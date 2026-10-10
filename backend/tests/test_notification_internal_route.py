from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.notifications import router as notifications_router
from app.core.config import settings
from app.db.models import (
    Notification,
    NotificationEvent,
    Photo,
    PhotoStatus,
    Review,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
)
from app.db.session import get_db
from app.main import http_exception_handler, validation_exception_handler

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


def _is_local_test_database(url: str) -> bool:
    if not url:
        return False
    parsed = make_url(url)
    return parsed.get_backend_name() == 'postgresql' and parsed.host in {'127.0.0.1', 'localhost'} and (
        'test' in parsed.database or 'goal' in parsed.database
    )


@unittest.skipUnless(_is_local_test_database(TEST_DATABASE_URL), 'requires local disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class NotificationInternalRoutePostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.engine.dispose()

    def setUp(self) -> None:
        self.token = uuid4().hex[:12]
        self.prefix = f'internal_route_{self.token}'
        self.secret = f'secret_{self.token}'
        self.db = self.Session()
        self.app = FastAPI()
        self.app.add_exception_handler(HTTPException, http_exception_handler)
        self.app.add_exception_handler(RequestValidationError, validation_exception_handler)
        self.app.include_router(notifications_router, prefix='/api/v1')

        def db_dependency():
            yield self.db

        self.app.dependency_overrides[get_db] = db_dependency
        self.client = TestClient(self.app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.app.dependency_overrides.clear()
        self.db.close()
        cleanup = self.Session()
        try:
            user_ids = select(User.id).where(User.public_id.like(f'usr_{self.prefix}%'))
            cleanup.execute(delete(Notification).where(Notification.recipient_user_id.in_(user_ids)))
            cleanup.execute(delete(NotificationEvent).where(NotificationEvent.public_id.like(f'nev_{self.prefix}%')))
            cleanup.execute(delete(Review).where(Review.public_id.like(f'rev_{self.prefix}%')))
            cleanup.execute(delete(ReviewTask).where(ReviewTask.public_id.like(f'tsk_{self.prefix}%')))
            cleanup.execute(delete(Photo).where(Photo.public_id.like(f'pho_{self.prefix}%')))
            cleanup.execute(delete(User).where(User.public_id.like(f'usr_{self.prefix}%')))
            cleanup.commit()
        finally:
            cleanup.close()

    def _post(self, *, secret: str | None = None, json: dict | None = None):
        headers = {'X-Task-Dispatch-Secret': secret} if secret is not None else {}
        return self.client.post('/api/v1/internal/notifications/process', headers=headers, json=json)

    def _create_review_completed_event(self) -> NotificationEvent:
        owner = User(
            public_id=f'usr_{self.prefix}',
            email=f'{self.prefix}@example.test',
            username=f'usr_{self.prefix}',
            plan=UserPlan.free,
            daily_quota_total=5,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        self.db.add(owner)
        self.db.flush()
        photo = Photo(
            public_id=f'pho_{self.prefix}',
            owner_user_id=owner.id,
            upload_id=f'upl_{self.prefix}',
            bucket='test',
            object_key=f'internal-notifications/{self.prefix}.jpg',
            content_type='image/jpeg',
            size_bytes=1234,
            status=PhotoStatus.READY,
            exif_data={},
            client_meta={},
        )
        self.db.add(photo)
        self.db.flush()
        task = ReviewTask(
            public_id=f'tsk_{self.prefix}',
            photo_id=photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.flash,
            status=TaskStatus.SUCCEEDED,
            request_payload={},
            finished_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        self.db.add(task)
        self.db.flush()
        review = Review(
            public_id=f'rev_{self.prefix}',
            task_id=task.id,
            photo_id=photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.flash,
            status=ReviewStatus.SUCCEEDED,
            image_type='portrait',
            schema_version='1.0',
            result_json={'score': 'fixture'},
            final_score=Decimal('7.20'),
            is_public=False,
            gallery_visible=False,
            gallery_audit_status='none',
            tags_json=[],
        )
        self.db.add(review)
        self.db.flush()
        event = NotificationEvent(
            public_id=f'nev_{self.prefix}',
            event_type='review.completed',
            dedupe_key=f'internal-route:{self.prefix}:review-completed',
            payload_json={'task_id': task.public_id, 'review_id': review.public_id},
            recipient_user_id=owner.id,
            optional_preference_eligible=False,
            occurred_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            available_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            cursor_json={},
        )
        self.db.add(event)
        self.db.commit()
        return event

    def test_rejects_when_cloud_tasks_are_disabled(self) -> None:
        with (
            patch.object(settings, 'cloud_tasks_enabled', False),
            patch.object(settings, 'cloud_tasks_secret', self.secret),
        ):
            response = self._post(secret=self.secret)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'TASK_DISPATCH_DISABLED')

    def test_rejects_when_dispatch_secret_is_missing(self) -> None:
        event = self._create_review_completed_event()

        with (
            patch.object(settings, 'cloud_tasks_enabled', True),
            patch.object(settings, 'cloud_tasks_secret', self.secret),
        ):
            response = self._post()

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['error']['code'], 'TASK_DISPATCH_UNAUTHORIZED')
        self.db.expire_all()
        self.assertEqual(self.db.get(NotificationEvent, event.id).status, 'pending')
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_rejects_when_dispatch_secret_is_wrong(self) -> None:
        event = self._create_review_completed_event()

        with (
            patch.object(settings, 'cloud_tasks_enabled', True),
            patch.object(settings, 'cloud_tasks_secret', self.secret),
        ):
            response = self._post(secret=f'wrong_{self.secret}')

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['error']['code'], 'TASK_DISPATCH_UNAUTHORIZED')
        self.db.expire_all()
        self.assertEqual(self.db.get(NotificationEvent, event.id).status, 'pending')
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_processes_pending_event_once_and_returns_no_store(self) -> None:
        event = self._create_review_completed_event()

        with (
            patch.object(settings, 'cloud_tasks_enabled', True),
            patch.object(settings, 'cloud_tasks_secret', self.secret),
        ):
            first = self._post(secret=self.secret)
            second = self._post(secret=self.secret)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.headers['cache-control'], 'private, no-store')
        self.assertEqual(first.json(), {'processed': 1, 'failed': 0, 'expired_deleted': 0})
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json(), {'processed': 0, 'failed': 0, 'expired_deleted': 0})
        self.db.expire_all()
        delivered = self.db.get(NotificationEvent, event.id)
        self.assertEqual(delivered.status, 'delivered')
        self.assertEqual(self.db.query(Notification).filter_by(dedupe_key=event.dedupe_key).count(), 1)

    def test_rejects_limit_below_one(self) -> None:
        with (
            patch.object(settings, 'cloud_tasks_enabled', True),
            patch.object(settings, 'cloud_tasks_secret', self.secret),
        ):
            response = self._post(secret=self.secret, json={'limit': 0})

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()['error']['code'], 'VALIDATION_ERROR')

    def test_rejects_limit_above_one_hundred(self) -> None:
        with (
            patch.object(settings, 'cloud_tasks_enabled', True),
            patch.object(settings, 'cloud_tasks_secret', self.secret),
        ):
            response = self._post(secret=self.secret, json={'limit': 101})

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()['error']['code'], 'VALIDATION_ERROR')


if __name__ == '__main__':
    unittest.main()
