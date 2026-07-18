from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

import urllib3


@dataclass(slots=True)
class PooledHTTPResponse:
    status: int
    data: bytes
    headers: Mapping[str, str]
    reason: str


class PooledHTTPStatusError(RuntimeError):
    def __init__(self, response: PooledHTTPResponse) -> None:
        super().__init__(f'HTTP {response.status}: {response.reason}')
        self.response = response


class PooledHTTPRequestError(RuntimeError):
    pass


_HTTP_POOL = urllib3.PoolManager(num_pools=16, maxsize=16, retries=False)


def pooled_request(
    method: str,
    url: str,
    *,
    body: bytes | None = None,
    headers: Mapping[str, str] | None = None,
    timeout_seconds: int | float | None = None,
) -> PooledHTTPResponse:
    timeout = urllib3.Timeout(total=timeout_seconds) if timeout_seconds is not None else None
    try:
        raw_response = _HTTP_POOL.request(
            method.upper(),
            url,
            body=body,
            headers=dict(headers or {}),
            timeout=timeout,
            preload_content=True,
        )
    except urllib3.exceptions.HTTPError as exc:
        raise PooledHTTPRequestError(str(exc)) from exc

    response = PooledHTTPResponse(
        status=int(raw_response.status),
        data=bytes(raw_response.data or b''),
        headers=raw_response.headers,
        reason=str(raw_response.reason or ''),
    )
    if response.status >= 400:
        raise PooledHTTPStatusError(response)
    return response
