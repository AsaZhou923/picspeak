from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import GUEST_TOKEN_COOKIE, CurrentActor, get_current_actor  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.db.models import RateLimitCounter, User, UserPlan, UserStatus  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import http_exception_handler  # noqa: E402

DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


def _is_local_test_database(url: str) -> bool:
    if not url:
        return False
    parsed = make_url(url)
    return parsed.get_backend_name() == 'postgresql' and parsed.host in {'127.0.0.1', 'localhost'} and 'test' in (parsed.database or '')


pytestmark = pytest.mark.skipif(
    not _is_local_test_database(DATABASE_URL),
    reason='requires local disposable migrated PostgreSQL via PICSPEAK_TEST_DATABASE_URL',
)


@pytest.fixture
def harness():
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    device_id = 'actor-commit-' + uuid4().hex
    created_public_ids: list[str] = []

    app = FastAPI()
    app.add_exception_handler(HTTPException, http_exception_handler)

    def real_get_db():
        # Same lifecycle as app.db.session.get_db: close without committing.
        db = Session()
        try:
            yield db
        finally:
            db.close()

    @app.get('/api/v1/probe/{item_id}')
    def read_only_probe(item_id: str, actor: CurrentActor = Depends(get_current_actor)):
        # Deliberately never commits, like the task/generation polling routes.
        created_public_ids.append(actor.user.public_id)
        return {'user': actor.user.public_id, 'item': item_id}

    app.dependency_overrides[get_db] = real_get_db
    client = TestClient(app, headers={'X-Device-Id': device_id})
    try:
        yield client, Session, created_public_ids
    finally:
        cleanup = Session()
        try:
            public_ids = set(created_public_ids)
            if public_ids:
                cleanup.execute(delete(User).where(User.public_id.in_(public_ids)))
            cleanup.execute(delete(RateLimitCounter).where(RateLimitCounter.endpoint == '/api/v1/probe/{item_id}'))
            cleanup.execute(delete(RateLimitCounter).where(RateLimitCounter.scope_key.like(f'%{device_id}%')))
            cleanup.commit()
        finally:
            cleanup.close()
        engine.dispose()


def _guest_route_hits(Session) -> list[int]:
    db = Session()
    try:
        return [
            row.hit_count
            for row in db.query(RateLimitCounter).filter(
                RateLimitCounter.scope == 'guest_api_minute',
                RateLimitCounter.endpoint == '/api/v1/probe/{item_id}',
            )
        ]
    finally:
        db.close()


def test_new_guest_from_a_read_only_route_is_persisted(harness):
    client, Session, _ = harness

    first = client.get('/api/v1/probe/a')
    assert first.status_code == 200
    guest_id = first.json()['user']
    assert client.cookies.get(GUEST_TOKEN_COOKIE)

    db = Session()
    try:
        assert db.query(User).filter(User.public_id == guest_id).one().plan == UserPlan.guest
    finally:
        db.close()
    # The issued cookie keeps working on the next request instead of naming a rolled-back user.
    second = client.get('/api/v1/probe/b')
    assert second.status_code == 200
    assert second.json()['user'] == guest_id


def test_guest_rate_limit_counts_read_only_requests_per_route_template(harness):
    client, Session, _ = harness

    with patch.object(settings, 'guest_api_rate_limit_per_minute', 3):
        statuses = [client.get(f'/api/v1/probe/item-{index}').status_code for index in range(4)]

    assert statuses == [200, 200, 200, 429]
    assert _guest_route_hits(Session) == [3]


def test_registered_user_last_login_is_persisted_from_a_read_only_route(harness):
    client, Session, created_public_ids = harness
    public_id = 'usr_actor_commit_' + uuid4().hex[:12]
    created_public_ids.append(public_id)
    stale_login = datetime.now(timezone.utc) - timedelta(days=3)
    db = Session()
    try:
        db.add(User(
            public_id=public_id, email=f'{public_id}@example.test', username=public_id, plan=UserPlan.free,
            daily_quota_total=10, daily_quota_used=0, status=UserStatus.active, last_login_at=stale_login,
        ))
        db.commit()
    finally:
        db.close()

    token = create_access_token({'sub': public_id, 'plan': 'free'}, ttl_seconds=600)
    response = client.get('/api/v1/probe/x', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 200

    db = Session()
    try:
        refreshed = db.query(User).filter(User.public_id == public_id).one().last_login_at
    finally:
        db.close()
    assert refreshed > stale_login + timedelta(days=2)
    # Registered users are not guest-limited, so no guest counter is written.
    assert _guest_route_hits(Session) == []
