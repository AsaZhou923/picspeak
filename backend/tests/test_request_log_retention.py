from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.db.models import ApiRequestLog  # noqa: E402
from app.services.audit import cleanup_expired_request_logs  # noqa: E402
from app.services.worker import ReviewWorker  # noqa: E402

DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@pytest.fixture
def db():
    if not DATABASE_URL:
        pytest.skip('requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
    engine = create_engine(DATABASE_URL)
    connection = engine.connect()
    transaction = connection.begin()
    schema = 'reqlog_' + uuid4().hex
    connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
    ApiRequestLog.__table__.create(connection)
    session = sessionmaker(bind=connection, join_transaction_mode='create_savepoint')()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
        engine.dispose()


def _seed(db, *ages_in_days):
    now = datetime.now(timezone.utc)
    for age in ages_in_days:
        db.add(ApiRequestLog(
            request_id='req_' + uuid4().hex, method='GET', path='/api/v1/x', status_code=200, duration_ms=1,
            created_at=now - timedelta(days=age),
        ))
    db.commit()


def _ages(db):
    now = datetime.now(timezone.utc)
    return sorted(round((now - row.created_at).total_seconds() / 86400) for row in db.query(ApiRequestLog).all())


def test_cleanup_keeps_the_retention_window_and_deletes_in_bounded_chunks(db):
    _seed(db, 1, 29, 31, 45, 90, 200)
    with patch.object(settings, 'api_request_log_retention_days', 30):
        assert cleanup_expired_request_logs(db, limit=3) == 3
        assert _ages(db) == [1, 29, 31]  # oldest first; the remaining expired row waits for the next call
        assert cleanup_expired_request_logs(db, limit=3) == 1
        assert cleanup_expired_request_logs(db, limit=3) == 0
    assert _ages(db) == [1, 29]


def test_zero_retention_disables_cleanup(db):
    _seed(db, 400)
    with patch.object(settings, 'api_request_log_retention_days', 0):
        assert cleanup_expired_request_logs(db) == 0
    assert len(_ages(db)) == 1


def _worker():
    worker = ReviewWorker(worker_name='test-worker')
    worker._gen_executor.shutdown(False, cancel_futures=True)
    return worker


def test_worker_runs_request_log_cleanup_once_per_minute():
    worker = _worker()
    session = MagicMock()
    with (
        patch.object(settings, 'api_request_log_retention_days', 30),
        patch('app.services.worker.time.monotonic', side_effect=[100.0, 100.0, 120.0]),
        patch('app.db.session.SessionLocal', MagicMock(return_value=session)),
        patch('app.services.worker.cleanup_expired_request_logs', return_value=5) as cleanup,
    ):
        worker._run_request_log_cleanup_if_due()
        worker._run_request_log_cleanup_if_due()
    cleanup.assert_called_once_with(session)
    session.close.assert_called_once_with()
    assert worker._next_request_log_cleanup_at == 160.0


def test_worker_skips_request_log_cleanup_when_disabled():
    worker = _worker()
    with (
        patch.object(settings, 'api_request_log_retention_days', 0),
        patch('app.services.worker.cleanup_expired_request_logs') as cleanup,
    ):
        worker._run_request_log_cleanup_if_due()
    cleanup.assert_not_called()
