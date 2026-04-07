from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone

from fastapi import status
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.db.models import BillingActivationCode, BillingSubscription, User, UserPlan

ACTIVATION_CODE_PROVIDER = 'activation_code'
ACTIVATION_CODE_SOURCE = 'ifdian'
ACTIVATION_CODE_DURATION_DAYS = 30
LEMONSQUEEZY_PROVIDER = 'lemonsqueezy'
_ACTIVATION_CODE_RE = re.compile(r'[^A-Z0-9]+')


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_activation_code(value: str) -> str:
    normalized = _ACTIVATION_CODE_RE.sub('', str(value or '').strip().upper())
    if not normalized:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'ACTIVATION_CODE_REQUIRED', 'Activation code is required')
    if len(normalized) < 12:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'ACTIVATION_CODE_INVALID', 'Activation code format is invalid')
    return normalized


def activation_code_hash(value: str) -> str:
    normalized = normalize_activation_code(value)
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


def activation_code_prefix(value: str) -> str:
    normalized = normalize_activation_code(value)
    return normalized[:8]


def subscription_grants_pro_access(subscription: BillingSubscription, *, now: datetime | None = None) -> bool:
    current = now or utc_now()
    status_value = (subscription.status or '').strip().lower()

    if status_value in {'active', 'on_trial'}:
        return subscription.ends_at is None or subscription.ends_at > current
    if status_value == 'cancelled' and subscription.ends_at and subscription.ends_at > current:
        return True
    return False


def current_period_ends_at(subscription: BillingSubscription) -> datetime | None:
    status_value = (subscription.status or '').strip().lower()
    if status_value == 'cancelled' and subscription.ends_at is not None:
        return subscription.ends_at
    return subscription.renews_at or subscription.ends_at or subscription.trial_ends_at


def active_subscription_for_user(db: Session, user: User) -> BillingSubscription | None:
    current = utc_now()
    subscriptions = (
        db.query(BillingSubscription)
        .filter(BillingSubscription.user_id == user.id)
        .order_by(BillingSubscription.updated_at.desc(), BillingSubscription.id.desc())
        .all()
    )

    lemonsqueezy_active = [
        item for item in subscriptions
        if item.provider == LEMONSQUEEZY_PROVIDER and subscription_grants_pro_access(item, now=current)
    ]
    if lemonsqueezy_active:
        return lemonsqueezy_active[0]

    activation_active = [
        item for item in subscriptions
        if item.provider == ACTIVATION_CODE_PROVIDER and subscription_grants_pro_access(item, now=current)
    ]
    if activation_active:
        return max(
            activation_active,
            key=lambda item: (
                current_period_ends_at(item) or datetime.min.replace(tzinfo=timezone.utc),
                item.updated_at or datetime.min.replace(tzinfo=timezone.utc),
                item.id or 0,
            ),
        )

    for item in subscriptions:
        if subscription_grants_pro_access(item, now=current):
            return item
    return None


def activation_subscription_for_user(db: Session, user: User) -> BillingSubscription | None:
    return (
        db.query(BillingSubscription)
        .filter(
            BillingSubscription.user_id == user.id,
            BillingSubscription.provider == ACTIVATION_CODE_PROVIDER,
        )
        .order_by(BillingSubscription.updated_at.desc(), BillingSubscription.id.desc())
        .first()
    )


def sync_user_billing_plan(db: Session, user: User) -> UserPlan:
    active_subscription = active_subscription_for_user(db, user)
    fallback_plan = UserPlan.guest if user.plan == UserPlan.guest else UserPlan.free
    target_plan = UserPlan.pro if active_subscription is not None else fallback_plan
    if user.plan != target_plan:
        user.plan = target_plan
        db.add(user)
        db.flush()
    return target_plan


def redeem_activation_code_for_user(
    db: Session,
    *,
    user: User,
    raw_code: str,
) -> tuple[BillingActivationCode, BillingSubscription]:
    current = utc_now()
    normalized = normalize_activation_code(raw_code)
    code_hash = hashlib.sha256(normalized.encode('utf-8')).hexdigest()
    code = db.query(BillingActivationCode).filter(BillingActivationCode.code_hash == code_hash).first()

    if code is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'ACTIVATION_CODE_NOT_FOUND', 'Activation code is invalid')
    if code.disabled_at is not None:
        raise api_error(status.HTTP_409_CONFLICT, 'ACTIVATION_CODE_DISABLED', 'Activation code is disabled')
    if code.expires_at is not None and code.expires_at <= current:
        raise api_error(status.HTTP_409_CONFLICT, 'ACTIVATION_CODE_EXPIRED', 'Activation code has expired')
    if code.redeemed_at is not None:
        raise api_error(status.HTTP_409_CONFLICT, 'ACTIVATION_CODE_ALREADY_REDEEMED', 'Activation code has already been redeemed')

    subscription = activation_subscription_for_user(db, user)
    if subscription is None:
        subscription = BillingSubscription(
            user_id=user.id,
            provider=ACTIVATION_CODE_PROVIDER,
            provider_subscription_id=f'act_{user.public_id}',
        )

    active_until = current_period_ends_at(subscription)
    start_at = active_until if active_until is not None and active_until > current else current
    activated_until = start_at + timedelta(days=code.duration_days)

    subscription.user_email = user.email
    subscription.product_name = 'PicSpeak Pro'
    subscription.variant_name = f'{code.duration_days}-day activation'
    subscription.status = 'active'
    subscription.cancelled = True
    subscription.test_mode = False
    subscription.renews_at = None
    subscription.ends_at = activated_until
    subscription.trial_ends_at = None
    subscription.last_event_name = 'activation_code_redeemed'
    subscription.last_event_at = current
    subscription.raw_payload = {
        'source': code.source or ACTIVATION_CODE_SOURCE,
        'batch_id': code.batch_id,
        'duration_days': code.duration_days,
        'code_prefix': code.code_prefix,
        'redeemed_at': current.isoformat(),
        'activated_until': activated_until.isoformat(),
    }
    db.add(subscription)
    db.flush()

    code.redeemed_by_user_id = user.id
    code.redeemed_at = current
    code.updated_at = current
    db.add(code)

    sync_user_billing_plan(db, user)
    return code, subscription
