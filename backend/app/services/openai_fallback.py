from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Callable

from app.core.http_client import PooledHTTPRequestError, PooledHTTPResponse, PooledHTTPStatusError


logger = logging.getLogger(__name__)
OFFICIAL_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses'
MAX_RETRY_DELAY_SECONDS = 10
PRIMARY_RETRY_TIMEOUT_SECONDS = 30


def fallback_request_timeout_budget(timeout_seconds: int, primary_attempts: int) -> int:
    return 2 * timeout_seconds + (primary_attempts - 1) * (
        min(timeout_seconds, PRIMARY_RETRY_TIMEOUT_SECONDS) + MAX_RETRY_DELAY_SECONDS
    )


def _retry_delay(exc: PooledHTTPRequestError | PooledHTTPStatusError, attempt: int) -> float:
    delay = min(2 ** attempt, MAX_RETRY_DELAY_SECONDS)
    if not isinstance(exc, PooledHTTPStatusError):
        return delay
    retry_after = next(
        (value for key, value in exc.response.headers.items() if key.lower() == 'retry-after'),
        '',
    )
    if not retry_after:
        return delay
    try:
        return max(delay, float(retry_after))
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(retry_after)
            return max(delay, (retry_at - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return delay


def request_with_openai_fallback(
    *,
    primary_endpoint: str,
    primary_api_key: str,
    fallback_api_key: str,
    primary_attempts: int,
    body: bytes,
    timeout_seconds: int | float,
    request: Callable[..., PooledHTTPResponse],
    on_primary_failure: Callable[[], None],
) -> PooledHTTPResponse:
    fallback_api_key = fallback_api_key.strip()
    attempts = max(1, primary_attempts) if fallback_api_key else 1
    for attempt in range(attempts):
        try:
            return request(
                'POST',
                primary_endpoint,
                body=body,
                headers={
                    'Authorization': f'Bearer {primary_api_key}',
                    'Content-Type': 'application/json',
                },
                timeout_seconds=timeout_seconds if attempt == 0 else min(timeout_seconds, PRIMARY_RETRY_TIMEOUT_SECONDS),
            )
        except (PooledHTTPRequestError, PooledHTTPStatusError) as exc:
            if not fallback_api_key:
                raise
            if isinstance(exc, PooledHTTPStatusError):
                status = exc.response.status
                if status not in {401, 403, 408, 429} and not 500 <= status <= 599:
                    raise
            if attempt + 1 < attempts:
                delay = _retry_delay(exc, attempt)
                # Honor long cooldowns by using the independent official provider.
                if delay > MAX_RETRY_DELAY_SECONDS:
                    on_primary_failure()
                    break
                on_primary_failure()
                time.sleep(delay)
            else:
                on_primary_failure()

    logger.warning('Primary photo review API unavailable; using official OpenAI fallback')
    return request(
        'POST',
        OFFICIAL_RESPONSES_ENDPOINT,
        body=body,
        headers={
            'Authorization': f'Bearer {fallback_api_key}',
            'Content-Type': 'application/json',
        },
        timeout_seconds=timeout_seconds,
    )


def redact_provider_error(text: str, primary_api_key: str, fallback_api_key: str) -> str:
    for api_key in sorted({primary_api_key, fallback_api_key} - {''}, key=len, reverse=True):
        text = text.replace(api_key, '[REDACTED]')
    return re.sub(r'sk-[A-Za-z0-9_-]+', '[REDACTED]', text)
