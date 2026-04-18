from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import api_error
from app.db.models import BillingSubscription, BillingWebhookEvent, User, UserPlan
from app.services.billing_access import subscription_grants_pro_access, sync_user_billing_plan
from app.services.lemonsqueezy import (
    LemonSqueezyAPIError,
    LemonSqueezyConfigurationError,
    retrieve_subscription,
    webhook_signing_secret,
)

HANDLED_LEMONSQUEEZY_EVENTS = {
    'order_created',
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'subscription_payment_success',
}


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
    return LemonSqueezyWebhookEvent(
        event_name=event_name,
        payload=payload,
        meta=meta,
        data=data,
        event_hash=hashlib.sha256(raw_body).hexdigest(),
        test_mode=bool(meta.get('test_mode')),
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
    db.add(record)
    db.flush()
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
    if not configured or not variant_id:
        return True
    return configured == variant_id


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
) -> BillingSubscription:
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

    urls = attributes.get('urls')
    url_map = urls if isinstance(urls, dict) else {}

    subscription.provider_customer_id = _attribute_text(attributes, 'customer_id') or subscription.provider_customer_id
    subscription.provider_order_id = order_id
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
    subscription.last_event_at = _utc_now()
    subscription.raw_payload = data
    subscription.updated_at = _utc_now()
    db.add(subscription)
    db.flush()
    return subscription


def _sync_subscription_from_api(db: Session, subscription_id: str, user: User | None) -> tuple[BillingSubscription, User]:
    data = retrieve_subscription(subscription_id)
    attributes = _payload_attributes(data)
    resolved_user = user
    if resolved_user is None:
        resolved_user = _lookup_user_by_email(db, str(attributes.get('user_email') or '').strip() or None)
    if resolved_user is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            'LEMONSQUEEZY_USER_NOT_FOUND',
            'Unable to match Lemon Squeezy subscription to a user',
        )
    subscription = _upsert_subscription_from_resource(
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
    if user is None:
        return 'ignored_user_not_found', None
    subscription = _upsert_subscription_from_resource(
        db,
        event_name=event.event_name,
        data=event.data,
        user=user,
        fallback_order_id=event.resource_id,
    )
    if not _variant_matches_pro_plan(subscription.variant_id):
        return 'ignored_non_pro_variant', user
    return 'order_recorded', user


def _process_subscription_event(db: Session, event: LemonSqueezyWebhookEvent, user: User | None) -> tuple[str, User | None]:
    if user is None:
        return 'ignored_user_not_found', None
    subscription = _upsert_subscription_from_resource(
        db,
        event_name=event.event_name,
        data=event.data,
        user=user,
    )
    if not _variant_matches_pro_plan(subscription.variant_id):
        return 'ignored_non_pro_variant', user
    _sync_user_plan(db, user)
    return 'subscription_synced', user


def _process_subscription_payment_success(db: Session, event: LemonSqueezyWebhookEvent, user: User | None) -> tuple[str, User | None]:
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
    if not _variant_matches_pro_plan(subscription.variant_id):
        return 'ignored_non_pro_variant', resolved_user

    invoice_id = str(event.data.get('id') or '').strip() or None
    subscription.last_invoice_id = invoice_id
    subscription.last_payment_status = 'success'
    subscription.last_payment_at = _parse_iso_datetime(attributes.get('updated_at')) or _utc_now()
    subscription.last_event_name = event.event_name
    subscription.last_event_at = _utc_now()
    subscription.updated_at = _utc_now()
    db.add(subscription)
    _sync_user_plan(db, resolved_user)
    return 'payment_recorded', resolved_user


def process_lemonsqueezy_webhook_event(db: Session, event: LemonSqueezyWebhookEvent) -> tuple[str, str | None]:
    if event.event_name not in HANDLED_LEMONSQUEEZY_EVENTS:
        return 'ignored_unhandled_event', None

    user = _match_user_for_event(db, event)
    if event.event_name == 'order_created':
        outcome, resolved_user = _process_order_created(db, event, user)
    elif event.event_name in {'subscription_created', 'subscription_updated', 'subscription_cancelled'}:
        outcome, resolved_user = _process_subscription_event(db, event, user)
    else:
        outcome, resolved_user = _process_subscription_payment_success(db, event, user)
    return outcome, resolved_user.public_id if resolved_user is not None else None
