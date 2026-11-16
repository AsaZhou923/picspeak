from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import rate_limit_endpoint
from app.api.routers.auth_support import _login_from_google_claims
from app.db.models import UserPlan
from app.db.session import get_db
from app.main import app
from app.services.guard import enforce_guest_api_rate_limit

GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com'


def _google_claims(**overrides) -> dict:
    claims = {
        'email': 'owner@example.com',
        'email_verified': 'true',
        'aud': GOOGLE_CLIENT_ID,
        'iss': 'https://accounts.google.com',
    }
    claims.update(overrides)
    return claims


class GoogleTokenClaimTests(unittest.TestCase):
    def _login(self, claims: dict, *, client_id: str = GOOGLE_CLIENT_ID):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        with patch('app.api.routers.auth_support.settings.google_oauth_client_id', client_id), patch(
            'app.api.routers.auth_support.create_access_token', return_value='jwt',
        ):
            return _login_from_google_claims(claims, db), db

    def _assert_rejected(self, claims: dict, status_code: int, code: str, *, client_id: str = GOOGLE_CLIENT_ID) -> None:
        with self.assertRaises(HTTPException) as raised:
            self._login(claims, client_id=client_id)
        self.assertEqual(raised.exception.status_code, status_code)
        self.assertEqual(raised.exception.detail['code'], code)

    def test_token_issued_to_this_application_signs_in(self) -> None:
        response, db = self._login(_google_claims())
        self.assertEqual(response.access_token, 'jwt')
        db.add.assert_called_once()

    def test_token_issued_to_another_application_is_rejected(self) -> None:
        self._assert_rejected(
            _google_claims(aud='other-app.apps.googleusercontent.com'), 401, 'GOOGLE_TOKEN_AUDIENCE_INVALID',
        )

    def test_token_without_an_audience_is_rejected(self) -> None:
        claims = _google_claims()
        del claims['aud']
        self._assert_rejected(claims, 401, 'GOOGLE_TOKEN_AUDIENCE_INVALID')

    def test_unconfigured_client_rejects_every_token(self) -> None:
        # An empty audience claim must not match an empty configured client id.
        self._assert_rejected(_google_claims(aud=''), 404, 'GOOGLE_OAUTH_NOT_CONFIGURED', client_id='')
        self._assert_rejected(_google_claims(), 404, 'GOOGLE_OAUTH_NOT_CONFIGURED', client_id='  ')

    def test_token_from_another_issuer_is_rejected(self) -> None:
        self._assert_rejected(_google_claims(iss='https://example.com'), 401, 'GOOGLE_TOKEN_ISSUER_INVALID')

    def test_unverified_email_reported_as_a_string_is_rejected(self) -> None:
        # tokeninfo returns the strings "true" / "false"; "false" is truthy in Python.
        for value in ('false', 'False', '', None, 0, 'yes'):
            with self.subTest(value=value):
                self._assert_rejected(_google_claims(email_verified=value), 401, 'GOOGLE_EMAIL_UNVERIFIED')

    def test_boolean_and_string_true_are_both_accepted(self) -> None:
        for value in (True, 'true', 'TRUE'):
            with self.subTest(value=value):
                response, _db = self._login(_google_claims(email_verified=value))
                self.assertEqual(response.access_token, 'jwt')


class GoogleLoginRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        self.addCleanup(app.dependency_overrides.clear)
        audit = patch('app.main._persist_audit_log')
        audit.start()
        self.addCleanup(audit.stop)

    def test_route_is_unavailable_and_calls_nothing_when_google_is_not_configured(self) -> None:
        with patch('app.api.routers.auth.settings.google_oauth_client_id', ''), patch(
            'app.api.routers.auth._google_token_info',
        ) as token_info, TestClient(app) as client:
            response = client.post('/api/v1/auth/google/login', json={'id_token': 'any.google.token'})

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'GOOGLE_OAUTH_NOT_CONFIGURED')
        token_info.assert_not_called()

    def test_route_rejects_a_token_for_another_application(self) -> None:
        self.db.execute.return_value.scalar_one_or_none.return_value = 1
        with patch('app.api.routers.auth.settings.google_oauth_client_id', GOOGLE_CLIENT_ID), patch(
            'app.api.routers.auth_support.settings.google_oauth_client_id', GOOGLE_CLIENT_ID,
        ), patch(
            'app.api.routers.auth._google_token_info',
            return_value=_google_claims(aud='other-app.apps.googleusercontent.com'),
        ), TestClient(app) as client:
            response = client.post('/api/v1/auth/google/login', json={'id_token': 'any.google.token'})

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['error']['code'], 'GOOGLE_TOKEN_AUDIENCE_INVALID')
        self.db.add.assert_not_called()


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
