from contextlib import asynccontextmanager
import time

from fastapi import FastAPI, Request

from app.api.routes import router
from app.db.session import SessionLocal
from app.services.audit import log_api_request
from app.services.worker import worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    worker.start()
    yield
    worker.stop()


app = FastAPI(title='AiPingTu Backend', version='1.0.0', lifespan=lifespan)
app.include_router(router)


@app.middleware('http')
async def request_audit_middleware(request: Request, call_next):
    started_at = time.perf_counter()
    request_body = await request.body()

    async def receive() -> dict:
        return {'type': 'http.request', 'body': request_body, 'more_body': False}

    request = Request(request.scope, receive)

    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        endpoint = request.scope.get('path')
        query_string = request.url.query or None
        user_public_id = getattr(request.state, 'current_user_public_id', None)

        forwarded_for = request.headers.get('x-forwarded-for')
        client_ip = forwarded_for.split(',', 1)[0].strip() if forwarded_for else None
        if not client_ip and request.client:
            client_ip = request.client.host

        db = SessionLocal()
        try:
            log_api_request(
                db,
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
        except Exception:
            db.rollback()
        finally:
            db.close()


@app.get('/healthz')
def healthz():
    return {'status': 'ok'}
