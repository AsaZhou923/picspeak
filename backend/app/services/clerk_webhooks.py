from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any

from fastapi import Request, status

from app.core.config import settings
from app.core.errors import api_error

_WEBHOOK_TOLERANCE_SECONDS = 5 * 60
_WEBHOOK_ID_HEADERS = ('svix-id', 'webhook-id')
_WEBHOOK_TIMESTAMP_HEADERS = ('svix-timestamp', 'webhook-timestamp')
_WEBHOOK_SIGNATURE_HEADERS = ('svix-signature', 'webhook-signature')


@dataclass(slots=True)
class ClerkWebhookEvent:
    type: str
    data: dict[str, Any]
    event_attributes: dict[str, Any] | None = None


def _require_webhook_secret() -> str:
    secret = settings.clerk_webhook_signing_secret.strip()
    if not secret:
        raise api_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            'CLERK_WEBHOOK_NOT_CONFIGURED',
            'Clerk webhook verification is not configured',
        )
    return secret


def _decode_secret(secret: str) -> bytes:
    normalized = secret.strip()
    if normalized.startswith('whsec_'):
        normalized = normalized[len('whsec_') :]
    try:
        return base64.b64decode(normalized, validate=True)
    except Exception as exc:
        raise api_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            'CLERK_WEBHOOK_SECRET_INVALID',
            'Clerk webhook signing secret is invalid',
        ) from exc


def _header_value(request: Request, names: tuple[str, ...]) -> str:
    for name in names:
        value = request.headers.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ''


def _verify_timestamp(timestamp_header: str) -> int:
    try:
        timestamp = int(timestamp_header)
    except ValueError as exc:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'CLERK_WEBHOOK_SIGNATURE_INVALID',
            'Webhook timestamp header is invalid',
        ) from exc

    now = int(time.time())
    if now - timestamp > _WEBHOOK_TOLERANCE_SECONDS or timestamp > now + _WEBHOOK_TOLERANCE_SECONDS:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'CLERK_WEBHOOK_SIGNATURE_INVALID',
            'Webhook timestamp is outside the allowed tolerance',
        )
    return timestamp


def _expected_signature(secret: bytes, *, message_id: str, timestamp: int, payload: str) -> str:
    signed_payload = f'{message_id}.{timestamp}.{payload}'.encode('utf-8')
    digest = hmac.new(secret, signed_payload, hashlib.sha256).digest()
    return base64.b64encode(digest).decode('utf-8')


def _verify_signature(signature_header: str, expected_signature: str) -> None:
    candidates = [item.strip() for item in signature_header.split(' ') if item.strip()]
    for candidate in candidates:
        version, separator, signature = candidate.partition(',')
        if separator != ',' or version != 'v1' or not signature:
            continue
        if hmac.compare_digest(signature, expected_signature):
            return

    raise api_error(
        status.HTTP_401_UNAUTHORIZED,
        'CLERK_WEBHOOK_SIGNATURE_INVALID',
        'Unable to verify Clerk webhook signature',
    )


async def verify_clerk_webhook(request: Request) -> ClerkWebhookEvent:
    secret = _decode_secret(_require_webhook_secret())
    message_id = _header_value(request, _WEBHOOK_ID_HEADERS)
    timestamp_header = _header_value(request, _WEBHOOK_TIMESTAMP_HEADERS)
    signature_header = _header_value(request, _WEBHOOK_SIGNATURE_HEADERS)

    if not message_id or not timestamp_header or not signature_header:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'CLERK_WEBHOOK_HEADERS_MISSING',
            'Missing required Clerk webhook headers',
        )

    raw_body = await request.body()
    try:
        payload_text = raw_body.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'CLERK_WEBHOOK_PAYLOAD_INVALID',
            'Webhook body must be valid UTF-8',
        ) from exc

    timestamp = _verify_timestamp(timestamp_header)
    expected_signature = _expected_signature(secret, message_id=message_id, timestamp=timestamp, payload=payload_text)
    _verify_signature(signature_header, expected_signature)

    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError as exc:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'CLERK_WEBHOOK_PAYLOAD_INVALID',
            'Webhook body must be valid JSON',
        ) from exc

    if not isinstance(payload, dict):
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'CLERK_WEBHOOK_PAYLOAD_INVALID',
            'Webhook payload must be an object',
        )

    event_type = payload.get('type')
    data = payload.get('data')
    event_attributes = payload.get('event_attributes')
    if not isinstance(event_type, str) or not event_type.strip():
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'CLERK_WEBHOOK_PAYLOAD_INVALID',
            'Webhook payload is missing an event type',
        )
    if not isinstance(data, dict):
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'CLERK_WEBHOOK_PAYLOAD_INVALID',
            'Webhook payload is missing event data',
        )
    if event_attributes is not None and not isinstance(event_attributes, dict):
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'CLERK_WEBHOOK_PAYLOAD_INVALID',
            'Webhook event attributes must be an object',
        )

    return ClerkWebhookEvent(
        type=event_type.strip(),
        data=data,
        event_attributes=event_attributes,
    )
