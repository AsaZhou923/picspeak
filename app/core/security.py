import base64
import hashlib
import hmac
import json
import time
from typing import Any

from fastapi import HTTPException, status

from app.core.config import settings


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
    serialized = json.dumps(body, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    payload_encoded = _b64url_encode(serialized)
    signature = hmac.new(settings.app_secret.encode('utf-8'), payload_encoded.encode('utf-8'), hashlib.sha256).digest()
    return f"{payload_encoded}.{_b64url_encode(signature)}"


def verify_payload(token: str) -> dict[str, Any]:
    try:
        payload_encoded, signature_encoded = token.split('.', 1)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid token format') from exc

    expected = hmac.new(settings.app_secret.encode('utf-8'), payload_encoded.encode('utf-8'), hashlib.sha256).digest()
    received = _b64url_decode(signature_encoded)
    if not hmac.compare_digest(expected, received):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid token signature')

    payload = json.loads(_b64url_decode(payload_encoded).decode('utf-8'))
    if int(payload.get('exp', 0)) < int(time.time()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Token expired')
    return payload


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
