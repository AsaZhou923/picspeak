from __future__ import annotations

from datetime import datetime, timedelta, timezone
from ipaddress import IPv6Address, ip_address, ip_network
import json
import re
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlencode
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ApiRequestLog


MAX_LOG_BODY_CHARS = 4000


SENSITIVE_SECRET_FIELDS = frozenset({
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
    'grant_token',
    'activation_code',
})

SENSITIVE_USER_CONTENT_FIELDS = frozenset({
    'prompt',
    'revised_prompt',
    'note',
    'notes',
    'tags',
    'feedback',
    'comment',
    'comments',
    'metadata',
    'metadata_json',
    'text',
    'reason',
    'description',
    'goal',
    'goal_snapshot',
    'success_criteria',
    'message',
})

SENSITIVE_JSON_FIELDS = set(SENSITIVE_SECRET_FIELDS | SENSITIVE_USER_CONTENT_FIELDS)

SENSITIVE_QUERY_FIELDS = {
    'access_token',
    'refresh_token',
    'id_token',
    'guest_token',
    'session_token',
    'photo_token',
    'generation_token',
    'share_token',
    'signature',
    'code',
    'token',
    'state',
    'x-amz-credential',
    'x-amz-security-token',
    'x-amz-signature',
}

CAPABILITY_QUERY_FIELDS = frozenset({
    *SENSITIVE_QUERY_FIELDS,
    'x-goog-signature',
    'x-goog-credential',
})

# Path segments that are themselves capabilities, e.g. /public/reviews/{share_token}.
_CAPABILITY_PATH_RE = re.compile(r'(/(?:public/reviews|share)/)([^/?#\s"\'<>]+)', re.IGNORECASE)


def mask_capability_path(path: str) -> str:
    """Mask capability-bearing path segments such as /public/reviews/{share_token}."""
    return _CAPABILITY_PATH_RE.sub(r'\1***', path)


def _mask_sensitive_text(text: str, *, fields: Iterable[str] = SENSITIVE_JSON_FIELDS) -> str:
    # Lightweight masking for JSON-like request payloads persisted in audit logs.
    masked = text
    for key in fields:
        masked = re.sub(
            rf'("{re.escape(key)}"\s*:\s*")([^"\\]*(?:\\.[^"\\]*)*)(")',
            r'\1***\3',
            masked,
            flags=re.IGNORECASE,
        )
    return masked


def _mask_form_encoded_text(text: str, *, fields: Iterable[str] = SENSITIVE_JSON_FIELDS) -> str:
    masked = text
    for key in fields:
        masked = re.sub(
            rf'((?:^|[?&]){re.escape(key)}=)([^&]*)',
            r'\1***',
            masked,
            flags=re.IGNORECASE,
        )
    return masked


def _redact_json_value(value: Any, *, fields: frozenset[str]) -> Any:
    if isinstance(value, dict):
        redacted: dict[Any, Any] = {}
        for key, item in value.items():
            if isinstance(key, str) and key.strip().lower() in fields:
                redacted[key] = '***'
            else:
                redacted[key] = _redact_json_value(item, fields=fields)
        return redacted
    if isinstance(value, list):
        return [_redact_json_value(item, fields=fields) for item in value]
    return value


def mask_capability_url_text(text: str) -> str:
    """Mask query values that grant image/object access in provider echoes."""
    masked = _mask_sensitive_text(str(text), fields=SENSITIVE_SECRET_FIELDS)
    masked = _mask_form_encoded_text(masked, fields=SENSITIVE_SECRET_FIELDS)
    for key in CAPABILITY_QUERY_FIELDS:
        masked = re.sub(
            rf'((?:^|[?&]|%3[fF]|%26|\\u0026|\\u003[fF]|&amp;){re.escape(key)}(?:=|%3[dD]|\\u003[dD]))'
            r'.*?'
            r'(?=$|[&\s"\'<>]|%26|\\u0026|&amp;)',
            r'\1***',
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
        (key, '***' if key.strip().lower() in CAPABILITY_QUERY_FIELDS else value)
        for key, value in parsed
    ]
    return urlencode(sanitized, doseq=True)


def _truncate_client_ip(client_ip: str | None) -> str | None:
    """Coarsen client IPs for audit storage: IPv4 to /24, IPv6 to /48."""
    if not client_ip:
        return None
    candidate = client_ip.strip()
    if not candidate:
        return None
    try:
        address = ip_address(candidate)
    except ValueError:
        return None
    if isinstance(address, IPv6Address):
        if address.ipv4_mapped is not None:
            return str(ip_network(f'{address.ipv4_mapped}/24', strict=False))
        return str(ip_network(f'{address}/48', strict=False))
    return str(ip_network(f'{address}/24', strict=False))


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
    redact_fields = frozenset(key.lower() for key in SENSITIVE_JSON_FIELDS)
    try:
        parsed = json.loads(content)
    except ValueError:
        pass
    else:
        if isinstance(parsed, (dict, list)):
            content = json.dumps(
                _redact_json_value(parsed, fields=redact_fields),
                ensure_ascii=False,
                separators=(',', ':'),
            )
    content = _mask_sensitive_text(content, fields=SENSITIVE_JSON_FIELDS)
    content = _mask_form_encoded_text(content, fields=SENSITIVE_JSON_FIELDS)
    content = mask_capability_url_text(content)
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
        path=mask_capability_path(path),
        query_string=_safe_query_string(query_string),
        endpoint=mask_capability_path(endpoint) if endpoint else endpoint,
        client_ip=_truncate_client_ip(client_ip),
        user_public_id=user_public_id,
        user_agent=user_agent,
        request_body=_safe_text_from_body(request_body),
        status_code=status_code,
        duration_ms=duration_ms,
        created_at=datetime.now(timezone.utc),
    )
    db.add(record)


def cleanup_expired_request_logs(db: Session, *, limit: int | None = None) -> int:
    """Delete one bounded chunk of request logs older than the retention period."""
    retention_days = int(settings.api_request_log_retention_days or 0)
    if retention_days <= 0:
        return 0
    chunk = min(max(int(limit or settings.api_request_log_cleanup_batch_size or 1000), 1), 10000)
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    ids = (
        select(ApiRequestLog.id)
        .where(ApiRequestLog.created_at < cutoff)
        .order_by(ApiRequestLog.created_at, ApiRequestLog.id)
        .limit(chunk)
    )
    deleted = db.query(ApiRequestLog).filter(ApiRequestLog.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return int(deleted or 0)
