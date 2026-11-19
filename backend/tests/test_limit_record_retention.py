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

from app.db.models import IdempotencyKey, RateLimitCounter, User, UserPlan, UserStatus  # noqa: E402
from app.services.guard import (  # noqa: E402
    claim_daily_marker,
    cleanup_expired_idempotency_keys,
    cleanup_expired_rate_limit_counters,
)
from app.services.worker import ReviewWorker  # noqa: E402

DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()
NOW = datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def db():
    if not DATABASE_URL:
        pytest.skip('requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
    engine = create_engine(DATABASE_URL)
    connection = engine.connect()
    transaction = connection.begin()
    schema = 'limits_' + uuid4().hex
    connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
    User.metadata.create_all(connection, tables=[User.__table__, RateLimitCounter.__table__, IdempotencyKey.__table__])
    session = sessionmaker(bind=connection, join_transaction_mode='create_savepoint')()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
        engine.dispose()


def _counter(db, label: str, window_start: datetime, window_seconds: int) -> None:
    db.add(RateLimitCounter(
        scope=label, scope_key='key', endpoint='endpoint', window_start=window_start, window_seconds=window_seconds,
        hit_count=1,
    ))


def _remaining_scopes(db) -> list[str]:
    return sorted(row.scope for row in db.query(RateLimitCounter).all())


def test_counter_cleanup_keeps_open_and_recently_closed_windows(db):
    month_start = datetime(2026, 11, 1, tzinfo=timezone.utc)
    _counter(db, 'minute_old', NOW - timedelta(days=2), 60)
    _counter(db, 'minute_recent', NOW - timedelta(hours=23), 60)
    _counter(db, 'day_closed_long_ago', NOW - timedelta(days=3), 86400)
    _counter(db, 'day_closed_hours_ago', NOW - timedelta(hours=30), 86400)
    _counter(db, 'month_open', month_start, 30 * 86400)
    _counter(db, 'month_previous', datetime(2026, 10, 1, tzinfo=timezone.utc), 31 * 86400)
    _counter(db, 'month_before', datetime(2026, 9, 1, tzinfo=timezone.utc), 30 * 86400)
    db.commit()

    assert cleanup_expired_rate_limit_counters(db, now=NOW, limit=2) == 2
    assert cleanup_expired_rate_limit_counters(db, now=NOW, limit=2) == 2
    assert cleanup_expired_rate_limit_counters(db, now=NOW, limit=2) == 0

    # The open month and anything that closed within the last day survive.
    assert _remaining_scopes(db) == ['day_closed_hours_ago', 'minute_recent', 'month_open']


def _idempotency(db, user_id: int, endpoint: str, expire_at: datetime) -> None:
    db.add(IdempotencyKey(
        user_id=user_id, endpoint=endpoint, idempotency_key=uuid4().hex, request_hash='hash', http_status=200,
        response_json={'ok': True}, expire_at=expire_at,
    ))


def test_idempotency_cleanup_removes_expired_replays_but_keeps_paid_generation_keys(db):
    user = User(
        public_id='usr_' + uuid4().hex[:12], email=f'{uuid4().hex}@example.test', username=uuid4().hex,
        plan=UserPlan.free, daily_quota_total=10, daily_quota_used=0, status=UserStatus.active,
    )
    db.add(user)
    db.flush()
    _idempotency(db, user.id, '/reviews', NOW - timedelta(hours=1))
    _idempotency(db, user.id, '/reviews', NOW + timedelta(hours=1))
    _idempotency(db, user.id, '/generations', NOW - timedelta(days=30))
    _idempotency(db, user.id, '/generations/reuse', NOW - timedelta(days=30))
    db.commit()

    assert cleanup_expired_idempotency_keys(db, now=NOW) == 1
    assert cleanup_expired_idempotency_keys(db, now=NOW) == 0
    remaining = sorted((row.endpoint, row.expire_at > NOW) for row in db.query(IdempotencyKey).all())
    assert remaining == [('/generations', False), ('/generations/reuse', False), ('/reviews', True)]


def test_daily_marker_is_claimed_once_per_key_and_day(db):
    assert claim_daily_marker(db, scope='blog_view_day', scope_key='net', endpoint='post', now=NOW) is True
    assert claim_daily_marker(db, scope='blog_view_day', scope_key='net', endpoint='post', now=NOW) is False
    assert claim_daily_marker(db, scope='blog_view_day', scope_key='other', endpoint='post', now=NOW) is True
    assert claim_daily_marker(db, scope='blog_view_day', scope_key='net', endpoint='post', now=NOW + timedelta(days=1)) is True


def test_worker_runs_limit_record_cleanup_once_per_minute():
    worker = ReviewWorker(worker_name='test-worker')
    worker._gen_executor.shutdown(False, cancel_futures=True)
    session = MagicMock()
    with (
        patch('app.services.worker.time.monotonic', side_effect=[100.0, 100.0, 120.0]),
        patch('app.db.session.SessionLocal', MagicMock(return_value=session)),
        patch('app.services.worker.cleanup_expired_rate_limit_counters', return_value=3) as counters,
        patch('app.services.worker.cleanup_expired_idempotency_keys', return_value=1) as replays,
    ):
        worker._run_limit_record_cleanup_if_due()
        worker._run_limit_record_cleanup_if_due()
    counters.assert_called_once_with(session)
    replays.assert_called_once_with(session)
    session.close.assert_called_once_with()
    assert worker._next_limit_record_cleanup_at == 160.0
