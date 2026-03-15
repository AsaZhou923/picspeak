from __future__ import annotations

from datetime import datetime, timezone
import re
from urllib.parse import parse_qsl, urlencode
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.models import ApiRequestLog


MAX_LOG_BODY_CHARS = 4000


SENSITIVE_JSON_FIELDS = {
    'password',
    'token',
    'access_token',
    'refresh_token',
    'id_token',
    'guest_token',
    'session_token',
    'clerk_session_token',
    'client_secret',
    'secret',
    'authorization',
}

SENSITIVE_QUERY_FIELDS = {
    'access_token',
    'refresh_token',
    'id_token',
    'guest_token',
    'session_token',
    'code',
    'token',
    'state',
}


def _mask_sensitive_text(text: str) -> str:
    # Lightweight masking for JSON-like request payloads persisted in audit logs.
    masked = text
    for key in SENSITIVE_JSON_FIELDS:
        masked = re.sub(
            rf'("{key}"\s*:\s*")([^"\\]*(?:\\.[^"\\]*)*)(")',
            rf'\1***\3',
            masked,
            flags=re.IGNORECASE,
        )
    return masked


def _mask_form_encoded_text(text: str) -> str:
    masked = text
    for key in SENSITIVE_JSON_FIELDS:
        masked = re.sub(
            rf'((?:^|[?&]){re.escape(key)}=)([^&]*)',
            rf'\1***',
            masked,
            flags=re.IGNORECASE,
        )
    return masked


def _safe_query_string(query_string: str | None) -> str | None:
    if not query_string:
        return None
    try:
        parsed = parse_qsl(query_string, keep_blank_values=True)
    except Exception:
        return _mask_form_encoded_text(query_string)

    sanitized = [
        (key, '***' if key.strip().lower() in SENSITIVE_QUERY_FIELDS else value)
        for key, value in parsed
    ]
    return urlencode(sanitized, doseq=True)



def _safe_text_from_body(body: bytes) -> str | None:
    if not body:
        return None
    try:
        content = body.decode('utf-8', errors='ignore')
    except Exception:
        return None
    content = content.strip()
    if not content:
        return None
    content = _mask_sensitive_text(content)
    content = _mask_form_encoded_text(content)
    if len(content) > MAX_LOG_BODY_CHARS:
        return content[:MAX_LOG_BODY_CHARS] + '...<truncated>'
    return content


def log_api_request(
    db: Session,
    *,
    request_id: str,
    method: str,
    path: str,
    query_string: str | None,
    endpoint: str | None,
    client_ip: str | None,
    user_public_id: str | None,
    user_agent: str | None,
    request_body: bytes,
    status_code: int,
    duration_ms: int,
) -> None:
    record = ApiRequestLog(
        request_id=request_id or f'req_{uuid4().hex[:16]}',
        method=method,
        path=path,
        query_string=_safe_query_string(query_string),
        endpoint=endpoint,
        client_ip=client_ip,
        user_public_id=user_public_id,
        user_agent=user_agent,
        request_body=_safe_text_from_body(request_body),
        status_code=status_code,
        duration_ms=duration_ms,
        created_at=datetime.now(timezone.utc),
    )
    db.add(record)
