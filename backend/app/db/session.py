from sqlalchemy import create_engine
from sqlalchemy.exc import IllegalStateChangeError
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    except BaseException:
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
