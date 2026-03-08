from __future__ import annotations

from datetime import datetime, timezone
import re
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
    'client_secret',
    'secret',
    'authorization',
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
        query_string=query_string,
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
