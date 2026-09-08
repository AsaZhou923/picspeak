from __future__ import annotations

from contextlib import nullcontext
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sqlalchemy.sql.elements import BinaryExpression

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.tasks import _serialize_task_status
from app.db.models import Photo, ReviewMode, ReviewTask, TaskStatus, User, UserPlan
from app.services.ai import AIReviewError, CanonicalScore
from scoring_fixtures import LOW_SCORES, score_evidence_fixture
from app.services.ai_prompts import SCORE_PROMPT_VERSION, SCORE_VERSION, SCORER_PREPROCESS_VERSION
from app.services.review_task_processor import (
    _canonical_score_event_payload,
    _claim_task,
    _process_task,
    _review_task_stale_timeout_seconds,
)


class ReviewTaskProcessorTests(unittest.TestCase):
    def test_cache_lock_contention_is_reported_as_retryable_scoring_failure(self) -> None:
        db = MagicMock()
        photo = SimpleNamespace(id=11, object_key='photo.jpg', exif_data={})
        owner = SimpleNamespace(id=22, plan=UserPlan.guest)
        task = SimpleNamespace(
            id=33, public_id='tsk_busy_score', photo_id=photo.id, owner_user_id=owner.id,
            mode=ReviewMode.flash, status=TaskStatus.RUNNING,
            request_payload={'locale': 'zh', 'image_type': 'default'},
            attempt_count=1, max_attempts=3, progress=10, next_attempt_at=None,
            last_heartbeat_at=None, error_code=None, error_message=None,
        )

        def query(model):
            mocked = MagicMock()
            if model is Photo:
                mocked.filter.return_value.first.return_value = photo
            elif model is User:
                mocked.filter.return_value.first.return_value = owner
            mocked.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
            return mocked

        db.query.side_effect = query
        db.bind = None
        db.get_bind.return_value.dialect.name = 'postgresql'
        db.execute.return_value.scalar.return_value = False
        with patch('app.services.review_task_processor._handle_failure') as failure, patch(
            'app.services.review_task_processor.run_ai_review'
        ) as run_review:
            _process_task(db, task)

        run_review.assert_not_called()
        self.assertEqual(failure.call_args.kwargs['error_code'], 'AI_SCORING_FAILED')
        self.assertTrue(failure.call_args.kwargs['retryable'])

    def test_serialize_task_status_hides_internal_ai_failure_details(self) -> None:
        task = SimpleNamespace(
            public_id='tsk_123',
            status=TaskStatus.PENDING,
            progress=0,
            review_id=None,
            attempt_count=1,
            max_attempts=3,
            next_attempt_at='2026-04-19T00:00:00+00:00',
            last_heartbeat_at=None,
            started_at=None,
            finished_at=None,
            error_code='AI_CALL_FAILED',
            error_message='AI provider HTTP 500: leaked upstream detail',
        )

        payload = _serialize_task_status(task)

        self.assertIsNotNone(payload['error'])
        self.assertEqual(payload['error']['message'], 'AI review is temporarily unavailable; retry scheduled')
        self.assertTrue(payload['error']['retryable'])

    def test_claim_task_consumes_one_attempt_when_claimed(self) -> None:
        db = MagicMock()
        update_query = MagicMock()
        fetch_query = MagicMock()
        db.query.side_effect = [update_query, fetch_query]
        update_filter = update_query.filter.return_value
        update_filter.update.return_value = 1
        fetch_query.filter.return_value.first.return_value = SimpleNamespace(id=42, public_id='tsk_123')

        with patch('app.services.review_task_processor.record_task_event'):
            claimed = _claim_task(db, 42, 'worker-1')

        self.assertTrue(claimed)
        payload = update_filter.update.call_args.args[0]
        self.assertIn(ReviewTask.attempt_count, payload)
        self.assertIsNone(payload[ReviewTask.error_code])
        self.assertIsNone(payload[ReviewTask.error_message])
        attempt_expr = payload[ReviewTask.attempt_count]
        self.assertIsInstance(attempt_expr, BinaryExpression)
        self.assertEqual(getattr(attempt_expr.left, 'name', None), ReviewTask.attempt_count.key)
        self.assertEqual(getattr(attempt_expr.right, 'value', None), 1)

    def test_review_task_stale_timeout_covers_scorer_and_writer_calls(self) -> None:
        with patch('app.services.review_task_processor.settings') as mocked_settings:
            mocked_settings.review_task_stale_timeout_seconds = 180
            mocked_settings.openai_score_timeout_seconds = 180
            mocked_settings.openai_review_timeout_seconds = 180
            mocked_settings.pro_ai_timeout_seconds = 180
            mocked_settings.ai_timeout_seconds = 60
            mocked_settings.retake_analysis_timeout_seconds = 180

            self.assertEqual(_review_task_stale_timeout_seconds(), 600)

    def test_serialize_task_status_identifies_writer_failure_stage(self) -> None:
        task = SimpleNamespace(
            public_id='tsk_123',
            status=TaskStatus.PENDING,
            progress=0,
            review_id=None,
            attempt_count=1,
            max_attempts=3,
            next_attempt_at='2026-09-05T08:00:00+00:00',
            last_heartbeat_at=None,
            started_at=None,
            finished_at=None,
            error_code='AI_WRITING_FAILED',
            error_message='AI writing is temporarily unavailable; retry scheduled',
        )

        payload = _serialize_task_status(task)

        self.assertEqual(payload['error']['failure_stage'], 'ai_writing')
        self.assertTrue(payload['error']['retryable'])

    def test_writer_retry_reuses_checkpointed_score(self) -> None:
        db = MagicMock()
        photo = SimpleNamespace(id=11, object_key='photo.jpg', exif_data={})
        owner = SimpleNamespace(id=22, plan=UserPlan.guest)
        task = SimpleNamespace(
            id=33,
            public_id='tsk_retry',
            photo_id=photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.flash,
            status=TaskStatus.RUNNING,
            request_payload={'locale': 'zh', 'image_type': 'default', 'review_model': 'qwen'},
            attempt_count=1,
            max_attempts=3,
            progress=10,
            next_attempt_at=None,
            last_heartbeat_at=None,
            error_code=None,
            error_message=None,
        )

        def query(model):
            query_mock = MagicMock()
            if model is Photo:
                query_mock.filter.return_value.first.return_value = photo
            elif model is User:
                query_mock.filter.return_value.first.return_value = owner
            return query_mock

        db.query.side_effect = query
        score = CanonicalScore(
            scores={'composition': 7, 'lighting': 6, 'color': 6, 'impact': 5, 'technical': 6},
            score_evidence=score_evidence_fixture(LOW_SCORES),
            final_score=6.0,
            model_name='gpt-5.6-luna',
            model_version='gpt-5.6-luna-2026-08-01',
            score_prompt_version=SCORE_PROMPT_VERSION,
            score_version=SCORE_VERSION,
            preprocess_version=SCORER_PREPROCESS_VERSION,
            input_tokens=100,
            output_tokens=20,
            latency_ms=1000,
        )
        scorer_calls = 0

        def fail_writer(*args, canonical_score=None, on_canonical_score=None, **kwargs):
            nonlocal scorer_calls
            if canonical_score is None:
                scorer_calls += 1
                on_canonical_score(score)
            raise AIReviewError('writer timed out', stage='writing')

        with patch('app.services.review_task_processor.settings.cloud_tasks_enabled', False), patch(
            'app.services.review_task_processor.canonical_score_cache_lease',
            return_value=nullcontext(None),
        ) as cache_lease, patch(
            'app.services.review_task_processor.run_ai_review', side_effect=fail_writer
        ):
            _process_task(db, task)
            task.status = TaskStatus.RUNNING
            task.attempt_count = 2
            _process_task(db, task)

        self.assertEqual(scorer_calls, 1)
        cache_lease.assert_called_once()
        self.assertEqual(task.error_code, 'AI_WRITING_FAILED')

    def test_score_checkpoint_event_includes_estimated_cost(self) -> None:
        score = CanonicalScore(
            scores={'composition': 7, 'lighting': 6, 'color': 6, 'impact': 5, 'technical': 6},
            score_evidence=score_evidence_fixture(LOW_SCORES),
            final_score=6.0,
            model_name='gpt-5.6-luna',
            model_version='gpt-5.6-luna-2026-08-01',
            score_prompt_version=SCORE_PROMPT_VERSION,
            score_version=SCORE_VERSION,
            preprocess_version=SCORER_PREPROCESS_VERSION,
            input_tokens=3590,
            output_tokens=414,
            latency_ms=10_000,
        )

        with patch('app.services.review_task_processor.settings.review_pricing_overrides', {}):
            payload = _canonical_score_event_payload(score)

        self.assertGreater(payload['estimated_cost_usd'], 0)
        self.assertIn('openai:gpt-5.6-luna', payload['cost_rate_version'])


if __name__ == '__main__':
    unittest.main()
