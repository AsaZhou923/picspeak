from __future__ import annotations

from concurrent.futures import Future
from datetime import datetime, timezone
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from starlette.requests import Request

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import Settings
from app.core.security import sign_payload, verify_payload
from app.db.models import UserPlan
from app.main import _should_capture_audit_body, _should_skip_audit
from app.api.routers.review_support import _attach_billing_info
from app.services.ai import AIJSONResponse, SCORE_VERSION, run_ai_review
from app.services.guard import _enforce_scope_rate_limit
from app.services.worker import ReviewWorker
from scripts.generate_activation_codes import build_insert_sql


def _request(
    *,
    method: str = 'POST',
    path: str = '/api/v1/reviews',
    headers: dict[str, str] | None = None,
) -> Request:
    return Request(
        {
            'type': 'http',
            'method': method,
            'path': path,
            'headers': [
                (key.lower().encode('latin-1'), value.encode('latin-1'))
                for key, value in (headers or {}).items()
            ],
            'client': ('127.0.0.1', 12345),
            'scheme': 'http',
            'server': ('testserver', 80),
        }
    )


class ReviewHardeningTests(unittest.TestCase):
    def test_rate_limit_increment_uses_postgresql_atomic_upsert(self) -> None:
        db = MagicMock()
        db.execute.return_value.scalar_one_or_none.return_value = 3

        result = _enforce_scope_rate_limit(
            db,
            scope='guest_api_minute',
            scope_key='guest:abc',
            endpoint='test',
            per_minute_limit=4,
            window_start=datetime(2026, 5, 23, 1, 2, tzinfo=timezone.utc),
            window_seconds=60,
        )

        statement = db.execute.call_args.args[0]
        compiled = str(statement.compile(dialect=postgresql.dialect()))
        self.assertIn('ON CONFLICT ON CONSTRAINT uq_rate_limit_window DO UPDATE', compiled)
        self.assertIn('hit_count = (rate_limit_counters.hit_count +', compiled)
        self.assertIn('WHERE rate_limit_counters.hit_count <', compiled)
        self.assertEqual(result['remaining'], 1)

    def test_rate_limit_raises_when_atomic_update_is_blocked_by_limit(self) -> None:
        db = MagicMock()
        db.execute.return_value.scalar_one_or_none.return_value = None

        with self.assertRaises(HTTPException) as raised:
            _enforce_scope_rate_limit(
                db,
                scope='guest_api_minute',
                scope_key='guest:abc',
                endpoint='test',
                per_minute_limit=4,
                window_start=datetime(2026, 5, 23, 1, 2, tzinfo=timezone.utc),
                window_seconds=60,
            )

        self.assertEqual(raised.exception.status_code, 429)

    def test_audit_skips_upload_and_photo_binary_paths(self) -> None:
        self.assertTrue(_should_skip_audit('/api/v1/uploads/presign'))
        self.assertTrue(_should_skip_audit('/api/v1/photos'))
        self.assertTrue(_should_skip_audit('/api/v1/photos/pho_123/image'))
        self.assertFalse(_should_skip_audit('/api/v1/reviews'))

    def test_audit_body_capture_rejects_large_or_binary_requests(self) -> None:
        self.assertFalse(
            _should_capture_audit_body(
                _request(headers={'content-length': str(8 * 1024), 'content-type': 'application/json'})
            )
        )
        self.assertFalse(
            _should_capture_audit_body(
                _request(headers={'content-length': '512', 'content-type': 'multipart/form-data; boundary=x'})
            )
        )
        self.assertTrue(
            _should_capture_audit_body(
                _request(headers={'content-length': '512', 'content-type': 'application/json'})
            )
        )

    def test_worker_shutdown_drains_completed_generation_futures(self) -> None:
        worker = ReviewWorker(worker_name='test-worker')
        future: Future[object] = Future()
        future.set_result({'result': 'ok'})
        worker._gen_futures = [future]

        worker._drain_generation_futures()
        worker._gen_executor.shutdown(wait=False, cancel_futures=True)

        self.assertEqual(worker._gen_futures, [])

    def test_activation_code_sql_uses_driver_quoting_for_text_values(self) -> None:
        sql = build_insert_sql(
            ['PSCN-ABCD-EFGH-JKLM'],
            batch_id="batch'); drop table billing_activation_codes; --",
            duration_days=30,
            source="ifdian'); select pg_sleep(10); --",
        )

        self.assertIn("batch''); drop table billing_activation_codes; --", sql)
        self.assertIn("ifdian''); select pg_sleep(10); --", sql)
        self.assertNotIn("batch'); drop table", sql)
        self.assertNotIn("ifdian'); select", sql)

    def test_payload_purpose_is_enforced_when_requested(self) -> None:
        token = sign_payload({'uid': 'usr_test'}, ttl_seconds=60, purpose='photo_proxy')

        self.assertEqual(verify_payload(token, expected_purpose='photo_proxy')['purpose'], 'photo_proxy')
        with self.assertRaises(HTTPException) as raised:
            verify_payload(token, expected_purpose='upload_confirm')

        self.assertEqual(raised.exception.status_code, 400)

    def test_remote_dev_with_default_secrets_is_rejected(self) -> None:
        with self.assertRaises((ValidationError, ValueError)):
            Settings(
                _env_file=None,
                app_env='dev',
                frontend_origin='https://picspeak.app',
                backend_cors_origins=['https://picspeak.app'],
                database_url='postgresql+psycopg2://postgres:postgres@db.example.com:5432/picspeak',
                app_secret='change-me',
                oauth_jwt_secret='change-me-jwt-secret',
            )

    def test_run_ai_review_accepts_story_score_alias_before_locking_scores(self) -> None:
        with patch('app.services.ai.settings.ai_api_key', 'test-key'), patch(
            'app.services.ai.model_name_for_mode',
            side_effect=lambda mode: 'qwen3.5-plus' if mode == 'pro' else 'qwen3.5-flash',
        ), patch(
            'app.services.ai._request_multimodal_json',
            side_effect=[
                AIJSONResponse(
                    parsed={'scores': {'composition': 6, 'lighting': 5, 'color': 5, 'story': 4, 'technical': 7}},
                    model_name='qwen3.5-flash',
                    usage={},
                    latency_ms=1,
                ),
                AIJSONResponse(
                    parsed={
                        'advantage': '1. clear subject',
                        'critique': '1. flat light',
                        'suggestions': '1. Observation: flat foreground; Reason: weak separation; Action: lower the camera.',
                    },
                    model_name='qwen3.5-plus',
                    usage={},
                    latency_ms=1,
                ),
            ],
        ):
            response = run_ai_review(
                mode='pro',
                image_url='https://example.com/photo.jpg',
                locale='en',
                image_type='default',
            )

        self.assertEqual(response.result.scores['impact'], 4)
        self.assertEqual(response.result.final_score, 5.4)
        self.assertEqual(response.result.score_version, SCORE_VERSION)

    def test_review_billing_info_uses_usage_snapshot_dicts(self) -> None:
        payload: dict[str, object] = {}
        user = SimpleNamespace(plan=UserPlan.free)

        with patch(
            'app.api.routers.review_support.user_usage_snapshot',
            return_value={
                'daily_remaining': 4,
                'monthly_remaining': 17,
                'pro_monthly_remaining': 2,
            },
        ):
            _attach_billing_info(payload, db=MagicMock(), user=user, charged=True)

        self.assertEqual(
            payload['billing_info'],
            {
                'quota_charged': True,
                'remaining_quota': {
                    'daily_remaining': 4,
                    'monthly_remaining': 17,
                    'pro_monthly_remaining': 2,
                },
            },
        )


if __name__ == '__main__':
    unittest.main()
