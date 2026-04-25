from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib import error as urllib_error
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib import request as urllib_request

from app.core.security import sign_payload
from app.core.config import settings
from app.db.models import User

ONE_TIME_PRO_BILLING_MODE = 'one_time_pro'
ONE_TIME_PRO_DURATION_DAYS = 30
ONE_TIME_PRO_GRANT_PURPOSE = 'lemonsqueezy_one_time_pro'
ONE_TIME_PRO_GRANT_TTL_SECONDS = 30 * 24 * 3600


class LemonSqueezyConfigurationError(RuntimeError):
    pass


class LemonSqueezyAPIError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, response_body: str | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


@dataclass(slots=True)
class LemonSqueezyCheckout:
    checkout_id: str
    checkout_url: str


def _require_setting(value: str, env_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise LemonSqueezyConfigurationError(f'{env_name} is not configured')
    return normalized


def require_api_key() -> str:
    return _require_setting(settings.lemonsqueezy_api_key, 'LEMONSQUEEZY_API_KEY')


def require_store_id() -> str:
    return _require_setting(settings.lemonsqueezy_store_id, 'LEMONSQUEEZY_STORE_ID')


def require_pro_variant_id() -> str:
    return _require_setting(settings.lemonsqueezy_pro_variant_id, 'LEMONSQUEEZY_PRO_VARIANT_ID')


def configured_checkout_url() -> str:
    configured = settings.lemonsqueezy_pro_checkout_url.strip()
    if configured:
        return configured
    raise LemonSqueezyConfigurationError('LEMONSQUEEZY_PRO_CHECKOUT_URL is not configured')


def configured_image_credit_pack_checkout_url() -> str:
    configured = settings.lemonsqueezy_image_credit_pack_checkout_url.strip()
    if configured:
        return configured
    raise LemonSqueezyConfigurationError('LEMONSQUEEZY_IMAGE_CREDIT_PACK_CHECKOUT_URL is not configured')


def webhook_signing_secret() -> str:
    return _require_setting(settings.lemonsqueezy_webhook_signing_secret, 'LEMONSQUEEZY_WEBHOOK_SIGNING_SECRET')


def checkout_success_url() -> str:
    configured = settings.lemonsqueezy_checkout_success_url.strip()
    if configured:
        return configured
    return f'{settings.frontend_origin}/payment-success'


def configured_webhook_url() -> str:
    return _require_setting(settings.lemonsqueezy_webhook_url, 'LEMONSQUEEZY_WEBHOOK_URL')


def _parse_positive_int(value: str, env_name: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise LemonSqueezyConfigurationError(f'{env_name} must be a positive integer') from exc
    if parsed <= 0:
        raise LemonSqueezyConfigurationError(f'{env_name} must be a positive integer')
    return parsed


def _api_request(path: str, *, method: str = 'GET', payload: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f'https://api.lemonsqueezy.com/v1{path}'
    headers = {
        'Accept': 'application/vnd.api+json',
        'Authorization': f'Bearer {require_api_key()}',
    }
    data: bytes | None = None
    if payload is not None:
        headers['Content-Type'] = 'application/vnd.api+json'
        data = json.dumps(payload).encode('utf-8')

    request = urllib_request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib_request.urlopen(request, timeout=20) as response:
            raw = response.read().decode('utf-8')
    except urllib_error.HTTPError as exc:
        response_body = exc.read().decode('utf-8', errors='replace')
        raise LemonSqueezyAPIError(
            f'Lemon Squeezy API request failed with status {exc.code}',
            status_code=exc.code,
            response_body=response_body,
        ) from exc
    except urllib_error.URLError as exc:
        raise LemonSqueezyAPIError(f'Unable to reach Lemon Squeezy API: {exc.reason}') from exc

    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise LemonSqueezyAPIError('Lemon Squeezy API returned invalid JSON', response_body=raw) from exc
    if not isinstance(decoded, dict):
        raise LemonSqueezyAPIError('Lemon Squeezy API returned an unexpected payload', response_body=raw)
    return decoded


def _pro_checkout_url_for_locale(locale: str | None = None) -> str:
    normalized_locale = str(locale or '').strip().lower()
    if normalized_locale.startswith('zh') and settings.lemonsqueezy_zh_pro_checkout_url.strip():
        return settings.lemonsqueezy_zh_pro_checkout_url.strip()
    return settings.lemonsqueezy_pro_checkout_url.strip()


def _hosted_checkout_for_user(user: User, *, locale: str | None = None) -> LemonSqueezyCheckout | None:
    base_url = _pro_checkout_url_for_locale(locale)
    if not base_url:
        return None

    normalized_locale = str(locale or '').strip().lower()
    parsed = urlsplit(base_url)
    query_params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query_params.update(
        {
            'checkout[email]': user.email,
            'checkout[name]': user.username,
            'checkout[custom][user_id]': user.public_id,
            'checkout[custom][plan]': 'pro',
        }
    )
    if normalized_locale.startswith('zh'):
        grant_token = sign_payload(
            {
                'purpose': ONE_TIME_PRO_GRANT_PURPOSE,
                'user_id': user.public_id,
                'plan': 'pro',
                'billing_mode': ONE_TIME_PRO_BILLING_MODE,
                'duration_days': ONE_TIME_PRO_DURATION_DAYS,
            },
            ttl_seconds=ONE_TIME_PRO_GRANT_TTL_SECONDS,
        )
        query_params.update(
            {
                'checkout[custom][billing_mode]': ONE_TIME_PRO_BILLING_MODE,
                'checkout[custom][duration_days]': str(ONE_TIME_PRO_DURATION_DAYS),
                'checkout[custom][grant_token]': grant_token,
                'checkout[custom][locale]': normalized_locale or 'zh',
            }
        )

    checkout_url = urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode(query_params),
            parsed.fragment,
        )
    )
    return LemonSqueezyCheckout(checkout_id='hosted', checkout_url=checkout_url)


def _append_checkout_data(base_url: str, user: User, custom_data: dict[str, str]) -> str:
    parsed = urlsplit(base_url)
    query_params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query_params.update(
        {
            'checkout[email]': user.email,
            'checkout[name]': user.username,
            'checkout[custom][user_id]': user.public_id,
        }
    )
    for key, value in custom_data.items():
        query_params[f'checkout[custom][{key}]'] = value
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode(query_params),
            parsed.fragment,
        )
    )


def create_image_credit_pack_checkout_for_user(user: User, *, pack: str, credits: int) -> LemonSqueezyCheckout:
    checkout_url = _append_checkout_data(
        configured_image_credit_pack_checkout_url(),
        user,
        {
            'kind': 'image_credit_pack',
            'pack': pack,
            'credits': str(credits),
        },
    )
    return LemonSqueezyCheckout(checkout_id='hosted_image_credit_pack', checkout_url=checkout_url)


def create_checkout_for_user(user: User, *, locale: str | None = None) -> LemonSqueezyCheckout:
    hosted_checkout = _hosted_checkout_for_user(user, locale=locale)
    if hosted_checkout is not None:
        return hosted_checkout

    store_id = require_store_id()
    variant_id = require_pro_variant_id()
    variant_id_int = _parse_positive_int(variant_id, 'LEMONSQUEEZY_PRO_VARIANT_ID')
    payload = {
        'data': {
            'type': 'checkouts',
            'attributes': {
                'checkout_data': {
                    'email': user.email,
                    'name': user.username,
                    'custom': {
                        'user_id': user.public_id,
                        'plan': 'pro',
                    },
                },
                'checkout_options': {
                    'embed': False,
                    'media': True,
                    'logo': True,
                    'subscription_preview': True,
                },
                'product_options': {
                    'redirect_url': checkout_success_url(),
                    'enabled_variants': [variant_id_int],
                },
                'test_mode': settings.lemonsqueezy_checkout_test_mode,
            },
            'relationships': {
                'store': {'data': {'type': 'stores', 'id': store_id}},
                'variant': {'data': {'type': 'variants', 'id': variant_id}},
            },
        }
    }
    response = _api_request('/checkouts', method='POST', payload=payload)
    data = response.get('data')
    if not isinstance(data, dict):
        raise LemonSqueezyAPIError('Lemon Squeezy checkout response is missing data')

    checkout_id = str(data.get('id') or '').strip()
    attributes = data.get('attributes')
    if not checkout_id or not isinstance(attributes, dict):
        raise LemonSqueezyAPIError('Lemon Squeezy checkout response is incomplete')

    checkout_url = str(attributes.get('url') or '').strip()
    if not checkout_url:
        raise LemonSqueezyAPIError('Lemon Squeezy checkout response did not include a checkout URL')
    return LemonSqueezyCheckout(checkout_id=checkout_id, checkout_url=checkout_url)


def retrieve_subscription(subscription_id: str) -> dict[str, Any]:
    normalized = subscription_id.strip()
    if not normalized:
        raise LemonSqueezyAPIError('Subscription id is required')
    response = _api_request(f'/subscriptions/{normalized}')
    data = response.get('data')
    if not isinstance(data, dict):
        raise LemonSqueezyAPIError('Lemon Squeezy subscription response is missing data')
    return data


def create_webhook(*, url: str, events: list[str], secret: str, test_mode: bool | None = None) -> dict[str, Any]:
    payload = {
        'data': {
            'type': 'webhooks',
            'attributes': {
                'url': url,
                'events': events,
                'secret': secret,
                'test_mode': settings.lemonsqueezy_webhook_test_mode if test_mode is None else test_mode,
            },
            'relationships': {
                'store': {'data': {'type': 'stores', 'id': require_store_id()}},
            },
        }
    }
    return _api_request('/webhooks', method='POST', payload=payload)
