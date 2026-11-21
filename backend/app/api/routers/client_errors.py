from __future__ import annotations

import json
import logging
import math
import os
import random
import re
import threading
import time
from collections import deque
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Request, status

from app.core.config import settings
from app.core.errors import ApiHTTPException, api_error
from app.core.network import client_ip_from_request, client_network_from_request
from app.services.audit import mask_capability_url_text

router = APIRouter(tags=['client-errors'])
logger = logging.getLogger(__name__)

# Hard bounds so an unauthenticated endpoint cannot be abused for log/memory amplification.
MAX_CLIENT_ERROR_BODY_BYTES = 16 * 1024
DEFAULT_RATE_LIMIT_PER_MINUTE = 30
RATE_LIMIT_WINDOW_SECONDS = 60.0
RATE_LIMIT_MAX_BUCKETS = 10_000
MAX_CSP_REPORTS_PER_BATCH = 5

ALLOWED_KINDS = frozenset({'error', 'unhandledrejection', 'csp'})
ALLOWED_CONTENT_TYPES = frozenset({
    'application/json',
    'application/csp-report',
    'application/reports+json',
    'text/plain',
})
# Known-expected Report-Only violations emitted by Next.js inline hydration scripts.
EXPECTED_INLINE_SCRIPT_DIRECTIVES = frozenset({'script-src', 'script-src-elem'})
CANONICAL_OWN_HOSTS = frozenset({'www.picspeak.art', 'picspeak.art'})

SENSITIVE_QUERY_KEYS = frozenset({
    'token',
    'photo_token',
    'generation_token',
    'access_token',
    'guest_token',
    'session_token',
    'refresh_token',
    'id_token',
    'api_key',
    'apikey',
    'key',
    'secret',
    'signature',
    'code',
    'auth',
    'authorization',
    'x-amz-signature',
    'x-amz-credential',
    'x-amz-security-token',
    '__clerk_handshake',
    '__clerk_db_jwt',
    '__clerk_ticket',
    '__clerk_status',
})

_BEARER_PATTERN = re.compile(r'(?i)\bBearer\s+[A-Za-z0-9\-._~+/]+=*')
_QUERY_SECRET_PATTERN = re.compile(
    r'(?i)([?&](?:token|photo_token|generation_token|access_token|guest_token|session_token|refresh_token|id_token|x-amz-signature|x-amz-credential|x-amz-security-token|__clerk_handshake|__clerk_db_jwt)=)[^&\s"\'<>]+'
)

# Module-level RNG hook so tests can assert sampling deterministically.
_sample_random = random.random
_stats_lock = threading.Lock()
_dropped_expected_csp_reports = 0


class _InMemoryIpRateLimiter:
    """Thread-safe, bounded per-IP fixed/sliding-window limiter with zero DB writes."""

    def __init__(self, *, window_seconds: float = RATE_LIMIT_WINDOW_SECONDS, max_buckets: int = RATE_LIMIT_MAX_BUCKETS) -> None:
        self._window_seconds = window_seconds
        self._max_buckets = max_buckets
        self._buckets: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, *, limit: int, now: float | None = None) -> int | None:
        """Record a hit or return Retry-After seconds if the limit is exceeded."""
        if limit <= 0:
            return int(math.ceil(self._window_seconds))
        ts = time.monotonic() if now is None else now
        cutoff = ts - self._window_seconds
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is not None:
                while bucket and bucket[0] <= cutoff:
                    bucket.popleft()
                if not bucket:
                    self._buckets.pop(key, None)
                    bucket = None

            if bucket is None:
                if len(self._buckets) >= self._max_buckets:
                    self._evict_stale(cutoff)
                if len(self._buckets) >= self._max_buckets:
                    oldest_key = next(iter(self._buckets))
                    self._buckets.pop(oldest_key, None)
                bucket = deque()
                self._buckets[key] = bucket

            if len(bucket) >= limit:
                retry_after = max(1, int(math.ceil(bucket[0] + self._window_seconds - ts)))
                return retry_after

            bucket.append(ts)
            return None

    def _evict_stale(self, cutoff: float) -> None:
        stale_keys = [
            bucket_key
            for bucket_key, entries in self._buckets.items()
            if not entries or entries[-1] <= cutoff
        ]
        for bucket_key in stale_keys:
            self._buckets.pop(bucket_key, None)

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


_rate_limiter = _InMemoryIpRateLimiter()


def _record_dropped_expected_csp(count: int = 1) -> None:
    global _dropped_expected_csp_reports
    if count <= 0:
        return
    with _stats_lock:
        _dropped_expected_csp_reports += count


def get_dropped_expected_csp_count() -> int:
    with _stats_lock:
        return _dropped_expected_csp_reports


def reset_client_error_rate_limiter() -> None:
    """Clear in-memory rate-limit and drop counters (intended for unit tests)."""
    global _dropped_expected_csp_reports
    _rate_limiter.reset()
    with _stats_lock:
        _dropped_expected_csp_reports = 0


def _rate_limit_per_minute() -> int:
    raw = os.getenv('CLIENT_ERROR_RATE_LIMIT_PER_MINUTE', '').strip()
    if raw:
        try:
            parsed = int(raw)
            if parsed >= 0:
                return parsed
        except ValueError:
            pass
    return DEFAULT_RATE_LIMIT_PER_MINUTE


def _own_document_hosts() -> frozenset[str]:
    hosts = set(CANONICAL_OWN_HOSTS)
    for origin in [settings.frontend_origin, *settings.backend_cors_origins]:
        if not origin:
            continue
        try:
            hostname = urlsplit(origin).hostname
        except ValueError:
            hostname = None
        if hostname:
            hosts.add(hostname.lower())
    return frozenset(hosts)


def _is_known_expected_csp_violation(details: dict[str, Any], *, fallback_url: str | None = None) -> bool:
    """Return True for Next.js inline hydration script violations on our own documents."""
    directive_raw = str(details.get('effective_directive') or details.get('violated_directive') or '').strip()
    directive = directive_raw.split()[0].lower() if directive_raw else ''
    if directive not in EXPECTED_INLINE_SCRIPT_DIRECTIVES:
        return False

    blocked_uri = str(details.get('blocked_uri') or '').strip().strip("'\"").lower()
    if blocked_uri != 'inline':
        return False

    doc_url = details.get('document_uri') or fallback_url
    if not isinstance(doc_url, str) or not doc_url:
        return False
    try:
        hostname = urlsplit(doc_url).hostname
    except ValueError:
        return False
    return bool(hostname and hostname.lower() in _own_document_hosts())


def _should_log_csp_report() -> bool:
    rate = float(settings.client_error_csp_sample_rate)
    if rate <= 0.0:
        return False
    if rate >= 1.0:
        return True
    return _sample_random() < rate


def _truncate_text(value: Any, *, max_length: int) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) <= max_length:
        return cleaned
    return f'{cleaned[:max_length]}...<truncated>'


def _sanitize_text(value: Any, *, max_length: int) -> str | None:
    text = _truncate_text(value, max_length=max_length)
    if text is None:
        return None
    masked = mask_capability_url_text(text)
    masked = _BEARER_PATTERN.sub('Bearer ***', masked)
    masked = _QUERY_SECRET_PATTERN.sub(r'\1***', masked)
    return _truncate_text(masked, max_length=max_length)


def _sanitize_url(value: Any, *, max_length: int = 512) -> str | None:
    raw = _truncate_text(value, max_length=max_length * 2)
    if raw is None:
        return None
    if raw in {'inline', 'eval', 'data', 'blob', 'about', 'self', 'wasm-eval'}:
        return raw
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return _sanitize_text(raw, max_length=max_length)

    if parsed.scheme and parsed.scheme.lower() not in {'http', 'https'}:
        # Preserve scheme label (e.g. data/blob/chrome-extension) without arbitrary payloads.
        return f'{parsed.scheme.lower()}:'[:max_length]

    netloc = parsed.netloc
    if '@' in netloc:
        netloc = netloc.rsplit('@', 1)[-1]

    safe_query = ''
    if parsed.query:
        kept_params = [
            (key, val)
            for key, val in parse_qsl(parsed.query, keep_blank_values=False)
            if key.strip().lower() not in SENSITIVE_QUERY_KEYS
        ]
        safe_query = urlencode(kept_params, doseq=True)

    rebuilt = urlunsplit((parsed.scheme, netloc, parsed.path, safe_query, ''))
    return _truncate_text(rebuilt, max_length=max_length)


async def _read_bounded_body(request: Request, *, max_bytes: int = MAX_CLIENT_ERROR_BODY_BYTES) -> bytes:
    content_length = request.headers.get('content-length')
    if content_length:
        try:
            if int(content_length) > max_bytes:
                raise api_error(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, 'REQUEST_TOO_LARGE', 'Request body is too large')
        except ValueError:
            pass

    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        if not chunk:
            continue
        total += len(chunk)
        if total > max_bytes:
            raise api_error(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, 'REQUEST_TOO_LARGE', 'Request body is too large')
        chunks.append(chunk)
    return b''.join(chunks)


def _normalize_csp_violation(body: dict[str, Any]) -> dict[str, Any]:
    document_uri = _sanitize_url(body.get('document-uri') or body.get('documentURL'))
    blocked_uri = _sanitize_url(body.get('blocked-uri') or body.get('blockedURL'))
    effective_directive = _sanitize_text(
        body.get('effective-directive') or body.get('effectiveDirective') or body.get('violated-directive'),
        max_length=128,
    )
    violated_directive = _sanitize_text(
        body.get('violated-directive') or body.get('violatedDirective') or effective_directive,
        max_length=128,
    )
    disposition = _sanitize_text(body.get('disposition'), max_length=32)
    source_file = _sanitize_url(body.get('source-file') or body.get('sourceFile'))
    line_number = body.get('line-number') if 'line-number' in body else body.get('lineNumber')
    column_number = body.get('column-number') if 'column-number' in body else body.get('columnNumber')
    sample = _sanitize_text(body.get('script-sample') or body.get('sample'), max_length=128)

    details: dict[str, Any] = {}
    if document_uri:
        details['document_uri'] = document_uri
    if effective_directive:
        details['effective_directive'] = effective_directive
    if violated_directive:
        details['violated_directive'] = violated_directive
    if blocked_uri:
        details['blocked_uri'] = blocked_uri
    if disposition:
        details['disposition'] = disposition
    if source_file:
        details['source_file'] = source_file
    if isinstance(line_number, int) and line_number >= 0:
        details['line_number'] = line_number
    if isinstance(column_number, int) and column_number >= 0:
        details['column_number'] = column_number
    if sample:
        details['sample'] = sample
    return details


def _csp_summary_message(details: dict[str, Any]) -> str:
    directive = details.get('effective_directive') or details.get('violated_directive') or 'unknown-directive'
    blocked = details.get('blocked_uri') or 'unknown-source'
    disposition = details.get('disposition')
    prefix = f'CSP violation ({disposition})' if disposition else 'CSP violation'
    return f'{prefix}: {directive} blocked {blocked}'[:500]


def _parse_payload(raw_data: Any, *, content_type: str, fallback_ua: str | None) -> dict[str, Any]:
    # 1. Reporting API v1 batch (`application/reports+json`)
    if content_type == 'application/reports+json' or isinstance(raw_data, list):
        if not isinstance(raw_data, list) or not raw_data:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'INVALID_CLIENT_ERROR_REPORT', 'Report batch must be a non-empty JSON array')
        kept_violations: list[tuple[dict[str, Any], str | None, str | None]] = []
        dropped_expected = 0
        valid_count = 0
        for item in raw_data[:MAX_CSP_REPORTS_PER_BATCH]:
            if not isinstance(item, dict):
                continue
            body = item.get('body') if isinstance(item.get('body'), dict) else {}
            violation = _normalize_csp_violation(body)
            if not violation:
                continue
            valid_count += 1
            item_url = _sanitize_url(item.get('url')) or violation.get('document_uri')
            item_ua = _sanitize_text(item.get('user_agent'), max_length=256)
            if _is_known_expected_csp_violation(violation, fallback_url=item_url):
                dropped_expected += 1
                continue
            kept_violations.append((violation, item_url, item_ua))
        if valid_count == 0:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'INVALID_CLIENT_ERROR_REPORT', 'No valid CSP reports in batch')
        if dropped_expected > 0:
            _record_dropped_expected_csp(dropped_expected)
        if not kept_violations:
            return {'dropped': True, 'kind': 'csp'}
        primary, first_url, first_ua = kept_violations[0]
        return {
            'dropped': False,
            'kind': 'csp',
            'source': 'reporting_api',
            'error_message': _csp_summary_message(primary),
            'stack': None,
            'url': first_url or primary.get('document_uri'),
            'user_agent': first_ua or _sanitize_text(fallback_ua, max_length=256),
            'release': 'unknown',
            'csp': primary,
            'report_count': len(kept_violations),
        }

    if not isinstance(raw_data, dict):
        raise api_error(status.HTTP_400_BAD_REQUEST, 'INVALID_CLIENT_ERROR_REPORT', 'Report payload must be a JSON object')

    # 2. Legacy CSP report (`application/csp-report` or `{"csp-report": {...}}`)
    if content_type == 'application/csp-report' or isinstance(raw_data.get('csp-report'), dict):
        csp_body = raw_data.get('csp-report') if isinstance(raw_data.get('csp-report'), dict) else raw_data
        details = _normalize_csp_violation(csp_body)
        if not details:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'INVALID_CLIENT_ERROR_REPORT', 'CSP report body is empty')
        if _is_known_expected_csp_violation(details):
            _record_dropped_expected_csp(1)
            return {'dropped': True, 'kind': 'csp'}
        return {
            'dropped': False,
            'kind': 'csp',
            'source': 'csp_report',
            'error_message': _csp_summary_message(details),
            'stack': None,
            'url': details.get('document_uri'),
            'user_agent': _sanitize_text(fallback_ua, max_length=256),
            'release': 'unknown',
            'csp': details,
            'report_count': 1,
        }

    # 3. First-party browser error report (`application/json`)
    raw_kind = str(raw_data.get('kind') or '').strip().lower()
    if raw_kind not in ALLOWED_KINDS:
        raise api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            'VALIDATION_ERROR',
            'kind must be one of: error, unhandledrejection, csp',
        )

    message = _sanitize_text(raw_data.get('message'), max_length=500)
    if not message:
        raise api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            'VALIDATION_ERROR',
            'message is required',
        )

    stack = _sanitize_text(raw_data.get('stack'), max_length=4000)
    url = _sanitize_url(raw_data.get('url'))
    user_agent = _sanitize_text(raw_data.get('user_agent') or fallback_ua, max_length=256)
    release = _sanitize_text(raw_data.get('release'), max_length=64) or 'unknown'
    source = _sanitize_text(raw_data.get('source'), max_length=64)

    return {
        'dropped': False,
        'kind': raw_kind,
        'source': source or raw_kind,
        'error_message': message,
        'stack': stack,
        'url': url,
        'user_agent': user_agent,
        'release': release,
        'csp': None,
        'report_count': 1,
    }


@router.post('/client-errors', status_code=status.HTTP_202_ACCEPTED)
async def report_client_error(request: Request) -> dict[str, str]:
    rate_key = client_network_from_request(request) or client_ip_from_request(request) or 'unknown'
    retry_after = _rate_limiter.check(rate_key, limit=_rate_limit_per_minute())
    if retry_after is not None:
        raise ApiHTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            code='RATE_LIMIT_EXCEEDED',
            message='Too many client error reports',
            headers={'Retry-After': str(retry_after)},
        )

    raw_content_type = request.headers.get('content-type', '').split(';', 1)[0].strip().lower()
    if raw_content_type and raw_content_type not in ALLOWED_CONTENT_TYPES:
        raise api_error(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            'UNSUPPORTED_MEDIA_TYPE',
            'Unsupported report content type',
        )

    raw_body = await _read_bounded_body(request)
    if not raw_body:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'INVALID_CLIENT_ERROR_REPORT', 'Empty report body')

    try:
        parsed_json = json.loads(raw_body.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'INVALID_CLIENT_ERROR_REPORT', 'Invalid JSON body') from exc

    normalized = _parse_payload(
        parsed_json,
        content_type=raw_content_type or 'application/json',
        fallback_ua=request.headers.get('user-agent'),
    )

    if normalized.get('dropped'):
        return {'status': 'accepted'}

    if normalized['kind'] == 'csp' and not _should_log_csp_report():
        return {'status': 'accepted'}

    log_payload: dict[str, Any] = {
        'event': 'client_error_reported',
        'request_id': getattr(request.state, 'request_id', None),
        'http_method': request.method,
        'request_path': request.url.path,
        'client_ip': client_ip_from_request(request),
        'kind': normalized['kind'],
        'source': normalized['source'],
        'error_message': normalized['error_message'],
        'url': normalized['url'],
        'user_agent': normalized['user_agent'],
        'release': normalized['release'],
        'serviceContext': {
            'service': 'picspeak-frontend',
            'version': normalized['release'],
        },
        'context': {
            'httpRequest': {
                'url': normalized['url'],
                'userAgent': normalized['user_agent'],
            },
        },
    }
    if normalized['stack']:
        log_payload['stack'] = normalized['stack']
    if normalized['csp']:
        log_payload['csp'] = normalized['csp']
    if normalized['report_count'] > 1:
        log_payload['report_count'] = normalized['report_count']

    if normalized['kind'] == 'csp':
        logger.info('Client CSP report received', extra=log_payload)
    else:
        logger.warning('Client error reported', extra=log_payload)
    return {'status': 'accepted'}
