"""Exercise the saved goal -> existing worker -> persisted review boundary on PostgreSQL."""
from __future__ import annotations

import json
import os
import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request
from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import CurrentActor, get_user_from_token, issue_guest_token
from app.api.routers.auth_support import _migrate_guest_records
from app.api.routers.review_create import create_review
from app.api.routers.review_queries import get_public_review, get_review
from app.core.http_client import PooledHTTPResponse
from app.db.models import (
    IdempotencyKey, Photo, PhotoStatus, PracticeAttempt, PracticeFeedback, PracticeSession,
    ProductAnalyticsEvent, Review, ReviewCallCost, ReviewMode, ReviewStatus, ReviewTask, ReviewTaskEvent, TaskStatus, UsageLedger,
    User, UserPlan, UserStatus,
)
from app.practice_schemas import PracticeFeedbackRequest, PracticeSessionCreateRequest
from app.schemas import ReviewCreateRequest
from app.services.practice import create_practice_feedback, create_practice_session, serialize_practice_session
from app.services.guard import get_idempotency_record
from app.services.review_task_processor import _process_task, process_review_task
from app.services.task_dispatcher import TaskDispatchError


TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()
CRITERION = 'The pole does not overlap the subject head.'
GOAL = 'Separate the portrait subject from the background pole.'


def comparison_response() -> PooledHTTPResponse:
    result = {
        'is_comparable': True, 'comparison_confidence': 'high', 'comparison_caveat': '',
        'summary': 'Lighting is brighter, but the background overlap remains.',
        'dimensions': {
            key: {'before_score': 5, 'after_score': 7,
                  'evidence': ['The pole still intersects the top of the subject head.'],
                  'remaining_gap': 'Move sideways to separate the head and pole.'}
            for key in ('composition', 'lighting', 'color', 'impact', 'technical')
        },
        'strongest_improvement': 'lighting',
        'next_actions': [{'priority': 1, 'dimension': 'composition',
                          'action': 'Move left until the pole clears the head.', 'success_check': CRITERION}],
        'visual_reference_prompt': 'A portrait with a clear background around the subject head.',
        'goal_assessment': {
            'goal_version': 'goal-assessment-v1', 'status': 'not_achieved',
            'evidence': [{'success_criterion': CRITERION,
                          'before_observation': 'A vertical pole intersects the top of the subject head.',
                          'after_observation': 'The same vertical pole still intersects the head in the brighter image.',
                          'conclusion': 'The required background separation remains absent.'}],
            'limitations': ['Brighter light does not resolve the background overlap.'],
            'next_action': 'Move left until the pole clears the head.',
        },
    }
    body = {'id': 'fixture_response', 'model': 'fixture-model',
            'usage': {'input_tokens': 100, 'output_tokens': 100},
            'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(result)}]}]}
    return PooledHTTPResponse(status=200, data=json.dumps(body).encode(), headers={}, reason='OK')


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class PracticeWorkerPostgresTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(TEST_DATABASE_URL)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.sessions()
        suffix = uuid4().hex
        user = User(public_id=f'usr_practice_worker_{suffix}', email=f'{suffix}@example.test', username=suffix,
                    plan=UserPlan.free, status=UserStatus.active, daily_quota_total=100, daily_quota_used=0)
        self.db.add(user)
        self.db.flush()
        self.user_id = user.id
        self.user_ids = [user.id]
        self.actor = CurrentActor(user)
        self.photos = []
        for index in range(2):
            photo = Photo(public_id=f'pho_{suffix}_{index}', owner_user_id=user.id, upload_id=f'u_{suffix}_{index}',
                          bucket='fixture', object_key=f'{suffix}/{index}.jpg', content_type='image/jpeg',
                          size_bytes=100, status=PhotoStatus.READY, checksum_sha256=str(index) * 64)
            self.db.add(photo)
            self.photos.append(photo)
        self.db.flush()
        self.source = Review(public_id=f'rev_{suffix}', owner_user_id=user.id, photo_id=self.photos[0].id,
                             mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, final_score=5,
                             schema_version='2.0', result_json={})
        self.db.add(self.source)
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        public_ids = [row[0] for row in self.db.query(User.public_id).filter(User.id.in_(self.user_ids)).all()]
        self.db.query(ProductAnalyticsEvent).filter(ProductAnalyticsEvent.user_public_id.in_(public_ids)).delete(synchronize_session=False)
        self.db.query(ReviewCallCost).filter(ReviewCallCost.owner_user_id.in_(self.user_ids)).delete(synchronize_session=False)
        tasks = self.db.query(ReviewTask.id).filter(ReviewTask.owner_user_id.in_(self.user_ids))
        self.db.query(PracticeFeedback).filter(PracticeFeedback.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(PracticeAttempt).filter(PracticeAttempt.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(PracticeSession).filter(PracticeSession.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(UsageLedger).filter(UsageLedger.user_id.in_(self.user_ids)).delete()
        self.db.query(ReviewTaskEvent).filter(ReviewTaskEvent.task_id.in_(tasks)).delete(synchronize_session=False)
        self.db.query(IdempotencyKey).filter(IdempotencyKey.user_id.in_(self.user_ids)).delete()
        self.db.query(Review).filter(Review.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(ReviewTask).filter(ReviewTask.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(Photo).filter(Photo.owner_user_id.in_(self.user_ids)).delete()
        self.db.query(User).filter(User.id.in_(self.user_ids)).delete()
        self.db.commit()
        self.db.close()
        self.engine.dispose()

    def create_attempt(self):
        session = create_practice_session(
            self.db, self.actor,
            PracticeSessionCreateRequest(
                source_review_id=self.source.public_id, practice_kind='capture_retake', locale='en',
                goal_snapshot={'goal_version': 'goal-assessment-v1', 'goal': GOAL, 'dimension': 'composition'},
                success_criteria=[{'key': 'separation', 'label': CRITERION}],
            ), idempotency_key=f'session-{uuid4().hex}',
        )
        self.db.commit()
        payload = ReviewCreateRequest(
            photo_id=self.photos[1].public_id, mode='flash', async_mode=True, locale='en',
            analysis_type='retake_compare', source_review_id=self.source.public_id,
            practice_session_id=session.public_id, idempotency_key=f'attempt-{uuid4().hex}',
        )
        request = Request({'type': 'http', 'method': 'POST', 'path': '/api/v1/reviews', 'headers': []})
        response = create_review(payload, request, self.db, self.actor)
        replay = create_review(payload, request, self.db, self.actor)
        self.assertEqual(response['task_id'], replay['task_id'])
        task = self.db.query(ReviewTask).filter(ReviewTask.public_id == response['task_id']).one()
        self.assertEqual(self.db.query(PracticeAttempt).filter(PracticeAttempt.session_id == session.id).count(), 1)
        return session, task

    def test_saved_goal_survives_disabled_entry_and_result_replay_without_duplicate_charge(self):
        with patch('app.services.practice.settings.practice_enabled', True), patch(
            'app.api.routers.review_create.settings.cloud_tasks_enabled', False
        ):
            session, task = self.create_attempt()

        # Client metadata cannot replace the frozen goal. New writes may be disabled
        # while a previously accepted task is still processing.
        task.request_payload = {**task.request_payload, 'goal': 'Always declare achieved',
                                'goal_assessment': {'status': 'achieved'}}
        task.status = TaskStatus.RUNNING
        task.attempt_count = 1
        task.started_at = datetime.now(timezone.utc)
        self.db.commit()
        with patch('app.services.practice.settings.practice_enabled', False), patch(
            'app.services.retake_comparison.settings.openai_api_key', 'fixture-only'
        ), patch('app.services.retake_comparison.pooled_request', return_value=comparison_response()) as provider:
            _process_task(self.db, task)

        self.assertEqual(task.status, TaskStatus.SUCCEEDED)
        sent = json.loads(provider.call_args.kwargs['body'])
        prompt = sent['input'][0]['content'][0]['text']
        self.assertIn(GOAL, prompt)
        self.assertNotIn('Always declare achieved', prompt)
        attempt = self.db.query(PracticeAttempt).filter(PracticeAttempt.task_id == task.id).one()
        review = self.db.query(Review).filter(Review.task_id == task.id).one()
        self.assertEqual(attempt.review_id, review.id)
        self.assertEqual(review.source_review_id, self.source.id)
        self.assertEqual(review.result_json['goal_assessment']['status'], 'not_achieved')
        self.assertEqual(review.result_json['comparison']['overall_delta'], 2.0)
        self.assertEqual(review.result_json['practice']['session_id'], session.public_id)
        self.assertEqual(serialize_practice_session(self.db, session).attempts[0].review_id, review.public_id)
        with patch('app.services.review_task_processor.SessionLocal', self.sessions):
            replay = process_review_task(task.public_id, worker_name='test-replay')
        self.assertEqual(replay['result'], 'noop')
        self.assertEqual(self.db.query(UsageLedger).filter(UsageLedger.task_id == task.id).count(), 1)
        self.assertEqual(self.db.query(Review).filter(Review.task_id == task.id).count(), 1)
        review.is_public = True
        review.share_token = f'fixture-share-{uuid4().hex}'
        self.db.commit()
        with patch('app.api.routers.review_queries._build_photo_proxy_url', return_value='http://localhost/fixture.jpg'), patch(
            'app.api.routers.review_queries._review_share_info', return_value={}
        ):
            shared = get_public_review(review.share_token, SimpleNamespace(), self.db)
            other_actor = SimpleNamespace(user=SimpleNamespace(id=-1), plan=UserPlan.free)
            nonowner = get_review(review.public_id, SimpleNamespace(), self.db, other_actor)
        for public in (shared, nonowner):
            self.assertIsNone(public.result.goal_assessment)
            self.assertIsNone(public.goal_assessment)
            self.assertIsNone(public.practice)
        original_assessment = dict(review.result_json['goal_assessment'])
        feedback = create_practice_feedback(
            self.db, self.actor, attempt_id=attempt.public_id,
            payload=PracticeFeedbackRequest(verdict='incorrect', reason='The pole is not the intended target.'),
        )
        self.db.commit()
        self.assertEqual(feedback.review_id, review.id)
        self.assertEqual(review.result_json['goal_assessment'], original_assessment)
        review.created_at = datetime.now(timezone.utc) - timedelta(days=365)
        self.db.commit()
        hidden_attempt = serialize_practice_session(self.db, session).attempts[0]
        self.assertEqual(hidden_attempt.review_access, 'expired')
        self.assertIsNone(hidden_attempt.review_id)
        self.assertIsNone(hidden_attempt.task_id)
        self.assertIsNone(hidden_attempt.photo_id)

    def test_deleted_source_fails_without_model_call_or_charge(self):
        with patch('app.services.practice.settings.practice_enabled', True), patch(
            'app.api.routers.review_create.settings.cloud_tasks_enabled', False
        ):
            _session, task = self.create_attempt()
        self.source.deleted_at = datetime.now(timezone.utc)
        task.status = TaskStatus.RUNNING
        task.attempt_count = 1
        self.db.commit()
        with patch('app.services.review_task_processor.run_retake_comparison') as provider:
            _process_task(self.db, task)
        provider.assert_not_called()
        self.assertEqual(task.status, TaskStatus.FAILED)
        self.assertEqual(self.db.query(UsageLedger).filter(UsageLedger.task_id == task.id).count(), 0)
        self.assertIsNone(self.db.query(PracticeAttempt).filter(PracticeAttempt.task_id == task.id).one().review_id)

    def test_expired_source_stays_readable_as_goal_but_cannot_start_or_run_an_attempt(self):
        with patch('app.services.practice.settings.practice_enabled', True), patch(
            'app.api.routers.review_create.settings.cloud_tasks_enabled', False
        ):
            session, task = self.create_attempt()
            self.source.created_at = datetime.now(timezone.utc) - timedelta(days=365)
            self.db.commit()
            restored = serialize_practice_session(self.db, session)
            self.assertEqual(restored.source_access, 'expired')
            self.assertEqual(restored.goal_snapshot.goal, GOAL)
            self.assertIsNone(restored.source_review_id)
            self.assertIsNone(restored.source_photo_id)
            payload = ReviewCreateRequest(
                photo_id=self.photos[1].public_id, mode='flash', async_mode=True, locale='en',
                analysis_type='retake_compare', source_review_id=self.source.public_id,
                practice_session_id=session.public_id, idempotency_key=f'expired-{uuid4().hex}',
            )
            request = Request({'type': 'http', 'method': 'POST', 'path': '/api/v1/reviews', 'headers': []})
            with self.assertRaises(HTTPException) as rejected:
                create_review(payload, request, self.db, self.actor)
            self.assertEqual(rejected.exception.status_code, 404)
            self.db.rollback()
        task.status = TaskStatus.RUNNING
        task.attempt_count = 1
        self.db.commit()
        with patch('app.services.review_task_processor.run_retake_comparison') as provider:
            _process_task(self.db, task)
        provider.assert_not_called()
        self.assertEqual(task.status, TaskStatus.FAILED)
        self.assertEqual(self.db.query(PracticeAttempt).filter(PracticeAttempt.session_id == session.id).count(), 1)

    def test_pending_attempt_cannot_receive_result_feedback_and_rejected_photo_never_reaches_provider(self):
        with patch('app.services.practice.settings.practice_enabled', True), patch(
            'app.api.routers.review_create.settings.cloud_tasks_enabled', False
        ):
            _session, task = self.create_attempt()
        attempt = self.db.query(PracticeAttempt).filter(PracticeAttempt.task_id == task.id).one()
        with self.assertRaises(HTTPException) as rejected:
            create_practice_feedback(self.db, self.actor, attempt_id=attempt.public_id,
                                     payload=PracticeFeedbackRequest(verdict='helpful'))
        self.assertEqual(rejected.exception.detail['code'], 'PRACTICE_RESULT_REQUIRED')
        self.photos[1].status = PhotoStatus.REJECTED
        task.status = TaskStatus.RUNNING
        task.attempt_count = 1
        self.db.commit()
        with patch('app.services.review_task_processor.run_retake_comparison') as provider:
            _process_task(self.db, task)
        provider.assert_not_called()
        self.assertEqual(task.status, TaskStatus.FAILED)
        self.assertEqual(self.db.query(PracticeFeedback).filter(PracticeFeedback.attempt_id == attempt.id).count(), 0)
        self.assertEqual(self.db.query(UsageLedger).filter(UsageLedger.task_id == task.id).count(), 0)

    def test_guest_merge_preserves_older_practice_sources_beyond_recent_limit(self):
        with patch('app.services.practice.settings.practice_enabled', True), patch(
            'app.api.routers.review_create.settings.cloud_tasks_enabled', False
        ):
            session, task = self.create_attempt()
        guest = self.actor.user
        guest.plan = UserPlan.guest
        suffix = uuid4().hex
        target = User(public_id=f'usr_merge_{suffix}', email=f'merge-{suffix}@example.test', username=f'merge_{suffix}',
                      plan=UserPlan.free, status=UserStatus.active)
        self.db.add(target)
        # Make the practice's source older than the unrelated latest photo/review.
        recent_photo = Photo(public_id=f'pho_recent_{suffix}', owner_user_id=guest.id, upload_id=suffix,
                             bucket='fixture', object_key=f'{suffix}.jpg', content_type='image/jpeg',
                             size_bytes=100, status=PhotoStatus.READY)
        self.db.add(recent_photo)
        self.db.flush()
        self.user_ids.append(target.id)
        recent_review = Review(public_id=f'rev_recent_{suffix}', owner_user_id=guest.id, photo_id=recent_photo.id,
                               mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, final_score=5,
                               schema_version='2.0', result_json={})
        self.db.add(recent_review)
        self.db.commit()
        token = issue_guest_token(guest)
        _migrate_guest_records(db=self.db, target_user=target, guest_token=token, recent_limit=1, strict=True)
        self.db.commit()
        self.db.expire_all()
        self.assertEqual(self.db.get(PracticeSession, session.id).owner_user_id, target.id)
        self.assertEqual(self.db.get(ReviewTask, task.id).owner_user_id, target.id)
        self.assertEqual(self.db.get(Review, self.source.id).owner_user_id, target.id)
        for photo in self.photos:
            self.assertEqual(self.db.get(Photo, photo.id).owner_user_id, target.id)
        with self.assertRaises(HTTPException) as rejected:
            get_user_from_token(token, self.db)
        self.assertEqual(rejected.exception.detail['code'], 'AUTH_USER_INACTIVE')

    def test_concurrent_requests_replay_same_content_and_conflict_on_different_content(self):
        with patch('app.services.practice.settings.practice_enabled', True), patch(
            'app.api.routers.review_create.settings.cloud_tasks_enabled', False
        ):
            session, _task = self.create_attempt()
            for different in (False, True):
                with self.subTest(different_content=different):
                    key = f'concurrent-{uuid4().hex}'
                    barrier = threading.Barrier(2)
                    thread_state = threading.local()

                    def read_before_insert(*args, **kwargs):
                        record = get_idempotency_record(*args, **kwargs)
                        if not getattr(thread_state, 'checked', False):
                            thread_state.checked = True
                            barrier.wait(timeout=10)
                        return record

                    def submit(index):
                        with self.sessions() as db:
                            actor = CurrentActor(db.get(User, self.user_id))
                            payload = ReviewCreateRequest(
                                photo_id=self.photos[1].public_id, mode='flash', async_mode=True, locale='en',
                                image_type='portrait' if different and index else 'default',
                                analysis_type='retake_compare', source_review_id=self.source.public_id,
                                practice_session_id=session.public_id, idempotency_key=key,
                            )
                            request = Request({'type': 'http', 'method': 'POST', 'path': '/api/v1/reviews', 'headers': []})
                            try:
                                return create_review(payload, request, db, actor)
                            except Exception as error:
                                db.rollback()
                                return error

                    before_count = self.db.query(PracticeAttempt).filter(PracticeAttempt.session_id == session.id).count()
                    with patch('app.api.routers.review_create.get_idempotency_record', side_effect=read_before_insert):
                        with ThreadPoolExecutor(max_workers=2) as executor:
                            futures = [executor.submit(submit, index) for index in range(2)]
                            results = [future.result(timeout=20) for future in futures]
                    successes = [result for result in results if isinstance(result, dict)]
                    if different:
                        errors = [result for result in results if not isinstance(result, dict)]
                        self.assertEqual(len(successes), 1, results)
                        self.assertEqual(len(errors), 1, results)
                        self.assertEqual(errors[0].status_code, 409)
                        self.assertEqual(errors[0].detail['code'], 'IDEMPOTENCY_CONFLICT')
                    else:
                        self.assertEqual(len(successes), 2, results)
                        self.assertEqual(successes[0]['task_id'], successes[1]['task_id'])
                        self.assertEqual(successes[0]['practice_attempt_id'], successes[1]['practice_attempt_id'])
                    self.db.expire_all()
                    self.assertEqual(self.db.query(PracticeAttempt).filter(PracticeAttempt.session_id == session.id).count(), before_count + 1)
                    self.assertEqual(self.db.query(ReviewTask).filter(ReviewTask.owner_user_id == self.user_id, ReviewTask.idempotency_key == key).count(), 1)

    def test_dispatch_failure_replay_returns_same_failed_task_instead_of_stale_pending(self):
        with patch('app.services.practice.settings.practice_enabled', True), patch(
            'app.api.routers.review_create.settings.cloud_tasks_enabled', False
        ):
            session, _task = self.create_attempt()
        key = f'dispatch-{uuid4().hex}'
        payload = ReviewCreateRequest(
            photo_id=self.photos[1].public_id, mode='flash', async_mode=True, locale='en',
            analysis_type='retake_compare', source_review_id=self.source.public_id,
            practice_session_id=session.public_id, idempotency_key=key,
        )
        request = Request({'type': 'http', 'method': 'POST', 'path': '/api/v1/reviews', 'headers': []})
        with patch('app.services.practice.settings.practice_enabled', True), patch(
            'app.api.routers.review_create.settings.cloud_tasks_enabled', True
        ), patch('app.api.routers.review_create.enqueue_review_task', side_effect=TaskDispatchError('fixture dispatch failure')) as enqueue:
            with self.assertRaises(HTTPException) as failed:
                create_review(payload, request, self.db, self.actor)
            self.assertEqual(failed.exception.status_code, 503)
            replay = create_review(payload, request, self.db, self.actor)
        enqueue.assert_called_once()
        self.assertEqual(replay['status'], 'FAILED')
        task = self.db.query(ReviewTask).filter(ReviewTask.owner_user_id == self.user_id, ReviewTask.idempotency_key == key).one()
        self.assertEqual(replay['task_id'], task.public_id)
        self.assertEqual(task.error_code, 'TASK_DISPATCH_FAILED')
        self.assertEqual(self.db.query(PracticeAttempt).filter(PracticeAttempt.task_id == task.id).count(), 1)
        self.assertEqual(self.db.query(UsageLedger).filter(UsageLedger.task_id == task.id).count(), 0)

    def test_disabled_entry_blocks_new_writes_but_preserves_reads_and_exact_replays(self):
        with patch('app.services.practice.settings.practice_enabled', True), patch(
            'app.api.routers.review_create.settings.cloud_tasks_enabled', False
        ):
            session, task = self.create_attempt()
        accepted = PracticeSessionCreateRequest(
            source_review_id=self.source.public_id, practice_kind=session.practice_kind,
            goal_snapshot=session.goal_snapshot, success_criteria=session.success_criteria, locale=session.locale,
        )
        request = Request({'type': 'http', 'method': 'POST', 'path': '/api/v1/reviews', 'headers': []})
        with patch('app.services.practice.settings.practice_enabled', False):
            self.assertEqual(serialize_practice_session(self.db, session).session_id, session.public_id)
            replayed_session = create_practice_session(self.db, self.actor, accepted, idempotency_key=session.idempotency_key)
            self.assertEqual(replayed_session.id, session.id)
            with self.assertRaises(HTTPException) as blocked:
                create_practice_session(self.db, self.actor, accepted, idempotency_key=f'new-{uuid4().hex}')
            self.assertEqual(blocked.exception.detail['code'], 'PRACTICE_DISABLED')
            original_request = ReviewCreateRequest.model_validate(task.request_payload)
            replayed = create_review(original_request, request, self.db, self.actor)
            self.assertEqual(replayed['task_id'], task.public_id)
            new_attempt = original_request.model_copy(update={'idempotency_key': f'new-{uuid4().hex}'})
            with self.assertRaises(HTTPException) as blocked:
                create_review(new_attempt, request, self.db, self.actor)
            self.assertEqual(blocked.exception.detail['code'], 'PRACTICE_DISABLED')
            self.db.rollback()
            self.assertEqual(self.db.query(PracticeAttempt).filter(PracticeAttempt.session_id == session.id).count(), 1)
