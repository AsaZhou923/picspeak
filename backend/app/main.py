from contextlib import asynccontextmanager
import logging
import time
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError

from app.api.router import router, webhook_router
from app.core.config import settings
from app.core.errors import normalize_http_error
from app.core.network import client_ip_from_request
from app.db.session import SessionLocal
from app.services.audit import log_api_request
from app.services.worker import worker

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.run_embedded_worker:
        worker.start()
    yield
    if settings.run_embedded_worker:
        worker.stop()


app = FastAPI(title='AiPingTu Backend', version='1.0.0', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_origin_regex=settings.backend_cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['X-Request-Id', 'X-Guest-Access-Token'],
)
app.include_router(router)
app.include_router(webhook_router)


def _error_response(*, status_code: int, request_id: str | None, code: str, message: str, extra: dict | None = None) -> JSONResponse:
    payload: dict[str, object] = {'error': {'code': code, 'message': message, 'request_id': request_id}}
    if extra:
        payload['error']['extra'] = extra
    return JSONResponse(status_code=status_code, content=payload)


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
        'user_public_id': getattr(request.state, 'current_user_public_id', None),
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
    return _error_response(
        status_code=exc.status_code,
        request_id=getattr(request.state, 'request_id', None),
        code=code,
        message=message,
        extra=extra,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    _log_error_response(
        request,
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        code='VALIDATION_ERROR',
        message='Request validation failed',
        extra={'fields': exc.errors()},
    )
    return _error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        request_id=getattr(request.state, 'request_id', None),
        code='VALIDATION_ERROR',
        message='Request validation failed',
        extra={'fields': exc.errors()},
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
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        request_id=getattr(request.state, 'request_id', None),
        code='INTERNAL_ERROR',
        message='Internal server error',
    )


@app.middleware('http')
async def request_audit_middleware(request: Request, call_next):
    started_at = time.perf_counter()
    request_body = await request.body()
    request_id = f'req_{uuid4().hex}'
    request.state.request_id = request_id

    async def receive() -> dict:
        return {'type': 'http.request', 'body': request_body, 'more_body': False}

    request = Request(request.scope, receive)

    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers['X-Request-Id'] = request_id
        return response
    finally:
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        endpoint = request.scope.get('path')
        query_string = request.url.query or None
        user_public_id = getattr(request.state, 'current_user_public_id', None)

        client_ip = client_ip_from_request(request)

        db = SessionLocal()
        try:
            log_api_request(
                db,
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                query_string=query_string,
                endpoint=endpoint,
                client_ip=client_ip,
                user_public_id=user_public_id,
                user_agent=request.headers.get('user-agent'),
                request_body=request_body,
                status_code=status_code,
                duration_ms=duration_ms,
            )
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            logger.warning(
                'Skipped duplicate API audit log',
                extra={'request_id': request_id, 'request_path': request.url.path, 'http_method': request.method},
            )
        except Exception:
            db.rollback()
            logger.exception(
                'Failed to persist API audit log',
                extra={'request_id': request_id, 'request_path': request.url.path, 'http_method': request.method},
            )
        finally:
            db.close()


@app.get('/healthz')
def healthz():
    return {'status': 'ok'}
