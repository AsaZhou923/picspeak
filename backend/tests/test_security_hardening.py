from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import rate_limit_endpoint
from app.db.models import UserPlan
from app.services.guard import enforce_guest_api_rate_limit

class GuestApiRateLimitTests(unittest.TestCase):
    def test_rate_limit_endpoint_is_the_route_template_not_the_url(self) -> None:
        router = APIRouter(prefix='/api/v1')

        @router.get('/tasks/{task_id}')
        def read_task(task_id: str, endpoint: str = Depends(rate_limit_endpoint)):
            return {'endpoint': endpoint}

        probe = FastAPI()
        probe.include_router(router)
        with TestClient(probe) as client:
            first = client.get('/api/v1/tasks/tsk_aaa').json()['endpoint']
            second = client.get('/api/v1/tasks/tsk_bbb').json()['endpoint']

        self.assertEqual(first, '/api/v1/tasks/{task_id}')
        self.assertEqual(second, first)

    def test_rate_limit_endpoint_without_a_matched_route(self) -> None:
        request = Request({'type': 'http', 'method': 'GET', 'path': '/x', 'headers': []})
        self.assertEqual(rate_limit_endpoint(request), 'unmatched')

    def test_guest_requests_count_against_route_and_overall_buckets(self) -> None:
        actor = SimpleNamespace(plan=UserPlan.guest)
        with patch('app.services.guard.settings.guest_api_rate_limit_per_minute', 60), patch(
            'app.services.guard.settings.guest_api_total_rate_limit_per_minute', 240,
        ), patch('app.services.guard._enforce_scope_rate_limit', return_value={'remaining': 1}) as enforce:
            limits = enforce_guest_api_rate_limit(MagicMock(), actor, '/api/v1/tasks/{task_id}', 'guest:abc')

        self.assertEqual(set(limits), {'guest_api_minute', 'guest_api_total_minute'})
        route_call, total_call = (call.kwargs for call in enforce.call_args_list)
        self.assertEqual(
            (route_call['scope'], route_call['endpoint'], route_call['per_minute_limit']),
            ('guest_api_minute', '/api/v1/tasks/{task_id}', 60),
        )
        self.assertEqual(
            (total_call['scope'], total_call['endpoint'], total_call['per_minute_limit']),
            ('guest_api_total_minute', 'guest_api', 240),
        )
        self.assertEqual(total_call['scope_key'], 'guest:abc')

    def test_overall_bucket_can_be_disabled(self) -> None:
        actor = SimpleNamespace(plan=UserPlan.guest)
        with patch('app.services.guard.settings.guest_api_total_rate_limit_per_minute', 0), patch(
            'app.services.guard._enforce_scope_rate_limit', return_value={'remaining': 1},
        ) as enforce:
            limits = enforce_guest_api_rate_limit(MagicMock(), actor, '/api/v1/reviews', 'guest:abc')

        self.assertEqual(set(limits), {'guest_api_minute'})
        enforce.assert_called_once()

    def test_registered_users_are_not_limited_by_guest_buckets(self) -> None:
        actor = SimpleNamespace(plan=UserPlan.free)
        with patch('app.services.guard._enforce_scope_rate_limit') as enforce:
            self.assertEqual(enforce_guest_api_rate_limit(MagicMock(), actor, '/api/v1/reviews', 'guest:abc'), {})
        enforce.assert_not_called()


if __name__ == '__main__':
    unittest.main()
