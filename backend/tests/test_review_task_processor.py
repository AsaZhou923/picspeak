from __future__ import annotations

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
from app.db.models import ReviewTask, TaskStatus
from app.services.review_task_processor import _claim_task


class ReviewTaskProcessorTests(unittest.TestCase):
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
        attempt_expr = payload[ReviewTask.attempt_count]
        self.assertIsInstance(attempt_expr, BinaryExpression)
        self.assertEqual(getattr(attempt_expr.left, 'name', None), ReviewTask.attempt_count.key)
        self.assertEqual(getattr(attempt_expr.right, 'value', None), 1)


if __name__ == '__main__':
    unittest.main()
