from __future__ import annotations

from datetime import datetime, timedelta, timezone
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

from app.core.config import settings
from app.db.base import Base
from app.db.models import Announcement, NotificationEvent, User, UserPlan, UserStatus
from app.services.announcements import (
    BODY_LIMIT,
    SPECIFIC_USER_LIMIT,
    SUMMARY_LIMIT,
    TITLE_LIMIT,
    WEEKLY_PUBLISH_LIMIT,
    announcement_status,
    cancel_announcement,
    draft_from_update_bundle,
    preview_announcement,
    publish_announcement,
    validate_announcement_content,
    validate_announcement_target,
)

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@compiles(JSONB, 'sqlite')
def _compile_jsonb_sqlite(_type, _compiler, **_kw):
    return 'JSON'


@compiles(BigInteger, 'sqlite')
def _compile_big_integer_sqlite(_type, _compiler, **_kw):
    return 'INTEGER'


ANNOUNCEMENT_TABLES = [
    User.__table__,
    Announcement.__table__,
    NotificationEvent.__table__,
]


def localized_content(*, title: str = 'Announcement', summary: str = 'Summary', body: str = 'Body') -> dict:
    return {
        'en': {'title': title, 'summary': summary, 'body': body},
        'zh': {'title': '公告', 'summary': '摘要', 'body': '正文'},
        'ja': {'title': 'お知らせ', 'summary': '概要', 'body': '本文'},
    }


class AnnouncementServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._publish_enabled = settings.announcement_publish_enabled
        self._event_capture_enabled = settings.notifications_event_capture_enabled
        settings.announcement_publish_enabled = True
        settings.notifications_event_capture_enabled = True
        self.engine = create_engine('sqlite:///:memory:', future=True)
        Base.metadata.create_all(self.engine, tables=ANNOUNCEMENT_TABLES)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self._ids: dict[str, int] = {}

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        settings.announcement_publish_enabled = self._publish_enabled
        settings.notifications_event_capture_enabled = self._event_capture_enabled

    def next_id(self, table: str) -> int:
        value = self._ids.get(table, 0) + 1
        self._ids[table] = value
        return value

    def user(self, suffix: str, *, status: UserStatus = UserStatus.active, plan: UserPlan = UserPlan.free) -> User:
        user = User(
            id=self.next_id('users'),
            public_id=f'usr_announcement_{suffix}',
            email=f'announcement_{suffix}@example.test',
            username=f'announcement_{suffix}',
            plan=plan,
            daily_quota_total=5,
            daily_quota_used=0,
            status=status,
            created_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        self.db.add(user)
        self.db.flush()
        return user

    def publish(self, key: str, **overrides) -> Announcement:
        values = {
            'idempotency_key': key,
            'content': localized_content(title=f'Title {key}'),
            'target_type': 'workspace',
            'audit_reason': f'test publish {key}',
            'deployment_verified': True,
        }
        values.update(overrides)
        announcement = publish_announcement(self.db, **values)
        self.db.flush()
        return announcement

    def test_content_requires_plain_three_locale_title_summary_body_limits(self) -> None:
        valid = validate_announcement_content(localized_content(
            title='T' * TITLE_LIMIT,
            summary='S' * SUMMARY_LIMIT,
            body='B' * BODY_LIMIT,
        ))
        self.assertEqual(valid['en']['title'], 'T' * TITLE_LIMIT)

        for field, value in [('title', 'T' * (TITLE_LIMIT + 1)), ('summary', 'S' * (SUMMARY_LIMIT + 1)), ('body', 'B' * (BODY_LIMIT + 1))]:
            content = localized_content()
            content['en'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_announcement_content(content)

        missing_summary = localized_content()
        missing_summary['en'].pop('summary')
        with self.assertRaises(ValueError):
            validate_announcement_content(missing_summary)

        with_url = localized_content(body='Open https://example.test')
        with self.assertRaises(ValueError):
            validate_announcement_content(with_url)

    def test_target_requires_known_internal_or_existing_content_id(self) -> None:
        self.assertEqual(validate_announcement_target('workspace', None)['href'], '/workspace')
        with self.assertRaises(ValueError):
            validate_announcement_target('workspace', 'unexpected')

        update_target = validate_announcement_target('updates', '2026-10-10-inbox-score-feedback-prep')
        self.assertEqual(update_target['href'], '/updates/2026-10-10-inbox-score-feedback-prep')
        with self.assertRaises(ValueError):
            validate_announcement_target('updates', 'missing-update-id')
        with self.assertRaises(ValueError):
            validate_announcement_target('updates', 'bad//id')

    def test_preview_returns_fingerprint_without_database(self) -> None:
        preview = preview_announcement(
            idempotency_key='ann-preview-1',
            content=localized_content(),
            target_type='workspace',
            audit_reason='reviewed deployment notes',
            deployment_verified=True,
        )

        self.assertTrue(preview['dry_run'])
        self.assertRegex(preview['content_fingerprint'], r'^[a-f0-9]{64}$')
        self.assertEqual(preview['audience']['type'], 'all_existing_users')

    def test_publish_snapshots_all_existing_users_and_records_database_actor(self) -> None:
        before = self.user('before')
        after = self.user('after')
        after.created_at = datetime.now(timezone.utc) + timedelta(days=1)
        self.db.flush()

        announcement = self.publish('ann-all-users')

        self.assertEqual(announcement.status, 'published')
        self.assertEqual(announcement.created_by, 'sqlite')
        self.assertEqual(announcement.audience_type, 'all_existing_users')
        self.assertEqual(announcement.audience_json['max_user_id'], before.id)
        self.assertEqual(announcement.title_json['en'], 'Title ann-all-users')
        self.assertEqual(announcement.summary_json['en'], 'Summary')
        self.assertEqual(announcement.cta_json['href'], '/workspace')
        self.assertEqual(self.db.query(NotificationEvent).filter_by(event_type='announcement.published').count(), 1)

    def test_publish_requires_service_and_event_capture_flags(self) -> None:
        settings.announcement_publish_enabled = False
        with self.assertRaises(ValueError):
            self.publish('ann-disabled-publish')
        settings.announcement_publish_enabled = True
        settings.notifications_event_capture_enabled = False
        with self.assertRaises(ValueError):
            self.publish('ann-disabled-capture')

    def test_publish_specific_users_uses_public_ids_with_limit_and_snapshot(self) -> None:
        first = self.user('specific_a')
        second = self.user('specific_b')
        self.user('specific_guest', plan=UserPlan.guest)

        announcement = self.publish(
            'ann-specific-users',
            recipient_public_ids=[second.public_id, first.public_id, first.public_id],
        )

        self.assertEqual(announcement.audience_type, 'specific_users')
        self.assertEqual(announcement.audience_json['user_public_ids'], [first.public_id, second.public_id])
        self.assertEqual(announcement.audience_json['user_ids'], [first.id, second.id])

        too_many = [f'usr_announcement_many_{index}' for index in range(SPECIFIC_USER_LIMIT + 1)]
        with self.assertRaises(ValueError):
            self.publish('ann-too-many', recipient_public_ids=too_many)
        with self.assertRaises(ValueError):
            self.publish('ann-internal-ids', recipient_ids=[first.id])

    def test_publish_is_idempotent_by_fingerprint_and_rejects_key_reuse(self) -> None:
        first = self.publish('ann-idempotent')
        second = self.publish('ann-idempotent')
        self.assertEqual(first.id, second.id)
        self.assertEqual(self.db.query(NotificationEvent).count(), 1)

        with self.assertRaises(ValueError):
            self.publish('ann-idempotent', content=localized_content(title='Different title'))

    def test_weekly_allowance_counts_cancelled_announcements(self) -> None:
        first = self.publish('ann-weekly-1')
        self.publish('ann-weekly-2')
        cancel_announcement(self.db, first.public_id, audit_reason='superseded by correction')

        with self.assertRaises(ValueError):
            self.publish('ann-weekly-3')

    def test_correction_requires_cancelled_source_and_status_reports_audit_log(self) -> None:
        source = self.publish('ann-source')
        cancel_announcement(self.db, source.public_id, audit_reason='incorrect wording')
        correction = self.publish('ann-correction', correction_of=source.public_id)
        status = announcement_status(self.db, correction.public_id)

        self.assertEqual(status['status'], 'published')
        self.assertEqual(status['operation_log'][0]['correction_of'], source.public_id)

        with self.assertRaises(ValueError):
            self.publish('ann-bad-correction', correction_of=correction.public_id)

    def test_import_update_bundle_creates_explicit_draft_without_publishing(self) -> None:
        draft = draft_from_update_bundle('2026-10-10-inbox-score-feedback-prep', audit_reason='prepare announcement draft')

        self.assertEqual(draft['target_type'], 'updates')
        self.assertEqual(draft['target_public_id'], '2026-10-10-inbox-score-feedback-prep')
        self.assertEqual(draft['update_id'], '2026-10-10-inbox-score-feedback-prep')
        self.assertIn('content', draft)


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class AnnouncementPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self._publish_enabled = settings.announcement_publish_enabled
        self._event_capture_enabled = settings.notifications_event_capture_enabled
        settings.announcement_publish_enabled = True
        settings.notifications_event_capture_enabled = True
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
        settings.announcement_publish_enabled = self._publish_enabled
        settings.notifications_event_capture_enabled = self._event_capture_enabled

    def test_publish_uses_postgres_lock_idempotency_and_outbox_event(self) -> None:
        now = datetime.now(timezone.utc)
        week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        existing_this_week = self.db.query(Announcement).filter(Announcement.published_at >= week_start).count()
        if existing_this_week >= WEEKLY_PUBLISH_LIMIT:
            raise unittest.SkipTest('local PostgreSQL announcement allowance already exhausted')
        user = User(
            public_id='usr_announcement_pg_probe',
            email='announcement_pg_probe@example.test',
            username='announcement_pg_probe',
            plan=UserPlan.free,
            daily_quota_total=5,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        self.db.add(user)
        self.db.flush()

        announcement = publish_announcement(
            self.db,
            idempotency_key='ann-pg-probe-1',
            content=localized_content(title='PG announcement', summary='PG summary', body='PG body'),
            recipient_public_ids=[user.public_id],
            target_type='workspace',
            audit_reason='postgres probe',
            deployment_verified=True,
        )
        same = publish_announcement(
            self.db,
            idempotency_key='ann-pg-probe-1',
            content=localized_content(title='PG announcement', summary='PG summary', body='PG body'),
            recipient_public_ids=[user.public_id],
            target_type='workspace',
            audit_reason='postgres probe',
            deployment_verified=True,
        )
        event_count = self.db.query(NotificationEvent).filter(
            NotificationEvent.dedupe_key == f'announcement:{announcement.public_id}:published'
        ).count()

        self.assertEqual(same.id, announcement.id)
        self.assertEqual(event_count, 1)
        self.assertEqual(announcement.audience_json['user_public_ids'], [user.public_id])


if __name__ == '__main__':
    unittest.main()
