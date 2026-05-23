from __future__ import annotations

import base64
import json
import logging
import threading
import time
from dataclasses import dataclass
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi import status

from app.core.config import settings
from app.core.errors import api_error
from app.core.http_client import PooledHTTPRequestError, PooledHTTPStatusError, pooled_request

logger = logging.getLogger(__name__)
_JWKS_CACHE_TTL_SECONDS = 300
_jwks_cache: dict[str, Any] = {'expires_at': 0.0, 'keys': []}
_jwks_cache_lock = threading.Lock()
_CLERK_BACKEND_USER_AGENT = 'PicSpeak Clerk Backend Adapter'


@dataclass(slots=True)
class ClerkIdentity:
    session_id: str
    user_id: str
    email: str
    email_verified: bool
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    avatar_url: str | None = None


def _require_clerk_secret_key() -> str:
    secret_key = settings.clerk_secret_key.strip()
    if not secret_key:
        raise api_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            'CLERK_NOT_CONFIGURED',
            'Clerk backend verification is not configured',
        )
    return secret_key


def _b64url_decode(raw: str) -> bytes:
    padding = '=' * (-len(raw) % 4)
    try:
        return base64.urlsafe_b64decode(raw + padding)
    except ValueError as exc:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_TOKEN_INVALID', 'Invalid Clerk session token') from exc


def _decode_jwt_segment(raw: str) -> dict[str, Any]:
    try:
        parsed = json.loads(_b64url_decode(raw).decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_TOKEN_INVALID', 'Invalid Clerk session token') from exc
    if not isinstance(parsed, dict):
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_TOKEN_INVALID', 'Invalid Clerk session token')
    return parsed


def _parse_clerk_error(raw_payload: bytes, reason: str) -> str:
    try:
        payload = json.loads(raw_payload.decode('utf-8'))
    except Exception:
        return reason or 'Request failed'

    if isinstance(payload, dict):
        errors = payload.get('errors')
        if isinstance(errors, list) and errors:
            first = errors[0]
            if isinstance(first, dict):
                message = first.get('long_message') or first.get('message')
                if isinstance(message, str) and message.strip():
                    return message.strip()
        message = payload.get('message')
        if isinstance(message, str) and message.strip():
            return message.strip()
    return reason or 'Request failed'


def _clerk_request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    secret_key = _require_clerk_secret_key()
    body = json.dumps(payload).encode('utf-8') if payload is not None else None
    headers = {
        'Authorization': f'Bearer {secret_key}',
        'Accept': 'application/json',
        'Clerk-API-Version': settings.clerk_api_version.strip(),
        'User-Agent': _CLERK_BACKEND_USER_AGENT,
    }
    if body is not None:
        headers['Content-Type'] = 'application/json'

    try:
        response = pooled_request(
            method,
            f"{settings.clerk_api_url.rstrip('/')}{path}",
            body=body,
            headers=headers,
            timeout_seconds=10,
        )
        raw = response.data.decode('utf-8')
    except PooledHTTPStatusError as exc:
        response = exc.response
        logger.warning(
            'Clerk API %s %s failed with HTTP %s',
            method,
            path,
            response.status,
        )
        message = _parse_clerk_error(response.data, response.reason)
        if response.status in {401, 403, 404}:
            raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_API_UNAUTHORIZED', message) from exc
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'CLERK_API_FAILED', message) from exc
    except PooledHTTPRequestError as exc:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'CLERK_API_UNREACHABLE', f'Clerk API request failed: {exc}') from exc

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'CLERK_API_INVALID_RESPONSE', 'Clerk API returned invalid JSON') from exc

    if not isinstance(parsed, dict):
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'CLERK_API_INVALID_RESPONSE', 'Clerk API returned an invalid payload')
    return parsed


def _refresh_jwks(now: float) -> list[dict[str, Any]]:
    payload = _clerk_request('GET', '/v1/jwks')
    keys = payload.get('keys')
    if not isinstance(keys, list):
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'CLERK_JWKS_INVALID', 'Clerk JWKS response is invalid')

    normalized_keys = [item for item in keys if isinstance(item, dict)]
    _jwks_cache['expires_at'] = now + _JWKS_CACHE_TTL_SECONDS
    _jwks_cache['keys'] = normalized_keys
    return list(normalized_keys)


def _fetch_jwks(*, force_refresh: bool = False) -> list[dict[str, Any]]:
    now = time.time()
    if not force_refresh and _jwks_cache['expires_at'] > now and _jwks_cache['keys']:
        return list(_jwks_cache['keys'])

    with _jwks_cache_lock:
        now = time.time()
        if not force_refresh and _jwks_cache['expires_at'] > now and _jwks_cache['keys']:
            return list(_jwks_cache['keys'])
        return _refresh_jwks(now)


def _rsa_verify_rs256(signing_input: bytes, signature: bytes, jwk: dict[str, Any]) -> bool:
    n_raw = jwk.get('n')
    e_raw = jwk.get('e')
    if not isinstance(n_raw, str) or not isinstance(e_raw, str):
        return False

    try:
        modulus = int.from_bytes(_b64url_decode(n_raw), 'big')
        exponent = int.from_bytes(_b64url_decode(e_raw), 'big')
        public_key = rsa.RSAPublicNumbers(exponent, modulus).public_key()
        public_key.verify(signature, signing_input, padding.PKCS1v15(), hashes.SHA256())
    except InvalidSignature:
        return False
    except (OverflowError, TypeError, ValueError):
        return False
    return True


def _allowed_authorized_parties() -> set[str]:
    candidates = {settings.frontend_origin.strip().rstrip('/')}
    candidates.update(origin.strip().rstrip('/') for origin in settings.backend_cors_origins if str(origin).strip())
    return {item for item in candidates if item}


def _verify_authorized_party(payload: dict[str, Any]) -> None:
    azp = payload.get('azp')
    if azp is None:
        return
    if not isinstance(azp, str) or not azp.strip():
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_TOKEN_INVALID', 'Invalid Clerk authorized party claim')
    if azp.strip().rstrip('/') not in _allowed_authorized_parties():
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_TOKEN_INVALID', 'Unexpected Clerk authorized party')


def _verify_session_jwt(session_token: str) -> tuple[dict[str, Any], dict[str, Any]]:
    parts = session_token.split('.')
    if len(parts) != 3 or not all(parts):
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_TOKEN_INVALID', 'Invalid Clerk session token')

    header = _decode_jwt_segment(parts[0])
    payload = _decode_jwt_segment(parts[1])
    signature = _b64url_decode(parts[2])

    algorithm = header.get('alg')
    key_id = header.get('kid')
    if algorithm != 'RS256' or not isinstance(key_id, str) or not key_id.strip():
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_TOKEN_INVALID', 'Unsupported Clerk session token')

    jwk = next((item for item in _fetch_jwks() if item.get('kid') == key_id), None)
    if jwk is None:
        jwk = next((item for item in _fetch_jwks(force_refresh=True) if item.get('kid') == key_id), None)
    if jwk is None:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_TOKEN_INVALID', 'Unable to verify Clerk session token')

    signing_input = f'{parts[0]}.{parts[1]}'.encode('utf-8')
    if not _rsa_verify_rs256(signing_input, signature, jwk):
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_TOKEN_INVALID', 'Unable to verify Clerk session token')

    now = int(time.time())
    exp = payload.get('exp')
    if not isinstance(exp, int) or exp < now:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_TOKEN_INVALID', 'Clerk session token expired')

    nbf = payload.get('nbf')
    if isinstance(nbf, int) and nbf > now:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_TOKEN_INVALID', 'Clerk session token is not active yet')

    _verify_authorized_party(payload)
    return header, payload


def _extract_primary_email(user_payload: dict[str, Any]) -> tuple[str, bool]:
    primary_email_id = user_payload.get('primary_email_address_id')
    email_addresses = user_payload.get('email_addresses')
    if not isinstance(email_addresses, list) or not email_addresses:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_EMAIL_MISSING', 'Clerk user does not have an email address')

    selected: dict[str, Any] | None = None
    for item in email_addresses:
        if not isinstance(item, dict):
            continue
        if primary_email_id and item.get('id') == primary_email_id:
            selected = item
            break
        if selected is None:
            selected = item

    if selected is None:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_EMAIL_MISSING', 'Clerk user does not have an email address')

    email = selected.get('email_address')
    if not isinstance(email, str) or not email.strip():
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_EMAIL_MISSING', 'Clerk user does not have an email address')

    verification = selected.get('verification')
    verified = False
    if isinstance(verification, dict):
        verified = verification.get('status') == 'verified'

    return email.strip(), verified


def verify_clerk_session_token(session_token: str) -> ClerkIdentity:
    _header, payload = _verify_session_jwt(session_token)

    session_id = payload.get('sid')
    if not isinstance(session_id, str) or not session_id.strip():
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_SESSION_ID_MISSING', 'Invalid Clerk session token')

    user_id = payload.get('sub')
    if not isinstance(user_id, str) or not user_id.strip():
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_USER_ID_MISSING', 'Clerk session is missing a user')
    user_id = user_id.strip()

    user_payload = _clerk_request('GET', f'/v1/users/{user_id}')
    email, email_verified = _extract_primary_email(user_payload)

    first_name = user_payload.get('first_name')
    last_name = user_payload.get('last_name')
    username = user_payload.get('username')
    image_url = user_payload.get('image_url')

    return ClerkIdentity(
        session_id=session_id.strip(),
        user_id=user_id,
        email=email,
        email_verified=email_verified,
        first_name=first_name.strip() if isinstance(first_name, str) and first_name.strip() else None,
        last_name=last_name.strip() if isinstance(last_name, str) and last_name.strip() else None,
        username=username.strip() if isinstance(username, str) and username.strip() else None,
        avatar_url=image_url.strip() if isinstance(image_url, str) and image_url.strip() else None,
    )
