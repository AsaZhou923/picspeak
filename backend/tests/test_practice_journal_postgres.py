"""Practice journal list and summary contracts on PostgreSQL."""
from __future__ import annotations

import os
import sys
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import CurrentActor
from app.api.routers.review_queries import get_review
from app.api.routers.review_support import _build_review_export_payload, _review_history_item
from app.db.models import (
    Photo,
    PhotoStatus,
    PracticeAttempt,
    PracticeSession,
    Review,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
)
from app.services.practice import owner_practice_context_for_review, serialize_practice_session
from app.services.practice_queries import get_practice_journal_summary, list_practice_journal_sessions
from app.services.practice_queries import _decode_cursor, _encode_cursor


TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class PracticeJournalPostgresTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.sessions()
        suffix = uuid4().hex
        self.suffix = suffix
        self.user = User(
            public_id=f'usr_practice_journal_{suffix}',
            email=f'{suffix}@journal.example.test',
            username=f'journal_{suffix[:20]}',
            plan=UserPlan.free,
            status=UserStatus.active,
            daily_quota_total=100,
            daily_quota_used=0,
        )
        self.other_user = User(
            public_id=f'usr_practice_journal_other_{suffix}',
            email=f'other-{suffix}@journal.example.test',
            username=f'journal_other_{suffix[:14]}',
            plan=UserPlan.free,
            status=UserStatus.active,
            daily_quota_total=100,
            daily_quota_used=0,
        )
        self.db.add_all([self.user, self.other_user])
        self.db.flush()
        self.actor = CurrentActor(self.user)
        self.user_ids = [self.user.id, self.other_user.id]

    def tearDown(self):
        self.db.rollback()
        self.db.query(PracticeAttempt).filter(PracticeAttempt.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(PracticeSession).filter(PracticeSession.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(Review).filter(Review.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(ReviewTask).filter(ReviewTask.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(Photo).filter(Photo.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(User).filter(User.id.in_(self.user_ids)).delete()
        self.db.commit()
        self.db.close()
        self.engine.dispose()

    def _photo(self, owner: User, label: str) -> Photo:
        photo = Photo(
            public_id=f'pho_{self.suffix}_{label}',
            owner_user_id=owner.id,
            upload_id=f'u_{self.suffix}_{label}',
            bucket='practice-journal-fixture',
            object_key=f'{self.suffix}/{label}.jpg',
            content_type='image/jpeg',
            size_bytes=100,
            status=PhotoStatus.READY,
            checksum_sha256=(label[:1] or 'a') * 64,
        )
        self.db.add(photo)
        self.db.flush()
        return photo

    def _review(
        self,
        owner: User,
        photo: Photo,
        label: str,
        *,
        status: str | None = None,
        image_type: str = 'portrait',
        deleted: bool = False,
        created_at: datetime | None = None,
    ) -> Review:
        result_json = {}
        if status is not None:
            result_json['goal_assessment'] = {
                'goal_version': 'goal-assessment-v1',
                'status': status,
                'evidence': [
                    {
                        'success_criterion': 'Make composition visibly stronger.',
                        'before_observation': 'The original frame leaves the subject merged with background clutter.',
                        'after_observation': 'The attempt separates the subject more clearly from the background.',
                        'conclusion': 'The target composition cue is partially improved in the attempt.',
                    }
                ] if status != 'indeterminate' else [],
                'limitations': ['The images are not comparable enough for a firm decision.'] if status == 'indeterminate' else [],
                'next_action': 'Try again with the same goal.',
            }
        review = Review(
            public_id=f'rev_{self.suffix}_{label}',
            owner_user_id=owner.id,
            photo_id=photo.id,
            mode=ReviewMode.flash,
            status=ReviewStatus.SUCCEEDED,
            image_type=image_type,
            schema_version='2.0',
            result_json=result_json,
            final_score=7,
            created_at=created_at,
            deleted_at=datetime.now(timezone.utc) if deleted else None,
        )
        self.db.add(review)
        self.db.flush()
        return review

    def _session(
        self,
        owner: User,
        source: Review,
        source_photo: Photo,
        label: str,
        *,
        lifecycle: str = 'active',
        kind: str = 'capture_retake',
        dimension: str = 'composition',
        created_at: datetime | None = None,
    ) -> PracticeSession:
        session = PracticeSession(
            public_id=f'prs_{self.suffix}_{label}',
            owner_user_id=owner.id,
            source_review_id=source.id,
            source_photo_id=source_photo.id,
            practice_kind=kind,
            lifecycle=lifecycle,
            goal_snapshot={
                'goal_version': 'goal-assessment-v1',
                'goal': f'Improve {dimension} for {label}.',
                'dimension': dimension,
            },
            success_criteria=[{'key': 'main', 'label': f'Make {dimension} visibly stronger.'}],
            locale='en',
            request_hash=f'hash-{label}',
            created_at=created_at,
            updated_at=created_at,
        )
        self.db.add(session)
        self.db.flush()
        return session

    def _attempt(
        self,
        session: PracticeSession,
        photo: Photo,
        label: str,
        *,
        review: Review | None = None,
        task_status: TaskStatus = TaskStatus.SUCCEEDED,
        sequence: int = 1,
        created_at: datetime | None = None,
    ) -> PracticeAttempt:
        task = ReviewTask(
            public_id=f'tsk_{self.suffix}_{label}',
            photo_id=photo.id,
            owner_user_id=session.owner_user_id,
            mode=ReviewMode.flash,
            status=task_status,
            request_payload={},
            created_at=created_at,
        )
        self.db.add(task)
        self.db.flush()
        attempt = PracticeAttempt(
            public_id=f'pra_{self.suffix}_{label}',
            session_id=session.id,
            owner_user_id=session.owner_user_id,
            task_id=task.id,
            review_id=review.id if review is not None else None,
            sequence=sequence,
            photo_id=photo.id,
            source_review_id=session.source_review_id,
            attempt_kind=session.practice_kind,
            request_hash=f'attempt-hash-{label}',
            created_at=created_at,
        )
        self.db.add(attempt)
        self.db.flush()
        return attempt

    @contextmanager
    def _select_counter(self):
        counts = {'selects': 0}

        def before_cursor_execute(_conn, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith('SELECT'):
                counts['selects'] += 1

        event.listen(self.engine, 'before_cursor_execute', before_cursor_execute)
        try:
            yield counts
        finally:
            event.remove(self.engine, 'before_cursor_execute', before_cursor_execute)

    def _request(self) -> Request:
        return Request({'type': 'http', 'method': 'GET', 'path': '/reviews/rev', 'headers': [(b'host', b'example.test')]})

    def test_list_cursor_uses_created_at_and_id_without_duplicates(self):
        shared_time = datetime(2026, 9, 19, 10, 0, tzinfo=timezone.utc)
        source_photo = self._photo(self.user, 'source')
        source = self._review(self.user, source_photo, 'source', image_type='street', created_at=shared_time)
        first = self._session(self.user, source, source_photo, 'first', dimension='composition', created_at=shared_time)
        second = self._session(self.user, source, source_photo, 'second', dimension='lighting', created_at=shared_time)
        other_source_photo = self._photo(self.other_user, 'other-source')
        other_source = self._review(self.other_user, other_source_photo, 'other-source', created_at=shared_time)
        self._session(self.other_user, other_source, other_source_photo, 'other', created_at=shared_time)
        self.db.commit()

        page_one = list_practice_journal_sessions(self.db, self.actor, limit=1)
        page_two = list_practice_journal_sessions(self.db, self.actor, limit=1, cursor=page_one.next_cursor)

        seen = {page_one.items[0].session_id, page_two.items[0].session_id}
        self.assertEqual(seen, {first.public_id, second.public_id})
        self.assertNotEqual(page_one.items[0].session_id, page_two.items[0].session_id)
        self.assertIsNone(page_two.next_cursor)
        self.assertEqual(page_one.items[0].source.genre, 'street')

    def test_summary_uses_all_sessions_even_when_list_is_filtered(self):
        base = datetime(2026, 9, 19, 11, 0, tzinfo=timezone.utc)
        source_photo = self._photo(self.user, 'sum-source')
        source = self._review(self.user, source_photo, 'sum-source', created_at=base)
        achieved_session = self._session(self.user, source, source_photo, 'achieved', dimension='composition', created_at=base)
        failed_session = self._session(
            self.user, source, source_photo, 'failed', dimension='lighting', lifecycle='archived',
            created_at=base + timedelta(minutes=1),
        )
        attempt_photo = self._photo(self.user, 'sum-attempt')
        achieved_review = self._review(
            self.user, attempt_photo, 'achieved-attempt', status='achieved',
            created_at=base + timedelta(minutes=2),
        )
        self._attempt(achieved_session, attempt_photo, 'achieved', review=achieved_review, created_at=base + timedelta(minutes=2))
        failed_photo = self._photo(self.user, 'failed-attempt')
        self._attempt(
            failed_session, failed_photo, 'failed', task_status=TaskStatus.FAILED,
            created_at=base + timedelta(minutes=3),
        )
        self.db.commit()

        filtered = list_practice_journal_sessions(self.db, self.actor, dimension='composition', limit=10)
        summary = get_practice_journal_summary(self.db, self.actor)

        self.assertEqual([item.dimension for item in filtered.items], ['composition'])
        self.assertEqual(summary.scope, 'all_practice')
        self.assertEqual(summary.session_count, 2)
        self.assertEqual(summary.attempt_count, 2)
        self.assertEqual(summary.sample_count, 1)
        self.assertEqual(summary.status_counts['achieved'], 1)
        self.assertEqual(summary.failed_count, 1)

    def test_deleted_source_and_deleted_attempt_review_do_not_leak_ids_or_count_as_sample(self):
        now = datetime(2026, 9, 19, 12, 0, tzinfo=timezone.utc)
        source_photo = self._photo(self.user, 'deleted-source-photo')
        source = self._review(self.user, source_photo, 'deleted-source', deleted=True, created_at=now)
        session = self._session(self.user, source, source_photo, 'deleted-source', created_at=now)
        attempt_photo = self._photo(self.user, 'deleted-attempt-photo')
        attempt_review = self._review(
            self.user, attempt_photo, 'deleted-attempt-review', status='partial',
            deleted=True, created_at=now + timedelta(minutes=1),
        )
        self._attempt(session, attempt_photo, 'deleted-attempt', review=attempt_review, created_at=now + timedelta(minutes=1))
        self.db.commit()

        listed = list_practice_journal_sessions(self.db, self.actor, limit=10)
        summary = get_practice_journal_summary(self.db, self.actor)

        self.assertEqual(listed.items[0].source.access, 'deleted')
        self.assertIsNone(listed.items[0].source.review_id)
        self.assertIsNone(listed.items[0].source.photo_id)
        self.assertEqual(listed.items[0].latest_attempt.review_access, 'deleted')
        self.assertIsNone(listed.items[0].latest_attempt.review_id)
        self.assertEqual(summary.sample_count, 0)
        self.assertEqual(summary.unknown_count, 1)

    def test_access_matrix_matches_detail_owner_history_and_export_contexts(self):
        now = datetime.now(timezone.utc)
        cases = [
            ('normal', None, 'available', True),
            ('deleted', 'deleted', 'deleted', False),
            ('rejected', 'rejected', 'photo_unavailable', False),
            ('expired', 'expired', 'expired', False),
        ]
        for label, mutation, expected_access, expect_ids in cases:
            with self.subTest(label=label):
                source_time = now - timedelta(days=31) if mutation == 'expired' else now
                source_photo = self._photo(self.user, f'{label}-matrix-source-photo')
                source = self._review(self.user, source_photo, f'{label}-matrix-source', created_at=source_time)
                session = self._session(self.user, source, source_photo, f'{label}-matrix-session', created_at=source_time)
                attempt_photo = self._photo(self.user, f'{label}-matrix-attempt-photo')
                attempt_review = self._review(
                    self.user,
                    attempt_photo,
                    f'{label}-matrix-attempt-review',
                    status='partial',
                    created_at=now + timedelta(minutes=1),
                )
                self._attempt(session, attempt_photo, f'{label}-matrix-attempt', review=attempt_review, created_at=now + timedelta(minutes=1))
                if mutation == 'deleted':
                    source.deleted_at = now
                elif mutation == 'rejected':
                    source_photo.status = PhotoStatus.REJECTED
                self.db.commit()

                detail = serialize_practice_session(self.db, session, self.actor)
                direct_context = owner_practice_context_for_review(self.db, attempt_review)
                request = self._request()
                with patch('app.api.routers.review_queries._build_photo_proxy_url', return_value='http://example.test/photo.jpg'), patch(
                    'app.api.routers.review_support._build_photo_proxy_url', return_value='http://example.test/photo.jpg'
                ):
                    owner_payload = get_review(attempt_review.public_id, request, self.db, self.actor)
                    history_payload = _review_history_item(request, attempt_review, attempt_photo, self.user.public_id, source.public_id)
                    export_payload = _build_review_export_payload(
                        review=attempt_review,
                        photo_id=attempt_photo.public_id,
                        photo_url='http://example.test/photo.jpg',
                        photo_thumbnail_url='http://example.test/thumb.jpg',
                        source_review_id=source.public_id,
                    )

                contexts = [
                    direct_context,
                    owner_payload.practice,
                    history_payload.practice,
                    export_payload.review.practice,
                ]
                self.assertEqual(detail.source_access, expected_access)
                self.assertEqual(detail.source_review_id, source.public_id if expect_ids else None)
                self.assertEqual(detail.source_photo_id, source_photo.public_id if expect_ids else None)
                for context in contexts:
                    self.assertIsNotNone(context)
                    assert context is not None
                    self.assertEqual(context['source_access'], expected_access)
                    self.assertEqual(context['continue_available'], expect_ids)
                    self.assertEqual(context['source_review_id'], source.public_id if expect_ids else None)
                    self.assertEqual(context['source_photo_id'], source_photo.public_id if expect_ids else None)

    def test_rejected_source_photo_hides_source_ids_and_disables_continue(self):
        now = datetime(2026, 9, 19, 13, 0, tzinfo=timezone.utc)
        source_photo = self._photo(self.user, 'rejected-source-photo')
        source_photo.status = PhotoStatus.REJECTED
        source = self._review(self.user, source_photo, 'rejected-source', created_at=now)
        self._session(self.user, source, source_photo, 'rejected-source', created_at=now)
        self.db.commit()

        listed = list_practice_journal_sessions(self.db, self.actor, limit=10)

        self.assertEqual(listed.items[0].source.access, 'photo_unavailable')
        self.assertIsNone(listed.items[0].source.review_id)
        self.assertIsNone(listed.items[0].source.photo_id)
        self.assertIsNone(listed.items[0].continuation_id)
        self.assertFalse(listed.items[0].continue_available)

    def test_plan_downgrade_expired_source_stays_readable_but_not_resumable_or_sampled(self):
        old = datetime.now(timezone.utc) - timedelta(days=31)
        source_photo = self._photo(self.user, 'expired-source-photo')
        source = self._review(self.user, source_photo, 'expired-source', created_at=old)
        session = self._session(self.user, source, source_photo, 'expired-source', created_at=old)
        attempt_photo = self._photo(self.user, 'expired-attempt-photo')
        attempt_review = self._review(self.user, attempt_photo, 'expired-attempt-review', status='achieved', created_at=old)
        self._attempt(session, attempt_photo, 'expired-attempt', review=attempt_review, created_at=old)
        self.db.commit()

        listed = list_practice_journal_sessions(self.db, self.actor, limit=10)
        summary = get_practice_journal_summary(self.db, self.actor)

        self.assertEqual(listed.items[0].source.access, 'expired')
        self.assertIsNone(listed.items[0].continuation_id)
        self.assertFalse(listed.items[0].continue_available)
        self.assertEqual(listed.items[0].latest_assessment_status, 'unknown')
        self.assertEqual(summary.sample_count, 0)
        self.assertEqual(summary.unknown_count, 1)

    def test_cross_owner_attempt_review_and_task_do_not_leak_or_count_sample(self):
        now = datetime(2026, 9, 19, 14, 0, tzinfo=timezone.utc)
        source_photo = self._photo(self.user, 'cross-source-photo')
        source = self._review(self.user, source_photo, 'cross-source', created_at=now)
        session = self._session(self.user, source, source_photo, 'cross-source', created_at=now)
        other_photo = self._photo(self.other_user, 'cross-other-photo')
        other_review = self._review(
            self.other_user, other_photo, 'cross-other-review', status='achieved',
            created_at=now + timedelta(minutes=1),
        )
        other_task = ReviewTask(
            public_id=f'tsk_{self.suffix}_cross_other',
            photo_id=other_photo.id,
            owner_user_id=self.other_user.id,
            mode=ReviewMode.flash,
            status=TaskStatus.SUCCEEDED,
            request_payload={},
            created_at=now + timedelta(minutes=1),
        )
        self.db.add(other_task)
        self.db.flush()
        attempt = PracticeAttempt(
            public_id=f'pra_{self.suffix}_cross',
            session_id=session.id,
            owner_user_id=self.user.id,
            task_id=other_task.id,
            review_id=other_review.id,
            sequence=1,
            photo_id=other_photo.id,
            source_review_id=session.source_review_id,
            attempt_kind=session.practice_kind,
            request_hash='attempt-hash-cross',
            created_at=now + timedelta(minutes=1),
        )
        self.db.add(attempt)
        self.db.commit()

        listed = list_practice_journal_sessions(self.db, self.actor, limit=10)
        summary = get_practice_journal_summary(self.db, self.actor)

        self.assertEqual(listed.items[0].latest_assessment_status, 'unknown')
        self.assertIsNone(listed.items[0].latest_attempt.task_id)
        self.assertIsNone(listed.items[0].latest_attempt.review_id)
        self.assertEqual(listed.items[0].latest_attempt.review_access, 'photo_unavailable')
        self.assertEqual(summary.sample_count, 0)
        self.assertEqual(summary.unknown_count, 1)

    def test_pending_attempt_keeps_task_and_photo_ids_for_polling_in_list_and_detail(self):
        now = datetime(2026, 9, 19, 14, 30, tzinfo=timezone.utc)
        source_photo = self._photo(self.user, 'pending-source-photo')
        source = self._review(self.user, source_photo, 'pending-source', created_at=now)
        session = self._session(self.user, source, source_photo, 'pending-session', created_at=now)
        attempt_photo = self._photo(self.user, 'pending-attempt-photo')
        attempt = self._attempt(
            session,
            attempt_photo,
            'pending-attempt',
            review=None,
            task_status=TaskStatus.RUNNING,
            created_at=now + timedelta(minutes=1),
        )
        self.db.commit()

        listed = list_practice_journal_sessions(self.db, self.actor, limit=10)
        detail = serialize_practice_session(self.db, session, self.actor)

        self.assertEqual(listed.items[0].latest_attempt.attempt_id, attempt.public_id)
        self.assertIsNotNone(listed.items[0].latest_attempt.task_id)
        self.assertEqual(listed.items[0].latest_attempt.task_id, detail.attempts[0].task_id)
        self.assertIsNone(listed.items[0].latest_attempt.review_id)
        self.assertEqual(listed.items[0].latest_attempt.review_access, 'none')
        self.assertEqual(detail.attempts[0].photo_id, attempt_photo.public_id)
        self.assertEqual(detail.attempts[0].review_access, 'none')

    def test_pending_attempt_with_unowned_task_hides_task_but_keeps_ready_photo(self):
        now = datetime(2026, 9, 19, 14, 45, tzinfo=timezone.utc)
        source_photo = self._photo(self.user, 'pending-cross-task-source-photo')
        source = self._review(self.user, source_photo, 'pending-cross-task-source', created_at=now)
        session = self._session(self.user, source, source_photo, 'pending-cross-task-session', created_at=now)
        attempt_photo = self._photo(self.user, 'pending-cross-task-attempt-photo')
        other_photo = self._photo(self.other_user, 'pending-cross-task-other-photo')
        other_task = ReviewTask(
            public_id=f'tsk_{self.suffix}_pending_cross_owner',
            photo_id=other_photo.id,
            owner_user_id=self.other_user.id,
            mode=ReviewMode.flash,
            status=TaskStatus.RUNNING,
            request_payload={},
            created_at=now + timedelta(minutes=1),
        )
        self.db.add(other_task)
        self.db.flush()
        attempt = PracticeAttempt(
            public_id=f'pra_{self.suffix}_pending_cross_owner',
            session_id=session.id,
            owner_user_id=self.user.id,
            task_id=other_task.id,
            review_id=None,
            sequence=1,
            photo_id=attempt_photo.id,
            source_review_id=session.source_review_id,
            attempt_kind=session.practice_kind,
            request_hash='attempt-hash-pending-cross-owner',
            created_at=now + timedelta(minutes=1),
        )
        self.db.add(attempt)
        self.db.commit()

        listed = list_practice_journal_sessions(self.db, self.actor, limit=10)
        detail = serialize_practice_session(self.db, session, self.actor)

        self.assertIsNone(listed.items[0].latest_attempt.task_id)
        self.assertIsNone(listed.items[0].latest_attempt.review_id)
        self.assertEqual(listed.items[0].latest_attempt.review_access, 'none')
        self.assertIsNone(detail.attempts[0].task_id)
        self.assertEqual(detail.attempts[0].photo_id, attempt_photo.public_id)

    def test_source_non_succeeded_and_session_owner_mismatch_hide_source_ids(self):
        now = datetime(2026, 9, 19, 14, 55, tzinfo=timezone.utc)
        failed_photo = self._photo(self.user, 'failed-source-photo')
        failed_source = self._review(self.user, failed_photo, 'failed-source', created_at=now)
        failed_source.status = ReviewStatus.FAILED
        self._session(self.user, failed_source, failed_photo, 'failed-source-session', created_at=now)

        other_photo = self._photo(self.other_user, 'owner-mismatch-source-photo')
        other_source = self._review(self.other_user, other_photo, 'owner-mismatch-source', created_at=now)
        mismatch = self._session(self.user, other_source, other_photo, 'owner-mismatch-session', created_at=now)
        mismatch.owner_user_id = self.user.id
        self.db.commit()

        listed = list_practice_journal_sessions(self.db, self.actor, limit=10)
        by_id = {item.session_id: item for item in listed.items}

        failed_item = by_id[f'prs_{self.suffix}_failed-source-session']
        self.assertEqual(failed_item.source.access, 'deleted')
        self.assertIsNone(failed_item.source.review_id)
        self.assertIsNone(failed_item.continuation_id)
        mismatch_item = by_id[f'prs_{self.suffix}_owner-mismatch-session']
        self.assertEqual(mismatch_item.source.access, 'deleted')
        self.assertIsNone(mismatch_item.source.review_id)
        self.assertIsNone(mismatch_item.source.photo_id)

    def test_malformed_cursor_rejects_without_server_error(self):
        with self.assertRaises(HTTPException) as raised:
            _decode_cursor('not-a-cursor')
        self.assertEqual(raised.exception.status_code, 400)
        with self.assertRaises(HTTPException) as naive:
            _decode_cursor(_encode_cursor(datetime(2026, 9, 19, 15, 0), 1))
        self.assertEqual(naive.exception.status_code, 400)
        with self.assertRaises(HTTPException) as nonpositive:
            _decode_cursor(_encode_cursor(datetime(2026, 9, 19, 15, 0, tzinfo=timezone.utc), 0))
        self.assertEqual(nonpositive.exception.status_code, 400)

    def test_existing_journal_detail_and_summary_remain_readable_when_practice_disabled(self):
        source_photo = self._photo(self.user, 'flag-source')
        source = self._review(self.user, source_photo, 'flag-source')
        session = self._session(self.user, source, source_photo, 'flag-session')
        self.db.commit()

        with patch('app.services.practice.settings.practice_enabled', False):
            detail = serialize_practice_session(self.db, session, self.actor)
            listed = list_practice_journal_sessions(self.db, self.actor, limit=10)
            summary = get_practice_journal_summary(self.db, self.actor)

        self.assertEqual(detail.session_id, session.public_id)
        self.assertEqual(listed.items[0].session_id, session.public_id)
        self.assertEqual(summary.session_count, 1)

    def test_journal_list_summary_and_detail_select_counts_are_bounded(self):
        base = datetime(2026, 9, 19, 16, 0, tzinfo=timezone.utc)
        bulk_session_ids = []
        for index in range(100):
            source_photo = self._photo(self.user, f'budget-source-photo-{index}')
            source = self._review(self.user, source_photo, f'budget-source-{index}', created_at=base + timedelta(seconds=index))
            session = self._session(self.user, source, source_photo, f'budget-session-{index}', created_at=base + timedelta(seconds=index))
            attempt_photo = self._photo(self.user, f'budget-attempt-photo-{index}')
            attempt_review = self._review(
                self.user,
                attempt_photo,
                f'budget-attempt-review-{index}',
                status='achieved',
                created_at=base + timedelta(minutes=1, seconds=index),
            )
            self._attempt(session, attempt_photo, f'budget-attempt-{index}', review=attempt_review, created_at=base + timedelta(minutes=1, seconds=index))
            bulk_session_ids.append(session.public_id)

        source_photo = self._photo(self.user, 'budget-large-source-photo')
        source = self._review(self.user, source_photo, 'budget-large-source', created_at=base + timedelta(hours=1))
        large_session = self._session(self.user, source, source_photo, 'budget-large-session', created_at=base + timedelta(hours=1))
        for index in range(500):
            attempt_photo = self._photo(self.user, f'budget-large-attempt-photo-{index}')
            attempt_review = self._review(
                self.user,
                attempt_photo,
                f'budget-large-attempt-review-{index}',
                status='partial',
                created_at=base + timedelta(hours=2, seconds=index),
            )
            self._attempt(
                large_session,
                attempt_photo,
                f'budget-large-attempt-{index}',
                review=attempt_review,
                sequence=index + 1,
                created_at=base + timedelta(hours=2, seconds=index),
            )
        self.db.commit()

        for limit in (1, 20, 100):
            with self.subTest(operation='list', limit=limit):
                with self._select_counter() as counts:
                    response = list_practice_journal_sessions(self.db, self.actor, limit=limit)
                self.assertLessEqual(counts['selects'], 10)
                self.assertEqual(len(response.items), limit)

        with self._select_counter() as summary_counts:
            summary = get_practice_journal_summary(self.db, self.actor)
        self.assertLessEqual(summary_counts['selects'], 10)
        self.assertEqual(summary.attempt_count, 600)

        with self._select_counter() as detail_counts:
            detail = serialize_practice_session(self.db, large_session, self.actor)
        self.assertLessEqual(detail_counts['selects'], 10)
        self.assertEqual(len(detail.attempts), 500)


if __name__ == '__main__':
    unittest.main()
