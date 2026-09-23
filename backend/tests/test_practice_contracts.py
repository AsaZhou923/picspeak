from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.auth_support import _migrate_guest_records
from app.api.routers.review_create import _matches_request_hash, _review_request_hash_payload, create_review
from app.api.routers.review_support import _review_result_payload
from app.db.models import PhotoStatus, PracticeAttempt, PracticeFeedback, PracticeSession, Review, ReviewTask, TaskStatus, UserPlan, UserStatus
from app.goal_assessment import GOAL_ASSESSMENT_VERSION, GoalAssessmentContext
from app.practice_schemas import PracticeSessionCreateRequest
from app.schemas import ReviewCreateRequest
from app.services.guard import hash_request
from app.services.practice import PracticeTaskContext, canonical_practice_request_hash, resolve_task_practice


class _FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def all(self):
        return self.rows


class PracticeContractTests(unittest.TestCase):
    def test_exact_pre_practice_idempotency_record_remains_replayable(self) -> None:
        payload = ReviewCreateRequest(photo_id='pho_legacy', mode='flash', idempotency_key='legacy-key')
        legacy = payload.model_dump(by_alias=True, exclude={'practice_session_id'})
        legacy_hash = hash_request(json.dumps(legacy, ensure_ascii=False, sort_keys=True))
        current_hash = hash_request(json.dumps(
            _review_request_hash_payload(MagicMock(), SimpleNamespace(), payload), ensure_ascii=False, sort_keys=True,
        ))
        self.assertNotEqual(legacy_hash, current_hash)
        self.assertTrue(_matches_request_hash(legacy_hash, current_hash, payload))
        different = payload.model_copy(update={'photo_id': 'pho_other'})
        self.assertFalse(_matches_request_hash(legacy_hash, 'other-hash', different))

    def test_session_schema_matches_goal_assessment_context_constraints(self) -> None:
        payload = PracticeSessionCreateRequest(
            source_review_id='rev_source',
            practice_kind='capture_retake',
            goal_snapshot={'goal': 'Separate the subject from the background', 'dimension': 'composition'},
            success_criteria=[{'key': 'separation', 'label': 'Subject edge is visibly separated'}],
        )

        self.assertEqual(payload.goal_snapshot.goal_version, GOAL_ASSESSMENT_VERSION)
        context = GoalAssessmentContext(
            goal_version=payload.goal_snapshot.goal_version,
            goal=payload.goal_snapshot.goal,
            success_criteria=[item.label for item in payload.success_criteria],
            practice_kind=payload.practice_kind,
        )
        self.assertEqual(context.goal_version, GOAL_ASSESSMENT_VERSION)

    def test_session_schema_rejects_goal_context_that_worker_would_reject(self) -> None:
        with self.assertRaises(ValidationError):
            PracticeSessionCreateRequest(
                source_review_id='rev_source',
                practice_kind='capture_retake',
                goal_snapshot={'goal': 'ok', 'dimension': 'composition'},
                success_criteria=[],
            )

        with self.assertRaises(ValidationError):
            PracticeSessionCreateRequest(
                source_review_id='rev_source',
                practice_kind='capture_retake',
                goal_snapshot={'goal': '   ', 'dimension': 'composition'},
                success_criteria=[{'key': 'blank', 'label': '   '}],
            )

        with self.assertRaises(ValidationError):
            PracticeSessionCreateRequest(
                source_review_id='rev_source',
                practice_kind='capture_retake',
                goal_snapshot={'goal': 'Move closer', 'dimension': 'composition', 'extra': 'forbidden'},
                success_criteria=[{'key': 'closer', 'label': 'Subject is larger'}],
            )

    def test_task_context_exposes_comparator_goal_context_and_skips_same_image(self) -> None:
        session = SimpleNamespace(
            practice_kind='capture_retake',
            goal_snapshot={
                'goal_version': GOAL_ASSESSMENT_VERSION,
                'goal': 'Separate the head from the pole',
                'dimension': 'composition',
            },
            success_criteria=[{'key': 'overlap', 'label': 'The pole does not overlap the head'}],
            public_id='prs_1',
        )
        context = PracticeTaskContext(
            session=session,
            attempt=SimpleNamespace(public_id='pra_1'),
            source_review=SimpleNamespace(),
            source_photo=SimpleNamespace(),
        )

        self.assertIsInstance(context.goal_context, GoalAssessmentContext)
        self.assertEqual(context.goal_context.success_criteria, ['The pole does not overlap the head'])

        same_image_context = PracticeTaskContext(
            session=SimpleNamespace(practice_kind='same_image_recheck'),
            attempt=SimpleNamespace(public_id='pra_2'),
            source_review=SimpleNamespace(),
            source_photo=SimpleNamespace(),
        )
        self.assertIsNone(same_image_context.goal_context)

    def test_review_idempotency_hash_ignores_transport_key(self) -> None:
        db = MagicMock()
        actor = SimpleNamespace(user=SimpleNamespace(id=7))
        body_key = ReviewCreateRequest(photo_id='pho_1', mode='flash', idempotency_key='body-key')
        header_key = ReviewCreateRequest(photo_id='pho_1', mode='flash')

        body_hash = canonical_practice_request_hash(_review_request_hash_payload(db, actor, body_key))
        header_hash = canonical_practice_request_hash(_review_request_hash_payload(db, actor, header_key))

        self.assertEqual(body_hash, header_hash)

    def test_review_idempotency_hash_includes_frozen_practice_goal(self) -> None:
        db = MagicMock()
        actor = SimpleNamespace(user=SimpleNamespace(id=7))
        session = SimpleNamespace(
            practice_kind='capture_retake',
            source_review_id=101,
            source_photo_id=202,
            goal_snapshot={'goal_version': GOAL_ASSESSMENT_VERSION, 'goal': 'Move closer', 'dimension': 'composition'},
            success_criteria=[{'key': 'closer', 'label': 'Subject fills more of the frame'}],
            locale='en',
        )
        db.query.return_value.filter.return_value.first.return_value = session
        payload = ReviewCreateRequest(
            photo_id='pho_after',
            mode='flash',
            source_review_id='rev_source',
            practice_session_id='prs_1',
            analysis_type='retake_compare',
            idempotency_key='ignored',
        )

        hash_payload = _review_request_hash_payload(db, actor, payload)

        self.assertNotIn('idempotency_key', hash_payload)
        self.assertEqual(hash_payload['practice_frozen_goal']['goal_snapshot']['goal'], 'Move closer')

    def test_public_review_result_omits_nested_goal_assessment(self) -> None:
        stored = {
            'scores': {'composition': 7, 'lighting': 7, 'color': 7, 'impact': 7, 'technical': 7},
            'goal_assessment': {
                'goal_version': GOAL_ASSESSMENT_VERSION,
                'status': 'achieved',
                'evidence': [{'criterion': 'private target', 'observation': 'private evidence'}],
                'limitations': [],
                'next_action': 'private next target',
            },
        }

        owner_payload = _review_result_payload(stored, 7.0)
        public_payload = _review_result_payload(stored, 7.0, include_goal_assessment=False)

        self.assertIn('goal_assessment', owner_payload)
        self.assertNotIn('goal_assessment', public_payload)

    def test_async_idempotency_collision_rejects_different_hash(self) -> None:
        db = MagicMock()
        db.flush.side_effect = IntegrityError('duplicate', params=None, orig=None)
        actor = SimpleNamespace(user=SimpleNamespace(id=7, plan=UserPlan.guest), plan=UserPlan.guest)
        payload = ReviewCreateRequest(photo_id='pho_1', mode='flash', idempotency_key='same-key')
        stale_record = SimpleNamespace(request_hash='different-hash', response_json=None)

        with patch('app.api.routers.review_create._find_photo_owned', return_value=SimpleNamespace(id=1, status=PhotoStatus.READY)), patch(
            'app.api.routers.review_create.get_idempotency_record',
            side_effect=[None, stale_record],
        ), patch('app.api.routers.review_create.enforce_guest_review_limits'), patch(
            'app.api.routers.review_create.guest_rate_limit_scope_key',
            return_value='guest-rate',
        ), patch(
            'app.api.routers.review_create.guest_quota_scope_key',
            return_value='guest-quota',
        ):
            with self.assertRaises(HTTPException) as raised:
                create_review(payload, SimpleNamespace(headers={}), db, actor)

        self.assertEqual(raised.exception.detail['code'], 'IDEMPOTENCY_CONFLICT')

    def test_async_idempotency_collision_replays_existing_attempt_ids(self) -> None:
        db = MagicMock()
        db.flush.side_effect = IntegrityError('duplicate', params=None, orig=None)
        actor = SimpleNamespace(user=SimpleNamespace(id=7, plan=UserPlan.guest), plan=UserPlan.guest)
        payload = ReviewCreateRequest(photo_id='pho_1', mode='flash', idempotency_key='same-key')
        expected_hash = hash_request(json.dumps(_review_request_hash_payload(db, actor, payload), ensure_ascii=False, sort_keys=True))
        existing_task = SimpleNamespace(
            id=44,
            public_id='tsk_existing',
            status=TaskStatus.PENDING,
            request_payload={'_request_hash': expected_hash},
        )

        def query(model):
            result = MagicMock()
            if model is ReviewTask:
                result.filter.return_value.first.return_value = existing_task
            else:
                result.filter.return_value.scalar.return_value = 'pra_existing'
            return result

        db.query.side_effect = query
        with patch('app.api.routers.review_create._find_photo_owned', return_value=SimpleNamespace(id=1, status=PhotoStatus.READY)), patch(
            'app.api.routers.review_create.get_idempotency_record',
            side_effect=[None, None],
        ), patch('app.api.routers.review_create.enforce_guest_review_limits'), patch(
            'app.api.routers.review_create.guest_rate_limit_scope_key',
            return_value='guest-rate',
        ), patch(
            'app.api.routers.review_create.guest_quota_scope_key',
            return_value='guest-quota',
        ):
            response = create_review(payload, SimpleNamespace(headers={}), db, actor)

        self.assertEqual(response['task_id'], 'tsk_existing')
        self.assertEqual(response['practice_attempt_id'], 'pra_existing')

    def test_resolve_task_practice_rejects_missing_attempt_for_practice_payload(self) -> None:
        task = SimpleNamespace(request_payload={'practice_session_id': 'prs_missing'})

        with self.assertRaises(HTTPException) as raised:
            resolve_task_practice(MagicMock(), task)

        self.assertEqual(raised.exception.detail['code'], 'PRACTICE_ATTEMPT_MISSING')

    def test_guest_merge_transfers_practice_owner_and_invalidates_guest(self) -> None:
        guest = SimpleNamespace(id=10, plan=UserPlan.guest, status=UserStatus.active)
        target = SimpleNamespace(id=20)
        review = SimpleNamespace(id=101, owner_user_id=10)
        photo = SimpleNamespace(id=201, owner_user_id=10)
        task = SimpleNamespace(id=301, owner_user_id=10, idempotency_key=None)
        session = SimpleNamespace(id=401, owner_user_id=10, source_review_id=101, source_photo_id=201, idempotency_key=None)
        attempt = SimpleNamespace(id=501, owner_user_id=10, source_review_id=101, review_id=None, photo_id=201, task_id=301)
        feedback = SimpleNamespace(owner_user_id=10)
        rows = {
            Review: [review],
            PracticeSession: [session],
            PracticeAttempt: [attempt],
            PracticeFeedback: [feedback],
            ReviewTask: [task],
        }
        db = MagicMock()

        def query(*models):
            model = models[0]
            if getattr(model, '__name__', '') == 'Photo':
                return _FakeQuery([photo])
            return _FakeQuery(rows.get(model, []))

        db.query.side_effect = query
        with patch('app.api.routers.auth_support.get_user_from_token', return_value=guest):
            migrated_reviews, migrated_photos = _migrate_guest_records(
                db=db,
                target_user=target,
                guest_token='guest-token',
                recent_limit=20,
                strict=True,
            )

        self.assertEqual((migrated_reviews, migrated_photos), (1, 1))
        self.assertEqual({review.owner_user_id, photo.owner_user_id, task.owner_user_id, session.owner_user_id, attempt.owner_user_id, feedback.owner_user_id}, {20})
        self.assertEqual(guest.status, UserStatus.deleted)


if __name__ == '__main__':
    unittest.main()
