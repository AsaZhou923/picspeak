from __future__ import annotations

import sys
import unittest
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException, Response, status
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import bind_guest_token, get_current_actor
from app.core.errors import api_error
from app.core.security import verify_payload
from app.db.models import UsageLedger, User, UserPlan, UserStatus
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
                    'Access-Control-Request-Headers': 'Authorization, Content-Type, X-Requested-With, Idempotency-Key, X-Guest-Access-Token, X-Device-Id, Cache-Control, Pragma',
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
                'cache-control',
                'pragma',
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

    def test_dev_cors_preflight_allows_localhost_dev_ports_for_polling(self) -> None:
        with self._client() as client:
            response = client.options(
                '/api/v1/generation-tasks/igt_test',
                headers={
                    'Origin': 'http://localhost:3002',
                    'Access-Control-Request-Method': 'GET',
                    'Access-Control-Request-Headers': 'Authorization, Cache-Control, Pragma',
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:3002')

    def test_uploads_presign_returns_object_key_in_response(self) -> None:
        db = MagicMock()
        actor = SimpleNamespace(user=SimpleNamespace(public_id='usr_upload_test'))
        storage = MagicMock()
        storage.generate_presigned_url.return_value = 'https://storage.example.com/presigned-put'

        def override_db():
            yield db

        def override_actor():
            return actor

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor

        with patch('app.api.routers.uploads.get_object_storage_client', return_value=storage):
            with self._client() as client:
                response = client.post(
                    '/api/v1/uploads/presign',
                    json={
                        'filename': 'sample.jpg',
                        'content_type': 'image/jpeg',
                        'size_bytes': 1024,
                    },
                )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn('object_key', body)
        self.assertTrue(body['object_key'].startswith('user_usr_upload_test/'))
        self.assertEqual(body['put_url'], 'https://storage.example.com/presigned-put')

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

    def test_image_credit_code_redeem_requires_signed_in_user(self) -> None:
        db = MagicMock()
        user = User(
            id=22,
            public_id='usr_credit_guest',
            email='guest-credit@example.com',
            username='guest_credit',
            plan=UserPlan.guest,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )

        def override_db():
            yield db

        def override_actor():
            return SimpleNamespace(user=user, plan=UserPlan.guest)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor

        with self._client() as client:
            response = client.post('/api/v1/billing/image-credit-code/redeem', json={'code': 'PICSPEAKART'})

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['error']['code'], 'BILLING_SIGNIN_REQUIRED')
        db.add.assert_not_called()

    def test_image_credit_code_redeem_adds_bonus_credit_ledger_entry(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        user = User(
            id=23,
            public_id='usr_credit_free',
            email='free-credit@example.com',
            username='free_credit',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )

        def override_db():
            yield db

        def override_actor():
            return SimpleNamespace(user=user, plan=UserPlan.free)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor

        with patch(
            'app.api.routers.billing._generation_credit_usage_snapshot',
            return_value={'monthly_total': 3, 'monthly_used': 0, 'monthly_remaining': 33},
        ):
            with self._client() as client:
                response = client.post('/api/v1/billing/image-credit-code/redeem', json={'code': ' picspeakart '})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['status'], 'redeemed')
        self.assertEqual(body['code'], 'PICSPEAKART')
        self.assertEqual(body['credits_granted'], 30)
        self.assertEqual(body['monthly_remaining'], 33)

        db.add.assert_called_once()
        ledger = db.add.call_args.args[0]
        self.assertIsInstance(ledger, UsageLedger)
        self.assertEqual(ledger.user_id, user.id)
        self.assertEqual(ledger.usage_type, 'image_generation_credit')
        self.assertEqual(ledger.amount, -30)
        self.assertEqual(ledger.unit, 'credits')
        self.assertEqual(ledger.metadata_json['grant_code'], 'PICSPEAKART')
        db.commit.assert_called_once()

    def test_image_credit_code_redeem_rejects_unknown_code(self) -> None:
        db = MagicMock()
        user = User(
            id=25,
            public_id='usr_credit_invalid',
            email='invalid-credit@example.com',
            username='invalid_credit',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )

        def override_db():
            yield db

        def override_actor():
            return SimpleNamespace(user=user, plan=UserPlan.free)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor

        with self._client() as client:
            response = client.post('/api/v1/billing/image-credit-code/redeem', json={'code': 'NOTREAL'})

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'IMAGE_CREDIT_CODE_INVALID')
        db.add.assert_not_called()

    def test_image_credit_code_redeem_is_one_time_per_user(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(metadata_json={'grant_type': 'promo_code', 'grant_code': 'PICSPEAKART'})
        ]
        user = User(
            id=24,
            public_id='usr_credit_repeat',
            email='repeat-credit@example.com',
            username='repeat_credit',
            plan=UserPlan.pro,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )

        def override_db():
            yield db

        def override_actor():
            return SimpleNamespace(user=user, plan=UserPlan.pro)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor

        with self._client() as client:
            response = client.post('/api/v1/billing/image-credit-code/redeem', json={'code': 'PICSPEAKART'})

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'IMAGE_CREDIT_CODE_ALREADY_REDEEMED')
        db.add.assert_not_called()

    def test_image_credit_pack_checkout_creates_usd_hosted_checkout(self) -> None:
        db = MagicMock()
        user = User(
            id=26,
            public_id='usr_credit_pack',
            email='pack@example.com',
            username='pack_user',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )

        def override_db():
            yield db

        def override_actor():
            return SimpleNamespace(user=user, plan=UserPlan.free)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor

        with patch(
            'app.services.lemonsqueezy.settings.lemonsqueezy_image_credit_pack_checkout_url',
            'https://picspeak.lemonsqueezy.com/checkout/buy/26bacef2-cd53-46dd-b5d0-f7fa9ec9b87b',
        ):
            with self._client() as client:
                response = client.post(
                    '/api/v1/billing/image-credit-pack/checkout',
                    json={'pack': 'image_credits_300', 'currency': 'usd', 'locale': 'en'},
                )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['status'], 'created')
        self.assertEqual(body['credits'], 300)
        self.assertEqual(body['price'], '$3.99')
        self.assertIsNotNone(body['checkout_url'])
        checkout_url = body['checkout_url']
        parsed = urlsplit(checkout_url)
        self.assertEqual(
            f'{parsed.scheme}://{parsed.netloc}{parsed.path}',
            'https://picspeak.lemonsqueezy.com/checkout/buy/26bacef2-cd53-46dd-b5d0-f7fa9ec9b87b',
        )
        query = parse_qs(parsed.query)
        self.assertEqual(query['checkout[email]'], ['pack@example.com'])
        self.assertEqual(query['checkout[name]'], ['pack_user'])
        self.assertEqual(query['checkout[custom][user_id]'], ['usr_credit_pack'])
        self.assertEqual(query['checkout[custom][kind]'], ['image_credit_pack'])
        self.assertEqual(query['checkout[custom][pack]'], ['image_credits_300'])
        self.assertEqual(query['checkout[custom][credits]'], ['300'])
        db.commit.assert_called_once()

    def test_billing_checkout_uses_one_time_zh_hosted_checkout_for_chinese_locale(self) -> None:
        db = MagicMock()
        user = User(
            id=28,
            public_id='usr_zh_checkout',
            email='zh-checkout@example.com',
            username='zh_checkout',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )

        def override_db():
            yield db

        def override_actor():
            return SimpleNamespace(user=user, plan=UserPlan.free)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor

        with patch(
            'app.services.lemonsqueezy.settings.lemonsqueezy_pro_checkout_url',
            'https://picspeak.lemonsqueezy.com/checkout/buy/default-pro',
        ), patch(
            'app.services.lemonsqueezy.settings.lemonsqueezy_zh_pro_checkout_url',
            'https://picspeak.lemonsqueezy.com/checkout/buy/b8c7310f-09b3-4be3-bac2-4d14ba6bbcde',
        ):
            with self._client() as client:
                response = client.post('/api/v1/billing/checkout', json={'plan': 'pro', 'locale': 'zh'})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['status'], 'created')
        parsed = urlsplit(body['checkout_url'])
        self.assertEqual(
            f'{parsed.scheme}://{parsed.netloc}{parsed.path}',
            'https://picspeak.lemonsqueezy.com/checkout/buy/b8c7310f-09b3-4be3-bac2-4d14ba6bbcde',
        )
        query = parse_qs(parsed.query)
        self.assertEqual(query['checkout[email]'], ['zh-checkout@example.com'])
        self.assertEqual(query['checkout[custom][plan]'], ['pro'])
        self.assertEqual(query['checkout[custom][billing_mode]'], ['one_time_pro'])
        self.assertEqual(query['checkout[custom][duration_days]'], ['30'])
        self.assertEqual(query['checkout[custom][locale]'], ['zh'])
        self.assertIn('checkout[custom][grant_token]', query)
        grant_payload = verify_payload(query['checkout[custom][grant_token]'][0])
        self.assertEqual(grant_payload['purpose'], 'lemonsqueezy_one_time_pro')
        self.assertEqual(grant_payload['user_id'], 'usr_zh_checkout')
        self.assertEqual(grant_payload['billing_mode'], 'one_time_pro')
        self.assertEqual(grant_payload['duration_days'], 30)
        db.commit.assert_called_once()

    def test_image_credit_pack_rmb_is_no_longer_available(self) -> None:
        db = MagicMock()
        user = User(
            id=27,
            public_id='usr_credit_pack_rmb',
            email='pack-rmb@example.com',
            username='pack_rmb_user',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )

        def override_db():
            yield db

        def override_actor():
            return SimpleNamespace(user=user, plan=UserPlan.free)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor

        with self._client() as client:
            response = client.post(
                '/api/v1/billing/image-credit-pack/checkout',
                json={'pack': 'image_credits_300', 'currency': 'rmb', 'locale': 'en'},
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'CREDIT_PACK_CURRENCY_UNSUPPORTED')
        db.commit.assert_not_called()


if __name__ == '__main__':
    unittest.main()
