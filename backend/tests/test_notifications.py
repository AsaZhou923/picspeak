from __future__ import annotations

import importlib
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, Response
from fastapi.testclient import TestClient
from starlette.requests import Request
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import BigInteger

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_registered_actor
from app.core.config import settings
from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db
from app.db.models import (
    Announcement,
    BillingSubscription,
    GeneratedImage,
    ImageGenerationTask,
    Notification,
    NotificationEvent,
    NotificationPreference,
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
from app.services import notification_events, notification_processor
from app.api.routers.notifications import router as notifications_router

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@compiles(JSONB, 'sqlite')
def _compile_jsonb_sqlite(_type, _compiler, **_kw):
    return 'JSON'


@compiles(BigInteger, 'sqlite')
def _compile_big_integer_sqlite(_type, _compiler, **_kw):
    return 'INTEGER'


NOTIFICATION_TABLES = [
    User.__table__,
    Photo.__table__,
    ReviewTask.__table__,
    Review.__table__,
    ImageGenerationTask.__table__,
    GeneratedImage.__table__,
    BillingSubscription.__table__,
    Announcement.__table__,
    NotificationPreference.__table__,
    NotificationEvent.__table__,
    Notification.__table__,
]


class NotificationSQLiteTests(unittest.TestCase):
    def setUp(self) -> None:
        self._capture_enabled_original = settings.notifications_event_capture_enabled
        settings.notifications_event_capture_enabled = True
        self.engine = create_engine('sqlite:///:memory:', future=True)
        Base.metadata.create_all(self.engine, tables=NOTIFICATION_TABLES)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self._ids: dict[str, int] = {}

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        settings.notifications_event_capture_enabled = self._capture_enabled_original

    def _next_id(self, table: str) -> int:
        value = self._ids.get(table, 0) + 1
        self._ids[table] = value
        return value

    def user(self, suffix: str, *, plan: UserPlan = UserPlan.free, status: UserStatus = UserStatus.active) -> User:
        user = User(
            id=self._next_id('users'),
            public_id=f'usr_notify_{suffix}',
            email=f'notify_{suffix}@example.test',
            username=f'notify_{suffix}',
            plan=plan,
            daily_quota_total=5,
            daily_quota_used=0,
            status=status,
        )
        self.db.add(user)
        self.db.flush()
        return user

    def photo(self, owner: User, suffix: str) -> Photo:
        photo = Photo(
            id=self._next_id('photos'),
            public_id=f'pho_notify_{suffix}',
            owner_user_id=owner.id,
            upload_id=f'upl_notify_{suffix}',
            bucket='test',
            object_key=f'notifications/{suffix}.jpg',
            content_type='image/jpeg',
            size_bytes=1234,
            status=PhotoStatus.READY,
            exif_data={},
            client_meta={},
        )
        self.db.add(photo)
        self.db.flush()
        return photo

    def review_task(self, owner: User, suffix: str, *, status: TaskStatus = TaskStatus.SUCCEEDED) -> ReviewTask:
        photo = self.photo(owner, suffix)
        task = ReviewTask(
            id=self._next_id('review_tasks'),
            public_id=f'tsk_notify_{suffix}',
            photo_id=photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.flash,
            status=status,
            request_payload={},
            finished_at=datetime(2026, 10, 10, 1, 0, tzinfo=timezone.utc),
        )
        self.db.add(task)
        self.db.flush()
        return task

    def review(self, owner: User, suffix: str, *, status: ReviewStatus = ReviewStatus.SUCCEEDED) -> Review:
        task = self.review_task(owner, suffix)
        review = Review(
            id=self._next_id('reviews'),
            public_id=f'rev_notify_{suffix}',
            task_id=task.id,
            photo_id=task.photo_id,
            owner_user_id=owner.id,
            mode=ReviewMode.flash,
            status=status,
            image_type='portrait',
            schema_version='1.0',
            result_json={'private': 'review_result_body'},
            final_score=Decimal('7.20'),
            is_public=True,
            gallery_visible=True,
            gallery_audit_status='approved',
            tags_json=[],
        )
        self.db.add(review)
        self.db.flush()
        return review

    def generation_task(self, owner: User, suffix: str, *, status: TaskStatus = TaskStatus.SUCCEEDED) -> ImageGenerationTask:
        task = ImageGenerationTask(
            id=self._next_id('generation_tasks'),
            public_id=f'igt_notify_{suffix}',
            owner_user_id=owner.id,
            status=status,
            generation_mode='general',
            intent='reference',
            prompt='private prompt text',
            prompt_hash=f'hash_{suffix}',
            request_payload={},
            finished_at=datetime(2026, 10, 10, 2, 0, tzinfo=timezone.utc),
        )
        self.db.add(task)
        self.db.flush()
        return task

    def generated_image(self, owner: User, task: ImageGenerationTask, suffix: str) -> GeneratedImage:
        image = GeneratedImage(
            id=self._next_id('generated_images'),
            public_id=f'gen_notify_{suffix}',
            task_id=task.id,
            owner_user_id=owner.id,
            object_bucket='private',
            object_key=f'generated/{suffix}.webp',
            content_type='image/webp',
            intent='reference',
            generation_mode='general',
            prompt='private prompt text',
            model_name='fixture-model',
            quality='standard',
            size='1024x1024',
            output_format='webp',
            credits_charged=1,
            metadata_json={},
        )
        self.db.add(image)
        self.db.flush()
        return image

    def event(
        self,
        suffix: str,
        *,
        recipient: User | None,
        event_type: str = 'gallery.review_liked',
        dedupe_key: str | None = None,
        payload: dict | None = None,
        optional: bool | None = True,
        occurred_at: datetime | None = None,
        cursor: dict | None = None,
    ) -> NotificationEvent:
        occurred = occurred_at or datetime(2026, 10, 10, 3, 0, tzinfo=timezone.utc)
        event = NotificationEvent(
            id=self._next_id('notification_events'),
            public_id=f'nev_notify_{suffix}',
            event_type=event_type,
            dedupe_key=dedupe_key or f'event:{suffix}',
            payload_json=payload or {'review_id': f'rev_notify_{suffix}'},
            recipient_user_id=recipient.id if recipient is not None else None,
            optional_preference_eligible=optional,
            occurred_at=occurred,
            available_at=occurred,
            cursor_json=cursor or {},
        )
        self.db.add(event)
        self.db.flush()
        return event

    def deliver(self, event: NotificationEvent) -> str:
        result = notification_processor.process_pending_notifications(
            self.db,
            limit=1,
            max_batches=1,
            time_budget_seconds=5,
        )
        self.assertEqual(result['failed'], 0)
        self.assertEqual(result['processed'], 1)
        return self.db.get(NotificationEvent, event.id).status

    def notification(
        self,
        recipient: User,
        suffix: str,
        *,
        category: str = 'system',
        notification_type: str = 'review_completed',
        template_key: str = 'review_completed',
        params: dict | None = None,
        delivered_at: datetime | None = None,
        read_at: datetime | None = None,
        archived_at: datetime | None = None,
        revoked_at: datetime | None = None,
        expires_at: datetime | None = None,
    ) -> Notification:
        delivered = delivered_at or datetime(2026, 10, 10, 4, 0, tzinfo=timezone.utc)
        row = Notification(
            id=self._next_id('notifications'),
            public_id=f'ntf_notify_{suffix}',
            recipient_user_id=recipient.id,
            category=category,
            notification_type=notification_type,
            dedupe_key=f'notification:{suffix}',
            template_key=template_key,
            template_version=1,
            template_params_json=params or {},
            target_type='review',
            target_public_id=f'rev_notify_{suffix}',
            occurred_at=delivered,
            delivered_at=delivered,
            read_at=read_at,
            archived_at=archived_at,
            revoked_at=revoked_at,
            expires_at=expires_at or delivered + timedelta(days=90),
        )
        self.db.add(row)
        self.db.flush()
        return row

    def test_record_review_terminal_deduplicates_completed_event(self) -> None:
        owner = self.user('review_dedupe')
        review = self.review(owner, 'review_dedupe')
        task = self.db.get(ReviewTask, review.task_id)

        first = notification_events.record_review_terminal(self.db, task, review)
        second = notification_events.record_review_terminal(self.db, task, review)

        self.assertTrue(first)
        self.assertFalse(second)
        self.assertEqual(self.db.query(NotificationEvent).count(), 1)

    def test_record_review_terminal_skips_cached_success(self) -> None:
        owner = self.user('cached')
        review = self.review(owner, 'cached')
        task = self.db.get(ReviewTask, review.task_id)

        inserted = notification_events.record_review_terminal(self.db, task, review, cached=True)

        self.assertFalse(inserted)
        self.assertEqual(self.db.query(NotificationEvent).count(), 0)

    def test_record_generation_terminal_skips_guest_owner(self) -> None:
        guest = self.user('guest_generation', plan=UserPlan.guest)
        task = self.generation_task(guest, 'guest_generation')
        image = self.generated_image(guest, task, 'guest_generation')

        inserted = notification_events.record_generation_terminal(self.db, task, image)

        self.assertFalse(inserted)
        self.assertEqual(self.db.query(NotificationEvent).count(), 0)

    def test_record_credit_confirmed_dedupes_per_user_and_ledger_grant(self) -> None:
        first_user = self.user('credit_first')
        second_user = self.user('credit_second')

        first = notification_events.record_credit_confirmed(self.db, first_user, grant_id='ledger_1', credits=30)
        repeat = notification_events.record_credit_confirmed(self.db, first_user, grant_id='ledger_1', credits=30)
        second = notification_events.record_credit_confirmed(self.db, second_user, grant_id='ledger_1', credits=30)

        self.assertTrue(first)
        self.assertFalse(repeat)
        self.assertTrue(second)
        events = self.db.query(NotificationEvent).order_by(NotificationEvent.recipient_user_id).all()
        self.assertEqual(len(events), 2)
        self.assertEqual({event.payload_json['credits'] for event in events}, {'30'})

    def test_record_subscription_changed_uses_state_version_for_distinct_changes(self) -> None:
        owner = self.user('subscription_versions')

        first = notification_events.record_subscription_changed(
            self.db,
            owner,
            subscription_id='sub_1',
            status='active',
            version='active|false|2026-11-01',
        )
        repeat = notification_events.record_subscription_changed(
            self.db,
            owner,
            subscription_id='sub_1',
            status='active',
            version='active|false|2026-11-01',
        )
        cancelled = notification_events.record_subscription_changed(
            self.db,
            owner,
            subscription_id='sub_1',
            status='cancelled',
            version='cancelled|true|2026-10-20',
        )

        self.assertTrue(first)
        self.assertFalse(repeat)
        self.assertTrue(cancelled)
        self.assertEqual(self.db.query(NotificationEvent).count(), 2)

    def test_record_gallery_like_skips_self_like(self) -> None:
        owner = self.user('self_like')
        review = self.review(owner, 'self_like')

        inserted = notification_events.record_gallery_like(self.db, review, liker_user_id=owner.id)

        self.assertFalse(inserted)
        self.assertEqual(self.db.query(NotificationEvent).count(), 0)

    def test_record_gallery_like_keeps_one_event_for_repeat_liker(self) -> None:
        owner = self.user('repeat_owner')
        liker = self.user('repeat_liker')
        review = self.review(owner, 'repeat')
        self.db.add(
            NotificationPreference(
                user_id=owner.id,
                likes_enabled=True,
                likes_enabled_at=notification_events.database_now(self.db) - timedelta(seconds=1),
                announcements_enabled=False,
            )
        )
        self.db.flush()

        notification_events.record_gallery_like(self.db, review, liker_user_id=liker.id)
        notification_events.record_gallery_like(self.db, review, liker_user_id=liker.id)

        self.assertEqual(self.db.query(NotificationEvent).count(), 1)

    def test_deliver_like_event_suppresses_when_preferences_default_off(self) -> None:
        owner = self.user('like_off')
        event = self.event('like_off', recipient=owner)

        status = self.deliver(event)

        self.assertEqual(status, 'suppressed_preferences')
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_deliver_like_event_requires_opt_in_before_event_time(self) -> None:
        owner = self.user('like_enabled_late')
        occurred_at = notification_events.database_now(self.db)
        self.db.add(
            NotificationPreference(
                user_id=owner.id,
                likes_enabled=True,
                likes_enabled_at=occurred_at + timedelta(seconds=1),
                announcements_enabled=False,
            )
        )
        event = self.event('like_enabled_late', recipient=owner, occurred_at=occurred_at)

        status = self.deliver(event)

        self.assertEqual(status, 'suppressed_preferences')
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_deliver_like_event_creates_notification_when_preference_enabled(self) -> None:
        owner = self.user('like_on')
        review = self.review(owner, 'like_on')
        occurred_at = notification_events.database_now(self.db)
        self.db.add(
            NotificationPreference(
                user_id=owner.id,
                likes_enabled=True,
                likes_enabled_at=occurred_at - timedelta(seconds=1),
                announcements_enabled=False,
            )
        )
        event = self.event('like_on', recipient=owner, payload={'review_id': review.public_id}, occurred_at=occurred_at)

        status = self.deliver(event)

        notification = self.db.query(Notification).one()
        self.assertEqual(status, 'delivered')
        self.assertEqual(notification.category, 'interaction')
        self.assertEqual(notification.template_params_json, {'review_id': review.public_id})

    def test_deliver_like_event_enforces_daily_limit_of_twenty(self) -> None:
        owner = self.user('like_cap')
        review = self.review(owner, 'like_cap')
        current = notification_events.database_now(self.db) - timedelta(seconds=1)
        self.db.add(
            NotificationPreference(
                user_id=owner.id,
                likes_enabled=True,
                likes_enabled_at=current - timedelta(days=1),
                announcements_enabled=False,
            )
        )
        for index in range(20):
            self.notification(
                owner,
                f'cap_{index}',
                category='interaction',
                notification_type='gallery.review_liked',
                template_key='gallery.review_liked.v1',
                delivered_at=current.replace(hour=1, minute=0, second=0, microsecond=0) + timedelta(minutes=index),
            )
        event = self.event('like_cap', recipient=owner, payload={'review_id': review.public_id}, occurred_at=current)

        status = self.deliver(event)

        self.assertEqual(status, 'suppressed_limit')
        self.assertEqual(self.db.query(Notification).count(), 20)

    def test_deliver_announcement_event_creates_notification_for_published_announcement(self) -> None:
        owner = self.user('announcement_on')
        published_at = notification_events.database_now(self.db)
        owner.created_at = published_at - timedelta(seconds=1)
        announcement = Announcement(
            id=self._next_id('announcements'),
            public_id='ann_notify_published',
            title_json={'en': 'Published announcement', 'zh': '公告', 'ja': 'お知らせ'},
            summary_json={'en': 'Summary', 'zh': '摘要', 'ja': '概要'},
            body_json={'en': 'Body', 'zh': '正文', 'ja': '本文'},
            cta_json={},
            audience_type='all_existing_users',
            audience_json={'max_user_id': owner.id},
            status='published',
            idempotency_key='ann_notify_published',
            content_fingerprint='fingerprint',
            published_at=published_at,
            expires_at=published_at + timedelta(days=7),
            operation_log_json=[],
        )
        self.db.add_all(
            [
                announcement,
                NotificationPreference(
                    user_id=owner.id,
                    likes_enabled=False,
                    announcements_enabled=True,
                    announcements_enabled_at=published_at - timedelta(seconds=1),
                ),
            ]
        )
        self.db.flush()
        event = self.event(
            'announcement_on',
            recipient=owner,
            event_type='announcement.published',
            payload={'announcement_id': announcement.public_id},
            occurred_at=published_at,
            cursor={'announcement_id': announcement.id, 'last_user_id': 0},
        )

        status = self.deliver(event)

        notification = self.db.query(Notification).one()
        self.assertEqual(status, 'delivered')
        self.assertEqual(notification.category, 'announcement')
        self.assertEqual(notification.announcement_id, announcement.id)

    def test_deliver_cancelled_announcement_event_expires_without_notification(self) -> None:
        owner = self.user('announcement_cancelled')
        published_at = notification_events.database_now(self.db)
        owner.created_at = published_at - timedelta(seconds=1)
        announcement = Announcement(
            id=self._next_id('announcements'),
            public_id='ann_notify_cancelled',
            title_json={'en': 'Cancelled announcement', 'zh': '取消公告', 'ja': 'キャンセル'},
            summary_json={'en': 'Summary', 'zh': '摘要', 'ja': '概要'},
            body_json={'en': 'Body', 'zh': '正文', 'ja': '本文'},
            cta_json={},
            audience_type='all_existing_users',
            audience_json={'max_user_id': owner.id},
            status='cancelled',
            idempotency_key='ann_notify_cancelled',
            content_fingerprint='fingerprint',
            published_at=published_at,
            cancelled_at=published_at + timedelta(minutes=1),
            operation_log_json=[],
        )
        self.db.add_all(
            [
                announcement,
                NotificationPreference(
                    user_id=owner.id,
                    likes_enabled=False,
                    announcements_enabled=True,
                    announcements_enabled_at=published_at - timedelta(seconds=1),
                ),
            ]
        )
        self.db.flush()
        event = self.event(
            'announcement_cancelled',
            recipient=owner,
            event_type='announcement.published',
            payload={'announcement_id': announcement.public_id},
            occurred_at=published_at,
            cursor={'announcement_id': announcement.id, 'last_user_id': 0},
        )

        status = self.deliver(event)

        self.assertEqual(status, 'expired_delivery')
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_retry_failure_marks_same_event_without_processing_next_pending_event(self) -> None:
        owner = self.user('retry_owner')
        current = notification_events.database_now(self.db) - timedelta(seconds=1)
        broken = self.event(
            'retry_broken',
            recipient=owner,
            event_type='review.completed',
            payload={'task_id': 'tsk_retry', 'photo_url': 'https://private.example.test/photo.jpg'},
            optional=False,
            occurred_at=current,
        )
        next_event = self.event(
            'retry_next',
            recipient=owner,
            event_type='review.completed',
            payload={'task_id': 'tsk_next'},
            optional=False,
            occurred_at=current,
        )

        result = notification_processor.process_pending_notifications(
            self.db,
            limit=1,
            max_batches=1,
            time_budget_seconds=5,
        )

        self.assertEqual(result, {'processed': 0, 'failed': 1})
        self.assertEqual(self.db.get(NotificationEvent, broken.id).status, 'pending')
        self.assertEqual(self.db.get(NotificationEvent, broken.id).attempts, 1)
        self.assertEqual(self.db.get(NotificationEvent, broken.id).last_error_code, 'NOTIFICATION_PROCESSING_FAILED')
        self.assertEqual(self.db.get(NotificationEvent, next_event.id).status, 'pending')
        self.assertEqual(self.db.get(NotificationEvent, next_event.id).attempts, 0)

    def test_visible_notifications_function_excludes_archived_expired_and_revoked(self) -> None:
        owner = self.user('visible')
        current = datetime(2026, 10, 10, 6, 0, tzinfo=timezone.utc)
        visible = self.notification(owner, 'visible', delivered_at=current)
        self.notification(owner, 'archived', delivered_at=current, archived_at=current)
        self.notification(owner, 'expired', delivered_at=current, expires_at=current - timedelta(seconds=1))
        self.notification(owner, 'revoked', delivered_at=current, revoked_at=current)
        visible_notifications = getattr(notification_processor, 'visible_notifications', None)
        self.assertTrue(callable(visible_notifications), 'notification_processor.visible_notifications must be defined')

        rows = visible_notifications(self.db, owner.id, now=current).all()

        self.assertEqual([row.public_id for row in rows], [visible.public_id])

    def test_unread_counts_excludes_archived_notifications(self) -> None:
        owner = self.user('unread')
        current = datetime(2026, 10, 10, 6, 0, tzinfo=timezone.utc)
        self.notification(owner, 'unread_system', category='system', delivered_at=current)
        self.notification(owner, 'unread_archived', category='system', delivered_at=current, archived_at=current)
        unread_counts = getattr(notification_processor, 'unread_counts', None)
        self.assertTrue(callable(unread_counts), 'notification_processor.unread_counts must be defined')

        counts = unread_counts(self.db, owner.id, now=current)

        self.assertEqual(counts['count'], 1)
        self.assertEqual(counts['categories'], {'system': 1, 'interaction': 0, 'announcement': 0})

    def test_notification_payload_exposes_only_public_template_fields(self) -> None:
        owner = self.user('payload')
        notification = self.notification(
            owner,
            'payload',
            notification_type='review.completed',
            template_key='review.completed.v1',
            params={
                'review_id': 'rev_public',
                'photo_url': 'https://signed.example.test/private.jpg',
                'result_json': {'private': True},
                'liker_user_id': 'usr_private',
                'error_message': 'raw private provider failure',
            },
        )
        notification_payload = getattr(notification_processor, 'notification_payload', None)
        self.assertTrue(callable(notification_payload), 'notification_processor.notification_payload must be defined')

        payload = notification_payload(self.db, notification, owner.id)

        self.assertEqual(payload['id'], notification.public_id)
        self.assertEqual(payload['params'], {'review_id': 'rev_public'})
        self.assertNotIn('photo_url', str(payload))
        self.assertNotIn('result_json', str(payload))
        self.assertNotIn('liker_user_id', str(payload))
        self.assertNotIn('raw private provider failure', str(payload))


class NotificationRouterTests(unittest.TestCase):
    def _router_module(self):
        try:
            return importlib.import_module('app.api.routers.notifications')
        except ImportError as exc:
            self.fail(f'app.api.routers.notifications must import cleanly: {exc}')

    def _router_module_or_skip(self):
        return self._router_module()

    def _request(self) -> Request:
        return Request({'type': 'http', 'method': 'GET', 'path': '/api/v1/notifications', 'headers': []})

    def test_notifications_router_imports_without_missing_service_helpers(self) -> None:
        self._router_module()

    def test_static_notification_routes_are_registered_before_dynamic_route(self) -> None:
        module = self._router_module_or_skip()
        paths = [route.path for route in module.router.routes]

        dynamic_path = '/{notification_id}' if '/{notification_id}' in paths else '/notifications/{notification_id}'
        dynamic_index = paths.index(dynamic_path)

        self.assertLess(paths.index('/unread-count' if '/unread-count' in paths else '/notifications/unread-count'), dynamic_index)
        self.assertLess(paths.index('/preferences' if '/preferences' in paths else '/notifications/preferences'), dynamic_index)
        self.assertLess(paths.index('/read-all' if '/read-all' in paths else '/notifications/read-all'), dynamic_index)

    def test_missing_authorization_rejects_without_creating_guest_user(self) -> None:
        with patch('app.api.deps.create_guest_user') as create_guest_user:
            with self.assertRaises(Exception) as rejected:
                get_registered_actor(self._request(), Response(), db=object(), authorization=None)

        self.assertEqual(getattr(rejected.exception, 'status_code'), 401)
        self.assertEqual(rejected.exception.detail['code'], 'AUTH_MISSING')
        create_guest_user.assert_not_called()

    def test_guest_token_rejects_notification_api_without_creating_guest_user(self) -> None:
        guest = SimpleNamespace(id=1, public_id='gst_notify_guest', plan=UserPlan.guest, status=UserStatus.active)

        with patch('app.api.deps._fetch_user_by_token', return_value=guest), patch(
            'app.api.deps.create_guest_user'
        ) as create_guest_user:
            with self.assertRaises(Exception) as rejected:
                get_registered_actor(self._request(), Response(), db=object(), authorization='Bearer guest-token')

        self.assertEqual(getattr(rejected.exception, 'status_code'), 401)
        self.assertEqual(rejected.exception.detail['code'], 'AUTH_LOGIN_REQUIRED')
        create_guest_user.assert_not_called()


class NotificationApiHTTPTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            'sqlite://',
            future=True,
            connect_args={'check_same_thread': False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine, tables=NOTIFICATION_TABLES)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.Session()
        now = datetime.now(timezone.utc)
        self.user = User(id=1, public_id='usr_notify_api_owner', email='owner@example.test', username='owner',
                         plan=UserPlan.free, daily_quota_total=5, daily_quota_used=0, status=UserStatus.active)
        self.other = User(id=2, public_id='usr_notify_api_other', email='other@example.test', username='other',
                          plan=UserPlan.free, daily_quota_total=5, daily_quota_used=0, status=UserStatus.active)
        self.guest = User(id=3, public_id='gst_notify_api_guest', email='guest@example.test', username='guest',
                          plan=UserPlan.guest, daily_quota_total=1, daily_quota_used=0, status=UserStatus.active)
        self.db.add_all([self.user, self.other, self.guest])
        self.db.add(Photo(id=1, public_id='pho_notify_api', owner_user_id=1, upload_id='upload', bucket='test',
                          object_key='photo.jpg', content_type='image/jpeg', size_bytes=10, status=PhotoStatus.READY,
                          exif_data={}, client_meta={}))
        self.db.add(ReviewTask(id=1, public_id='tsk_notify_api', photo_id=1, owner_user_id=1, mode=ReviewMode.flash,
                               status=TaskStatus.SUCCEEDED, request_payload={}, finished_at=now))
        self.db.add(Review(id=1, public_id='rev_notify_api', task_id=1, photo_id=1, owner_user_id=1,
                           mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, image_type='portrait',
                           schema_version='1.0', result_json={'private': 'must_not_leak'}, final_score=Decimal('7.10'),
                           is_public=False, gallery_visible=False, gallery_audit_status='withdrawn', tags_json=[]))
        self.db.add(Photo(id=2, public_id='pho_notify_api_old', owner_user_id=1, upload_id='upload-old', bucket='test',
                          object_key='photo-old.jpg', content_type='image/jpeg', size_bytes=10, status=PhotoStatus.READY,
                          exif_data={}, client_meta={}))
        self.db.add(ReviewTask(id=2, public_id='tsk_notify_api_old', photo_id=2, owner_user_id=1, mode=ReviewMode.flash,
                               status=TaskStatus.SUCCEEDED, request_payload={}, finished_at=now - timedelta(days=40)))
        self.db.add(Review(id=2, public_id='rev_notify_api_old_private', task_id=2, photo_id=2, owner_user_id=1,
                           mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, image_type='portrait',
                           schema_version='1.0', result_json={'private': 'must_not_leak'}, final_score=Decimal('7.10'),
                           is_public=False, gallery_visible=False, gallery_audit_status='withdrawn', tags_json=[],
                           created_at=now - timedelta(days=40)))
        self.db.add_all([
            Notification(id=1, public_id='ntf_notify_api_review', recipient_user_id=1, category='system',
                         notification_type='review.completed', dedupe_key='api:review', template_key='review_completed',
                         template_version=1, template_params_json={'review_id': 'rev_notify_api', 'photo_url': 'https://private.example.test/signed'},
                         target_type='review', target_public_id='rev_notify_api', occurred_at=now, delivered_at=now, expires_at=now + timedelta(days=90)),
            Notification(id=2, public_id='ntf_notify_api_other', recipient_user_id=2, category='system',
                         notification_type='review.completed', dedupe_key='api:other', template_key='review_completed',
                         template_version=1, template_params_json={'review_id': 'rev_other'}, target_type='review',
                         target_public_id='rev_other', occurred_at=now, delivered_at=now, expires_at=now + timedelta(days=90)),
            Notification(id=3, public_id='ntf_notify_api_revoked', recipient_user_id=1, category='system',
                         notification_type='review.completed', dedupe_key='api:revoked', template_key='review_completed',
                         template_version=1, template_params_json={'review_id': 'rev_notify_api'}, target_type='review',
                         target_public_id='rev_notify_api', occurred_at=now, delivered_at=now, revoked_at=now, expires_at=now + timedelta(days=90)),
            Notification(id=4, public_id='ntf_notify_api_old_null_expiry', recipient_user_id=1, category='system',
                         notification_type='review.completed', dedupe_key='api:old-null', template_key='review_completed',
                         template_version=1, template_params_json={'review_id': 'rev_notify_api'}, target_type='review',
                         target_public_id='rev_notify_api', occurred_at=now - timedelta(days=91), delivered_at=now - timedelta(days=91), expires_at=None),
            Notification(id=5, public_id='ntf_notify_api_expired_review', recipient_user_id=1, category='system',
                         notification_type='review.completed', dedupe_key='api:expired-review', template_key='review_completed',
                         template_version=1, template_params_json={'review_id': 'rev_notify_api_old_private'}, target_type='review',
                         target_public_id='rev_notify_api_old_private', occurred_at=now - timedelta(minutes=1),
                         delivered_at=now - timedelta(minutes=1), read_at=now, expires_at=now + timedelta(days=90)),
        ])
        self.db.commit()

        app = FastAPI()
        app.include_router(notifications_router, prefix='/api/v1')

        @app.middleware('http')
        async def no_store_notifications(request, call_next):
            response = await call_next(request)
            if '/notifications' in request.url.path:
                response.headers['Cache-Control'] = 'private, no-store'
            return response

        def db_dependency():
            yield self.db

        app.dependency_overrides[get_db] = db_dependency
        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.db.close()
        self.engine.dispose()

    def headers(self, user: User | None = None) -> dict:
        user = user or self.user
        role = 'guest' if user.plan == UserPlan.guest else 'user'
        token = create_access_token({'sub': user.public_id, 'role': role})
        return {'Authorization': f'Bearer {token}'}

    def set_subscription(self, *, ends_at: datetime) -> None:
        self.db.query(BillingSubscription).delete(synchronize_session=False)
        self.db.add(BillingSubscription(
            user_id=self.user.id,
            provider='activation_code',
            provider_subscription_id=f'ntf-sub-{ends_at.timestamp()}',
            status='active',
            ends_at=ends_at,
        ))
        self.db.commit()

    def test_list_and_detail_use_frontend_contract_without_raw_payload(self) -> None:
        with patch.object(settings, 'notifications_read_enabled', True):
            listing = self.client.get('/api/v1/notifications', params={'locale': 'zh'}, headers=self.headers())
            detail = self.client.get('/api/v1/notifications/ntf_notify_api_review', params={'locale': 'zh'}, headers=self.headers())

        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.headers['cache-control'], 'private, no-store')
        item = listing.json()['items'][0]
        items_by_id = {row['notification_id']: row for row in listing.json()['items']}
        self.assertEqual(item['notification_id'], 'ntf_notify_api_review')
        self.assertEqual(item['title'], '点评已完成')
        self.assertEqual(item['target']['href'], '/reviews/rev_notify_api')
        self.assertEqual(items_by_id['ntf_notify_api_expired_review']['target']['state'], 'unavailable')
        self.assertIsNone(items_by_id['ntf_notify_api_expired_review']['target']['href'])
        self.assertNotIn('id', item)
        self.assertNotIn('event_type', item)
        self.assertNotIn('params', item)
        self.assertNotIn('photo_url', str(listing.json()))
        self.assertEqual(detail.json()['body'], '打开结果查看评分与下一次拍摄建议。')
        self.assertEqual(detail.json()['rendered_locale'], 'zh')
        self.assertNotIn('must_not_leak', str(detail.json()))

    def test_get_has_no_read_side_effect_and_read_archive_are_idempotent(self) -> None:
        with patch.object(settings, 'notifications_read_enabled', True):
            first_detail = self.client.get('/api/v1/notifications/ntf_notify_api_review', headers=self.headers())
            first_read = self.client.post('/api/v1/notifications/ntf_notify_api_review/read', headers=self.headers())
            second_read = self.client.post('/api/v1/notifications/ntf_notify_api_review/read', headers=self.headers())
            archived = self.client.patch('/api/v1/notifications/ntf_notify_api_review', headers=self.headers(), json={'archived': True})
            restored = self.client.patch('/api/v1/notifications/ntf_notify_api_review', headers=self.headers(), json={'archived': False})

        self.assertIsNone(first_detail.json()['read_at'])
        self.assertEqual(first_read.json()['read_at'], second_read.json()['read_at'])
        self.assertEqual(first_read.json()['unread_count'], 0)
        self.assertEqual(archived.json()['notification_id'], 'ntf_notify_api_review')
        self.assertIsNotNone(archived.json()['archived_at'])
        self.assertEqual(archived.json()['read_at'], first_read.json()['read_at'])
        self.assertIsNone(restored.json()['archived_at'])
        self.assertEqual(restored.json()['read_at'], first_read.json()['read_at'])

    def test_review_target_retention_uses_effective_plan_without_persisting_downgrade(self) -> None:
        self.user.plan = UserPlan.pro
        self.db.add(self.user)
        self.db.commit()

        self.set_subscription(ends_at=datetime.now(timezone.utc) - timedelta(days=1))
        with patch.object(settings, 'notifications_read_enabled', True):
            expired = self.client.get('/api/v1/notifications', headers=self.headers())
        expired_item = {row['notification_id']: row for row in expired.json()['items']}['ntf_notify_api_expired_review']
        self.assertEqual(expired_item['target']['state'], 'unavailable')
        self.assertIsNone(expired_item['target']['href'])
        self.db.expire_all()
        self.assertEqual(self.db.get(User, self.user.id).plan, UserPlan.pro)
        self.assertEqual(self.db.get(User, self.user.id).daily_quota_used, 0)

        self.set_subscription(ends_at=datetime.now(timezone.utc) + timedelta(days=30))
        with patch.object(settings, 'notifications_read_enabled', True):
            active = self.client.get('/api/v1/notifications', headers=self.headers())
        active_item = {row['notification_id']: row for row in active.json()['items']}['ntf_notify_api_expired_review']
        self.assertEqual(active_item['target']['state'], 'available')
        self.assertEqual(active_item['target']['href'], '/reviews/rev_notify_api_old_private')
        self.db.expire_all()
        self.assertEqual(self.db.get(User, self.user.id).plan, UserPlan.pro)
        self.assertEqual(self.db.get(User, self.user.id).daily_quota_used, 0)

    def test_read_all_permissions_disabled_and_retention_paths(self) -> None:
        with patch.object(settings, 'notifications_read_enabled', True):
            invalid_locale = self.client.get('/api/v1/notifications', params={'locale': 'fr'}, headers=self.headers())
            missing = self.client.get('/api/v1/notifications')
            guest = self.client.get('/api/v1/notifications', headers=self.headers(self.guest))
            other = self.client.get('/api/v1/notifications/ntf_notify_api_review', headers=self.headers(self.other))
            revoked = self.client.get('/api/v1/notifications/ntf_notify_api_revoked', headers=self.headers())
            old_null_expiry = self.client.get('/api/v1/notifications/ntf_notify_api_old_null_expiry', headers=self.headers())
            read_all = self.client.post('/api/v1/notifications/read-all', headers=self.headers(), json={'category': 'system'})
            count = self.client.get('/api/v1/notifications/unread-count', headers=self.headers())
        with patch.object(settings, 'notifications_read_enabled', False):
            disabled = self.client.get('/api/v1/notifications', headers=self.headers())

        self.assertEqual(invalid_locale.status_code, 422)
        self.assertEqual(missing.status_code, 401)
        self.assertEqual(guest.status_code, 401)
        self.assertEqual(other.status_code, 404)
        self.assertEqual(revoked.status_code, 410)
        self.assertEqual(old_null_expiry.status_code, 410)
        self.assertEqual(read_all.json()['changed_count'], 1)
        self.assertEqual(count.json()['by_category'], {'system': 0, 'interaction': 0, 'announcement': 0})
        self.assertEqual(disabled.status_code, 503)
        disabled_body = disabled.json()
        disabled_code = disabled_body.get('error', disabled_body.get('detail', {})).get('code')
        self.assertEqual(disabled_code, 'NOTIFICATIONS_DISABLED')
        for response in (invalid_locale, missing, guest, other, revoked, old_null_expiry, disabled):
            self.assertEqual(response.headers['cache-control'], 'private, no-store')


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class NotificationPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.connection = self.engine.connect()
        self.transaction = self.connection.begin()
        self.Session = sessionmaker(bind=self.connection, autoflush=False, autocommit=False)
        self.db = self.Session()

    def tearDown(self) -> None:
        self.db.close()
        self.transaction.rollback()
        self.connection.close()
        self.engine.dispose()

    def _user(self, suffix: str) -> User:
        user = User(
            public_id=f'usr_notify_pg_{suffix}',
            email=f'notify_pg_{suffix}@example.test',
            username=f'notify_pg_{suffix}',
            plan=UserPlan.free,
            daily_quota_total=5,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def test_event_dedupe_is_enforced_by_database_unique_constraint(self) -> None:
        user = self._user('dedupe')
        values = {
            'public_id': 'nev_notify_pg_dedupe_1',
            'event_type': 'review.completed',
            'dedupe_key': 'pg:dedupe:review',
            'payload_json': {'task_id': 'tsk_pg'},
            'recipient_user_id': user.id,
            'optional_preference_eligible': False,
            'occurred_at': datetime.now(timezone.utc),
            'available_at': datetime.now(timezone.utc),
            'cursor_json': {},
        }
        first = notification_events._insert_event_once(self.db, values)
        second_values = dict(values, public_id='nev_notify_pg_dedupe_2')
        second = notification_events._insert_event_once(self.db, second_values)
        self.db.commit()

        self.assertTrue(first)
        self.assertFalse(second)
        self.assertEqual(self.db.query(NotificationEvent).filter(NotificationEvent.dedupe_key == values['dedupe_key']).count(), 1)


if __name__ == '__main__':
    unittest.main()
