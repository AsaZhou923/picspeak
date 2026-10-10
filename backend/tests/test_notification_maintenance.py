from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os
from pathlib import Path
import sys
import unittest

from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.types import BigInteger

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.base import Base
from app.db.models import (
    Announcement,
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
from app.services import notification_processor
from app.services.notification_events import database_now
from app.services.notification_maintenance import notification_event_status, retry_failed_notification_event

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@compiles(JSONB, 'sqlite')
def _compile_jsonb_sqlite(_type, _compiler, **_kw):
    return 'JSON'


@compiles(BigInteger, 'sqlite')
def _compile_big_integer_sqlite(_type, _compiler, **_kw):
    return 'INTEGER'


MAINTENANCE_TABLES = [
    User.__table__,
    Photo.__table__,
    ReviewTask.__table__,
    Review.__table__,
    Announcement.__table__,
    NotificationEvent.__table__,
    Notification.__table__,
]


class NotificationMaintenanceMixin:
    db = None
    _ids: dict[str, int]

    def next_id(self, table: str) -> int:
        value = self._ids.get(table, 0) + 1
        self._ids[table] = value
        return value

    def user(self, suffix: str, *, status: UserStatus = UserStatus.active, plan: UserPlan = UserPlan.free) -> User:
        kwargs = {
            'public_id': f'usr_maint_{suffix}',
            'email': f'maint_{suffix}@example.test',
            'username': f'maint_{suffix}',
            'plan': plan,
            'daily_quota_total': 5,
            'daily_quota_used': 0,
            'status': status,
        }
        if self.db.get_bind().dialect.name == 'sqlite':
            kwargs['id'] = self.next_id('users')
        user = User(**kwargs)
        self.db.add(user)
        self.db.flush()
        return user

    def review(self, owner: User, suffix: str) -> Review:
        photo_kwargs = {
            'public_id': f'pho_maint_{suffix}',
            'owner_user_id': owner.id,
            'upload_id': f'upl_maint_{suffix}',
            'bucket': 'test',
            'object_key': f'maintenance/{suffix}.jpg',
            'content_type': 'image/jpeg',
            'size_bytes': 123,
            'status': PhotoStatus.READY,
            'exif_data': {},
            'client_meta': {},
        }
        task_kwargs = {
            'public_id': f'tsk_maint_{suffix}',
            'owner_user_id': owner.id,
            'mode': ReviewMode.flash,
            'status': TaskStatus.SUCCEEDED,
            'request_payload': {},
            'finished_at': datetime.now(timezone.utc) - timedelta(minutes=1),
        }
        review_kwargs = {
            'public_id': f'rev_maint_{suffix}',
            'owner_user_id': owner.id,
            'mode': ReviewMode.flash,
            'status': ReviewStatus.SUCCEEDED,
            'image_type': 'portrait',
            'schema_version': '1.0',
            'result_json': {},
            'final_score': Decimal('7.20'),
            'is_public': True,
            'gallery_visible': True,
            'gallery_audit_status': 'approved',
            'tags_json': [],
        }
        if self.db.get_bind().dialect.name == 'sqlite':
            photo_kwargs['id'] = self.next_id('photos')
            task_kwargs['id'] = self.next_id('review_tasks')
            review_kwargs['id'] = self.next_id('reviews')
        photo = Photo(**photo_kwargs)
        self.db.add(photo)
        self.db.flush()
        task = ReviewTask(photo_id=photo.id, **task_kwargs)
        self.db.add(task)
        self.db.flush()
        review = Review(task_id=task.id, photo_id=photo.id, **review_kwargs)
        self.db.add(review)
        self.db.flush()
        return review

    def failed_event(
        self,
        suffix: str,
        *,
        recipient: User | None,
        event_type: str = 'review.completed',
        payload: dict | None = None,
        cursor: dict | None = None,
        occurred_at: datetime | None = None,
        status: str = 'failed',
    ) -> NotificationEvent:
        kwargs = {
            'public_id': f'nev_maint_{suffix}',
            'event_type': event_type,
            'dedupe_key': f'maint:{suffix}',
            'payload_json': payload or {},
            'recipient_user_id': recipient.id if recipient is not None else None,
            'optional_preference_eligible': False,
            'occurred_at': occurred_at or datetime.now(timezone.utc) - timedelta(minutes=5),
            'available_at': datetime.now(timezone.utc) - timedelta(minutes=5),
            'processed_at': datetime.now(timezone.utc) - timedelta(minutes=1),
            'status': status,
            'attempts': 10,
            'last_error_code': 'NOTIFICATION_PROCESSING_FAILED',
            'cursor_json': cursor or {},
        }
        if self.db.get_bind().dialect.name == 'sqlite':
            kwargs['id'] = self.next_id('notification_events')
        event = NotificationEvent(**kwargs)
        self.db.add(event)
        self.db.flush()
        return event


class NotificationMaintenanceSQLiteTests(NotificationMaintenanceMixin, unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine('sqlite:///:memory:', future=True)
        Base.metadata.create_all(self.engine, tables=MAINTENANCE_TABLES)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self._ids = {}

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_retry_failed_event_requeues_same_row_and_consumer_delivers(self) -> None:
        owner = self.user('retry_owner')
        review = self.review(owner, 'retry_ok')
        task = self.db.get(ReviewTask, review.task_id)
        event = self.failed_event(
            'retry_ok',
            recipient=owner,
            payload={'task_id': task.public_id, 'review_id': review.public_id},
        )

        dry_run = retry_failed_notification_event(self.db, event.public_id, audit_reason='operator verified fixed code')
        self.assertTrue(dry_run['dry_run'])
        self.assertEqual(self.db.get(NotificationEvent, event.id).status, 'failed')

        result = retry_failed_notification_event(self.db, event.public_id, audit_reason='operator verified fixed code', execute=True)
        self.assertFalse(result['dry_run'])
        retry_row = self.db.get(NotificationEvent, event.id)
        self.assertEqual(retry_row.public_id, event.public_id)
        self.assertEqual(retry_row.status, 'pending')
        self.assertEqual(retry_row.attempts, 0)
        self.assertEqual(retry_row.last_error_code, None)
        self.assertEqual(len(retry_row.cursor_json['manual_retry_audit']), 1)

        processed = notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
        delivered_event = self.db.get(NotificationEvent, event.id)
        notification = self.db.query(Notification).one()
        self.assertEqual(processed['processed'], 1)
        self.assertEqual(delivered_event.status, 'delivered')
        self.assertEqual(notification.dedupe_key, event.dedupe_key)

        read_at = database_now(self.db)
        notification.read_at = read_at
        with self.assertRaises(ValueError):
            retry_failed_notification_event(self.db, event.public_id, audit_reason='duplicate replay')
        self.assertEqual(self.db.query(Notification).count(), 1)
        self.assertEqual(self.db.get(Notification, notification.id).read_at, read_at)

    def test_retry_refuses_old_delivered_and_suppressed_events(self) -> None:
        owner = self.user('refuse_owner')
        review = self.review(owner, 'refuse')
        task = self.db.get(ReviewTask, review.task_id)
        payload = {'task_id': task.public_id, 'review_id': review.public_id}
        old = self.failed_event('old', recipient=owner, payload=payload, occurred_at=datetime.now(timezone.utc) - timedelta(days=8))
        delivered = self.failed_event('delivered', recipient=owner, payload=payload, status='delivered')
        suppressed = self.failed_event('suppressed', recipient=owner, payload=payload, status='suppressed_preferences')

        for event in (old, delivered, suppressed):
            with self.subTest(event=event.public_id), self.assertRaises(ValueError):
                retry_failed_notification_event(self.db, event.public_id, audit_reason='operator check')

    def test_retry_refuses_cancelled_announcement(self) -> None:
        now = database_now(self.db)
        announcement = Announcement(
            id=self.next_id('announcements'),
            public_id='ann_maint_cancelled',
            title_json={'en': 'Title', 'zh': '标题', 'ja': 'Title'},
            summary_json={'en': 'Summary', 'zh': '摘要', 'ja': 'Summary'},
            body_json={'en': 'Body', 'zh': '正文', 'ja': 'Body'},
            cta_json={},
            audience_type='all_existing_users',
            audience_json={'max_user_id': 100},
            status='cancelled',
            idempotency_key='ann_maint_cancelled',
            content_fingerprint='fingerprint',
            published_at=now - timedelta(minutes=10),
            cancelled_at=now - timedelta(minutes=1),
            operation_log_json=[],
        )
        self.db.add(announcement)
        self.db.flush()
        event = self.failed_event(
            'ann_cancelled',
            recipient=None,
            event_type='announcement.published',
            payload={'announcement_id': announcement.public_id},
            cursor={'announcement_id': announcement.id, 'last_user_id': 0},
        )

        with self.assertRaises(ValueError):
            retry_failed_notification_event(self.db, event.public_id, audit_reason='operator check')

    def test_status_output_omits_private_payload_and_user_ids(self) -> None:
        owner = self.user('status_owner')
        review = self.review(owner, 'status')
        task = self.db.get(ReviewTask, review.task_id)
        event = self.failed_event('status', recipient=owner, payload={'task_id': task.public_id, 'review_id': review.public_id})

        status = notification_event_status(self.db, event.public_id)

        self.assertEqual(status['event']['event_id'], event.public_id)
        self.assertEqual(status['event']['has_recipient'], True)
        self.assertNotIn('payload', status['event'])
        self.assertNotIn('recipient_user_id', status['event'])
        self.assertIn('failed', status['counts_by_status'])


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class NotificationMaintenancePostgresTests(NotificationMaintenanceMixin, unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.connection = self.engine.connect()
        self.transaction = self.connection.begin()
        self.Session = sessionmaker(bind=self.connection, autoflush=False, autocommit=False)
        self.db = self.Session()
        self._ids = {}

    def tearDown(self) -> None:
        self.db.close()
        self.transaction.rollback()
        self.connection.close()
        self.engine.dispose()

    def test_postgres_retry_failed_to_pending_to_delivered_preserves_original_event(self) -> None:
        owner = self.user('pg_retry_owner')
        review = self.review(owner, 'pg_retry')
        task = self.db.get(ReviewTask, review.task_id)
        event = self.failed_event(
            'pg_retry',
            recipient=owner,
            payload={'task_id': task.public_id, 'review_id': review.public_id},
        )

        retry_failed_notification_event(self.db, event.public_id, audit_reason='postgres retry probe', execute=True)
        pending = self.db.query(NotificationEvent).filter_by(public_id=event.public_id).one()
        self.assertEqual(pending.status, 'pending')
        self.assertEqual(pending.dedupe_key, event.dedupe_key)

        processed = notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)

        delivered = self.db.query(NotificationEvent).filter_by(public_id=event.public_id).one()
        self.assertEqual(processed['processed'], 1)
        self.assertEqual(delivered.status, 'delivered')
        self.assertEqual(self.db.query(Notification).filter_by(dedupe_key=event.dedupe_key).count(), 1)


if __name__ == '__main__':
    unittest.main()
