from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import BaseModel, ValidationError
from starlette.requests import Request as StarletteRequest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers import uploads
from app.api.routers.analytics import track_product_analytics_event
from app.api.routers.auth import auth_clerk_exchange
from app.core.errors import api_error
from app.core.request_limits import RequestBodyLimitMiddleware
from app.db.models import UserPlan
from app.main import _should_capture_audit_body
from app.schemas import PresignRequest, ProductAnalyticsTrackRequest
from app.services import clerk_auth
from app.services.guard import request_rate_limit_scope_key


def _request(path: str = '/api/v1/analytics/events', client_host: str = '203.0.113.10') -> StarletteRequest:
    return StarletteRequest({
        'type': 'http',
        'method': 'POST',
        'path': path,
        'headers': [],
        'client': (client_host, 1234),
        'scheme': 'https',
        'server': ('api.example.com', 443),
        'query_string': b'',
    })


class _Body(BaseModel):
    value: str


def _limited_app(limit: int) -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestBodyLimitMiddleware, max_body_bytes=limit)

    @app.post('/raw')
    async def raw(request: Request):
        return {'size': len(await request.body())}

    @app.post('/model')
    def model(body: _Body):
        return {'size': len(body.value)}

    return app


class RequestBodyLimitTests(unittest.TestCase):
    def test_declared_oversized_body_is_rejected_before_the_route(self) -> None:
        with TestClient(_limited_app(64)) as client:
            response = client.post('/raw', content=b'x' * 65)

        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()['error']['code'], 'REQUEST_TOO_LARGE')

    def test_streamed_body_without_length_is_counted(self) -> None:
        def chunks():
            for _ in range(10):
                yield b'x' * 16

        with TestClient(_limited_app(64)) as client:
            raw = client.post('/raw', content=chunks())
            parsed = client.post('/model', content=chunks(), headers={'content-type': 'application/json'})

        self.assertEqual(raw.status_code, 413)
        self.assertEqual(parsed.status_code, 413)

    def test_bodies_within_the_limit_pass(self) -> None:
        with TestClient(_limited_app(64)) as client:
            response = client.post('/model', json={'value': 'hello'})

        self.assertEqual(response.status_code, 200)

    def test_zero_disables_the_limit(self) -> None:
        with TestClient(_limited_app(0)) as client:
            response = client.post('/raw', content=b'x' * 4096)

        self.assertEqual(response.json(), {'size': 4096})


class AnalyticsLimitTests(unittest.TestCase):
    def test_metadata_must_stay_small(self) -> None:
        ProductAnalyticsTrackRequest(event_name='page_view', metadata={'source': 'home', 'nested': {'a': [1, 2]}})
        for metadata in (
            {f'k{index}': index for index in range(51)},
            {'a': {'b': {'c': {'d': {'e': 1}}}}},
            {'blob': 'x' * 9000},
        ):
            with self.subTest(keys=len(metadata)), self.assertRaises(ValidationError):
                ProductAnalyticsTrackRequest(event_name='page_view', metadata=metadata)

    def test_scope_key_is_per_account_for_users_and_per_network_otherwise(self) -> None:
        request = _request()
        user = SimpleNamespace(public_id='usr_member', plan=UserPlan.free)
        guest = SimpleNamespace(public_id='gst_visitor', plan=UserPlan.guest)

        self.assertEqual(request_rate_limit_scope_key(request, user), 'user:usr_member')
        network_key = request_rate_limit_scope_key(request, None)
        self.assertTrue(network_key.startswith('guest:'))
        self.assertEqual(request_rate_limit_scope_key(request, guest), network_key)

    def test_anonymous_events_are_rate_limited_per_network(self) -> None:
        payload = ProductAnalyticsTrackRequest(event_name='page_view', metadata={})
        db = MagicMock()

        with (
            patch('app.api.routers.analytics.enforce_minute_rate_limit') as limit,
            patch('app.api.routers.analytics.normalize_stage_a_event_name', return_value='page_view'),
            patch('app.api.routers.analytics.record_product_event'),
        ):
            track_product_analytics_event(payload, _request(), db, None, None)

        limit.assert_called_once()
        self.assertEqual(limit.call_args.kwargs['scope'], 'analytics_event_minute')
        self.assertTrue(limit.call_args.kwargs['scope_key'].startswith('guest:'))
        self.assertEqual(limit.call_args.kwargs['limit'], 120)


class ClerkAbuseLimitTests(unittest.TestCase):
    def setUp(self) -> None:
        clerk_auth._jwks_cache.update({'expires_at': 0.0, 'keys': [], 'forced_at': 0.0})

    def tearDown(self) -> None:
        clerk_auth._jwks_cache.update({'expires_at': 0.0, 'keys': [], 'forced_at': 0.0})

    def test_forced_jwks_refresh_has_a_cooldown(self) -> None:
        keys = [{'kid': 'kid_live', 'n': 'abc', 'e': 'AQAB'}]
        # Each fetch reads the clock before and inside the cache lock.
        clock = [1000.0, 1000.0, 1005.0, 1005.0, 1010.0, 1010.0, 1036.0, 1036.0]
        with patch('app.services.clerk_auth._clerk_request', return_value={'keys': keys}) as upstream, patch(
            'app.services.clerk_auth.time.time', side_effect=clock,
        ):
            clerk_auth._fetch_jwks()
            clerk_auth._fetch_jwks(force_refresh=True)
            clerk_auth._fetch_jwks(force_refresh=True)
            clerk_auth._fetch_jwks(force_refresh=True)

        # Initial fetch, the first forced refresh, and one after the 30s cooldown;
        # the forced refresh 5s after the previous one is served from cache.
        self.assertEqual(upstream.call_count, 3)

    def test_exchange_counts_rejected_tokens_toward_the_limit(self) -> None:
        db = MagicMock()
        order = MagicMock()
        order.attach_mock(db.commit, 'commit')

        def reject(_token):
            order.verify()
            raise api_error(401, 'CLERK_TOKEN_INVALID', 'Invalid Clerk session token')

        with (
            patch('app.api.routers.auth.enforce_minute_rate_limit', side_effect=lambda *a, **k: order.limit()),
            patch('app.api.routers.auth.verify_clerk_session_token', side_effect=reject),
        ):
            with self.assertRaises(Exception):
                auth_clerk_exchange(_request('/api/v1/auth/clerk/exchange'), MagicMock(), None, db, 'Bearer forged')

        self.assertEqual(order.mock_calls[:3], [call.limit(), call.commit(), call.verify()])


class AuditBodyTests(unittest.TestCase):
    def test_redeem_request_bodies_are_not_captured(self) -> None:
        for path in ('/api/v1/billing/activation-code/redeem', '/api/v1/billing/image-credit-code/redeem'):
            with self.subTest(path=path):
                self.assertFalse(_should_capture_audit_body(_request(path)))


class UploadHardeningTests(unittest.TestCase):
    def _presign(self, filename: str, content_type: str) -> str:
        storage = MagicMock()
        storage.generate_presigned_url.return_value = 'https://storage.example.com/put'
        actor = SimpleNamespace(user=SimpleNamespace(public_id='usr_upload', plan=UserPlan.free))
        with (
            patch('app.api.routers.uploads.get_object_storage_client', return_value=storage),
            patch('app.api.routers.uploads.enforce_minute_rate_limit') as limit,
        ):
            response = uploads.create_upload_presign(
                PresignRequest(filename=filename, content_type=content_type, size_bytes=1024),
                _request('/api/v1/uploads/presign'),
                MagicMock(),
                actor,
            )
        self.assertEqual(limit.call_args.kwargs['scope_key'], 'user:usr_upload')
        return response.object_key

    def test_object_extension_follows_the_content_type(self) -> None:
        self.assertTrue(self._presign('photo.html', 'image/png').endswith('.png'))
        self.assertTrue(self._presign('no-extension', 'image/webp').endswith('.webp'))
        self.assertTrue(self._presign('photo.jpeg.svg', 'image/jpeg').endswith('.jpg'))

    def _confirm_failure(self, error, *, referenced: bool = False) -> MagicMock:
        storage = MagicMock()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = object() if referenced else None
        token = {'bucket': 'photos', 'object_key': 'user_usr_upload/obj.jpg'}
        with (
            patch('app.api.routers.uploads._verify_uploaded_object', side_effect=error),
            patch('app.api.routers.uploads.get_object_storage_client', return_value=storage),
        ):
            with self.assertRaises(type(error)):
                uploads._verify_uploaded_object_or_discard(db, token)
        return storage

    def test_rejected_upload_content_is_deleted(self) -> None:
        storage = self._confirm_failure(api_error(400, 'UPLOAD_IMAGE_INVALID', 'invalid'))

        storage.delete_object.assert_called_once_with(Bucket='photos', Key='user_usr_upload/obj.jpg')

    def test_transient_or_missing_uploads_are_kept(self) -> None:
        for error in (
            api_error(503, 'UPLOAD_VERIFICATION_FAILED', 'unavailable'),
            api_error(400, 'UPLOAD_NOT_FOUND', 'missing'),
            api_error(409, 'UPLOAD_CONTENT_MISMATCH', 'changed'),
        ):
            with self.subTest(code=error.detail['code']):
                self._confirm_failure(error).delete_object.assert_not_called()

    def test_referenced_objects_are_never_deleted(self) -> None:
        storage = self._confirm_failure(api_error(400, 'UPLOAD_IMAGE_INVALID', 'invalid'), referenced=True)

        storage.delete_object.assert_not_called()


if __name__ == '__main__':
    unittest.main()
