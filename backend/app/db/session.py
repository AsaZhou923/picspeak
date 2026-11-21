import math

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IllegalStateChangeError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings


_engine_kwargs = {'pool_pre_ping': True}
_database_driver = make_url(settings.database_url).drivername.split('+', 1)[0]
if _database_driver != 'sqlite':
    _engine_kwargs.update(
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=settings.db_pool_recycle_seconds,
    )

engine = create_engine(settings.database_url, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def create_readiness_engine(database_url: str | None = None, *, timeout_seconds: float | None = None):
    """Dedicated NullPool engine for /readyz so hung probes never tie up the shared pool."""
    url = database_url or settings.database_url
    driver = make_url(url).drivername.split('+', 1)[0]
    timeout = max(float(settings.readyz_db_timeout_seconds if timeout_seconds is None else timeout_seconds), 0.1)
    kwargs: dict[str, object] = {'poolclass': NullPool}
    if driver == 'postgresql':
        connect_timeout = max(int(math.ceil(timeout)), 1)
        timeout_ms = max(int(timeout * 1000), 100)
        kwargs['connect_args'] = {
            'connect_timeout': connect_timeout,
            'options': f'-c statement_timeout={timeout_ms}',
        }
    return create_engine(url, **kwargs)


readiness_engine = create_readiness_engine()


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        # Best effort rollback when request/task is cancelled.
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            db.close()
        except IllegalStateChangeError:
            # Cancellation can interrupt a transaction state transition.
            db.invalidate()
