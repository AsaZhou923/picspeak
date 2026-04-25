from __future__ import annotations

import logging
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_current_actor, get_db
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import BillingSubscription, UsageLedger, User, UserPlan
from app.schemas import (
    ActivationCodeRedeemRequest,
    ActivationCodeRedeemResponse,
    BillingCheckoutRequest,
    BillingCheckoutResponse,
    BillingPortalResponse,
    CreditPackCheckoutRequest,
    CreditPackCheckoutResponse,
    ImageCreditCodeRedeemRequest,
    ImageCreditCodeRedeemResponse,
    UsageResponse,
)
from app.services.billing_access import (
    active_subscription_for_user as resolve_active_subscription_for_user,
    current_period_ends_at as resolve_current_period_ends_at,
    redeem_activation_code_for_user,
    subscription_grants_pro_access as billing_subscription_grants_pro_access,
)
from app.services.guard import (
    enforce_activation_code_rate_limit,
    guest_quota_scope_key,
    guest_usage_snapshot,
    has_priority_queue,
    history_retention_days_for_plan,
    plan_review_modes,
    user_usage_snapshot,
)
from app.services.image_generation_task_processor import (
    count_monthly_generation_credit_consumed,
    count_monthly_generation_credit_grants,
    count_monthly_generation_credits,
    monthly_generation_credit_limit_for_plan,
)
from app.services.lemonsqueezy import (
    LemonSqueezyAPIError,
    LemonSqueezyConfigurationError,
    create_checkout_for_user,
    create_image_credit_pack_checkout_for_user,
    retrieve_subscription,
)
from app.services.product_analytics import record_product_event

router = APIRouter(tags=['billing'])
logger = logging.getLogger(__name__)

IMAGE_CREDIT_PROMO_CODE = 'PICSPEAKART'
IMAGE_CREDIT_PROMO_CREDITS = 30
IMAGE_CREDIT_PACK_KEY = 'image_credits_300'
IMAGE_CREDIT_PACK_CREDITS = 300
IMAGE_CREDIT_PACK_PRICES = {
    'usd': '$3.99',
}


def _subscription_portal_url(subscription: BillingSubscription) -> str | None:
    candidates = (
        subscription.customer_portal_url,
        subscription.customer_portal_update_subscription_url,
        subscription.update_payment_method_url,
    )
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _configured_customer_portal_url() -> str | None:
    checkout_url = settings.lemonsqueezy_pro_checkout_url.strip()
    if not checkout_url:
        return None

    parsed = urlsplit(checkout_url)
    if not parsed.scheme or not parsed.netloc:
        return None

    return urlunsplit((parsed.scheme, parsed.netloc, '/billing', '', ''))


def _is_lemonsqueezy_dashboard_url(url: str | None) -> bool:
    if not isinstance(url, str) or not url.strip():
        return False

    parsed = urlsplit(url.strip())
    return parsed.netloc == 'app.lemonsqueezy.com' and parsed.path.startswith('/dashboard')


def _customer_portal_destination(subscription: BillingSubscription) -> str | None:
    portal_url = _subscription_portal_url(subscription)
    if portal_url and not _is_lemonsqueezy_dashboard_url(portal_url):
        return portal_url
    fallback_url = _configured_customer_portal_url()
    if fallback_url and not _is_lemonsqueezy_dashboard_url(fallback_url):
        return fallback_url
    return None


def _refresh_subscription_portal_urls(db: Session, subscription: BillingSubscription) -> BillingSubscription:
    subscription_id = str(subscription.provider_subscription_id or '').strip()
    if not subscription_id:
        return subscription

    data = retrieve_subscription(subscription_id)
    attributes = data.get('attributes')
    if not isinstance(attributes, dict):
        return subscription

    urls = attributes.get('urls')
    url_map = urls if isinstance(urls, dict) else {}

    subscription.update_payment_method_url = str(
        url_map.get('update_payment_method') or subscription.update_payment_method_url or ''
    ).strip() or None
    subscription.customer_portal_url = str(url_map.get('customer_portal') or subscription.customer_portal_url or '').strip() or None
    subscription.customer_portal_update_subscription_url = str(
        url_map.get('customer_portal_update_subscription') or subscription.customer_portal_update_subscription_url or ''
    ).strip() or None
    subscription.raw_payload = data
    db.add(subscription)
    db.flush()
    return subscription


def _subscription_grants_pro_access(subscription: BillingSubscription, *, now: datetime | None = None) -> bool:
    return billing_subscription_grants_pro_access(subscription, now=now)


def _current_period_ends_at(subscription: BillingSubscription) -> datetime | None:
    return resolve_current_period_ends_at(subscription)


def _active_subscription_for_user(db: Session, user: User) -> BillingSubscription | None:
    return resolve_active_subscription_for_user(db, user)


def _best_subscription_for_portal(subscriptions: list[BillingSubscription]) -> BillingSubscription | None:
    active_with_portal: BillingSubscription | None = None
    active_without_portal: BillingSubscription | None = None
    latest_with_portal: BillingSubscription | None = None

    for subscription in subscriptions:
        portal_url = _subscription_portal_url(subscription)
        if portal_url and latest_with_portal is None:
            latest_with_portal = subscription

        if _subscription_grants_pro_access(subscription):
            if portal_url:
                active_with_portal = subscription
                break
            if active_without_portal is None:
                active_without_portal = subscription

    return active_with_portal or active_without_portal or latest_with_portal or (subscriptions[0] if subscriptions else None)


def _generation_credit_usage_snapshot(db: Session, user: User, plan: UserPlan) -> dict[str, int | None]:
    if plan == UserPlan.guest:
        return {
            'monthly_total': 0,
            'monthly_used': 0,
            'monthly_remaining': 0,
        }

    base_monthly_total = monthly_generation_credit_limit_for_plan(plan)
    monthly_granted = count_monthly_generation_credit_grants(db, user)
    monthly_total = base_monthly_total + monthly_granted
    monthly_used = count_monthly_generation_credit_consumed(db, user)
    return {
        'monthly_total': monthly_total,
        'monthly_used': max(monthly_used, 0),
        'monthly_remaining': max(monthly_total - monthly_used, 0),
    }


def _normalize_image_credit_code(raw_code: str) -> str:
    return ''.join(str(raw_code or '').strip().upper().split())


def _has_redeemed_image_credit_code(db: Session, user: User, code: str) -> bool:
    grants = (
        db.query(UsageLedger)
        .filter(
            UsageLedger.user_id == user.id,
            UsageLedger.usage_type == 'image_generation_credit',
        )
        .all()
    )
    for grant in grants:
        metadata = getattr(grant, 'metadata_json', None) or {}
        if metadata.get('grant_type') == 'promo_code' and metadata.get('grant_code') == code:
            return True
    return False


@router.get('/me/usage', response_model=UsageResponse)
def get_usage(request: Request, db: Session = Depends(get_db), actor: CurrentActor = Depends(get_current_actor)):
    quota = (
        guest_usage_snapshot(db, guest_quota_scope_key(request, actor.user))
        if actor.plan == UserPlan.guest
        else user_usage_snapshot(db, actor.user)
    )
    subscription = None
    if actor.plan == UserPlan.pro:
        active_subscription = _active_subscription_for_user(db, actor.user)
        if active_subscription is not None:
            subscription = {
                'provider': active_subscription.provider,
                'status': active_subscription.status,
                'cancelled': active_subscription.cancelled,
                'renews_at': active_subscription.renews_at,
                'ends_at': active_subscription.ends_at,
                'current_period_ends_at': _current_period_ends_at(active_subscription),
            }
    db.commit()
    return UsageResponse(
        plan=actor.plan.value,
        quota=quota,
        generation_credits=_generation_credit_usage_snapshot(db, actor.user, actor.plan),
        features={
            'review_modes': plan_review_modes(actor.plan),
            'history_retention_days': history_retention_days_for_plan(actor.plan),
            'priority_queue': has_priority_queue(actor.plan),
        },
        subscription=subscription,
        rate_limit={},
    )


@router.post('/billing/checkout', response_model=BillingCheckoutResponse)
def create_billing_checkout(
    payload: BillingCheckoutRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        raise api_error(status.HTTP_403_FORBIDDEN, 'BILLING_SIGNIN_REQUIRED', 'Please sign in before starting checkout')
    if actor.plan == UserPlan.pro:
        db.commit()
        return BillingCheckoutResponse(
            status='already_active',
            plan=payload.plan,
            message='Your account is already on Pro.',
            checkout_url=None,
        )
    try:
        checkout = create_checkout_for_user(actor.user, locale=payload.locale)
    except LemonSqueezyConfigurationError as exc:
        raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, 'LEMONSQUEEZY_NOT_CONFIGURED', str(exc)) from exc
    except LemonSqueezyAPIError as exc:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'LEMONSQUEEZY_API_FAILED', str(exc)) from exc
    record_product_event(
        db,
        event_name='checkout_started',
        user_public_id=actor.user.public_id,
        plan=actor.plan.value,
        source='checkout',
        page_path='/billing/checkout',
        metadata={
            'plan': payload.plan,
            'provider': 'lemonsqueezy',
            'checkout_id': checkout.checkout_id,
        },
    )
    db.commit()
    return BillingCheckoutResponse(
        status='created',
        plan=payload.plan,
        message='Checkout created successfully.',
        checkout_url=checkout.checkout_url,
    )


@router.post('/billing/image-credit-pack/checkout', response_model=CreditPackCheckoutResponse)
def create_image_credit_pack_checkout(
    payload: CreditPackCheckoutRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        raise api_error(status.HTTP_403_FORBIDDEN, 'BILLING_SIGNIN_REQUIRED', 'Please sign in before buying image credits')

    currency = str(payload.currency or 'usd').lower()
    if currency != 'usd':
        raise api_error(status.HTTP_400_BAD_REQUEST, 'CREDIT_PACK_CURRENCY_UNSUPPORTED', 'Only USD credit pack checkout is available')

    price = IMAGE_CREDIT_PACK_PRICES[currency]
    checkout_url: str | None = None
    checkout_id: str | None = None
    response_status = 'placeholder'
    message = 'Credit pack checkout is reserved but not connected yet.'
    if currency == 'usd':
        try:
            checkout = create_image_credit_pack_checkout_for_user(
                actor.user,
                pack=IMAGE_CREDIT_PACK_KEY,
                credits=IMAGE_CREDIT_PACK_CREDITS,
            )
        except LemonSqueezyConfigurationError as exc:
            raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, 'LEMONSQUEEZY_NOT_CONFIGURED', str(exc)) from exc
        checkout_url = checkout.checkout_url
        checkout_id = checkout.checkout_id
        response_status = 'created'
        message = 'Credit pack checkout created successfully.'

    record_product_event(
        db,
        event_name='credit_pack_checkout_started',
        user_public_id=actor.user.public_id,
        plan=actor.plan.value,
        source='checkout',
        page_path='/billing/image-credit-pack/checkout',
        metadata={
            'pack': payload.pack,
            'credits': IMAGE_CREDIT_PACK_CREDITS,
            'currency': currency,
            'price': price,
            'placeholder': response_status == 'placeholder',
            'locale': payload.locale,
            'provider': 'lemonsqueezy' if checkout_url else None,
            'checkout_id': checkout_id,
        },
    )
    db.commit()
    return CreditPackCheckoutResponse(
        status=response_status,
        pack=IMAGE_CREDIT_PACK_KEY,
        credits=IMAGE_CREDIT_PACK_CREDITS,
        currency=currency,
        price=price,
        message=message,
        checkout_url=checkout_url,
    )


@router.post('/billing/activation-code/redeem', response_model=ActivationCodeRedeemResponse)
def redeem_activation_code(
    payload: ActivationCodeRedeemRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        raise api_error(status.HTTP_403_FORBIDDEN, 'BILLING_SIGNIN_REQUIRED', 'Please sign in before redeeming an activation code')

    # Enforce per-user rate limit before attempting redemption to prevent brute-force.
    enforce_activation_code_rate_limit(db, actor.user)

    _, subscription = redeem_activation_code_for_user(db, user=actor.user, raw_code=payload.code)
    db.commit()
    db.refresh(actor.user)
    db.refresh(subscription)
    activated_until = resolve_current_period_ends_at(subscription)
    if activated_until is None:
        raise api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, 'ACTIVATION_CODE_STATE_INVALID', 'Activation did not produce an expiry time')

    return ActivationCodeRedeemResponse(
        status='activated',
        plan=actor.user.plan.value,
        provider=subscription.provider,
        message='Activation code redeemed successfully.',
        activated_until=activated_until,
    )


@router.post('/billing/image-credit-code/redeem', response_model=ImageCreditCodeRedeemResponse)
def redeem_image_credit_code(
    payload: ImageCreditCodeRedeemRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        raise api_error(status.HTTP_403_FORBIDDEN, 'BILLING_SIGNIN_REQUIRED', 'Please sign in before redeeming a credit code')

    code = _normalize_image_credit_code(payload.code)
    if code != IMAGE_CREDIT_PROMO_CODE:
        raise api_error(status.HTTP_404_NOT_FOUND, 'IMAGE_CREDIT_CODE_INVALID', 'This credit code is not valid')

    if _has_redeemed_image_credit_code(db, actor.user, code):
        raise api_error(status.HTTP_409_CONFLICT, 'IMAGE_CREDIT_CODE_ALREADY_REDEEMED', 'This credit code has already been redeemed')

    db.add(
        UsageLedger(
            user_id=actor.user.id,
            review_id=None,
            task_id=None,
            usage_type='image_generation_credit',
            amount=-IMAGE_CREDIT_PROMO_CREDITS,
            unit='credits',
            bill_date=datetime.now(timezone.utc).date(),
            metadata_json={
                'grant_type': 'promo_code',
                'grant_code': code,
                'credits_granted': IMAGE_CREDIT_PROMO_CREDITS,
            },
        )
    )
    db.commit()
    snapshot = _generation_credit_usage_snapshot(db, actor.user, actor.plan)
    return ImageCreditCodeRedeemResponse(
        status='redeemed',
        code=code,
        credits_granted=IMAGE_CREDIT_PROMO_CREDITS,
        message='Credit code redeemed successfully.',
        monthly_total=snapshot['monthly_total'],
        monthly_used=snapshot['monthly_used'],
        monthly_remaining=snapshot['monthly_remaining'],
    )


@router.get('/billing/portal', response_model=BillingPortalResponse)
def get_billing_portal(
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan != UserPlan.pro:
        raise api_error(status.HTTP_403_FORBIDDEN, 'BILLING_PORTAL_PRO_REQUIRED', 'Only Pro users can manage a subscription')

    subscriptions = (
        db.query(BillingSubscription)
        .filter(
            BillingSubscription.user_id == actor.user.id,
            BillingSubscription.provider == 'lemonsqueezy',
        )
        .order_by(BillingSubscription.updated_at.desc(), BillingSubscription.id.desc())
        .all()
    )
    subscription = _best_subscription_for_portal(subscriptions)
    if subscription is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'BILLING_SUBSCRIPTION_NOT_FOUND', 'No subscription was found for this account')

    try:
        subscription = _refresh_subscription_portal_urls(db, subscription)
    except LemonSqueezyConfigurationError:
        logger.warning('Lemon Squeezy is not configured while refreshing billing portal links')
    except LemonSqueezyAPIError as exc:
        logger.warning('Failed to refresh billing portal link from Lemon Squeezy: %s', exc)

    portal_url = _customer_portal_destination(subscription)
    if not portal_url:
        raise api_error(
            status.HTTP_409_CONFLICT,
            'BILLING_PORTAL_UNAVAILABLE',
            'Your subscription is active, but the billing portal link is not ready yet',
        )

    db.commit()
    return BillingPortalResponse(
        status='ready',
        portal_url=portal_url,
        message='Billing portal ready.',
    )
