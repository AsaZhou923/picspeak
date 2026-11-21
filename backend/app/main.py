import asyncio
from contextlib import asynccontextmanager
import logging
import time
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError

from app.api.deps import bind_guest_token
from app.api.request_state import get_current_user_public_id
from app.api.router import router, webhook_router
from app.core.config import settings
from app.core.errors import normalize_http_error
from app.core.network import client_ip_from_request
from app.core.request_limits import RequestBodyLimitMiddleware
from app.db.session import SessionLocal
from app.services.audit import log_api_request
from app.services.worker import worker

logger = logging.getLogger(__name__)
_AUDIT_TASKS: set[asyncio.Task[object]] = set()
_AUDIT_TASK_DRAIN_TIMEOUT_SECONDS = 5.0


def _dev_cors_origin_regex() -> str | None:
    if settings.backend_cors_origin_regex:
        return settings.backend_cors_origin_regex
    if settings.app_env.strip().lower() == 'dev':
        return r'https?://(localhost|127\.0\.0\.1):\d+'
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.run_embedded_worker:
        worker.start()
    yield
    await _drain_audit_tasks()
    if settings.run_embedded_worker:
        worker.stop()


app = FastAPI(title='PicSpeak Backend', version='1.0.0', lifespan=lifespan)
app.add_middleware(RequestBodyLimitMiddleware, max_body_bytes=settings.max_request_body_bytes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_origin_regex=_dev_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allow_headers=[
        'Authorization',
        'Content-Type',
        'Accept',
        'X-Requested-With',
        'Idempotency-Key',
        'X-Guest-Access-Token',
        'X-Device-Id',
        'Cache-Control',
        'Pragma',
    ],
    expose_headers=['X-Request-Id', 'X-Guest-Access-Token', 'Content-Disposition', 'Retry-After'],
)
app.include_router(router)
app.include_router(webhook_router)


def _error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    extra: dict | None = None,
) -> JSONResponse:
    payload: dict[str, object] = {
        'error': {'code': code, 'message': message, 'request_id': getattr(request.state, 'request_id', None)}
    }
    if extra:
        payload['error']['extra'] = extra
    response = JSONResponse(status_code=status_code, content=payload)
    # An error response replaces the one the actor dependency set the new guest's cookie on.
    issued_guest_token = getattr(request.state, 'issued_guest_token', None)
    if issued_guest_token:
        bind_guest_token(response, issued_guest_token)
    return response


def _log_error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    extra: dict | None = None,
    exc: Exception | None = None,
) -> None:
    log_payload = {
        'request_id': getattr(request.state, 'request_id', None),
        'http_method': request.method,
        'request_path': request.url.path,
        'status_code': status_code,
        'error_code': code,
        'error_message': message,
        'client_ip': client_ip_from_request(request),
        'user_public_id': get_current_user_public_id(request),
    }
    if extra:
        log_payload['extra'] = extra

    if exc is not None:
        logger.error(
            'Unhandled API exception',
            extra=log_payload,
            exc_info=(type(exc), exc, exc.__traceback__),
        )
    elif status_code >= 500:
        logger.error('API request failed', extra=log_payload)
    else:
        logger.warning('API request rejected', extra=log_payload)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    code, message, extra = normalize_http_error(exc.status_code, exc.detail)
    _log_error_response(request, status_code=exc.status_code, code=code, message=message, extra=extra)
    response = _error_response(
        request,
        status_code=exc.status_code,
        code=code,
        message=message,
        extra=extra,
    )
    response.headers.update(exc.headers or {})
    return response


def _validation_error_fields(exc: RequestValidationError) -> list[dict]:
    """Keep only JSON-safe location, type and message for each validation error.

    Custom validators put the raised exception object in ``ctx``, which
    JSONResponse cannot serialize; ``input`` may echo user content into logs.
    """
    fields: list[dict] = []
    for error in exc.errors():
        fields.append({
            'type': str(error.get('type', '')),
            'loc': [part if isinstance(part, (str, int)) else str(part) for part in error.get('loc', ())],
            'msg': str(error.get('msg', '')),
        })
    return fields


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    fields = _validation_error_fields(exc)
    _log_error_response(
        request,
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        code='VALIDATION_ERROR',
        message='Request validation failed',
        extra={'fields': fields},
    )
    return _error_response(
        request,
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        code='VALIDATION_ERROR',
        message='Request validation failed',
        extra={'fields': fields},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    _log_error_response(
        request,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code='INTERNAL_ERROR',
        message='Internal server error',
        exc=exc,
    )
    return _error_response(
        request,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code='INTERNAL_ERROR',
        message='Internal server error',
    )


# Paths excluded from audit logging (high-frequency / non-business endpoints).
_AUDIT_SKIP_PATHS = {
    '/healthz',
    '/docs',
    '/openapi.json',
    '/redoc',
    '/api/v1/uploads/presign',
    '/api/v1/photos',
    '/api/v1/client-errors',
}
_AUDIT_SKIP_PREFIXES = ('/api/v1/photos/',)
_AUDIT_BODY_CAPTURE_LIMIT_BYTES = 4 * 1024
_AUDIT_BINARY_CONTENT_TYPES = ('application/octet-stream', 'multipart/form-data')
# Request bodies are NOT persisted by default so user free text (prompts,
# notes, tags, feedback, analytics metadata) never lands in api_request_logs.
# Only explicitly allowlisted paths that carry no user free text or secrets
# may opt in to bounded body capture for debugging.
_AUDIT_BODY_ALLOW_PATHS: frozenset[str] = frozenset()
# Defense-in-depth denylist for secret-bearing paths; always rejected even if
# accidentally added to _AUDIT_BODY_ALLOW_PATHS.
_AUDIT_BODY_SKIP_PATHS = frozenset({
    '/api/v1/billing/activation-code/redeem',
    '/api/v1/client-errors',
})


def _should_skip_audit(path: str) -> bool:
    return path in _AUDIT_SKIP_PATHS or any(path.startswith(prefix) for prefix in _AUDIT_SKIP_PREFIXES)


def _should_capture_audit_body(request: Request) -> bool:
    path = request.url.path
    if path in _AUDIT_BODY_SKIP_PATHS or path not in _AUDIT_BODY_ALLOW_PATHS:
        return False
    content_type = request.headers.get('content-type', '').split(';', 1)[0].strip().lower()
    if content_type in _AUDIT_BINARY_CONTENT_TYPES:
        return False

    content_length = request.headers.get('content-length')
    if content_length:
        try:
            if int(content_length) > _AUDIT_BODY_CAPTURE_LIMIT_BYTES:
                return False
        except ValueError:
            return False
    elif request.method.upper() not in {'GET', 'HEAD', 'OPTIONS'}:
        return False
    return True


def _persist_audit_log(
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
    """Persist a single audit log row.

    Designed to run in a **thread-pool** so that the synchronous DB
    session never blocks the async event loop.
    """
    db = SessionLocal()
    try:
        log_api_request(
            db,
            request_id=request_id,
            method=method,
            path=path,
            query_string=query_string,
            endpoint=endpoint,
            client_ip=client_ip,
            user_public_id=user_public_id,
            user_agent=user_agent,
            request_body=request_body,
            status_code=status_code,
            duration_ms=duration_ms,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.warning(
            'Skipped duplicate API audit log',
            extra={'request_id': request_id, 'request_path': path, 'http_method': method},
        )
    except Exception:
        db.rollback()
        logger.exception(
            'Failed to persist API audit log',
            extra={'request_id': request_id, 'request_path': path, 'http_method': method},
        )
    finally:
        db.close()


def _schedule_audit_task(coro) -> None:
    task = asyncio.create_task(coro)
    _AUDIT_TASKS.add(task)
    task.add_done_callback(_AUDIT_TASKS.discard)


async def _drain_audit_tasks() -> None:
    if not _AUDIT_TASKS:
        return

    done, pending = await asyncio.wait(_AUDIT_TASKS, timeout=_AUDIT_TASK_DRAIN_TIMEOUT_SECONDS)
    for task in done:
        try:
            task.result()
        except Exception:
            logger.exception('Audit task failed during shutdown')
    if pending:
        logger.warning('Cancelling %s pending audit task(s) during shutdown', len(pending))
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)


@app.middleware('http')
async def request_audit_middleware(request: Request, call_next):
    started_at = time.perf_counter()
    request_id = f'req_{uuid4().hex}'
    request.state.request_id = request_id
    request_body = b''
    skip_audit = _should_skip_audit(request.url.path)

    if not skip_audit and _should_capture_audit_body(request):
        full_request_body = await request.body()
        request_body = full_request_body[:_AUDIT_BODY_CAPTURE_LIMIT_BYTES]

        async def receive() -> dict:
            return {'type': 'http.request', 'body': full_request_body, 'more_body': False}

        request = Request(request.scope, receive)
        request.state.request_id = request_id

    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers['X-Request-Id'] = request_id
        if '/score-feedback' in request.url.path or '/notifications' in request.url.path:
            response.headers['Cache-Control'] = 'private, no-store'
        return response
    finally:
        # Skip audit for non-business endpoints.
        if not skip_audit:
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            # Fire-and-forget: run the synchronous DB write in the
            # default thread-pool so the event loop stays unblocked.
            _schedule_audit_task(
                asyncio.to_thread(
                    _persist_audit_log,
                    request_id=request_id,
                    method=request.method,
                    path=request.url.path,
                    query_string=request.url.query or None,
                    endpoint=request.scope.get('path'),
                    client_ip=client_ip_from_request(request),
                    user_public_id=get_current_user_public_id(request),
                    user_agent=request.headers.get('user-agent'),
                    request_body=request_body,
                    status_code=status_code,
                    duration_ms=duration_ms,
                )
            )


@app.get('/healthz')
def healthz():
    return {'status': 'ok'}
