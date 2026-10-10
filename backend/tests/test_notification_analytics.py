from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sys
import unittest
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.api.routers.analytics import router as analytics_router
from app.core.security import create_access_token
from app.db.base import Base
from app.db.models import Notification, ProductAnalyticsEvent, User, UserPlan, UserStatus

try:
    from tests.test_notifications import NOTIFICATION_TABLES
except ImportError:
    from test_notifications import NOTIFICATION_TABLES


ANALYTICS_TABLES = [*NOTIFICATION_TABLES, ProductAnalyticsEvent.__table__]
TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


class NotificationAnalyticsHTTPTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            'sqlite://',
            future=True,
            connect_args={'check_same_thread': False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine, tables=ANALYTICS_TABLES)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.Session()
        self.now = datetime(2026, 10, 10, 8, 0, tzinfo=timezone.utc)
        self.owner = self.user(1, 'owner')
        self.other = self.user(2, 'other')
        self.guest = self.user(3, 'guest', plan=UserPlan.guest)
        self.notification(self.owner, 1, 'owner_like', category='interaction', notification_type='gallery.review_liked')
        self.notification(self.other, 2, 'other_system', category='system', notification_type='review.completed')
        self.db.commit()

        app = FastAPI()
        app.include_router(analytics_router, prefix='/api/v1')

        def db_dependency():
            yield self.db

        app.dependency_overrides[get_db] = db_dependency
        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.db.close()
        self.engine.dispose()

    def user(self, row_id: int, suffix: str, *, plan: UserPlan = UserPlan.free) -> User:
        row = User(
            id=row_id,
            public_id=f'usr_notif_analytics_{suffix}' if plan != UserPlan.guest else f'gst_notif_analytics_{suffix}',
            email=f'notif_analytics_{suffix}@example.test',
            username=f'notif_analytics_{suffix}',
            plan=plan,
            daily_quota_total=5,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def notification(
        self,
        recipient: User,
        row_id: int,
        suffix: str,
        *,
        category: str,
        notification_type: str,
    ) -> Notification:
        row = Notification(
            id=row_id,
            public_id=f'ntf_analytics_{suffix}',
            recipient_user_id=recipient.id,
            category=category,
            notification_type=notification_type,
            dedupe_key=f'analytics:{suffix}',
            template_key=f'{notification_type}.v1',
            template_version=1,
            template_params_json={'private': 'must_not_leak'},
            target_type='review',
            target_public_id=f'rev_analytics_{suffix}',
            occurred_at=self.now,
            delivered_at=self.now,
            expires_at=self.now + timedelta(days=90),
        )
        self.db.add(row)
        self.db.flush()
        return row

    def headers(self, user: User | None = None) -> dict[str, str]:
        user = user or self.owner
        role = 'guest' if user.plan == UserPlan.guest else 'user'
        token = create_access_token({'sub': user.public_id, 'role': role})
        return {'Authorization': f'Bearer {token}', 'X-Device-Id': 'device-notifications-test'}

    def post_event(self, event_name: str, *, page_path: str, metadata: dict, user: User | None = None):
        return self.client.post(
            '/api/v1/analytics/events',
            headers=self.headers(user),
            json={
                'event_name': event_name,
                'source': 'notifications',
                'page_path': page_path,
                'locale': 'en',
                'session_id': 'session-notifications-test',
                'metadata': metadata,
            },
        )

    def error_code(self, response) -> str | None:
        payload = response.json()
        detail = payload.get('detail') or payload.get('error') or {}
        return detail.get('code')

    def events(self) -> list[ProductAnalyticsEvent]:
        return self.db.query(ProductAnalyticsEvent).order_by(ProductAnalyticsEvent.id).all()

    def test_center_and_preferences_events_store_only_whitelisted_metadata(self) -> None:
        opened = self.post_event(
            'notification_center_opened',
            page_path='/account/notifications',
            metadata={
                'category': 'interaction',
                'archived': False,
                'unread_only': True,
                'email': 'owner@example.test',
                'token': 'secret-token',
                'raw_json': {'unsafe': True},
            },
        )
        changed = self.post_event(
            'notification_preferences_changed',
            page_path='/account/notifications/settings',
            metadata={
                'key': 'likes_enabled',
                'enabled': True,
                'body': 'private announcement body',
                'photo_url': 'https://private.example.test/photo.jpg',
            },
        )

        self.assertEqual(opened.status_code, 202)
        self.assertEqual(changed.status_code, 202)
        rows = self.events()
        self.assertEqual(rows[0].source, 'notifications')
        self.assertEqual(rows[0].user_public_id, self.owner.public_id)
        self.assertEqual(rows[0].metadata_json, {'category': 'interaction', 'archived': False, 'unread_only': True})
        self.assertEqual(rows[1].metadata_json, {'key': 'likes_enabled', 'enabled': True})
        self.assertNotIn('secret-token', str(rows))
        self.assertNotIn('private.example.test', str(rows))

    def test_detail_events_derive_category_and_type_from_owned_visible_notification(self) -> None:
        forged = {
            'category': 'system',
            'type': 'review.completed',
            'target_type': 'review',
            'email': 'owner@example.test',
            'token': 'secret-token',
            'photo_url': 'https://private.example.test/photo.jpg',
        }

        opened = self.post_event(
            'notification_opened',
            page_path='/account/notifications/ntf_analytics_owner_like',
            metadata=forged,
        )
        clicked = self.post_event(
            'notification_target_clicked',
            page_path='/account/notifications/ntf_analytics_owner_like',
            metadata=forged,
        )

        self.assertEqual(opened.status_code, 202)
        self.assertEqual(clicked.status_code, 202)
        for row in self.events():
            self.assertEqual(row.metadata_json, {'category': 'interaction', 'type': 'gallery.review_liked'})
        self.assertNotIn('target_type', str([row.metadata_json for row in self.events()]))
        self.assertNotIn('secret-token', str([row.metadata_json for row in self.events()]))
        self.assertNotIn('private.example.test', str([row.metadata_json for row in self.events()]))

    def test_notification_events_reject_guests_foreign_ids_and_invalid_metadata_without_writes(self) -> None:
        missing = self.client.post(
            '/api/v1/analytics/events',
            json={
                'event_name': 'notification_center_opened',
                'source': 'notifications',
                'page_path': '/account/notifications',
                'metadata': {'category': 'all', 'archived': False, 'unread_only': False},
            },
        )
        guest = self.post_event(
            'notification_center_opened',
            page_path='/account/notifications',
            metadata={'category': 'all', 'archived': False, 'unread_only': False},
            user=self.guest,
        )
        foreign = self.post_event(
            'notification_opened',
            page_path='/account/notifications/ntf_analytics_other_system',
            metadata={'category': 'system', 'type': 'review.completed'},
        )
        invalid_page = self.post_event(
            'notification_preferences_changed',
            page_path='/account/notifications',
            metadata={'key': 'likes_enabled', 'enabled': True},
        )
        invalid_metadata = self.post_event(
            'notification_center_opened',
            page_path='/account/notifications',
            metadata={'category': 'all', 'archived': 'false', 'unread_only': False},
        )

        self.assertEqual(missing.status_code, 401)
        self.assertEqual(guest.status_code, 401)
        self.assertEqual(self.error_code(missing), 'AUTH_LOGIN_REQUIRED')
        self.assertEqual(self.error_code(guest), 'AUTH_LOGIN_REQUIRED')
        self.assertEqual(foreign.status_code, 404)
        self.assertEqual(self.error_code(foreign), 'NOTIFICATION_NOT_FOUND')
        self.assertEqual(invalid_page.status_code, 400)
        self.assertEqual(self.error_code(invalid_page), 'ANALYTICS_PAGE_INVALID')
        self.assertEqual(invalid_metadata.status_code, 400)
        self.assertEqual(self.error_code(invalid_metadata), 'ANALYTICS_METADATA_INVALID')
        self.assertEqual(self.db.query(ProductAnalyticsEvent).count(), 0)

    def test_non_notification_analytics_keeps_existing_guest_behavior(self) -> None:
        response = self.client.post(
            '/api/v1/analytics/events',
            json={
                'event_name': 'home_viewed',
                'source': 'home_direct',
                'page_path': '/',
                'metadata': {'content_id': 'home'},
            },
        )

        self.assertEqual(response.status_code, 202)
        row = self.db.query(ProductAnalyticsEvent).one()
        self.assertIsNone(row.user_public_id)
        self.assertEqual(row.plan, 'guest')
        self.assertEqual(row.metadata_json, {'content_id': 'home'})


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class NotificationAnalyticsPostgresHTTPTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.connection = self.engine.connect()
        self.transaction = self.connection.begin()
        self.Session = sessionmaker(bind=self.connection, expire_on_commit=False)
        self.db = self.Session()
        self.suffix = uuid4().hex[:12]
        self.now = datetime.now(timezone.utc)
        self.owner = self.user('owner')
        self.other = self.user('other')
        self.guest = self.user('guest', plan=UserPlan.guest)
        self.owner_notification = self.notification(self.owner, 'owner_like', category='interaction', notification_type='gallery.review_liked')
        self.other_notification = self.notification(self.other, 'other_system', category='system', notification_type='review.completed')
        self.db.flush()

        app = FastAPI()
        app.include_router(analytics_router, prefix='/api/v1')

        def db_dependency():
            yield self.db

        app.dependency_overrides[get_db] = db_dependency
        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.db.close()
        self.transaction.rollback()
        self.connection.close()
        self.engine.dispose()

    def user(self, label: str, *, plan: UserPlan = UserPlan.free) -> User:
        row = User(
            public_id=f'usr_notif_analytics_pg_{self.suffix}_{label}' if plan != UserPlan.guest else f'gst_notif_analytics_pg_{self.suffix}_{label}',
            email=f'notif_analytics_pg_{self.suffix}_{label}@example.test',
            username=f'notif_analytics_pg_{self.suffix}_{label}',
            plan=plan,
            daily_quota_total=5,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def notification(
        self,
        recipient: User,
        label: str,
        *,
        category: str,
        notification_type: str,
    ) -> Notification:
        row = Notification(
            public_id=f'ntf_analytics_pg_{self.suffix}_{label}',
            recipient_user_id=recipient.id,
            category=category,
            notification_type=notification_type,
            dedupe_key=f'analytics:pg:{self.suffix}:{label}',
            template_key=f'{notification_type}.v1',
            template_version=1,
            template_params_json={'private': 'must_not_leak'},
            target_type='review',
            target_public_id=f'rev_analytics_pg_{self.suffix}_{label}',
            occurred_at=self.now,
            delivered_at=self.now,
            expires_at=self.now + timedelta(days=90),
        )
        self.db.add(row)
        self.db.flush()
        return row

    def headers(self, user: User) -> dict[str, str]:
        role = 'guest' if user.plan == UserPlan.guest else 'user'
        token = create_access_token({'sub': user.public_id, 'role': role})
        return {'Authorization': f'Bearer {token}'}

    def post_event(self, event_name: str, *, page_path: str, metadata: dict, user: User):
        return self.client.post(
            '/api/v1/analytics/events',
            headers=self.headers(user),
            json={
                'event_name': event_name,
                'source': 'notifications',
                'page_path': page_path,
                'locale': 'en',
                'session_id': f'session-notifications-pg-{self.suffix}',
                'metadata': metadata,
            },
        )

    def error_code(self, response) -> str | None:
        payload = response.json()
        detail = payload.get('detail') or payload.get('error') or {}
        return detail.get('code')

    def test_postgres_http_enforces_privacy_guest_and_foreign_notification_id(self) -> None:
        accepted = self.post_event(
            'notification_opened',
            page_path=f'/account/notifications/{self.owner_notification.public_id}',
            metadata={
                'category': 'system',
                'type': 'review.completed',
                'token': 'secret-token',
                'photo_url': 'https://private.example.test/photo.jpg',
            },
            user=self.owner,
        )
        guest = self.post_event(
            'notification_center_opened',
            page_path='/account/notifications',
            metadata={'category': 'all', 'archived': False, 'unread_only': False},
            user=self.guest,
        )
        foreign = self.post_event(
            'notification_opened',
            page_path=f'/account/notifications/{self.other_notification.public_id}',
            metadata={'category': 'system', 'type': 'review.completed'},
            user=self.owner,
        )

        self.assertEqual(accepted.status_code, 202)
        self.assertEqual(guest.status_code, 401)
        self.assertEqual(self.error_code(guest), 'AUTH_LOGIN_REQUIRED')
        self.assertEqual(foreign.status_code, 404)
        self.assertEqual(self.error_code(foreign), 'NOTIFICATION_NOT_FOUND')
        rows = (
            self.db.query(ProductAnalyticsEvent)
            .filter(ProductAnalyticsEvent.session_id == f'session-notifications-pg-{self.suffix}')
            .all()
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].metadata_json, {'category': 'interaction', 'type': 'gallery.review_liked'})
        self.assertNotIn('secret-token', str(rows[0].metadata_json))
        self.assertNotIn('private.example.test', str(rows[0].metadata_json))


if __name__ == '__main__':
    unittest.main()
