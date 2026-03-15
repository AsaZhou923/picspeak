import base64
import hashlib
import hmac
import json
import time
from typing import Any

from app.core.config import settings
from app.core.errors import api_error


class JWTValidationError(ValueError):
    pass


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode('utf-8').rstrip('=')


def _b64url_decode(raw: str) -> bytes:
    padding = '=' * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def sign_payload(payload: dict[str, Any], ttl_seconds: int) -> str:
    body = payload.copy()
    body['exp'] = int(time.time()) + ttl_seconds
    return sign_payload_with_exp(body, body['exp'])


def sign_payload_with_exp(payload: dict[str, Any], exp_timestamp: int) -> str:
    body = payload.copy()
    body['exp'] = int(exp_timestamp)
    serialized = json.dumps(body, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    payload_encoded = _b64url_encode(serialized)
    signature = hmac.new(settings.app_secret.encode('utf-8'), payload_encoded.encode('utf-8'), hashlib.sha256).digest()
    return f"{payload_encoded}.{_b64url_encode(signature)}"


def verify_payload(token: str) -> dict[str, Any]:
    try:
        payload_encoded, signature_encoded = token.split('.', 1)
    except ValueError as exc:
        raise api_error(400, 'TOKEN_FORMAT_INVALID', 'Invalid token format') from exc

    expected = hmac.new(settings.app_secret.encode('utf-8'), payload_encoded.encode('utf-8'), hashlib.sha256).digest()
    received = _b64url_decode(signature_encoded)
    if not hmac.compare_digest(expected, received):
        raise api_error(400, 'TOKEN_SIGNATURE_INVALID', 'Invalid token signature')

    payload = json.loads(_b64url_decode(payload_encoded).decode('utf-8'))
    if int(payload.get('exp', 0)) < int(time.time()):
        raise api_error(400, 'TOKEN_EXPIRED', 'Token expired')
    return payload




def create_access_token(payload: dict[str, Any], ttl_seconds: int = 24 * 3600) -> str:
    now = int(time.time())
    body = payload.copy()
    body.setdefault('iat', now)
    body.setdefault('nbf', now)
    body.setdefault('exp', now + ttl_seconds)

    header = {'alg': 'HS256', 'typ': 'JWT'}
    issuer = settings.oauth_jwt_issuer.strip()
    if issuer:
        body.setdefault('iss', issuer)
    audience = settings.oauth_jwt_audience.strip()
    if audience:
        body.setdefault('aud', audience)

    header_b64 = _b64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_b64 = _b64url_encode(json.dumps(body, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    signed_part = f'{header_b64}.{payload_b64}'.encode('utf-8')
    signature = hmac.new(settings.oauth_jwt_secret.encode('utf-8'), signed_part, hashlib.sha256).digest()
    return f'{header_b64}.{payload_b64}.{_b64url_encode(signature)}'

def validate_access_token(token: str) -> dict[str, Any]:
    try:
        header_b64, payload_b64, signature_b64 = token.split('.')
    except ValueError as exc:
        raise JWTValidationError('malformed jwt') from exc

    signed_part = f'{header_b64}.{payload_b64}'.encode('utf-8')
    try:
        header = json.loads(_b64url_decode(header_b64).decode('utf-8'))
        payload = json.loads(_b64url_decode(payload_b64).decode('utf-8'))
        signature = _b64url_decode(signature_b64)
    except (json.JSONDecodeError, ValueError) as exc:
        raise JWTValidationError('invalid jwt encoding') from exc

    if header.get('alg') != 'HS256':
        raise JWTValidationError('unsupported jwt alg')

    expected_signature = hmac.new(settings.oauth_jwt_secret.encode('utf-8'), signed_part, hashlib.sha256).digest()
    if not hmac.compare_digest(expected_signature, signature):
        raise JWTValidationError('invalid jwt signature')

    now = int(time.time())
    exp = payload.get('exp')
    if not isinstance(exp, int) or exp < now:
        raise JWTValidationError('jwt expired')

    nbf = payload.get('nbf')
    if isinstance(nbf, int) and nbf > now:
        raise JWTValidationError('jwt not active')

    issuer = settings.oauth_jwt_issuer.strip()
    if issuer and payload.get('iss') != issuer:
        raise JWTValidationError('invalid jwt issuer')

    audience = settings.oauth_jwt_audience.strip()
    if audience:
        aud_claim = payload.get('aud')
        if isinstance(aud_claim, str):
            valid_audience = aud_claim == audience
        elif isinstance(aud_claim, list):
            valid_audience = audience in aud_claim
        else:
            valid_audience = False
        if not valid_audience:
            raise JWTValidationError('invalid jwt audience')

    return payload
