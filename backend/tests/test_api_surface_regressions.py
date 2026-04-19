from __future__ import annotations

import sys
import unittest
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException, Response, status
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import bind_guest_token, get_current_actor
from app.core.errors import api_error
from app.db.models import User, UserPlan, UserStatus
from app.db.session import get_db
from app.main import app


class ApiSurfaceRegressionTests(unittest.TestCase):
    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    @contextmanager
    def _client(self):
        with patch('app.main.worker.start'), patch('app.main.worker.stop'):
            with TestClient(app) as client:
                yield client

    def test_cors_preflight_limits_configured_methods_and_headers(self) -> None:
        with self._client() as client:
            response = client.options(
                '/healthz',
                headers={
                    'Origin': 'http://localhost:3000',
                    'Access-Control-Request-Method': 'POST',
                    'Access-Control-Request-Headers': 'Authorization, Content-Type, X-Requested-With, Idempotency-Key, X-Guest-Access-Token, X-Device-Id',
                },
            )

        self.assertEqual(response.status_code, 200)
        allow_methods = {item.strip() for item in response.headers['access-control-allow-methods'].split(',')}
        self.assertEqual(allow_methods, {'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'})

        allow_headers = {item.strip().lower() for item in response.headers['access-control-allow-headers'].split(',')}
        self.assertNotIn('*', allow_headers)
        self.assertTrue(
            {
                'authorization',
                'content-type',
                'x-requested-with',
                'idempotency-key',
                'x-guest-access-token',
                'x-device-id',
            }.issubset(allow_headers)
        )

    def test_cors_preflight_rejects_disallowed_method(self) -> None:
        with self._client() as client:
            response = client.options(
                '/healthz',
                headers={
                    'Origin': 'http://localhost:3000',
                    'Access-Control-Request-Method': 'TRACE',
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn('Disallowed CORS method', response.text)

    def test_guest_cookie_forces_lax_same_site_in_dev(self) -> None:
        response = Response()

        with patch('app.api.deps.settings.app_env', 'dev'), patch('app.api.deps.settings.cookie_samesite', 'none'):
            bind_guest_token(response, 'guest-token')

        cookie_header = response.headers['set-cookie'].lower()
        self.assertIn('samesite=lax', cookie_header)
        self.assertNotIn('secure', cookie_header)

    def test_guest_cookie_allows_none_same_site_in_non_dev(self) -> None:
        response = Response()

        with patch('app.api.deps.settings.app_env', 'prod'), patch('app.api.deps.settings.cookie_samesite', 'none'):
            bind_guest_token(response, 'guest-token')

        cookie_header = response.headers['set-cookie'].lower()
        self.assertIn('samesite=none', cookie_header)
        self.assertIn('secure', cookie_header)

    def test_clerk_webhook_conflict_returns_200_duplicate(self) -> None:
        db = MagicMock()
        event = SimpleNamespace(type='user.updated', data={}, event_attributes=None)

        def override_db():
            yield db

        app.dependency_overrides[get_db] = override_db

        with patch('app.api.routers.auth.verify_clerk_webhook', new=AsyncMock(return_value=event)), patch(
            'app.api.routers.auth._process_clerk_webhook_event',
            side_effect=HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={'code': 'CLERK_ACCOUNT_CONFLICT', 'message': 'duplicate'},
            ),
        ):
            with self._client() as client:
                response = client.post('/api/v1/webhooks/clerk', json={'type': 'user.updated', 'data': {}})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['outcome'], 'ignored_duplicate')
        db.rollback.assert_called_once()

    def test_clerk_webhook_auth_processing_errors_return_400(self) -> None:
        event = SimpleNamespace(type='user.updated', data={}, event_attributes=None)

        for failing_status in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN):
            with self.subTest(failing_status=failing_status):
                db = MagicMock()

                def override_db():
                    yield db

                app.dependency_overrides[get_db] = override_db

                with patch('app.api.routers.auth.verify_clerk_webhook', new=AsyncMock(return_value=event)), patch(
                    'app.api.routers.auth._process_clerk_webhook_event',
                    side_effect=HTTPException(
                        status_code=failing_status,
                        detail={'code': 'AUTH_FAILURE', 'message': 'unexpected auth failure'},
                    ),
                ):
                    with self._client() as client:
                        response = client.post('/api/v1/webhooks/clerk', json={'type': 'user.updated', 'data': {}})

                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()['error']['code'], 'WEBHOOK_PROCESSING_ERROR')
                db.rollback.assert_called_once()
                app.dependency_overrides.clear()

    def test_activation_code_endpoint_stops_on_rate_limit(self) -> None:
        db = MagicMock()
        user = User(
            id=21,
            public_id='usr_rate_limited',
            email='rate@example.com',
            username='rate_user',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        actor = SimpleNamespace(user=user, plan=UserPlan.free)

        def override_db():
            yield db

        def override_actor():
            return actor

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor

        rate_limit_error = api_error(status.HTTP_429_TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Too many activation attempts')

        with patch('app.api.routers.billing.enforce_activation_code_rate_limit', side_effect=rate_limit_error) as enforce_limit, patch(
            'app.api.routers.billing.redeem_activation_code_for_user'
        ) as redeem_code:
            with self._client() as client:
                response = client.post(
                    '/api/v1/billing/activation-code/redeem',
                    json={'code': 'PSCN-ABCD-EFGH-JKLM'},
                )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()['error']['code'], 'RATE_LIMITED')
        enforce_limit.assert_called_once_with(db, user)
        redeem_code.assert_not_called()


if __name__ == '__main__':
    unittest.main()
