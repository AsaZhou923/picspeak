from __future__ import annotations

import os
import sys
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.auth_support import _handle_clerk_user_deleted
from app.core.config import settings
from app.db.base import Base
from app.db.models import (
    Announcement,
    GeneratedImage,
    ImageGenerationTask,
    Notification,
    NotificationEvent,
    NotificationPreference,
    Photo,
    PhotoStatus,
    Review,
    ReviewLike,
    ReviewMode,
    ReviewScoreFeedback,
    ReviewScoreSnapshot,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
)
from app.services import notification_events, notification_processor
from app.services.notification_maintenance import retry_failed_notification_event


TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@unittest.skipUnless(TEST_DATABASE_URL, 'requires PICSPEAK_TEST_DATABASE_URL PostgreSQL')
class NotificationPostgresConcurrencyTests(unittest.TestCase):
    engine = None
    Session = None
    database_name = None
    _capture_enabled_original = None

    @classmethod
    def setUpClass(cls) -> None:
        cls._capture_enabled_original = settings.notifications_event_capture_enabled
        settings.notifications_event_capture_enabled = True
        base_url = make_url(TEST_DATABASE_URL)
        cls.database_name = f"picspeak_notif_{uuid4().hex[:12]}"
        admin_database = base_url.database or 'postgres'
        admin_url = base_url.set(database='postgres')
        try:
            admin_engine = create_engine(admin_url, isolation_level='AUTOCOMMIT', future=True)
            with admin_engine.connect() as conn:
                conn.execute(text(f'CREATE DATABASE {cls.database_name} TEMPLATE template0'))
        except Exception:
            if admin_database != 'postgres':
                admin_url = base_url.set(database=admin_database)
                admin_engine = create_engine(admin_url, isolation_level='AUTOCOMMIT', future=True)
                with admin_engine.connect() as conn:
                    conn.execute(text(f'CREATE DATABASE {cls.database_name} TEMPLATE template0'))
            else:
                raise
        finally:
            try:
                admin_engine.dispose()
            except UnboundLocalError:
                pass

        cls.engine = create_engine(base_url.set(database=cls.database_name), pool_size=8, max_overflow=4, future=True)
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False, expire_on_commit=False)

    @classmethod
    def tearDownClass(cls) -> None:
        settings.notifications_event_capture_enabled = cls._capture_enabled_original
        if cls.engine is not None:
            cls.engine.dispose()
        if cls.database_name:
            base_url = make_url(TEST_DATABASE_URL)
            admin_url = base_url.set(database='postgres')
            admin_engine = create_engine(admin_url, isolation_level='AUTOCOMMIT', future=True)
            try:
                with admin_engine.connect() as conn:
                    conn.execute(
                        text(
                            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                            "WHERE datname = :database_name AND pid <> pg_backend_pid()"
                        ),
                        {'database_name': cls.database_name},
                    )
                    conn.execute(text(f'DROP DATABASE IF EXISTS {cls.database_name}'))
            finally:
                admin_engine.dispose()

    def setUp(self) -> None:
        self.db = self.Session()
        tables = ', '.join(f'"{table.name}"' for table in reversed(Base.metadata.sorted_tables))
        self.db.execute(text(f'TRUNCATE {tables} RESTART IDENTITY CASCADE'))
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()

    def user(self, suffix: str, *, plan: UserPlan = UserPlan.free) -> User:
        user = User(
            public_id=f'usr_pg_{suffix}_{uuid4().hex[:8]}',
            email=f'{suffix}_{uuid4().hex[:8]}@example.test',
            username=f'pg_{suffix}_{uuid4().hex[:8]}',
            plan=plan,
            daily_quota_total=5,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        self.db.add(user)
        self.db.flush()
        return user

    def review(self, owner: User, suffix: str) -> Review:
        photo = Photo(
            public_id=f'pho_pg_{suffix}_{uuid4().hex[:8]}',
            owner_user_id=owner.id,
            upload_id=f'upl_pg_{suffix}_{uuid4().hex[:8]}',
            bucket='test',
            object_key=f'notifications/{suffix}.jpg',
            content_type='image/jpeg',
            size_bytes=100,
            status=PhotoStatus.READY,
            exif_data={},
            client_meta={},
        )
        self.db.add(photo)
        self.db.flush()
        task = ReviewTask(
            public_id=f'tsk_pg_{suffix}_{uuid4().hex[:8]}',
            photo_id=photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.flash,
            status=TaskStatus.SUCCEEDED,
            request_payload={},
            finished_at=datetime.now(timezone.utc),
        )
        self.db.add(task)
        self.db.flush()
        review = Review(
            public_id=f'rev_pg_{suffix}_{uuid4().hex[:8]}',
            task_id=task.id,
            photo_id=photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.flash,
            status=ReviewStatus.SUCCEEDED,
            image_type='portrait',
            schema_version='1.0',
            result_json={},
            final_score=Decimal('7.10'),
            is_public=True,
            gallery_visible=True,
            gallery_audit_status='approved',
            tags_json=[],
        )
        self.db.add(review)
        self.db.flush()
        return review

    def generation(self, owner: User, suffix: str) -> tuple[ImageGenerationTask, GeneratedImage]:
        task = ImageGenerationTask(
            public_id=f'igt_pg_{suffix}_{uuid4().hex[:8]}',
            owner_user_id=owner.id,
            status=TaskStatus.SUCCEEDED,
            generation_mode='general',
            intent='reference',
            prompt='test prompt',
            prompt_hash=f'hash_{suffix}_{uuid4().hex[:8]}',
            request_payload={},
            finished_at=datetime.now(timezone.utc),
        )
        self.db.add(task)
        self.db.flush()
        image = GeneratedImage(
            public_id=f'gen_pg_{suffix}_{uuid4().hex[:8]}',
            task_id=task.id,
            owner_user_id=owner.id,
            object_bucket='test',
            object_key=f'generations/{suffix}.webp',
            content_type='image/webp',
            width=1024,
            height=1024,
            intent='reference',
            generation_mode='general',
            prompt='test prompt',
            revised_prompt=None,
            model_name='gpt-image-test',
            quality='medium',
            size='1024x1024',
            output_format='webp',
            credits_charged=1,
            metadata_json={},
        )
        self.db.add(image)
        self.db.flush()
        return task, image


    def score_snapshot(self, review: Review, suffix: str) -> ReviewScoreSnapshot:
        snapshot = ReviewScoreSnapshot(
            public_id=f'rss_pg_{suffix}_{uuid4().hex[:8]}',
            review_id=review.id,
            revision_hash=f'revhash_{suffix}_{uuid4().hex}',
            snapshot_schema_version='1',
            analysis_type='single',
            mode='flash',
            image_type=review.image_type,
            final_score=Decimal('7.100000'),
            scores_json={'composition': 7.1},
            score_version='score-test',
        )
        self.db.add(snapshot)
        self.db.flush()
        return snapshot

    def score_feedback(self, snapshot: ReviewScoreSnapshot, user: User, suffix: str, role: str) -> ReviewScoreFeedback:
        feedback = ReviewScoreFeedback(
            public_id=f'rsf_pg_{suffix}_{uuid4().hex[:8]}',
            snapshot_id=snapshot.id,
            user_id=user.id,
            role_at_submission=role,
            source_surface='gallery' if role == 'community' else 'result',
            verdict='accurate',
            state='active',
            feedback_version=1,
        )
        self.db.add(feedback)
        self.db.flush()
        return feedback

    def enable_like_preferences(self, user: User, enabled_at: datetime | None = None) -> None:
        self.db.add(
            NotificationPreference(
                user_id=user.id,
                likes_enabled=True,
                likes_enabled_at=enabled_at or datetime.now(timezone.utc) - timedelta(days=1),
                announcements_enabled=True,
                announcements_enabled_at=enabled_at or datetime.now(timezone.utc) - timedelta(days=1),
            )
        )
        self.db.flush()

    def pending_event(
        self,
        recipient: User,
        *,
        suffix: str,
        event_type: str = 'review.failed',
        payload: dict | None = None,
        optional: bool = False,
        occurred_at: datetime | None = None,
    ) -> NotificationEvent:
        now = occurred_at or notification_events.database_now(self.db)
        event = NotificationEvent(
            public_id=f'nev_pg_{suffix}_{uuid4().hex[:8]}',
            event_type=event_type,
            dedupe_key=f'event:{suffix}:{uuid4().hex}',
            payload_json=payload or {'task_id': f'tsk_{suffix}'},
            recipient_user_id=recipient.id,
            optional_preference_eligible=optional,
            occurred_at=now,
            available_at=now,
            cursor_json={},
        )
        self.db.add(event)
        self.db.flush()
        return event


    def test_clerk_user_deleted_scrubs_notifications_preferences_events_and_owned_score_feedback(self) -> None:
        owner = self.user('delete_owner')
        owner.clerk_user_id = f'clerk_{uuid4().hex}'
        community = self.user('delete_community')
        other_owner = self.user('delete_other_owner')
        owned_review = self.review(owner, 'delete_owned')
        other_review = self.review(other_owner, 'delete_other')
        owned_snapshot = self.score_snapshot(owned_review, 'owned')
        other_snapshot = self.score_snapshot(other_review, 'other')
        owned_snapshot_id = owned_snapshot.id
        other_review_id = other_review.id
        self.score_feedback(owned_snapshot, owner, 'owned_author', 'author')
        self.score_feedback(owned_snapshot, community, 'owned_community', 'community')
        self.score_feedback(other_snapshot, owner, 'authored_elsewhere', 'community')
        self.enable_like_preferences(owner)
        now = notification_events.database_now(self.db)
        event = self.pending_event(
            owner,
            suffix='delete_event',
            payload={'task_id': 'tsk_private', 'review_id': owned_review.public_id},
            occurred_at=now,
        )
        self.db.add(Notification(
            public_id=f'not_pg_delete_{uuid4().hex[:6]}',
            recipient_user_id=owner.id,
            category='system',
            notification_type='review.failed',
            dedupe_key='delete:notification',
            template_key='review_failed',
            template_version=1,
            template_params_json={'task_id': 'tsk_private'},
            occurred_at=now,
            delivered_at=now,
            expires_at=now + timedelta(days=90),
        ))
        self.db.commit()

        status, public_id = _handle_clerk_user_deleted(self.db, {'id': owner.clerk_user_id})
        self.db.commit()

        self.assertEqual(status, 'deleted')
        self.assertEqual(public_id, owner.public_id)
        self.assertEqual(self.db.get(User, owner.id).status, UserStatus.deleted)
        self.assertEqual(self.db.query(Notification).filter_by(recipient_user_id=owner.id).count(), 0)
        self.assertIsNone(self.db.get(NotificationPreference, owner.id))
        self.db.expire_all()
        scrubbed_event = self.db.get(NotificationEvent, event.id)
        self.assertIsNone(scrubbed_event.recipient_user_id)
        self.assertEqual(scrubbed_event.payload_json, {})
        self.assertEqual(scrubbed_event.cursor_json, {})
        self.assertEqual(scrubbed_event.status, 'expired_delivery')
        self.assertEqual(scrubbed_event.last_error_code, 'RECIPIENT_DELETED')
        self.assertEqual(self.db.query(ReviewScoreSnapshot).filter_by(review_id=owned_review.id).count(), 0)
        self.assertEqual(self.db.query(ReviewScoreFeedback).filter_by(snapshot_id=owned_snapshot_id).count(), 0)
        self.assertEqual(self.db.query(ReviewScoreFeedback).filter_by(user_id=owner.id).count(), 0)
        self.assertEqual(self.db.query(ReviewScoreSnapshot).filter_by(review_id=other_review_id).count(), 1)

    def test_clerk_user_deleted_race_with_notification_delivery_leaves_no_private_inbox_state(self) -> None:
        owner = self.user('delete_race')
        owner.clerk_user_id = f'clerk_{uuid4().hex}'
        self.pending_event(owner, suffix='delete_race', payload={'task_id': 'tsk_race'})
        self.db.commit()

        def delete_user() -> None:
            session = self.Session()
            try:
                _handle_clerk_user_deleted(session, {'id': owner.clerk_user_id})
                session.commit()
            finally:
                session.close()

        def process_events() -> None:
            session = self.Session()
            try:
                notification_processor.process_pending_notifications(session, limit=1, max_batches=1)
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(delete_user), executor.submit(process_events)]
            for future in futures:
                future.result(timeout=10)

        self.db.expire_all()
        self.assertEqual(self.db.get(User, owner.id).status, UserStatus.deleted)
        self.assertEqual(self.db.query(Notification).filter_by(recipient_user_id=owner.id).count(), 0)
        events = self.db.query(NotificationEvent).all()
        self.assertEqual(len(events), 1)
        self.assertIn(events[0].status, {'expired_delivery', 'suppressed_inactive', 'delivered'})
        if events[0].recipient_user_id is None:
            self.assertEqual(events[0].payload_json, {})
            self.assertEqual(events[0].cursor_json, {})


    def test_gallery_like_capture_and_user_deletion_are_fenced_without_private_event_leak(self) -> None:
        owner = self.user('delete_like_owner')
        owner.clerk_user_id = f'clerk_{uuid4().hex}'
        liker = self.user('delete_like_liker')
        review = self.review(owner, 'delete_like')
        self.enable_like_preferences(owner)
        self.db.commit()

        def capture_like() -> None:
            session = self.Session()
            try:
                local_review = session.query(Review).filter_by(id=review.id).one()
                notification_events.record_gallery_like(session, local_review, liker.id)
                session.commit()
            finally:
                session.close()

        def delete_user() -> None:
            session = self.Session()
            try:
                _handle_clerk_user_deleted(session, {'id': owner.clerk_user_id})
                session.commit()
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(capture_like), executor.submit(delete_user)]
            for future in futures:
                future.result(timeout=10)

        self.db.expire_all()
        self.assertEqual(self.db.get(User, owner.id).status, UserStatus.deleted)
        self.assertEqual(self.db.query(Notification).filter_by(recipient_user_id=owner.id).count(), 0)
        leaked_events = self.db.query(NotificationEvent).filter_by(recipient_user_id=owner.id).count()
        self.assertEqual(leaked_events, 0)
        for event in self.db.query(NotificationEvent).all():
            self.assertEqual(event.payload_json, {})
            self.assertEqual(event.cursor_json, {})
            self.assertEqual(event.status, 'expired_delivery')

    def test_stale_identity_capture_paths_recheck_deleted_user_before_insert(self) -> None:
        fixtures = []
        for suffix in ('credit', 'subscription', 'review', 'generation'):
            owner = self.user(f'stale_{suffix}')
            owner.clerk_user_id = f'clerk_{suffix}_{uuid4().hex}'
            fixture = {'suffix': suffix, 'owner_id': owner.id, 'clerk_user_id': owner.clerk_user_id}
            if suffix == 'review':
                review = self.review(owner, 'stale_review')
                fixture.update({'task_id': review.task_id, 'review_id': review.id})
            elif suffix == 'generation':
                task, image = self.generation(owner, 'stale_generation')
                fixture.update({'task_id': task.id, 'image_id': image.id})
            fixtures.append(fixture)
        self.db.commit()

        cases = []
        for fixture in fixtures:
            suffix = fixture['suffix']
            stale_session = self.Session()
            stale_user = stale_session.get(User, fixture['owner_id'])
            if suffix == 'credit':
                call = lambda session=stale_session, user=stale_user: notification_events.record_credit_confirmed(
                    session, user, grant_id='ledger_stale', credits=30
                )
            elif suffix == 'subscription':
                call = lambda session=stale_session, user=stale_user: notification_events.record_subscription_changed(
                    session, user, subscription_id='sub_stale', status='active', version='v1'
                )
            elif suffix == 'review':
                task_id = fixture['task_id']
                review_id = fixture['review_id']
                call = lambda session=stale_session, task_id=task_id, review_id=review_id: notification_events.record_review_terminal(
                    session, session.get(ReviewTask, task_id), session.get(Review, review_id)
                )
            else:
                task_id = fixture['task_id']
                image_id = fixture['image_id']
                call = lambda session=stale_session, task_id=task_id, image_id=image_id: notification_events.record_generation_terminal(
                    session, session.get(ImageGenerationTask, task_id), session.get(GeneratedImage, image_id)
                )
            cases.append((suffix, fixture['clerk_user_id'], stale_session, call))

        try:
            for suffix, clerk_user_id, stale_session, call in cases:
                with self.subTest(path=suffix):
                    delete_session = self.Session()
                    try:
                        _handle_clerk_user_deleted(delete_session, {'id': clerk_user_id})
                        delete_session.commit()
                    finally:
                        delete_session.close()
                    self.assertFalse(call())
                    stale_session.commit()
        finally:
            for *_rest, stale_session, _call in cases:
                stale_session.close()

        self.assertEqual(self.db.query(NotificationEvent).count(), 0)

    def test_capture_works_when_recipient_user_is_already_locked(self) -> None:
        owner = self.user('already_locked')
        self.db.commit()

        locked = self.db.query(User).filter_by(id=owner.id).with_for_update(key_share=True).populate_existing().one()
        inserted = notification_events.record_credit_confirmed(self.db, locked, grant_id='ledger_locked', credits=30)
        self.db.commit()

        self.assertTrue(inserted)
        event = self.db.query(NotificationEvent).one()
        self.assertEqual(event.recipient_user_id, owner.id)

    def test_busy_recipient_delivery_stays_pending_without_attempt_penalty_then_recovers(self) -> None:
        owner = self.user('busy_consumer')
        self.pending_event(owner, suffix='busy_consumer')
        self.db.commit()
        holder = self.Session()
        try:
            holder.query(User).filter_by(id=owner.id).with_for_update().one()
            result = notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
            event = self.db.query(NotificationEvent).one()
            self.assertEqual(result, {'processed': 0, 'failed': 0})
            self.assertEqual(event.status, 'pending')
            self.assertEqual(event.attempts, 0)
            self.assertEqual(self.db.query(Notification).count(), 0)
            holder.rollback()
        finally:
            holder.close()

        event = self.db.query(NotificationEvent).one()
        event.available_at = notification_events.database_now(self.db) - timedelta(seconds=1)
        self.db.commit()
        result = notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
        event = self.db.query(NotificationEvent).one()
        self.assertEqual(result['processed'], 1)
        self.assertEqual(event.status, 'delivered')
        self.assertEqual(event.attempts, 0)
        self.assertEqual(self.db.query(Notification).count(), 1)

    def test_busy_announcement_recipient_does_not_advance_cursor_past_user(self) -> None:
        first = self.user('ann_busy_first')
        second = self.user('ann_busy_second')
        self.enable_like_preferences(first)
        self.enable_like_preferences(second)
        now = notification_events.database_now(self.db)
        announcement = Announcement(
            public_id=f'ann_pg_busy_{uuid4().hex[:8]}',
            title_json={'en': 'Title', 'zh': '标题', 'ja': 'タイトル'},
            summary_json={'en': 'Summary', 'zh': '摘要', 'ja': '概要'},
            body_json={'en': 'Body', 'zh': '正文', 'ja': '本文'},
            cta_json={},
            audience_type='all_existing_users',
            audience_json={'max_user_id': second.id},
            status='published',
            idempotency_key=f'ann_busy_{uuid4().hex}',
            content_fingerprint=uuid4().hex,
            published_at=now,
            operation_log_json=[],
        )
        self.db.add(announcement)
        self.db.flush()
        event = NotificationEvent(
            public_id=f'nev_pg_ann_busy_{uuid4().hex[:8]}',
            event_type='announcement.published',
            dedupe_key=f'announcement:{announcement.public_id}:published',
            payload_json={'announcement_id': announcement.public_id},
            recipient_user_id=None,
            optional_preference_eligible=False,
            occurred_at=now,
            available_at=now,
            cursor_json={'announcement_id': announcement.id, 'last_user_id': 0},
        )
        self.db.add(event)
        self.db.commit()
        holder = self.Session()
        try:
            holder.query(User).filter_by(id=first.id).with_for_update().one()
            result = notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
            self.db.expire_all()
            pending = self.db.get(NotificationEvent, event.id)
            self.assertEqual(result, {'processed': 0, 'failed': 0})
            self.assertEqual(pending.status, 'pending')
            self.assertEqual(pending.cursor_json['last_user_id'], 0)
            self.assertEqual(self.db.query(Notification).count(), 0)
            holder.rollback()
        finally:
            holder.close()

        delivered_event = self.db.get(NotificationEvent, event.id)
        delivered_event.available_at = notification_events.database_now(self.db) - timedelta(seconds=1)
        self.db.commit()
        result = notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
        self.db.expire_all()
        delivered = self.db.get(NotificationEvent, event.id)
        self.assertEqual(result['processed'], 1)
        self.assertEqual(delivered.status, 'delivered')
        self.assertEqual(delivered.cursor_json['last_user_id'], second.id)
        self.assertEqual(self.db.query(Notification).count(), 2)

    def test_captured_like_delivers_after_gallery_withdraw_and_renders_owner_target(self) -> None:
        owner = self.user('withdraw_owner')
        liker = self.user('withdraw_liker')
        review = self.review(owner, 'withdraw_like')
        self.enable_like_preferences(owner)
        self.db.commit()

        local_review = self.db.get(Review, review.id)
        self.assertTrue(notification_events.record_gallery_like(self.db, local_review, liker.id))
        local_review.gallery_visible = False
        local_review.gallery_audit_status = 'withdrawn'
        self.db.commit()

        result = notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
        event = self.db.query(NotificationEvent).one()
        notification = self.db.query(Notification).one()
        rendered = notification_processor.render_notification(self.db, notification)

        self.assertEqual(result['processed'], 1)
        self.assertEqual(event.status, 'delivered')
        self.assertEqual(rendered['target'], {'type': 'review', 'public_id': review.public_id, 'state': 'available'})

    def test_captured_like_expires_when_review_is_deleted_before_delivery(self) -> None:
        owner = self.user('deleted_like_owner')
        liker = self.user('deleted_like_liker')
        review = self.review(owner, 'deleted_like')
        self.enable_like_preferences(owner)
        self.db.commit()

        local_review = self.db.get(Review, review.id)
        self.assertTrue(notification_events.record_gallery_like(self.db, local_review, liker.id))
        local_review.deleted_at = notification_events.database_now(self.db)
        self.db.commit()

        result = notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
        event = self.db.query(NotificationEvent).one()

        self.assertEqual(result['processed'], 1)
        self.assertEqual(event.status, 'expired_delivery')
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_retry_failed_event_reports_busy_recipient_without_requeueing(self) -> None:
        owner = self.user('retry_busy_owner')
        review = self.review(owner, 'retry_busy')
        task = self.db.get(ReviewTask, review.task_id)
        now = notification_events.database_now(self.db)
        event = NotificationEvent(
            public_id=f'nev_pg_retry_busy_{uuid4().hex[:8]}',
            event_type='review.completed',
            dedupe_key=f'retry_busy:{uuid4().hex}',
            payload_json={'task_id': task.public_id, 'review_id': review.public_id},
            recipient_user_id=owner.id,
            optional_preference_eligible=False,
            occurred_at=now,
            available_at=now,
            processed_at=now,
            status='failed',
            attempts=10,
            last_error_code='NOTIFICATION_PROCESSING_FAILED',
            cursor_json={},
        )
        self.db.add(event)
        self.db.commit()
        holder = self.Session()
        try:
            holder.query(User).filter_by(id=owner.id).with_for_update().one()
            with self.assertRaisesRegex(ValueError, 'busy'):
                retry_failed_notification_event(self.db, event.public_id, audit_reason='postgres retry busy', execute=True)
            self.db.rollback()
        finally:
            holder.rollback()
            holder.close()

        unchanged = self.db.query(NotificationEvent).filter_by(public_id=event.public_id).one()
        self.assertEqual(unchanged.status, 'failed')
        self.assertEqual(unchanged.attempts, 10)


    def test_mutual_likes_create_rows_and_events_without_fk_lock_deadlock(self) -> None:
        user_a = self.user('mutual_a')
        user_b = self.user('mutual_b')
        review_a = self.review(user_a, 'mutual_a')
        review_b = self.review(user_b, 'mutual_b')
        self.enable_like_preferences(user_a)
        self.enable_like_preferences(user_b)
        self.db.commit()
        ready = threading.Barrier(2)

        def like_review(*, review_id: int, liker_id: int) -> None:
            session = self.Session()
            try:
                session.execute(text("SET LOCAL lock_timeout = '3000ms'"))
                local_review = session.query(Review).filter_by(id=review_id).one()
                session.add(ReviewLike(review_id=local_review.id, user_id=liker_id))
                notification_events.record_gallery_like(session, local_review, liker_id)
                ready.wait(timeout=5)
                session.commit()
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(like_review, review_id=review_b.id, liker_id=user_a.id),
                executor.submit(like_review, review_id=review_a.id, liker_id=user_b.id),
            ]
            for future in futures:
                future.result(timeout=10)

        self.assertEqual(self.db.query(ReviewLike).count(), 2)
        events = self.db.query(NotificationEvent).filter_by(event_type='gallery.review_liked').all()
        self.assertEqual(len(events), 2)
        self.assertEqual({event.recipient_user_id for event in events}, {user_a.id, user_b.id})
        self.assertEqual({event.status for event in events}, {'pending'})

    def test_concurrent_like_events_stop_at_daily_limit_twenty(self) -> None:
        owner = self.user('like_cap')
        liker_one = self.user('liker_one')
        liker_two = self.user('liker_two')
        review = self.review(owner, 'like_cap')
        self.enable_like_preferences(owner)
        now = notification_events.database_now(self.db)
        for index in range(19):
            self.db.add(
                Notification(
                    public_id=f'not_pg_existing_{index}_{uuid4().hex[:6]}',
                    recipient_user_id=owner.id,
                    category='interaction',
                    notification_type='gallery.review_liked',
                    dedupe_key=f'existing:{index}',
                    template_key='gallery_review_liked',
                    template_version=1,
                    template_params_json={'review_id': review.public_id},
                    target_type='review',
                    target_public_id=review.public_id,
                    occurred_at=now - timedelta(minutes=10, seconds=index),
                    delivered_at=now - timedelta(minutes=10, seconds=index),
                    expires_at=now + timedelta(days=90),
                )
            )
        self.db.commit()

        def capture_and_process(liker_id: int) -> str:
            session = self.Session()
            try:
                local_review = session.query(Review).filter_by(id=review.id).one()
                notification_events.record_gallery_like(session, local_review, liker_id)
                session.commit()
                notification_processor.process_pending_notifications(session, limit=1, max_batches=1)
                event = session.query(NotificationEvent).filter(NotificationEvent.dedupe_key.like(f'gallery_like:{review.public_id}:{liker_id}')).one()
                return event.status
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = sorted(executor.map(capture_and_process, [liker_one.id, liker_two.id]))

        self.assertEqual(statuses, ['delivered', 'pending'])
        pending = self.db.query(NotificationEvent).filter_by(status='pending').one()
        self.assertEqual(pending.attempts, 0)
        pending.available_at = notification_events.database_now(self.db) - timedelta(seconds=1)
        self.db.commit()
        notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
        statuses = sorted(row.status for row in self.db.query(NotificationEvent).all())
        self.assertEqual(statuses, ['delivered', 'suppressed_limit'])
        delivered = self.db.query(Notification).filter(
            Notification.recipient_user_id == owner.id,
            Notification.notification_type == 'gallery.review_liked',
        ).count()
        self.assertEqual(delivered, 20)

    def test_disabled_then_reopened_preferences_do_not_replay_old_like_event(self) -> None:
        owner = self.user('pref_reopen')
        liker = self.user('pref_liker')
        review = self.review(owner, 'pref_reopen')
        self.db.add(NotificationPreference(user_id=owner.id, likes_enabled=False, announcements_enabled=False))
        self.db.commit()

        local_review = self.db.get(Review, review.id)
        inserted = notification_events.record_gallery_like(self.db, local_review, liker.id)
        self.db.commit()
        self.assertTrue(inserted)

        pref = self.db.get(NotificationPreference, owner.id)
        pref.likes_enabled = True
        pref.likes_enabled_at = notification_events.database_now(self.db) + timedelta(seconds=1)
        self.db.commit()

        result = notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
        event = self.db.query(NotificationEvent).one()
        self.assertEqual(result['processed'], 1)
        self.assertEqual(event.status, 'suppressed_preferences')
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_preference_close_serializes_before_delivery_for_same_user(self) -> None:
        owner = self.user('pref_close')
        review = self.review(owner, 'pref_close')
        event_time = notification_events.database_now(self.db) - timedelta(seconds=2)
        self.enable_like_preferences(owner, enabled_at=event_time - timedelta(seconds=1))
        self.pending_event(
            owner,
            suffix='pref_close_like',
            event_type='gallery.review_liked',
            payload={'review_id': review.public_id},
            optional=True,
            occurred_at=event_time,
        )
        self.db.commit()
        locked = threading.Event()

        def close_preferences() -> None:
            session = self.Session()
            try:
                user = session.query(User).filter_by(id=owner.id).with_for_update().one()
                pref = session.get(NotificationPreference, user.id)
                pref.likes_enabled = False
                pref.likes_enabled_at = None
                locked.set()
                time.sleep(0.25)
                session.commit()
            finally:
                session.close()

        closer = threading.Thread(target=close_preferences)
        closer.start()
        locked.wait(timeout=2)
        result = notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
        closer.join(timeout=2)

        event = self.db.query(NotificationEvent).one()
        self.assertEqual(result['processed'], 0)
        self.assertEqual(event.status, 'pending')
        self.assertEqual(event.attempts, 0)
        event.available_at = notification_events.database_now(self.db) - timedelta(seconds=1)
        self.db.commit()
        result = notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
        event = self.db.query(NotificationEvent).one()
        self.assertEqual(result['processed'], 1)
        self.assertEqual(event.status, 'suppressed_preferences')
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_two_consumers_skip_locked_and_rollback_recovery_no_duplicate(self) -> None:
        owner = self.user('skip_locked')
        self.pending_event(owner, suffix='locked_first')
        self.pending_event(owner, suffix='second')
        self.db.commit()

        holder = self.Session()
        try:
            locked_event = holder.query(NotificationEvent).order_by(NotificationEvent.id).with_for_update(skip_locked=True).first()
            self.assertIsNotNone(locked_event)
            other = self.Session()
            try:
                result = notification_processor.process_pending_notifications(other, limit=1, max_batches=1)
                self.assertEqual(result['processed'], 1)
                other_event_count = other.query(Notification).count()
                self.assertEqual(other_event_count, 1)
            finally:
                other.close()
            holder.rollback()
        finally:
            holder.close()

        notification_processor.process_pending_notifications(self.db, limit=10, max_batches=1)
        self.assertEqual(self.db.query(NotificationEvent).filter_by(status='delivered').count(), 2)
        self.assertEqual(self.db.query(Notification).count(), 2)
        dedupe_count = self.db.query(Notification.dedupe_key).distinct().count()
        self.assertEqual(dedupe_count, 2)

    def test_business_transaction_rollback_discards_captured_event(self) -> None:
        owner = self.user('rollback')
        review = self.review(owner, 'rollback')
        task = self.db.get(ReviewTask, review.task_id)

        transaction = self.db.begin_nested()
        notification_events.record_review_terminal(self.db, task, review)
        transaction.rollback()
        self.db.commit()

        self.assertEqual(self.db.query(NotificationEvent).count(), 0)

    def test_guest_terminal_history_not_replayed_after_upgrade_but_future_terminal_captures(self) -> None:
        guest = self.user('guest_before', plan=UserPlan.guest)
        guest_review = self.review(guest, 'guest_before')
        guest_task = self.db.get(ReviewTask, guest_review.task_id)
        self.assertFalse(notification_events.record_review_terminal(self.db, guest_task, guest_review))
        guest.plan = UserPlan.free
        self.db.commit()
        self.assertEqual(self.db.query(NotificationEvent).count(), 0)

        upgraded = self.user('guest_after', plan=UserPlan.guest)
        upgraded_review = self.review(upgraded, 'guest_after')
        upgraded.plan = UserPlan.free
        self.db.flush()
        upgraded_task = self.db.get(ReviewTask, upgraded_review.task_id)
        self.assertTrue(notification_events.record_review_terminal(self.db, upgraded_task, upgraded_review))
        self.db.commit()
        self.assertEqual(self.db.query(NotificationEvent).count(), 1)

    def test_cancelled_announcement_event_expires_without_delivery(self) -> None:
        owner = self.user('announcement_cancel')
        self.db.add(NotificationPreference(
            user_id=owner.id,
            likes_enabled=False,
            announcements_enabled=True,
            announcements_enabled_at=notification_events.database_now(self.db) - timedelta(days=1),
        ))
        announcement = Announcement(
            public_id=f'ann_pg_cancel_{uuid4().hex[:8]}',
            title_json={'en': 'Title', 'zh': '标题', 'ja': 'タイトル'},
            summary_json={'en': 'Summary', 'zh': '摘要', 'ja': '概要'},
            body_json={'en': 'Body', 'zh': '正文', 'ja': '本文'},
            cta_json={},
            audience_type='all_existing_users',
            audience_json={'max_user_id': owner.id},
            status='cancelled',
            idempotency_key=f'ann_cancel_{uuid4().hex}',
            content_fingerprint=uuid4().hex,
            published_at=notification_events.database_now(self.db) - timedelta(minutes=1),
            cancelled_at=notification_events.database_now(self.db),
            operation_log_json=[],
        )
        self.db.add(announcement)
        self.db.flush()
        self.pending_event(
            owner,
            suffix='announcement_cancel',
            event_type='announcement.published',
            payload={'announcement_id': announcement.public_id},
            optional=True,
            occurred_at=announcement.published_at,
        ).cursor_json = {'announcement_id': announcement.id, 'last_user_id': 0}
        self.db.commit()

        notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
        event = self.db.query(NotificationEvent).one()
        self.assertEqual(event.status, 'expired_delivery')
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_like_daily_limit_uses_delivered_day_boundary(self) -> None:
        owner = self.user('midnight')
        review = self.review(owner, 'midnight')
        event_time = datetime(2026, 10, 10, 0, 0, 1, tzinfo=timezone.utc)
        self.enable_like_preferences(owner, enabled_at=event_time - timedelta(days=1))
        for index in range(20):
            self.db.add(Notification(
                public_id=f'not_pg_yesterday_{index}_{uuid4().hex[:6]}',
                recipient_user_id=owner.id,
                category='interaction',
                notification_type='gallery.review_liked',
                dedupe_key=f'yesterday:{index}',
                template_key='gallery_review_liked',
                template_version=1,
                template_params_json={'review_id': review.public_id},
                target_type='review',
                target_public_id=review.public_id,
                occurred_at=event_time - timedelta(minutes=10),
                delivered_at=event_time - timedelta(seconds=2),
                expires_at=event_time + timedelta(days=90),
            ))
        self.pending_event(
            owner,
            suffix='midnight_like',
            event_type='gallery.review_liked',
            payload={'review_id': review.public_id},
            optional=True,
            occurred_at=event_time,
        )
        self.db.commit()
        original_clock = notification_processor.database_now
        notification_processor.database_now = lambda _db: event_time
        try:
            notification_processor.process_pending_notifications(self.db, limit=1, max_batches=1)
        finally:
            notification_processor.database_now = original_clock
        self.assertEqual(self.db.query(NotificationEvent).filter_by(status='delivered').count(), 1)
        self.assertEqual(
            self.db.query(Notification).filter(Notification.delivered_at >= event_time).count(),
            1,
        )

    def test_recover_900_pending_events_and_health_transitions(self) -> None:
        owner = self.user('bulk_recover')
        stale = notification_events.database_now(self.db) - timedelta(minutes=10)
        for index in range(900):
            self.pending_event(owner, suffix=f'bulk_{index}', occurred_at=stale)
        self.db.commit()

        before = notification_processor.notification_health_snapshot(self.db)
        started = time.monotonic()
        result = notification_processor.process_pending_notifications(
            self.db,
            limit=100,
            max_batches=10,
            time_budget_seconds=20,
        )
        elapsed = time.monotonic() - started
        after = notification_processor.notification_health_snapshot(self.db)

        self.assertEqual(result['processed'], 900)
        self.assertLess(elapsed, 20)
        self.assertTrue(before['stale_pending_over_5m'])
        self.assertEqual(after['pending_count'], 0)
        self.assertFalse(after['stale_pending_over_5m'])
        self.assertEqual(self.db.query(Notification).count(), 900)

    def test_cleanup_deletes_delivered_older_than_retention_and_scrubs_processed_payloads(self) -> None:
        owner = self.user('cleanup')
        now = notification_events.database_now(self.db)
        old_delivered = now - timedelta(days=91)
        keep_delivered = now - timedelta(days=10)
        self.db.add_all(
            [
                Notification(
                    public_id=f'not_pg_old_{uuid4().hex[:6]}',
                    recipient_user_id=owner.id,
                    category='system',
                    notification_type='review.failed',
                    dedupe_key='cleanup:old',
                    template_key='review_failed',
                    template_version=1,
                    template_params_json={'task_id': 'tsk_old'},
                    occurred_at=old_delivered,
                    delivered_at=old_delivered,
                    expires_at=None,
                ),
                Notification(
                    public_id=f'not_pg_keep_{uuid4().hex[:6]}',
                    recipient_user_id=owner.id,
                    category='system',
                    notification_type='review.failed',
                    dedupe_key='cleanup:keep',
                    template_key='review_failed',
                    template_version=1,
                    template_params_json={'task_id': 'tsk_keep'},
                    occurred_at=keep_delivered,
                    delivered_at=keep_delivered,
                    expires_at=None,
                ),
                NotificationEvent(
                    public_id=f'nev_pg_scrub_{uuid4().hex[:6]}',
                    event_type='review.failed',
                    dedupe_key='cleanup:event:scrub',
                    payload_json={'task_id': 'tsk_private'},
                    recipient_user_id=owner.id,
                    optional_preference_eligible=False,
                    occurred_at=now - timedelta(days=40),
                    available_at=now - timedelta(days=40),
                    status='delivered',
                    processed_at=now - timedelta(days=31),
                    cursor_json={'private': 'cursor'},
                ),
            ]
        )
        self.db.commit()

        deleted = notification_processor.cleanup_expired_notifications(self.db, limit=10)

        self.assertEqual(deleted, 1)
        remaining = self.db.query(Notification).one()
        self.assertEqual(remaining.dedupe_key, 'cleanup:keep')
        event = self.db.query(NotificationEvent).filter_by(dedupe_key='cleanup:event:scrub').one()
        self.assertEqual(event.payload_json, {})
        self.assertEqual(event.cursor_json, {})


if __name__ == '__main__':
    unittest.main()
