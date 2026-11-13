from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Request, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiHTTPException, api_error
from app.core.security import verify_payload
from app.db.models import BillingSubscription, BillingWebhookEvent, UsageLedger, User, UserPlan
from app.services.billing_access import current_period_ends_at, subscription_grants_pro_access, sync_user_billing_plan
from app.services.generation_credit_reservations import PURCHASED_BALANCE_VERSION, generation_credit_balance_snapshot
from app.services.lemonsqueezy import (
    ONE_TIME_PRO_BILLING_MODE,
    ONE_TIME_PRO_DURATION_DAYS,
    ONE_TIME_PRO_GRANT_PURPOSE,
    LemonSqueezyAPIError,
    LemonSqueezyConfigurationError,
    retrieve_subscription,
    webhook_signing_secret,
)
from app.services.notification_events import record_credit_confirmed, record_subscription_changed
from app.services.product_analytics import record_product_event

HANDLED_LEMONSQUEEZY_EVENTS = {
    'order_created',
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'subscription_expired',
    'subscription_resumed',
    'subscription_paused',
    'subscription_unpaused',
    'subscription_payment_success',
    'subscription_payment_recovered',
    'subscription_payment_failed',
    'subscription_payment_refunded',
    'order_refunded',
}

IMAGE_CREDIT_PACK_KEY = 'image_credits_300'
IMAGE_CREDIT_PACK_CREDITS = 300
CREDIT_PACK_GRANT_TYPE = 'lemonsqueezy_credit_pack'
CREDIT_PACK_REFUND_GRANT_TYPE = 'lemonsqueezy_credit_pack_refund'
ONE_TIME_PRO_REFUNDED_STATUS = 'refunded'


@dataclass(slots=True)
class LemonSqueezyWebhookEvent:
    event_name: str
    payload: dict[str, Any]
    meta: dict[str, Any]
    data: dict[str, Any]
    event_hash: str
    test_mode: bool
    resource_type: str | None
    resource_id: str | None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _subscription_state_fingerprint(subscription: BillingSubscription) -> str:
    return '|'.join(
        [
            str(subscription.status or ''),
            str(subscription.cancelled),
            str(subscription.renews_at or ''),
            str(subscription.ends_at or ''),
        ]
    )


def _notification_subscription_token(subscription: BillingSubscription) -> str:
    source_id = subscription.provider_subscription_id or subscription.provider_order_id or str(subscription.id or '')
    return hashlib.sha256(str(source_id).encode()).hexdigest()[:24]


def _record_subscription_changed_if_state_changed(
    db: Session,
    user: User,
    subscription: BillingSubscription,
    *,
    before_fingerprint: str | None,
    event_version: str | None,
) -> None:
    after_fingerprint = _subscription_state_fingerprint(subscription)
    if before_fingerprint == after_fingerprint:
        return
    record_subscription_changed(
        db,
        user,
        subscription_id=_notification_subscription_token(subscription),
        status=subscription.status,
        version=f'{after_fingerprint}|{event_version or ""}',
    )


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if normalized.endswith('Z'):
        normalized = normalized[:-1] + '+00:00'
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _event_effective_at(attributes: dict[str, Any]) -> datetime | None:
    return _parse_iso_datetime(attributes.get('updated_at')) or _parse_iso_datetime(attributes.get('created_at'))


def _test_mode_matches(event: LemonSqueezyWebhookEvent) -> bool:
    if not isinstance(event.test_mode, bool):
        return False
    flags = [event.test_mode]
    attributes = _payload_attributes(event.data)
    for source in (event.meta, attributes):
        if 'test_mode' in source:
            if not isinstance(source['test_mode'], bool):
                return False
            flags.append(source['test_mode'])
    if any(flag != flags[0] for flag in flags):
        return False
    # A production endpoint must never mint test entitlements, even when an old
    # deployment accidentally retains the development webhook setting.
    if settings.app_env.strip().lower() in {'prod', 'production'} and event.test_mode:
        return False
    return event.test_mode == settings.lemonsqueezy_webhook_test_mode


def _payload_attributes(data: dict[str, Any]) -> dict[str, Any]:
    attributes = data.get('attributes')
    return attributes if isinstance(attributes, dict) else {}


def _attribute_text(attributes: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = attributes.get(key)
        if value is None:
            continue
        normalized = str(value).strip()
        if normalized:
            return normalized
    return None


def _order_item_attributes(attributes: dict[str, Any]) -> dict[str, Any]:
    first_order_item = attributes.get('first_order_item')
    return first_order_item if isinstance(first_order_item, dict) else {}


def _payload_relationship_id(data: dict[str, Any], name: str) -> str | None:
    relationships = data.get('relationships')
    if not isinstance(relationships, dict):
        return None
    target = relationships.get(name)
    if not isinstance(target, dict):
        return None
    rel_data = target.get('data')
    if not isinstance(rel_data, dict):
        return None
    value = rel_data.get('id')
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _compare_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode('utf-8'), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


async def verify_lemonsqueezy_webhook(request: Request) -> LemonSqueezyWebhookEvent:
    signature = request.headers.get('X-Signature', '').strip()
    if not signature:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'LEMONSQUEEZY_WEBHOOK_HEADERS_MISSING',
            'Missing Lemon Squeezy webhook signature',
        )

    raw_body = await request.body()
    try:
        secret = webhook_signing_secret()
    except LemonSqueezyConfigurationError as exc:
        raise api_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            'LEMONSQUEEZY_NOT_CONFIGURED',
            str(exc),
        ) from exc

    if not _compare_signature(raw_body, signature, secret):
        raise api_error(
            status.HTTP_401_UNAUTHORIZED,
            'LEMONSQUEEZY_WEBHOOK_SIGNATURE_INVALID',
            'Unable to verify Lemon Squeezy webhook signature',
        )

    try:
        payload = json.loads(raw_body.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'LEMONSQUEEZY_WEBHOOK_PAYLOAD_INVALID',
            'Webhook body must be valid UTF-8 JSON',
        ) from exc

    if not isinstance(payload, dict):
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'LEMONSQUEEZY_WEBHOOK_PAYLOAD_INVALID',
            'Webhook payload must be an object',
        )

    meta = payload.get('meta')
    data = payload.get('data')
    if not isinstance(meta, dict) or not isinstance(data, dict):
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'LEMONSQUEEZY_WEBHOOK_PAYLOAD_INVALID',
            'Webhook payload is missing meta or data',
        )

    event_name = str(meta.get('event_name') or '').strip()
    if not event_name:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'LEMONSQUEEZY_WEBHOOK_PAYLOAD_INVALID',
            'Webhook payload is missing an event name',
        )

    resource_type = str(data.get('type') or '').strip() or None
    resource_id = str(data.get('id') or '').strip() or None
    test_mode = meta.get('test_mode', _payload_attributes(data).get('test_mode', False))
    if not isinstance(test_mode, bool):
        raise api_error(status.HTTP_400_BAD_REQUEST, 'LEMONSQUEEZY_WEBHOOK_PAYLOAD_INVALID', 'Invalid payment mode')
    return LemonSqueezyWebhookEvent(
        event_name=event_name,
        payload=payload,
        meta=meta,
        data=data,
        event_hash=hashlib.sha256(raw_body).hexdigest(),
        test_mode=test_mode,
        resource_type=resource_type,
        resource_id=resource_id,
    )


def record_lemonsqueezy_webhook_event(db: Session, event: LemonSqueezyWebhookEvent) -> tuple[BillingWebhookEvent, bool]:
    existing = (
        db.query(BillingWebhookEvent)
        .filter(
            BillingWebhookEvent.provider == 'lemonsqueezy',
            BillingWebhookEvent.event_hash == event.event_hash,
        )
        .first()
    )
    if existing is not None:
        return existing, True

    record = BillingWebhookEvent(
        provider='lemonsqueezy',
        event_name=event.event_name,
        event_hash=event.event_hash,
        resource_type=event.resource_type,
        resource_id=event.resource_id,
        test_mode=event.test_mode,
        payload_json=event.payload,
    )
    try:
        # The unique hash is also the concurrency boundary for identical raw
        # deliveries. Keep a competing insert's rollback inside a savepoint.
        with db.begin_nested():
            db.add(record)
            db.flush()
    except IntegrityError:
        existing = db.query(BillingWebhookEvent).filter(
            BillingWebhookEvent.provider == 'lemonsqueezy',
            BillingWebhookEvent.event_hash == event.event_hash,
        ).one_or_none()
        if existing is None:
            raise
        return existing, True
    return record, False


def _custom_data(meta: dict[str, Any]) -> dict[str, Any]:
    custom_data = meta.get('custom_data')
    return custom_data if isinstance(custom_data, dict) else {}


def _lookup_user_by_public_id(db: Session, public_id: str | None) -> User | None:
    if not public_id:
        return None
    return db.query(User).filter(User.public_id == public_id).first()


def _lookup_user_by_email(db: Session, email: str | None) -> User | None:
    if not email:
        return None
    normalized = email.strip().lower()
    if not normalized:
        return None
    return db.query(User).filter(func.lower(User.email) == normalized).first()


def _lookup_subscription(
    db: Session,
    *,
    provider_subscription_id: str | None = None,
    provider_order_id: str | None = None,
    user_id: int | None = None,
) -> BillingSubscription | None:
    query = db.query(BillingSubscription).filter(BillingSubscription.provider == 'lemonsqueezy')
    if provider_subscription_id:
        item = query.filter(BillingSubscription.provider_subscription_id == provider_subscription_id).first()
        if item is not None:
            return item
    if provider_order_id and user_id is not None:
        item = (
            query.filter(
                BillingSubscription.provider_order_id == provider_order_id,
                BillingSubscription.user_id == user_id,
            )
            .order_by(BillingSubscription.updated_at.desc(), BillingSubscription.id.desc())
            .first()
        )
        if item is not None:
            return item
    return None


def _variant_matches_pro_plan(variant_id: str | None) -> bool:
    configured = settings.lemonsqueezy_pro_variant_id.strip()
    return bool(configured and variant_id and configured == variant_id)


def _variant_matches_one_time_pro_plan(variant_id: str | None) -> bool:
    # The current one-time variant sells new passes; the legacy Chinese variant
    # stays accepted so delayed or replayed orders from the old product resolve.
    configured = {
        value
        for value in (
            settings.lemonsqueezy_pro_one_time_variant_id.strip(),
            settings.lemonsqueezy_zh_pro_variant_id.strip(),
        )
        if value
    }
    if configured:
        return bool(variant_id) and variant_id in configured
    return _variant_matches_pro_plan(variant_id)


def _variant_matches_image_credit_pack(variant_id: str | None) -> bool:
    configured = settings.lemonsqueezy_image_credit_pack_variant_id.strip()
    if not configured:
        return True
    return str(variant_id or '').strip() == configured


def _is_image_credit_pack_order(event: LemonSqueezyWebhookEvent) -> bool:
    custom = _custom_data(event.meta)
    return (
        str(custom.get('kind') or '').strip() == 'image_credit_pack'
        or str(custom.get('pack') or '').strip() == IMAGE_CREDIT_PACK_KEY
    )


def _is_one_time_pro_order(event: LemonSqueezyWebhookEvent) -> bool:
    custom = _custom_data(event.meta)
    return (
        str(custom.get('billing_mode') or '').strip().lower() == ONE_TIME_PRO_BILLING_MODE
        and str(custom.get('plan') or '').strip().lower() == 'pro'
    )


def _verified_one_time_pro_payload(event: LemonSqueezyWebhookEvent, user: User) -> dict[str, Any] | None:
    custom = _custom_data(event.meta)
    token = str(custom.get('grant_token') or '').strip()
    if not token:
        return None
    try:
        payload = verify_payload(token, expected_purpose=ONE_TIME_PRO_GRANT_PURPOSE)
    except (ApiHTTPException, ValueError, TypeError, UnicodeDecodeError):
        return None

    if payload.get('user_id') != user.public_id:
        return None
    if payload.get('plan') != 'pro':
        return None
    if payload.get('billing_mode') != ONE_TIME_PRO_BILLING_MODE:
        return None
    try:
        duration_days = int(payload.get('duration_days'))
    except (TypeError, ValueError):
        return None
    if duration_days != ONE_TIME_PRO_DURATION_DAYS:
        return None
    return payload


def _image_credit_pack_order_id(event: LemonSqueezyWebhookEvent) -> str | None:
    attributes = _payload_attributes(event.data)
    return (
        str(event.resource_id or '').strip()
        or str(attributes.get('order_id') or '').strip()
        or str(attributes.get('identifier') or '').strip()
        or None
    )


def _order_resource_id(event: LemonSqueezyWebhookEvent) -> str | None:
    attributes = _payload_attributes(event.data)
    return (
        str(event.resource_id or '').strip()
        or str(attributes.get('order_id') or '').strip()
        or str(attributes.get('identifier') or '').strip()
        or str(event.data.get('id') or '').strip()
        or None
    )


def _one_time_pro_already_granted(subscription: BillingSubscription | None) -> bool:
    if subscription is None:
        return False
    payload = subscription.raw_payload if isinstance(subscription.raw_payload, dict) else {}
    access = payload.get('billing_access')
    return isinstance(access, dict) and access.get('billing_mode') == ONE_TIME_PRO_BILLING_MODE


def _grant_one_time_pro_access(
    db: Session,
    *,
    user: User,
    subscription: BillingSubscription,
    event: LemonSqueezyWebhookEvent,
) -> tuple[BillingSubscription, str | None, str | None, bool]:
    current = _utc_now()
    current_end = current_period_ends_at(subscription)
    start_at = current_end if current_end is not None and current_end > current else current
    ends_at = start_at + timedelta(days=ONE_TIME_PRO_DURATION_DAYS)

    subscription.status = 'active'
    subscription.cancelled = True
    subscription.renews_at = None
    subscription.ends_at = ends_at
    subscription.trial_ends_at = None
    subscription.product_name = subscription.product_name or 'PicSpeak Pro'
    subscription.variant_name = subscription.variant_name or f'{ONE_TIME_PRO_DURATION_DAYS}-day one-time Pro'
    subscription.last_event_name = event.event_name
    subscription.last_event_at = current
    subscription.updated_at = current
    subscription.raw_payload = {
        **(event.data if isinstance(event.data, dict) else {}),
        'billing_access': {
            'billing_mode': ONE_TIME_PRO_BILLING_MODE,
            'duration_days': ONE_TIME_PRO_DURATION_DAYS,
            'activated_at': current.isoformat(),
            'activated_until': ends_at.isoformat(),
            'renews': False,
        },
    }
    db.add(subscription)
    _sync_user_plan(db, user)
    record_subscription_changed(
        db,
        user,
        subscription_id=_notification_subscription_token(subscription),
        status=subscription.status,
        version=_subscription_state_fingerprint(subscription),
    )
    record_product_event(
        db,
        event_name='paid_success',
        user_public_id=user.public_id,
        plan=user.plan.value,
        source='checkout',
        page_path='/billing/webhooks/lemonsqueezy',
        metadata={
            'provider': 'lemonsqueezy',
            'kind': ONE_TIME_PRO_BILLING_MODE,
            'order_id': subscription.provider_order_id or _order_resource_id(event),
            'duration_days': ONE_TIME_PRO_DURATION_DAYS,
            'renews': False,
        },
    )
    return subscription


def _credit_pack_ledger_entry(db: Session, user: User, order_id: str | None, *, grant_type: str) -> UsageLedger | None:
    if not order_id:
        return None
    entries = (
        db.query(UsageLedger)
        .filter(
            UsageLedger.user_id == user.id,
            UsageLedger.usage_type == 'image_generation_credit',
        )
        .all()
    )
    for entry in entries:
        metadata = getattr(entry, 'metadata_json', None) or {}
        if metadata.get('grant_type') == grant_type and str(metadata.get('order_id') or '') == order_id:
            return entry
    return None


def _has_granted_image_credit_pack(db: Session, user: User, order_id: str | None) -> bool:
    return _credit_pack_ledger_entry(db, user, order_id, grant_type=CREDIT_PACK_GRANT_TYPE) is not None


def _order_fully_refunded(attributes: dict[str, Any]) -> bool:
    # Lemon Squeezy marks partial refunds as 'partial_refund'; only a full
    # refund withdraws the purchase. Partial refunds stay a manual decision.
    return str(attributes.get('status') or '').strip().lower() == 'refunded'


def _order_refund_already_received(db: Session, order_id: str | None, *, test_mode: bool) -> bool:
    """Whether a full refund for this order arrived before its grant was processed."""
    if not order_id:
        return False
    refunds = (
        db.query(BillingWebhookEvent)
        .filter(
            BillingWebhookEvent.provider == 'lemonsqueezy',
            BillingWebhookEvent.event_name == 'order_refunded',
            BillingWebhookEvent.resource_id == order_id,
            BillingWebhookEvent.test_mode == test_mode,
        )
        .all()
    )
    for refund in refunds:
        if getattr(refund, 'test_mode', False) != test_mode or getattr(refund, 'outcome', None) == 'ignored_payment_mode_mismatch':
            continue
        payload = refund.payload_json if isinstance(refund.payload_json, dict) else {}
        data = payload.get('data') if isinstance(payload.get('data'), dict) else {}
        if _order_fully_refunded(_payload_attributes(data)):
            return True
    return False


def _process_image_credit_pack_order(db: Session, event: LemonSqueezyWebhookEvent, user: User | None) -> tuple[str, User | None]:
    if user is None:
        return 'ignored_user_not_found', None

    attributes = _payload_attributes(event.data)
    order_item_attributes = _order_item_attributes(attributes)
    variant_id = _attribute_text(attributes, 'variant_id') or _attribute_text(order_item_attributes, 'variant_id')
    if not _variant_matches_image_credit_pack(variant_id):
        return 'ignored_non_credit_pack_variant', user

    order_id = _image_credit_pack_order_id(event)
    if not order_id:
        return 'ignored_credit_pack_missing_order_id', user
    # Serialize both new reservations and grants at the same user boundary.
    # Event hashes alone do not deduplicate distinct deliveries of one order.
    db.query(User).filter(User.id == user.id).populate_existing().with_for_update().one()
    if _has_granted_image_credit_pack(db, user, order_id):
        return 'credit_pack_already_granted', user
    if _order_refund_already_received(db, order_id, test_mode=event.test_mode):
        return 'ignored_credit_pack_already_refunded', user

    custom = _custom_data(event.meta)
    try:
        credits = int(str(custom.get('credits') or IMAGE_CREDIT_PACK_CREDITS).strip())
    except ValueError:
        credits = IMAGE_CREDIT_PACK_CREDITS
    if credits != IMAGE_CREDIT_PACK_CREDITS:
        credits = IMAGE_CREDIT_PACK_CREDITS

    ledger = UsageLedger(
        user_id=user.id,
        review_id=None,
        task_id=None,
        usage_type='image_generation_credit',
        amount=-credits,
        unit='credits',
        bill_date=_utc_now().date(),
        metadata_json={
            'grant_type': CREDIT_PACK_GRANT_TYPE,
            'balance_version': 'persistent-v1',
            'pack': IMAGE_CREDIT_PACK_KEY,
            'order_id': order_id,
            'credits_granted': credits,
            'event_name': event.event_name,
        },
    )
    db.add(ledger)
    db.flush()
    record_credit_confirmed(db, user, grant_id=f'ledger_{ledger.id}', credits=credits)
    record_product_event(
        db,
        event_name='paid_success',
        user_public_id=user.public_id,
        plan=user.plan.value,
        source='checkout',
        page_path='/billing/webhooks/lemonsqueezy',
        metadata={
            'provider': 'lemonsqueezy',
            'kind': 'image_credit_pack',
            'pack': IMAGE_CREDIT_PACK_KEY,
            'credits_granted': credits,
            'revenue_usd': 3.99,
            'order_id': order_id,
            'event_name': event.event_name,
        },
    )
    return 'credit_pack_granted', user


def _subscription_grants_pro_access(subscription: BillingSubscription, *, now: datetime | None = None) -> bool:
    return subscription_grants_pro_access(subscription, now=now)


def _sync_user_plan(db: Session, user: User) -> None:
    sync_user_billing_plan(db, user)


def _upsert_subscription_from_resource(
    db: Session,
    *,
    event_name: str,
    data: dict[str, Any],
    user: User,
    fallback_order_id: str | None = None,
    event_hash: str | None = None,
) -> tuple[BillingSubscription, str | None, str | None, bool]:
    attributes = _payload_attributes(data)
    order_item_attributes = _order_item_attributes(attributes)
    resource_id = str(data.get('id') or '').strip() or None
    subscription_id = resource_id if event_name.startswith('subscription_') and data.get('type') == 'subscriptions' else None
    order_id = _attribute_text(attributes, 'order_id') or fallback_order_id
    subscription = _lookup_subscription(
        db,
        provider_subscription_id=subscription_id,
        provider_order_id=order_id,
        user_id=user.id,
    )
    if subscription is None:
        subscription = BillingSubscription(user_id=user.id, provider='lemonsqueezy')
    elif subscription.user_id != user.id:
        raise api_error(status.HTTP_409_CONFLICT, 'LEMONSQUEEZY_IDENTITY_MISMATCH', 'Subscription owner does not match')
    before_fingerprint = _subscription_state_fingerprint(subscription) if subscription.id is not None else None
    event_effective_at = _event_effective_at(attributes)
    # Older payment handlers wrote the local invoice receipt time into the
    # subscription-state watermark. Recover its provider timestamp when possible.
    # Portal refreshes can also replace raw_payload without applying its state,
    # so an equal-time subscription snapshot must still be accepted in this case.
    legacy_payment_watermark = subscription.last_event_name == 'subscription_payment_success'
    state_watermark = subscription.last_event_at
    if legacy_payment_watermark:
        state_watermark = _event_effective_at(_payload_attributes(subscription.raw_payload or {}))
    if subscription.id is not None and event_effective_at is not None and state_watermark is not None:
        stale = event_effective_at < state_watermark if legacy_payment_watermark else event_effective_at <= state_watermark
        if stale:
            return subscription, before_fingerprint, str(event_effective_at.isoformat()), False

    urls = attributes.get('urls')
    url_map = urls if isinstance(urls, dict) else {}

    subscription.provider_customer_id = _attribute_text(attributes, 'customer_id') or subscription.provider_customer_id
    subscription.provider_order_id = order_id or subscription.provider_order_id
    if subscription_id:
        subscription.provider_subscription_id = subscription_id
    subscription.store_id = _attribute_text(attributes, 'store_id') or subscription.store_id
    subscription.product_id = _attribute_text(attributes, 'product_id') or _attribute_text(order_item_attributes, 'product_id') or subscription.product_id
    subscription.variant_id = _attribute_text(attributes, 'variant_id') or _attribute_text(order_item_attributes, 'variant_id') or subscription.variant_id
    subscription.product_name = _attribute_text(attributes, 'product_name') or subscription.product_name
    subscription.variant_name = _attribute_text(attributes, 'variant_name') or subscription.variant_name
    subscription.user_email = _attribute_text(attributes, 'user_email', 'customer_email') or user.email
    subscription.status = str(attributes.get('status') or subscription.status or 'pending').strip() or 'pending'
    subscription.cancelled = bool(attributes.get('cancelled')) or event_name == 'subscription_cancelled'
    subscription.test_mode = bool(attributes.get('test_mode', False))
    subscription.renews_at = _parse_iso_datetime(attributes.get('renews_at'))
    subscription.ends_at = _parse_iso_datetime(attributes.get('ends_at'))
    subscription.trial_ends_at = _parse_iso_datetime(attributes.get('trial_ends_at'))
    subscription.update_payment_method_url = str(
        url_map.get('update_payment_method') or subscription.update_payment_method_url or ''
    ).strip() or None
    subscription.customer_portal_url = str(url_map.get('customer_portal') or subscription.customer_portal_url or '').strip() or None
    subscription.customer_portal_update_subscription_url = str(
        url_map.get('customer_portal_update_subscription') or subscription.customer_portal_update_subscription_url or ''
    ).strip() or None
    subscription.last_event_name = event_name
    subscription.last_event_at = event_effective_at or _utc_now()
    subscription.raw_payload = data
    subscription.updated_at = _utc_now()
    db.add(subscription)
    db.flush()
    effective_version = str((event_effective_at or subscription.last_event_at or _utc_now()).isoformat())
    if event_hash:
        effective_version = f'{effective_version}|{event_hash}'
    return subscription, before_fingerprint, effective_version, True


def _sync_subscription_from_api(db: Session, subscription_id: str, user: User | None) -> tuple[BillingSubscription, User]:
    data = retrieve_subscription(subscription_id)
    attributes = _payload_attributes(data)
    if data.get('type') != 'subscriptions' or str(data.get('id') or '') != subscription_id:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'LEMONSQUEEZY_API_FAILED', 'Invalid subscription resource')
    if attributes.get('test_mode', False) != settings.lemonsqueezy_webhook_test_mode or (
        settings.app_env.strip().lower() in {'prod', 'production'} and attributes.get('test_mode') is True
    ):
        raise api_error(status.HTTP_409_CONFLICT, 'LEMONSQUEEZY_MODE_MISMATCH', 'Subscription belongs to a different payment mode')
    if not _variant_matches_pro_plan(_attribute_text(attributes, 'variant_id')):
        raise api_error(status.HTTP_409_CONFLICT, 'LEMONSQUEEZY_VARIANT_MISMATCH', 'Subscription is not a configured Pro offer')
    resolved_user = user
    if resolved_user is None:
        resolved_user = _lookup_user_by_email(db, str(attributes.get('user_email') or '').strip() or None)
    if resolved_user is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            'LEMONSQUEEZY_USER_NOT_FOUND',
            'Unable to match Lemon Squeezy subscription to a user',
        )
    db.query(User).filter(User.id == resolved_user.id).populate_existing().with_for_update().one()
    subscription, _before_fingerprint, _event_version, _applied = _upsert_subscription_from_resource(
        db,
        event_name='subscription_updated',
        data=data,
        user=resolved_user,
    )
    return subscription, resolved_user


def _match_user_for_event(db: Session, event: LemonSqueezyWebhookEvent) -> User | None:
    custom = _custom_data(event.meta)
    user = _lookup_user_by_public_id(db, str(custom.get('user_id') or '').strip() or None)
    if user is not None:
        return user

    attributes = _payload_attributes(event.data)
    candidate_subscription_id = None
    if event.event_name.startswith('subscription_') and event.data.get('type') == 'subscriptions':
        candidate_subscription_id = str(event.data.get('id') or '').strip() or None
    else:
        candidate_subscription_id = (
            str(attributes.get('subscription_id') or '').strip()
            or _payload_relationship_id(event.data, 'subscription')
        )

    if candidate_subscription_id:
        subscription = _lookup_subscription(db, provider_subscription_id=candidate_subscription_id)
        if subscription is not None:
            return db.query(User).filter(User.id == subscription.user_id).first()

    email = (
        str(attributes.get('user_email') or '').strip()
        or str(attributes.get('customer_email') or '').strip()
        or str(attributes.get('email') or '').strip()
        or None
    )
    return _lookup_user_by_email(db, email)


def _process_order_created(db: Session, event: LemonSqueezyWebhookEvent, user: User | None) -> tuple[str, User | None]:
    if _is_image_credit_pack_order(event):
        return _process_image_credit_pack_order(db, event, user)
    if user is None:
        return 'ignored_user_not_found', None
    order_id = _order_resource_id(event)
    attributes = _payload_attributes(event.data)
    variant_id = _attribute_text(attributes, 'variant_id') or _attribute_text(_order_item_attributes(attributes), 'variant_id')
    if not _is_one_time_pro_order(event) and not _variant_matches_pro_plan(variant_id):
        return 'ignored_non_pro_variant', user
    if _is_one_time_pro_order(event):
        if _verified_one_time_pro_payload(event, user) is None:
            return 'ignored_one_time_pro_grant_invalid', user
        # Serialize with order_refunded so a concurrent refund sees this grant
        # or this grant sees the committed refund.
        db.query(User).filter(User.id == user.id).populate_existing().with_for_update().one()
        existing_subscription = _lookup_subscription(db, provider_order_id=order_id, user_id=user.id)
        if _one_time_pro_already_granted(existing_subscription):
            return 'one_time_pro_already_granted', user
        if _order_refund_already_received(db, order_id, test_mode=event.test_mode):
            return 'ignored_one_time_pro_already_refunded', user
    else:
        existing = _lookup_subscription(db, provider_order_id=order_id, user_id=user.id)
        if existing is not None and existing.provider_subscription_id:
            # An order receipt is not a subscription snapshot and must not
            # overwrite active/cancelled/expired state when delivered late.
            return 'order_recorded', user
    subscription, before_fingerprint, event_version, applied = _upsert_subscription_from_resource(
        db,
        event_name=event.event_name,
        data=event.data,
        user=user,
        fallback_order_id=order_id,
        event_hash=event.event_hash,
    )
    if _is_one_time_pro_order(event):
        if not _variant_matches_one_time_pro_plan(subscription.variant_id):
            return 'ignored_non_pro_variant', user
        _grant_one_time_pro_access(db, user=user, subscription=subscription, event=event)
        return 'one_time_pro_granted', user
    if not _variant_matches_pro_plan(subscription.variant_id):
        return 'ignored_non_pro_variant', user
    if applied:
        _record_subscription_changed_if_state_changed(
            db,
            user,
            subscription,
            before_fingerprint=before_fingerprint,
            event_version=event_version,
        )
    return 'order_recorded', user


def _revoke_image_credit_pack(
    db: Session, event: LemonSqueezyWebhookEvent, user: User, order_id: str,
) -> tuple[str, User | None]:
    db.query(User).filter(User.id == user.id).populate_existing().with_for_update().one()
    if _credit_pack_ledger_entry(db, user, order_id, grant_type=CREDIT_PACK_REFUND_GRANT_TYPE) is not None:
        return 'credit_pack_refund_already_applied', user
    grant = _credit_pack_ledger_entry(db, user, order_id, grant_type=CREDIT_PACK_GRANT_TYPE)
    credits_granted = abs(int(grant.amount)) if grant is not None else 0
    # Credits already spent cannot be withdrawn; revoke what is still unused.
    # Held reservations count as unused: releasing one later must not bring
    # refunded credits back.
    balance = generation_credit_balance_snapshot(db, user)
    unspent = balance['purchased_total'] - balance['purchased_used']
    credits_revoked = max(min(credits_granted, unspent), 0)
    db.add(
        UsageLedger(
            user_id=user.id,
            review_id=None,
            task_id=None,
            usage_type='image_generation_credit',
            amount=credits_revoked,
            unit='credits',
            bill_date=_utc_now().date(),
            metadata_json={
                'grant_type': CREDIT_PACK_REFUND_GRANT_TYPE,
                'balance_version': PURCHASED_BALANCE_VERSION,
                'credit_allocation': {'version': 1, 'monthly': 0, 'purchased': credits_revoked},
                'order_id': order_id,
                'credits_granted': credits_granted,
                'credits_revoked': credits_revoked,
                'credits_already_spent': credits_granted - credits_revoked,
                'event_name': event.event_name,
            },
        )
    )
    db.flush()
    return 'credit_pack_refunded', user


def _revoke_one_time_pro_access(
    db: Session, event: LemonSqueezyWebhookEvent, user: User, subscription: BillingSubscription,
) -> tuple[str, User | None]:
    if (subscription.status or '').strip().lower() == ONE_TIME_PRO_REFUNDED_STATUS:
        return 'one_time_pro_refund_already_applied', user
    before_fingerprint = _subscription_state_fingerprint(subscription)
    current = _utc_now()
    payload = subscription.raw_payload if isinstance(subscription.raw_payload, dict) else {}
    access = payload.get('billing_access') if isinstance(payload.get('billing_access'), dict) else {}
    subscription.status = ONE_TIME_PRO_REFUNDED_STATUS
    subscription.cancelled = True
    subscription.renews_at = None
    subscription.ends_at = current
    subscription.last_event_name = event.event_name
    subscription.last_event_at = current
    subscription.updated_at = current
    # Keep billing_access so a replayed order_created cannot grant the order again.
    subscription.raw_payload = {**payload, 'billing_access': {**access, 'refunded_at': current.isoformat()}}
    db.add(subscription)
    _sync_user_plan(db, user)
    _record_subscription_changed_if_state_changed(
        db,
        user,
        subscription,
        before_fingerprint=before_fingerprint,
        event_version=event.event_hash,
    )
    return 'one_time_pro_refunded', user


def _process_order_refunded(db: Session, event: LemonSqueezyWebhookEvent, user: User | None) -> tuple[str, User | None]:
    if user is None:
        return 'ignored_user_not_found', None
    order_id = _order_resource_id(event)
    if not order_id:
        return 'ignored_refund_missing_order_id', user
    # Same user boundary as the grant paths, so an overlapping order_created
    # either commits its grant first or observes this refund.
    db.query(User).filter(User.id == user.id).populate_existing().with_for_update().one()
    full_refund = _order_fully_refunded(_payload_attributes(event.data))
    if _is_image_credit_pack_order(event) or _has_granted_image_credit_pack(db, user, order_id):
        if not full_refund:
            return 'credit_pack_partial_refund_recorded', user
        return _revoke_image_credit_pack(db, event, user, order_id)
    subscription = _lookup_subscription(db, provider_order_id=order_id, user_id=user.id)
    if subscription is not None and _one_time_pro_already_granted(subscription):
        if not full_refund:
            return 'one_time_pro_partial_refund_recorded', user
        return _revoke_one_time_pro_access(db, event, user, subscription)
    # Subscription access follows subscription state events; a refunded renewal
    # does not end the subscription unless Lemon Squeezy cancels it.
    return 'refund_recorded', user


def _process_subscription_event(db: Session, event: LemonSqueezyWebhookEvent, user: User | None) -> tuple[str, User | None]:
    if user is None:
        return 'ignored_user_not_found', None
    attributes = _payload_attributes(event.data)
    existing = _lookup_subscription(db, provider_subscription_id=str(event.data.get('id') or ''))
    variant_id = _attribute_text(attributes, 'variant_id') or (existing.variant_id if existing is not None else None)
    if not _variant_matches_pro_plan(variant_id):
        return 'ignored_non_pro_variant', user
    subscription, before_fingerprint, event_version, applied = _upsert_subscription_from_resource(
        db,
        event_name=event.event_name,
        data=event.data,
        user=user,
        event_hash=event.event_hash,
    )
    if not _variant_matches_pro_plan(subscription.variant_id):
        return 'ignored_non_pro_variant', user
    _sync_user_plan(db, user)
    if applied:
        _record_subscription_changed_if_state_changed(
            db,
            user,
            subscription,
            before_fingerprint=before_fingerprint,
            event_version=event_version,
        )
    return 'subscription_synced', user


def _processed_invoice_events(db: Session, event: LemonSqueezyWebhookEvent) -> list[BillingWebhookEvent]:
    return (
        db.query(BillingWebhookEvent)
        .filter(
            BillingWebhookEvent.provider == 'lemonsqueezy',
            BillingWebhookEvent.resource_type == 'subscription-invoices',
            BillingWebhookEvent.resource_id == str(event.data.get('id') or ''),
            BillingWebhookEvent.test_mode == event.test_mode,
            BillingWebhookEvent.processed_at.is_not(None),
            BillingWebhookEvent.event_name.in_(['subscription_payment_success', 'subscription_payment_recovered', 'subscription_payment_refunded']),
        )
        .all()
    )


def _process_subscription_payment(db: Session, event: LemonSqueezyWebhookEvent, user: User | None) -> tuple[str, User | None]:
    attributes = _payload_attributes(event.data)
    subscription_id = (
        str(attributes.get('subscription_id') or '').strip()
        or _payload_relationship_id(event.data, 'subscription')
    )
    subscription = None
    resolved_user = user

    if subscription_id:
        subscription = _lookup_subscription(db, provider_subscription_id=subscription_id)
        if subscription is not None and resolved_user is None:
            resolved_user = db.query(User).filter(User.id == subscription.user_id).first()

    if subscription is None:
        if not subscription_id:
            return 'ignored_missing_subscription', user
        try:
            subscription, resolved_user = _sync_subscription_from_api(db, subscription_id, resolved_user)
        except LemonSqueezyConfigurationError as exc:
            raise api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, 'LEMONSQUEEZY_NOT_CONFIGURED', str(exc)) from exc
        except LemonSqueezyAPIError as exc:
            raise api_error(status.HTTP_502_BAD_GATEWAY, 'LEMONSQUEEZY_API_FAILED', str(exc)) from exc

    if resolved_user is None:
        return 'ignored_user_not_found', None
    if subscription.user_id != resolved_user.id:
        return 'ignored_identity_mismatch', resolved_user
    if not _variant_matches_pro_plan(subscription.variant_id):
        return 'ignored_non_pro_variant', resolved_user

    before_fingerprint = _subscription_state_fingerprint(subscription)
    invoice_id = str(event.data.get('id') or '').strip() or None
    if not invoice_id:
        return 'ignored_missing_invoice', resolved_user
    is_success = event.event_name in {'subscription_payment_success', 'subscription_payment_recovered'}
    if is_success:
        previous_events = _processed_invoice_events(db, event)
        if any(item.event_name == 'subscription_payment_refunded' and item.outcome in {
            'payment_refunded', 'payment_partial_refund_recorded',
        } for item in previous_events) or (
            subscription.last_invoice_id == invoice_id and subscription.last_payment_status in {'refunded', 'partial_refund'}
        ):
            return 'payment_already_refunded', resolved_user
        if any(item.outcome == 'payment_recorded' for item in previous_events) or (
            subscription.last_invoice_id == invoice_id and subscription.last_payment_status == 'success'
        ):
            return 'payment_already_recorded', resolved_user
    if event.event_name == 'subscription_payment_refunded':
        payment_status = 'refunded' if _order_fully_refunded(attributes) else 'partial_refund'
        outcome = 'payment_refunded' if payment_status == 'refunded' else 'payment_partial_refund_recorded'
    else:
        payment_status = 'success' if is_success else 'failed'
        outcome = 'payment_recorded' if is_success else 'payment_failed_recorded'
    payment_effective_at = _event_effective_at(attributes)
    # An invoice is not a subscription-state snapshot. Keep its timestamps and
    # identity separate so delayed/equal-time subscription updates can restore
    # access, and older invoices cannot replace newer payment metadata.
    # The provider can send recovery/success and refund at the same timestamp.
    # A refund wins a tie for the same invoice; a failure must not undo success.
    same_invoice = subscription.last_invoice_id == invoice_id
    status_rank = {'failed': 0, 'success': 1, 'partial_refund': 2, 'refunded': 3}
    tied_upgrade = same_invoice and payment_effective_at == subscription.last_payment_at and (
        status_rank.get(payment_status, -1) > status_rank.get(subscription.last_payment_status or '', -1)
    )
    status_can_advance = not same_invoice or (
        status_rank.get(payment_status, -1) >= status_rank.get(subscription.last_payment_status or '', -1)
    )
    if status_can_advance and (subscription.last_payment_at is None or tied_upgrade or (
        payment_effective_at is not None and payment_effective_at > subscription.last_payment_at
    )):
        subscription.last_invoice_id = invoice_id
        subscription.last_payment_status = payment_status
        subscription.last_payment_at = payment_effective_at
    subscription.updated_at = _utc_now()
    db.add(subscription)
    _sync_user_plan(db, resolved_user)
    _record_subscription_changed_if_state_changed(
        db,
        resolved_user,
        subscription,
        before_fingerprint=before_fingerprint,
        event_version=event.event_hash or str((subscription.last_payment_at or _utc_now()).isoformat()),
    )
    if not is_success:
        return outcome, resolved_user
    record_product_event(
        db,
        event_name='paid_success',
        user_public_id=resolved_user.public_id,
        plan=resolved_user.plan.value,
        source='checkout',
        page_path='/billing/webhooks/lemonsqueezy',
        metadata={
            'provider': 'lemonsqueezy',
            'subscription_id': subscription.provider_subscription_id,
            'invoice_id': invoice_id,
            'event_name': event.event_name,
        },
    )
    return outcome, resolved_user


def process_lemonsqueezy_webhook_event(db: Session, event: LemonSqueezyWebhookEvent) -> tuple[str, str | None]:
    if event.event_name not in HANDLED_LEMONSQUEEZY_EVENTS:
        return 'ignored_unhandled_event', None
    if not _test_mode_matches(event):
        return 'ignored_payment_mode_mismatch', None
    expected_resource = (
        'orders' if event.event_name.startswith('order_') else
        'subscription-invoices' if event.event_name.startswith('subscription_payment_') else 'subscriptions'
    )
    if event.data.get('type') != expected_resource or not str(event.data.get('id') or '').strip():
        return 'ignored_resource_mismatch', None
    event.data = {**event.data, 'attributes': {**_payload_attributes(event.data), 'test_mode': event.test_mode}}

    user = _match_user_for_event(db, event)
    if user is not None and event.event_name.startswith('subscription_'):
        # Serialize all invoice/state paths for an owner. Refresh any subscription
        # loaded while matching the user before this lock was acquired.
        db.query(User).filter(User.id == user.id).populate_existing().with_for_update().one()
        db.flush()
        for item in db.identity_map.values():
            if isinstance(item, BillingSubscription):
                db.expire(item)
    if event.event_name == 'order_created':
        outcome, resolved_user = _process_order_created(db, event, user)
    elif event.event_name == 'order_refunded':
        outcome, resolved_user = _process_order_refunded(db, event, user)
    elif event.event_name.startswith('subscription_payment_'):
        outcome, resolved_user = _process_subscription_payment(db, event, user)
    else:
        outcome, resolved_user = _process_subscription_event(db, event, user)
    return outcome, resolved_user.public_id if resolved_user is not None else None
