from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status


DEFAULT_ERROR_CODES: dict[int, str] = {
    status.HTTP_400_BAD_REQUEST: 'BAD_REQUEST',
    status.HTTP_401_UNAUTHORIZED: 'UNAUTHORIZED',
    status.HTTP_403_FORBIDDEN: 'FORBIDDEN',
    status.HTTP_404_NOT_FOUND: 'NOT_FOUND',
    status.HTTP_409_CONFLICT: 'CONFLICT',
    status.HTTP_422_UNPROCESSABLE_ENTITY: 'VALIDATION_ERROR',
    status.HTTP_429_TOO_MANY_REQUESTS: 'RATE_LIMITED',
    status.HTTP_500_INTERNAL_SERVER_ERROR: 'INTERNAL_ERROR',
    status.HTTP_502_BAD_GATEWAY: 'UPSTREAM_ERROR',
    status.HTTP_503_SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
}


class ApiHTTPException(HTTPException):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        detail: dict[str, Any] = {'code': code, 'message': message}
        if extra:
            detail['extra'] = extra
        super().__init__(status_code=status_code, detail=detail, headers=headers)


def api_error(status_code: int, code: str, message: str, **extra: Any) -> ApiHTTPException:
    return ApiHTTPException(status_code=status_code, code=code, message=message, extra=extra or None)


def normalize_http_error(status_code: int, detail: Any) -> tuple[str, str, dict[str, Any] | None]:
    if isinstance(detail, dict):
        code = str(detail.get('code') or DEFAULT_ERROR_CODES.get(status_code) or 'HTTP_ERROR')
        message = str(detail.get('message') or detail.get('detail') or 'Request failed')
        extra = detail.get('extra')
        return code, message, extra if isinstance(extra, dict) else None
    if isinstance(detail, str) and detail.strip():
        return DEFAULT_ERROR_CODES.get(status_code) or 'HTTP_ERROR', detail.strip(), None
    return DEFAULT_ERROR_CODES.get(status_code) or 'HTTP_ERROR', 'Request failed', None
