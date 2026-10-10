from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException, Response
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.routers import notifications as notification_api
from app.db.base import Base
from app.db.models import (
    Notification,
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
from app.schemas import NotificationArchiveRequest, NotificationPreferencesUpdateRequest, NotificationReadAllRequest
try:
    from tests.test_notifications import NOTIFICATION_TABLES
except ImportError:
    from test_notifications import NOTIFICATION_TABLES


class NotificationApiSQLiteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine('sqlite:///:memory:', future=True)
        Base.metadata.create_all(self.engine, tables=NOTIFICATION_TABLES)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self._ids: dict[str, int] = {}
        self.now = datetime(2026, 10, 10, 8, 0, tzinfo=timezone.utc)
        self.owner = self.user('owner')
        self.other = self.user('other')

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _next_id(self, table: str) -> int:
        value = self._ids.get(table, 0) + 1
        self._ids[table] = value
        return value

    def user(self, suffix: str, *, plan: UserPlan = UserPlan.free, status: UserStatus = UserStatus.active) -> User:
        row = User(
            id=self._next_id('users'),
            public_id=f'usr_api_{suffix}',
            email=f'api_{suffix}@example.test',
            username=f'api_{suffix}',
            plan=plan,
            daily_quota_total=5,
            daily_quota_used=0,
            status=status,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def review(self, owner: User, suffix: str, *, deleted_at: datetime | None = None) -> Review:
        photo = Photo(
            id=self._next_id('photos'),
            public_id=f'pho_api_{suffix}',
            owner_user_id=owner.id,
            upload_id=f'upl_api_{suffix}',
            bucket='test',
            object_key=f'api/{suffix}.jpg',
            content_type='image/jpeg',
            size_bytes=123,
            status=PhotoStatus.READY,
            exif_data={},
            client_meta={},
        )
        self.db.add(photo)
        self.db.flush()
        task = ReviewTask(
            id=self._next_id('review_tasks'),
            public_id=f'tsk_api_{suffix}',
            photo_id=photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.flash,
            status=TaskStatus.SUCCEEDED,
            request_payload={},
        )
        self.db.add(task)
        self.db.flush()
        review = Review(
            id=self._next_id('reviews'),
            public_id=f'rev_api_{suffix}',
            task_id=task.id,
            photo_id=photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.flash,
            status=ReviewStatus.SUCCEEDED,
            image_type='portrait',
            schema_version='1.0',
            result_json={'private': True},
            final_score=Decimal('7.20'),
            is_public=True,
            gallery_visible=True,
            gallery_audit_status='approved',
            gallery_added_at=self.now,
            tags_json=[],
            deleted_at=deleted_at,
        )
        self.db.add(review)
        self.db.flush()
        return review

    def notification(
        self,
        recipient: User,
        suffix: str,
        *,
        category: str = 'system',
        notification_type: str = 'review.completed',
        params: dict | None = None,
        target_public_id: str | None = None,
        read_at: datetime | None = None,
        archived_at: datetime | None = None,
        revoked_at: datetime | None = None,
        expires_at: datetime | None = None,
    ) -> Notification:
        delivered = self.now + timedelta(minutes=self._next_id('delivered'))
        params = params if params is not None else {'task_id': f'tsk_api_{suffix}', 'review_id': f'rev_api_{suffix}'}
        row = Notification(
            id=self._next_id('notifications'),
            public_id=f'ntf_api_{suffix}',
            recipient_user_id=recipient.id,
            category=category,
            notification_type=notification_type,
            dedupe_key=f'notification:{suffix}',
            template_key=f'{notification_type}.v1',
            template_version=1,
            template_params_json=params,
            target_type='review',
            target_public_id=target_public_id or params.get('review_id'),
            occurred_at=delivered,
            delivered_at=delivered,
            read_at=read_at,
            archived_at=archived_at,
            revoked_at=revoked_at,
            expires_at=expires_at or self.now + timedelta(days=90),
        )
        self.db.add(row)
        self.db.flush()
        return row

    def response(self) -> Response:
        return Response()

    def assert_same_instant(self, actual: datetime | None, expected: datetime) -> None:
        self.assertIsNotNone(actual)
        self.assertEqual(actual.tzinfo, timezone.utc)
        self.assertEqual(actual.replace(tzinfo=None), expected.replace(tzinfo=None))

    def test_read_read_all_archive_restore_and_counts_use_shared_visibility(self) -> None:
        review = self.review(self.owner, 'read')
        first = self.notification(self.owner, 'read', params={'task_id': 'tsk_api_read', 'review_id': review.public_id})
        second = self.notification(self.owner, 'read_second', params={'task_id': 'tsk_api_read', 'review_id': review.public_id})
        self.notification(self.owner, 'read_archived', archived_at=self.now)
        self.notification(self.owner, 'read_expired', expires_at=self.now - timedelta(seconds=1))

        with patch('app.api.routers.notifications.database_now', return_value=self.now):
            count = notification_api.notification_unread_count(self.response(), db=self.db, user=self.owner)
            page = notification_api.list_notifications(
                self.response(),
                category='all',
                unread_only=False,
                archived=False,
                locale='en',
                cursor=None,
                limit=20,
                db=self.db,
                user=self.owner,
            )
        self.assertEqual(count.total, 2)
        self.assertEqual(count.by_category['system'], 2)
        self.assertEqual(page.unread_count, 2)
        self.assertEqual({item.notification_id for item in page.items}, {first.public_id, second.public_id})

        read_at = self.now + timedelta(minutes=30)
        later = self.now + timedelta(hours=1)
        with patch('app.api.routers.notifications.database_now', side_effect=[read_at, later]):
            first_read = notification_api.mark_notification_read(first.public_id, self.response(), db=self.db, user=self.owner)
            second_read = notification_api.mark_notification_read(first.public_id, self.response(), db=self.db, user=self.owner)
        self.assert_same_instant(first_read.read_at, read_at)
        self.assert_same_instant(second_read.read_at, read_at)

        with patch('app.api.routers.notifications.database_now', return_value=later):
            archived = notification_api.patch_notification(
                second.public_id,
                NotificationArchiveRequest(archived=True),
                self.response(),
                db=self.db,
                user=self.owner,
            )
        self.assertIsNotNone(archived.archived_at)
        self.assertIsNone(archived.read_at)

        with patch('app.api.routers.notifications.database_now', return_value=later + timedelta(minutes=1)):
            restored = notification_api.patch_notification(
                second.public_id,
                NotificationArchiveRequest(archived=False),
                self.response(),
                db=self.db,
                user=self.owner,
            )
        self.assertIsNone(restored.archived_at)
        self.assertIsNone(restored.read_at)

        with patch('app.api.routers.notifications.database_now', return_value=later):
            changed = notification_api.mark_all_notifications_read(
                self.response(),
                NotificationReadAllRequest(category='all'),
                db=self.db,
                user=self.owner,
            )
        self.assertEqual(changed.changed_count, 1)
        self.assertEqual(changed.unread_count, 0)

    def test_detail_owner_404_expired_and_revoked_410(self) -> None:
        visible = self.notification(self.owner, 'owned')
        expired = self.notification(self.owner, 'expired_detail', expires_at=self.now - timedelta(seconds=1))
        revoked = self.notification(self.owner, 'revoked_detail', revoked_at=self.now)

        with patch('app.api.routers.notifications.database_now', return_value=self.now):
            with self.assertRaises(HTTPException) as other_rejected:
                notification_api.get_notification(visible.public_id, self.response(), locale='en', db=self.db, user=self.other)
            with self.assertRaises(HTTPException) as expired_rejected:
                notification_api.get_notification(expired.public_id, self.response(), locale='en', db=self.db, user=self.owner)
            with self.assertRaises(HTTPException) as revoked_rejected:
                notification_api.get_notification(revoked.public_id, self.response(), locale='en', db=self.db, user=self.owner)

        self.assertEqual(other_rejected.exception.status_code, 404)
        self.assertEqual(expired_rejected.exception.status_code, 410)
        self.assertEqual(revoked_rejected.exception.status_code, 410)

    def test_preferences_default_null_invalid_and_enabled_at_transitions(self) -> None:
        defaults = notification_api.get_notification_preferences(self.response(), db=self.db, user=self.owner)
        self.assertFalse(defaults.likes_enabled)
        self.assertFalse(defaults.announcements_enabled)
        with self.assertRaises(ValidationError):
            NotificationPreferencesUpdateRequest(likes_enabled=None)

        t1 = self.now
        t2 = self.now + timedelta(minutes=1)
        t3 = self.now + timedelta(minutes=2)
        t4 = self.now + timedelta(minutes=3)
        with patch('app.services.notification_events.database_now', side_effect=[t1, t2, t3, t4]):
            enabled = notification_api.update_notification_preferences(
                NotificationPreferencesUpdateRequest(likes_enabled=True),
                self.response(),
                db=self.db,
                user=self.owner,
            )
            enabled_again = notification_api.update_notification_preferences(
                NotificationPreferencesUpdateRequest(likes_enabled=True),
                self.response(),
                db=self.db,
                user=self.owner,
            )
            disabled = notification_api.update_notification_preferences(
                NotificationPreferencesUpdateRequest(likes_enabled=False),
                self.response(),
                db=self.db,
                user=self.owner,
            )
            reenabled = notification_api.update_notification_preferences(
                NotificationPreferencesUpdateRequest(likes_enabled=True),
                self.response(),
                db=self.db,
                user=self.owner,
            )

        self.assert_same_instant(enabled.likes_enabled_at, t1)
        self.assert_same_instant(enabled_again.likes_enabled_at, t1)
        self.assertIsNone(disabled.likes_enabled_at)
        self.assert_same_instant(reenabled.likes_enabled_at, t4)

    def test_subscription_copy_distinguishes_activation_from_cancelled_renewal(self) -> None:
        from app.services.notification_access import render_notification

        active = self.notification(self.owner, 'subscription_active', notification_type='subscription.changed',
                                   params={'subscription_id': 'private_provider_id', 'status': 'active'})
        cancelled = self.notification(self.owner, 'subscription_cancelled', notification_type='subscription.changed',
                                      params={'subscription_id': 'private_provider_id', 'status': 'cancelled'})
        for locale, cancellation in [('en', 'cancelled'), ('zh', '已取消'), ('ja', '停止')]:
            with self.subTest(locale=locale):
                active_copy = render_notification(self.db, active, locale=locale, detail=True)
                cancelled_copy = render_notification(self.db, cancelled, locale=locale, detail=True)
                self.assertNotEqual(active_copy['summary'], cancelled_copy['summary'])
                self.assertIn(cancellation, cancelled_copy['summary'])
                self.assertNotIn('private_provider_id', str(cancelled_copy))

    def test_payload_target_requires_owner_visible_review_and_revoked_rows_hide(self) -> None:
        owner_review = self.review(self.owner, 'target')
        wrong_owner = self.notification(
            self.other,
            'wrong_owner_target',
            category='interaction',
            notification_type='gallery.review_liked',
            params={'review_id': owner_review.public_id},
            target_public_id=owner_review.public_id,
        )
        revoked = self.notification(self.other, 'hidden_revoked', revoked_at=self.now)

        with patch('app.api.routers.notifications.database_now', return_value=self.now):
            page = notification_api.list_notifications(
                self.response(),
                category='all',
                unread_only=False,
                archived=False,
                locale='en',
                cursor=None,
                limit=20,
                db=self.db,
                user=self.other,
            )

        self.assertEqual([item.notification_id for item in page.items], [wrong_owner.public_id])
        self.assertEqual(page.items[0].target.state, 'unavailable')
        self.assertIsNone(page.items[0].target.href)
        self.assertNotIn(revoked.public_id, {item.notification_id for item in page.items})


if __name__ == '__main__':
    unittest.main()
