import base64
import hashlib
import hmac
import json
import time
from typing import Any

from fastapi import HTTPException, status

from app.core.config import settings


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
