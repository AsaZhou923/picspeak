from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IllegalStateChangeError
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


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
