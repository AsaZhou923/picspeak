from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router
from app.services.worker import worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    worker.start()
    yield
    worker.stop()


app = FastAPI(title='AiPingTu Backend', version='1.0.0', lifespan=lifespan)
app.include_router(router)


@app.get('/healthz')
def healthz():
    return {'status': 'ok'}
