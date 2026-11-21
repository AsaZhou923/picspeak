from __future__ import annotations

import ast
from datetime import datetime, timedelta, timezone
from io import StringIO
import json
import logging
from pathlib import Path
import sys
import time
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from fastapi import APIRouter, HTTPException, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import _fetch_user_by_token
from app.api.request_state import set_current_user_public_id
from app.api.routers import billing as billing_router
from app.api.routers import gallery_support
from app.api.routers import generations as generations_router
from app.api.routers import photos as photos_router
from app.api.routers import review_actions
from app.api.routers import uploads as uploads_router
from app.core.config import Settings
from app.core.http_client import PooledHTTPRequestError
from app.core.logging_config import (
    CloudLoggingJsonFormatter,
    DevTextFormatter,
    ERROR_REPORTING_TYPE,
    RequestContextFilter,
    SERVICE_NAME,
    bind_request_log_context,
    configure_logging,
    reset_request_log_context,
)
from app.core.security import JWTValidationError
from app.db.models import UserPlan
from app.main import _check_database_readiness, app
from app.schemas import BillingCheckoutRequest, CreditPackCheckoutRequest, GenerationCreateRequest, PresignRequest, ReviewMetaUpdateRequest
from app.services import clerk_auth, lemonsqueezy_webhooks
from app.services.content_audit import ContentAuditError
from app.services.image_generation_prompt import PromptSafetyError
from app.services.lemonsqueezy import LemonSqueezyAPIError, LemonSqueezyConfigurationError
from app.services.operational_health import (
    OperationalTaskSample,
    build_operational_health_snapshot,
    render_operational_health_markdown,
)
from app.services.worker import ReviewWorker
from app.services.worker_health import (
    maybe_warn_stale_pending_tasks,
    oldest_pending_task_ages_seconds,
    reset_pending_task_alert_cooldown,
)


def _dummy_request(path: str = '/api/v1/test') -> Request:
    req = Request(
        {
            'type': 'http',
            'method': 'POST',
            'path': path,
            'headers': [(b'host', b'api.example.com')],
            'client': ('203.0.113.10', 12345),
            'scheme': 'http',
            'server': ('api.example.com', 80),
        }
    )
    req.state.request_id = 'req_test_sentinel'
    return req


class ErrorTextHardeningTests(unittest.TestCase):
    def test_static_ast_forbids_exception_interpolation_in_api_errors(self) -> None:
        """Ensure no api_error / HTTPException call interpolates an caught exception."""
        app_root = BACKEND_ROOT / 'app'
        offenders: list[str] = []

        for path in sorted(app_root.rglob('*.py')):
            source = path.read_text(encoding='utf-8-sig')
            tree = ast.parse(source, filename=str(path))

            for node in ast.walk(tree):
                if not isinstance(node, ast.ExceptHandler) or not node.name:
                    continue
                exc_name = node.name
                for inner in ast.walk(node):
                    if not isinstance(inner, ast.Call):
                        continue
                    fn = inner.func
                    fn_name = fn.id if isinstance(fn, ast.Name) else (fn.attr if isinstance(fn, ast.Attribute) else '')
                    if fn_name not in {'api_error', 'HTTPException', 'ApiHTTPException'}:
                        continue

                    for arg in list(inner.args) + [kw.value for kw in inner.keywords]:
                        for sub in ast.walk(arg):
                            # Direct str(exc) / repr(exc)
                            if (
                                isinstance(sub, ast.Call)
                                and isinstance(sub.func, ast.Name)
                                and sub.func.id in {'str', 'repr'}
                                and any(isinstance(a, ast.Name) and a.id == exc_name for a in sub.args)
                            ):
                                offenders.append(f'{path.relative_to(BACKEND_ROOT)}:{inner.lineno}: {ast.get_source_segment(source, inner)}')
                            # f-string interpolating {exc}
                            if isinstance(sub, ast.FormattedValue) and any(
                                isinstance(v, ast.Name) and v.id == exc_name for v in ast.walk(sub.value)
                            ):
                                offenders.append(f'{path.relative_to(BACKEND_ROOT)}:{inner.lineno}: {ast.get_source_segment(source, inner)}')

        self.assertEqual(offenders, [], msg='Found exception interpolation in API error responses:\n' + '\n'.join(offenders))

    def test_auth_token_invalid_returns_fixed_message_and_logs_with_request_id(self) -> None:
        secret = 'SENTINEL_JWT_SECRET_DETAIL'
        tokens = bind_request_log_context(request_id='req_auth_123', request_path='/api/v1/me')
        try:
            with (
                patch('app.api.deps.validate_access_token', side_effect=JWTValidationError(secret)),
                self.assertLogs('app.api.deps', level='WARNING') as logs,
                self.assertRaises(HTTPException) as raised,
            ):
                _fetch_user_by_token('bad.token.value', MagicMock())
        finally:
            reset_request_log_context(tokens)

        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.detail['code'], 'AUTH_TOKEN_INVALID')
        self.assertEqual(raised.exception.detail['message'], 'Invalid access token')
        self.assertNotIn(secret, json.dumps(raised.exception.detail))
        self.assertTrue(any(secret in record.getMessage() or (record.exc_info and secret in str(record.exc_info[1])) for record in logs.records))

    def test_photo_fetch_and_storage_fetch_omit_sdk_exception_text(self) -> None:
        secret = 'SENTINEL_R2_BUCKET_ENDPOINT_SECRET'
        storage = MagicMock()
        storage.get_object.side_effect = RuntimeError(secret)
        photo = SimpleNamespace(bucket='private-bucket', object_key='user_1/photo.jpg')

        with (
            patch('app.api.routers.photos.get_object_storage_client', return_value=storage),
            self.assertLogs('app.api.routers.photos', level='ERROR') as logs,
        ):
            with self.assertRaises(HTTPException) as first:
                photos_router._get_photo_object(photo)
            with self.assertRaises(HTTPException) as second:
                photos_router._get_storage_object_bytes('private-bucket', 'user_1/thumb.webp')

        for raised in (first, second):
            self.assertEqual(raised.exception.status_code, 502)
            self.assertEqual(raised.exception.detail['code'], 'PHOTO_FETCH_FAILED')
            self.assertEqual(raised.exception.detail['message'], 'Failed to fetch photo')
            self.assertNotIn(secret, json.dumps(raised.exception.detail))
        self.assertEqual(len(logs.records), 2)

    def test_upload_presign_omits_storage_exception_text(self) -> None:
        secret = 'SENTINEL_PRESIGN_S3_KEY_SECRET'
        storage = MagicMock()
        storage.generate_presigned_url.side_effect = RuntimeError(secret)
        actor = SimpleNamespace(user=SimpleNamespace(id=1, public_id='usr_1'))
        payload = PresignRequest(filename='photo.jpg', content_type='image/jpeg', size_bytes=1024, sha256='a' * 64)

        with (
            patch('app.api.routers.uploads.get_object_storage_client', return_value=storage),
            patch('app.api.routers.uploads.request_rate_limit_scope_key', return_value=None),
            self.assertLogs('app.api.routers.uploads', level='ERROR') as logs,
            self.assertRaises(HTTPException) as raised,
        ):
            uploads_router.create_upload_presign(payload, request=_dummy_request('/api/v1/uploads/presign'), db=MagicMock(), actor=actor)

        self.assertEqual(raised.exception.status_code, 500)
        self.assertEqual(raised.exception.detail['code'], 'UPLOAD_PRESIGN_FAILED')
        self.assertEqual(raised.exception.detail['message'], 'Failed to generate upload presign URL')
        self.assertNotIn(secret, json.dumps(raised.exception.detail))
        self.assertEqual(len(logs.records), 1)

    def test_image_audit_failed_omits_provider_exception_text(self) -> None:
        secret = 'SENTINEL_AUDIT_UPSTREAM_TEXT'
        review = SimpleNamespace(
            public_id='rev_1',
            photo_id=10,
            owner_user_id=7,
            deleted_at=None,
            favorite=False,
            gallery_visible=False,
        )
        photo = SimpleNamespace(id=10, bucket='photos', object_key='u/p.jpg')
        actor = SimpleNamespace(user=SimpleNamespace(id=7, public_id='usr_7'), plan=UserPlan.free)

        with (
            patch('app.api.routers.review_actions._find_review_owned', return_value=review),
            patch('app.api.routers.review_actions.admit_photo_use', return_value=photo),
            patch('app.api.routers.review_actions._lock_review_owner'),
            patch('app.api.routers.review_actions._reload_live_review'),
            patch('app.api.routers.review_actions.get_object_read_url', return_value='https://signed.example/p.jpg'),
            patch('app.api.routers.review_actions.run_content_audit', side_effect=ContentAuditError(secret)),
            self.assertLogs('app.api.routers.review_actions', level='WARNING') as logs,
            self.assertRaises(HTTPException) as raised,
        ):
            review_actions.update_review_meta(
                'rev_1',
                ReviewMetaUpdateRequest(gallery_visible=True),
                db=MagicMock(),
                actor=actor,
            )

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.detail['code'], 'IMAGE_AUDIT_FAILED')
        self.assertEqual(raised.exception.detail['message'], 'Image content audit failed')
        self.assertNotIn(secret, json.dumps(raised.exception.detail))
        self.assertEqual(len(logs.records), 1)

    def test_clerk_unreachable_omits_network_exception_text(self) -> None:
        secret = 'SENTINEL_CLERK_TLS_PROXY_ERROR'
        with (
            patch('app.services.clerk_auth._require_clerk_secret_key', return_value='sk_test_123'),
            patch('app.services.clerk_auth.pooled_request', side_effect=PooledHTTPRequestError(secret)),
            self.assertLogs('app.services.clerk_auth', level='WARNING') as logs,
            self.assertRaises(HTTPException) as raised,
        ):
            clerk_auth._clerk_request('GET', '/v1/jwks')

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.detail['code'], 'CLERK_API_UNREACHABLE')
        self.assertEqual(raised.exception.detail['message'], 'Clerk API request failed')
        self.assertNotIn(secret, json.dumps(raised.exception.detail))
        self.assertEqual(len(logs.records), 1)

    def test_gallery_thumbnail_upload_omits_storage_exception_text(self) -> None:
        secret = 'SENTINEL_THUMB_PUT_ERROR'
        storage = MagicMock()
        storage.put_object.side_effect = RuntimeError(secret)
        photo = SimpleNamespace(public_id='pho_1', bucket='photos', object_key='u/p.jpg', client_meta={})

        with (
            patch('app.api.routers.gallery_support._get_photo_object', return_value=(None, b'img')),
            patch('app.api.routers.gallery_support._build_thumbnail_bytes', return_value=(b'webpbytes', 'image/webp')),
            patch('app.api.routers.gallery_support.get_object_storage_client', return_value=storage),
            self.assertLogs('app.api.routers.gallery_support', level='ERROR') as logs,
            self.assertRaises(HTTPException) as raised,
        ):
            gallery_support._ensure_gallery_thumbnail(photo)

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.detail['code'], 'GALLERY_THUMBNAIL_UPLOAD_FAILED')
        self.assertEqual(raised.exception.detail['message'], 'Failed to upload gallery thumbnail')
        self.assertNotIn(secret, json.dumps(raised.exception.detail))
        self.assertEqual(len(logs.records), 1)

    def test_billing_and_generation_errors_omit_exception_text(self) -> None:
        secret = 'SENTINEL_INTERNAL_BILLING_OR_PROMPT_TEXT'
        actor = SimpleNamespace(user=SimpleNamespace(id=1, public_id='usr_1'), plan=UserPlan.free)

        with (
            patch('app.api.routers.billing.create_checkout_for_user', side_effect=LemonSqueezyConfigurationError(secret)),
            self.assertLogs('app.api.routers.billing', level='WARNING'),
            self.assertRaises(HTTPException) as cfg_err,
        ):
            billing_router.create_billing_checkout(BillingCheckoutRequest(plan='pro', locale='en'), db=MagicMock(), actor=actor)
        self.assertEqual(cfg_err.exception.detail['code'], 'LEMONSQUEEZY_NOT_CONFIGURED')
        self.assertNotIn(secret, json.dumps(cfg_err.exception.detail))

        with (
            patch('app.api.routers.billing.create_checkout_for_user', side_effect=LemonSqueezyAPIError(secret)),
            self.assertLogs('app.api.routers.billing', level='WARNING'),
            self.assertRaises(HTTPException) as api_err,
        ):
            billing_router.create_billing_checkout(BillingCheckoutRequest(plan='pro', locale='en'), db=MagicMock(), actor=actor)
        self.assertEqual(api_err.exception.detail['code'], 'LEMONSQUEEZY_API_FAILED')
        self.assertNotIn(secret, json.dumps(api_err.exception.detail))

        with (
            patch('app.api.routers.billing.create_image_credit_pack_checkout_for_user', side_effect=LemonSqueezyConfigurationError(secret)),
            self.assertLogs('app.api.routers.billing', level='WARNING'),
            self.assertRaises(HTTPException) as pack_err,
        ):
            billing_router.create_image_credit_pack_checkout(CreditPackCheckoutRequest(pack='image_credits_300', currency='usd'), db=MagicMock(), actor=actor)
        self.assertEqual(pack_err.exception.detail['code'], 'LEMONSQUEEZY_NOT_CONFIGURED')
        self.assertNotIn(secret, json.dumps(pack_err.exception.detail))

        with (
            patch('app.services.lemonsqueezy_webhooks.webhook_signing_secret', side_effect=LemonSqueezyConfigurationError(secret)),
            self.assertLogs('app.services.lemonsqueezy_webhooks', level='WARNING'),
        ):
            async def _receive():
                return {'type': 'http.request', 'body': b'{}', 'more_body': False}

            req = Request(
                {'type': 'http', 'method': 'POST', 'path': '/api/v1/webhooks/lemonsqueezy', 'headers': [(b'x-signature', b'abc')]},
                _receive,
            )
            import asyncio

            with self.assertRaises(HTTPException) as wh_err:
                asyncio.run(lemonsqueezy_webhooks.verify_lemonsqueezy_webhook(req))
        self.assertEqual(wh_err.exception.detail['code'], 'LEMONSQUEEZY_NOT_CONFIGURED')
        self.assertNotIn(secret, json.dumps(wh_err.exception.detail))

        with (
            patch('app.api.routers.generations.build_general_generation_prompt', side_effect=PromptSafetyError(secret)),
            self.assertLogs('app.api.routers.generations', level='WARNING'),
            self.assertRaises(HTTPException) as gen_err,
        ):
            generations_router.create_generation(
                GenerationCreateRequest(generation_mode='general', intent='custom_creation', prompt='some prompt text', quality='low', size='1024x1024'),
                request=_dummy_request('/api/v1/generations'),
                db=MagicMock(),
                actor=actor,
            )
        self.assertEqual(gen_err.exception.detail['code'], 'GENERATION_PROMPT_REJECTED')
        self.assertNotIn(secret, json.dumps(gen_err.exception.detail))


class ReadinessProbeTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_pending_task_alert_cooldown()

    def tearDown(self) -> None:
        reset_pending_task_alert_cooldown()

    def test_readyz_returns_ok_with_informational_worker_and_pending_fields_and_skips_audit(self) -> None:
        with (
            patch('app.main._schedule_audit_task') as schedule_audit,
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            patch('app.main._check_database_readiness') as check_db,
            patch(
                'app.main._collect_readiness_diagnostics',
                return_value={
                    'oldest_pending_review_seconds': 12.5,
                    'oldest_pending_generation_seconds': None,
                    'worker': {
                        'enabled': True,
                        'running': True,
                        'alive_threads': 2,
                        'heartbeat_stale': False,
                        'last_loop_at': '2026-11-21T05:00:00+00:00',
                        'last_loop_age_seconds': 0.5,
                        'has_error': False,
                        'last_error_at': None,
                    },
                },
            ),
        ):
            with TestClient(app) as client:
                response = client.get('/readyz')

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['status'], 'ok')
        self.assertEqual(body['oldest_pending_review_seconds'], 12.5)
        self.assertIsNone(body['oldest_pending_generation_seconds'])
        self.assertFalse(body['worker']['heartbeat_stale'])
        self.assertNotIn('last_error', body['worker'])
        check_db.assert_called_once()
        schedule_audit.assert_not_called()

    def test_readyz_returns_503_unavailable_without_exception_text_on_db_error(self) -> None:
        secret = 'psycopg2://admin:supersecret@db.internal:5432/prod'
        with (
            patch('app.main._schedule_audit_task') as schedule_audit,
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            patch('app.main._check_database_readiness', side_effect=RuntimeError(secret)),
            self.assertLogs('app.main', level='WARNING') as logs,
        ):
            with TestClient(app) as client:
                response = client.get('/readyz')

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'status': 'unavailable'})
        self.assertNotIn(secret, response.text)
        self.assertTrue(any('Database readiness check failed' in rec.getMessage() for rec in logs.records))
        schedule_audit.assert_not_called()

    def test_readyz_times_out_and_returns_503_unavailable(self) -> None:
        def slow_db(_timeout_seconds: float) -> None:
            time.sleep(0.5)

        with (
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            patch('app.main.settings.readyz_db_timeout_seconds', 0.1),
            patch('app.main._check_database_readiness', side_effect=slow_db),
        ):
            with TestClient(app) as client:
                started = time.monotonic()
                response = client.get('/readyz')
                elapsed = time.monotonic() - started

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'status': 'unavailable'})
        self.assertLess(elapsed, 0.45)

    def test_readyz_never_fails_when_diagnostics_fail_or_worker_is_stale(self) -> None:
        with (
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            patch('app.main._check_database_readiness'),
            patch('app.main._collect_readiness_diagnostics', side_effect=RuntimeError('stats boom')),
            patch(
                'app.main.worker.heartbeat_snapshot',
                return_value={
                    'enabled': True,
                    'running': True,
                    'alive_threads': 0,
                    'heartbeat_stale': True,
                    'last_loop_at': None,
                    'last_loop_age_seconds': 999.0,
                    'has_error': True,
                    'last_error_at': '2026-11-21T05:00:00+00:00',
                },
            ),
        ):
            with TestClient(app) as client:
                response = client.get('/readyz')

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['status'], 'ok')
        self.assertTrue(body['worker']['heartbeat_stale'])
        self.assertNotIn('stats boom', response.text)

    def test_check_database_readiness_sets_postgres_statement_timeout(self) -> None:
        executed: list[tuple[str, object]] = []
        conn = MagicMock()
        conn.dialect.name = 'postgresql'

        def fake_execute(stmt, params=None):
            executed.append((str(stmt), params))
            result = MagicMock()
            result.scalar.return_value = 1
            return result

        conn.execute.side_effect = fake_execute
        cm = MagicMock()
        cm.__enter__.return_value = conn
        cm.__exit__.return_value = False

        with patch('app.main.engine.begin', return_value=cm):
            _check_database_readiness(2.0)

        self.assertEqual(len(executed), 2)
        self.assertIn("set_config('statement_timeout'", executed[0][0])
        self.assertEqual(executed[0][1], {'timeout_ms': '2000'})
        self.assertEqual(executed[1][0], 'SELECT 1')


class StructuredErrorReportingTests(unittest.TestCase):
    def test_structured_json_logs_setting_defaults_by_app_env_and_allows_override(self) -> None:
        dev_settings = Settings(_env_file=None, app_env='dev', database_url='sqlite://localhost/test')
        self.assertFalse(dev_settings.use_structured_json_logs)

        blank_override = Settings(_env_file=None, app_env='dev', structured_json_logs='', database_url='sqlite://localhost/test')
        self.assertFalse(blank_override.use_structured_json_logs)

        forced_on = Settings(_env_file=None, app_env='dev', structured_json_logs=True, database_url='sqlite://localhost/test')
        self.assertTrue(forced_on.use_structured_json_logs)

        prod_settings = Settings(
            _env_file=None,
            app_env='production',
            app_secret='a' * 64,
            oauth_jwt_secret='b' * 64,
            database_url='sqlite://localhost/test',
        )
        self.assertTrue(prod_settings.use_structured_json_logs)

        prod_forced_off = Settings(
            _env_file=None,
            app_env='production',
            structured_json_logs=False,
            app_secret='a' * 64,
            oauth_jwt_secret='b' * 64,
            database_url='sqlite://localhost/test',
        )
        self.assertFalse(prod_forced_off.use_structured_json_logs)

    def test_unhandled_api_exception_emits_cloud_error_reporting_json(self) -> None:
        probe_router = APIRouter()

        @probe_router.get('/_test/unhandled-boom')
        def _boom(request: Request):
            set_current_user_public_id(request, 'usr_error_42')
            raise RuntimeError('kaboom-internal-trace')

        app.include_router(probe_router)
        stream = StringIO()
        handler = configure_logging(json_logs=True, stream=stream)
        try:
            with (
                patch('app.main._schedule_audit_task', side_effect=lambda coro: coro.close()),
                patch('app.main.worker.start'),
                patch('app.main.worker.stop'),
            ):
                with TestClient(app, raise_server_exceptions=False) as client:
                    response = client.get('/_test/unhandled-boom')
        finally:
            logging.getLogger().removeHandler(handler)
            app.router.routes = [r for r in app.router.routes if getattr(r, 'path', None) != '/_test/unhandled-boom']

        self.assertEqual(response.status_code, 500)
        body = response.json()
        self.assertEqual(body['error']['code'], 'INTERNAL_ERROR')
        self.assertNotIn('kaboom-internal-trace', response.text)
        req_id = body['error']['request_id']
        self.assertTrue(req_id)

        entries = [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]
        error_entries = [entry for entry in entries if entry.get('event') == 'unhandled_api_exception']
        self.assertEqual(len(error_entries), 1)
        entry = error_entries[0]
        self.assertEqual(entry['severity'], 'ERROR')
        self.assertEqual(entry['@type'], ERROR_REPORTING_TYPE)
        self.assertEqual(entry['serviceContext'], {'service': SERVICE_NAME})
        self.assertEqual(entry['request_id'], req_id)
        self.assertEqual(entry['user_public_id'], 'usr_error_42')
        self.assertEqual(entry['request_path'], '/_test/unhandled-boom')
        self.assertIn('Traceback (most recent call last):', entry['message'])
        self.assertIn('kaboom-internal-trace', entry['message'])
        self.assertEqual(entry['context']['user'], 'usr_error_42')
        self.assertEqual(entry['context']['httpRequest']['url'], '/_test/unhandled-boom')

    def test_worker_unexpected_exception_emits_cloud_error_reporting_json(self) -> None:
        stream = StringIO()
        handler = configure_logging(json_logs=True, stream=stream)
        worker = ReviewWorker(worker_name='test-obs-worker')
        self.addCleanup(worker._gen_executor.shutdown, False, cancel_futures=True)
        try:
            future = worker._gen_executor.submit(lambda: (_ for _ in ()).throw(RuntimeError('worker-gen-crash')))
            worker._gen_futures.append(future)
            # Wait for completion
            try:
                future.result(timeout=2)
            except RuntimeError:
                pass
            worker._prune_done_gen_futures()
        finally:
            logging.getLogger().removeHandler(handler)

        entries = [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]
        worker_errors = [e for e in entries if e.get('event') == 'worker_generation_unhandled_exception']
        self.assertEqual(len(worker_errors), 1)
        entry = worker_errors[0]
        self.assertEqual(entry['severity'], 'ERROR')
        self.assertEqual(entry['@type'], ERROR_REPORTING_TYPE)
        self.assertEqual(entry['serviceContext'], {'service': SERVICE_NAME})
        self.assertEqual(entry['worker_name'], 'test-obs-worker')
        self.assertIn('Traceback (most recent call last):', entry['message'])
        self.assertIn('worker-gen-crash', entry['message'])

        snap = worker.heartbeat_snapshot(include_error_text=True)
        self.assertTrue(snap['has_error'])
        self.assertIn('worker-gen-crash', snap['last_error'])

    def test_worker_loop_crash_emits_cloud_error_reporting_json_and_records_heartbeat_error(self) -> None:
        stream = StringIO()
        handler = configure_logging(json_logs=True, stream=stream)
        worker = ReviewWorker(worker_name='test-loop-worker')
        self.addCleanup(worker._gen_executor.shutdown, False, cancel_futures=True)

        def fail_once_then_stop(*_args, **_kwargs):
            worker._running = False
            raise RuntimeError('worker-loop-boom')

        worker._running = True
        try:
            with (
                patch.object(worker, '_run_guest_cleanup_if_due'),
                patch.object(worker, '_run_request_log_cleanup_if_due'),
                patch.object(worker, '_run_limit_record_cleanup_if_due'),
                patch.object(worker, '_prune_done_gen_futures'),
                patch('app.db.session.SessionLocal', return_value=MagicMock()),
                patch('app.services.worker.claim_next_pending_review_task', side_effect=fail_once_then_stop),
                patch('app.services.worker.time.sleep'),
            ):
                worker._loop()
        finally:
            logging.getLogger().removeHandler(handler)

        entries = [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]
        loop_errors = [e for e in entries if e.get('event') == 'worker_loop_unhandled_exception']
        self.assertEqual(len(loop_errors), 1)
        entry = loop_errors[0]
        self.assertEqual(entry['severity'], 'ERROR')
        self.assertEqual(entry['@type'], ERROR_REPORTING_TYPE)
        self.assertEqual(entry['serviceContext'], {'service': SERVICE_NAME})
        self.assertEqual(entry['worker_name'], 'test-loop-worker')
        self.assertIn('worker-loop-boom', entry['message'])
        self.assertIn('Traceback (most recent call last):', entry['message'])

        snap = worker.heartbeat_snapshot(include_error_text=True)
        self.assertIsNotNone(snap['last_loop_at'])
        self.assertIn('worker-loop-boom', snap['last_error'])

    def test_dev_text_formatter_is_human_readable(self) -> None:
        formatter = DevTextFormatter()
        record = logging.LogRecord('app.test', logging.INFO, __file__, 1, 'hello dev', (), None)
        record.request_id = 'req_dev_1'
        rendered = formatter.format(record)
        self.assertIn('INFO [app.test] [req=req_dev_1] hello dev', rendered)
        with self.assertRaises(json.JSONDecodeError):
            json.loads(rendered)

    def test_request_context_filter_correlates_nested_logger_calls(self) -> None:
        formatter = CloudLoggingJsonFormatter()
        context_filter = RequestContextFilter()
        tokens = bind_request_log_context(request_id='req_corr_9', request_path='/api/v1/photos/1', user_public_id='usr_9')
        try:
            record = logging.LogRecord('app.api.routers.photos', logging.WARNING, __file__, 1, 'storage warn', (), None)
            context_filter.filter(record)
            parsed = json.loads(formatter.format(record))
        finally:
            reset_request_log_context(tokens)

        self.assertEqual(parsed['request_id'], 'req_corr_9')
        self.assertEqual(parsed['user_public_id'], 'usr_9')
        self.assertEqual(parsed['request_path'], '/api/v1/photos/1')
        self.assertEqual(parsed['serviceContext'], {'service': SERVICE_NAME})
        self.assertNotIn('@type', parsed)


class WorkerVisibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_pending_task_alert_cooldown()

    def tearDown(self) -> None:
        reset_pending_task_alert_cooldown()

    def test_worker_heartbeat_tracks_loop_time_staleness_and_last_error(self) -> None:
        worker = ReviewWorker(worker_name='hb-worker')
        self.addCleanup(worker._gen_executor.shutdown, False, cancel_futures=True)

        now = datetime(2026, 11, 21, 5, 0, tzinfo=timezone.utc)
        worker.record_heartbeat(now=now, now_monotonic=1000.0)
        worker.record_error(RuntimeError('transient db error'), now=now)

        fresh = worker.heartbeat_snapshot(stale_after_seconds=60, include_error_text=True, now_monotonic=1025.0)
        self.assertFalse(fresh['heartbeat_stale'])
        self.assertEqual(fresh['last_loop_age_seconds'], 25.0)
        self.assertEqual(fresh['last_loop_at'], now.isoformat())
        self.assertTrue(fresh['has_error'])
        self.assertEqual(fresh['last_error'], 'RuntimeError: transient db error')

        stale = worker.heartbeat_snapshot(stale_after_seconds=60, include_error_text=False, now_monotonic=1065.0)
        self.assertTrue(stale['heartbeat_stale'])
        self.assertEqual(stale['last_loop_age_seconds'], 65.0)
        self.assertNotIn('last_error', stale)

        # Dead threads while _running=True must also report stale even if heartbeat was recent
        dead_thread = MagicMock()
        dead_thread.is_alive.return_value = False
        worker._running = True
        worker._threads = [dead_thread]
        dead = worker.heartbeat_snapshot(stale_after_seconds=60, now_monotonic=1005.0)
        self.assertTrue(dead['heartbeat_stale'])
        self.assertEqual(dead['alive_threads'], 0)

    def test_oldest_pending_task_ages_and_rate_limited_warning(self) -> None:
        engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE review_tasks (id INTEGER PRIMARY KEY, status TEXT NOT NULL, created_at DATETIME NOT NULL)'))
            conn.execute(text('CREATE TABLE image_generation_tasks (id INTEGER PRIMARY KEY, status TEXT NOT NULL, created_at DATETIME NOT NULL)'))
            now = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)
            conn.execute(
                text('INSERT INTO review_tasks (id, status, created_at) VALUES (:id, :status, :created_at)'),
                [
                    {'id': 1, 'status': 'PENDING', 'created_at': (now - timedelta(minutes=15)).strftime('%Y-%m-%d %H:%M:%S')},
                    {'id': 2, 'status': 'PENDING', 'created_at': (now - timedelta(minutes=2)).strftime('%Y-%m-%d %H:%M:%S')},
                    {'id': 3, 'status': 'SUCCEEDED', 'created_at': (now - timedelta(hours=3)).strftime('%Y-%m-%d %H:%M:%S')},
                ],
            )
            conn.execute(
                text('INSERT INTO image_generation_tasks (id, status, created_at) VALUES (:id, :status, :created_at)'),
                [
                    {'id': 1, 'status': 'PENDING', 'created_at': (now - timedelta(minutes=12)).strftime('%Y-%m-%d %H:%M:%S')},
                ],
            )
        Session = sessionmaker(bind=engine)
        with Session() as db:
            ages = oldest_pending_task_ages_seconds(db, now=now)

        self.assertEqual(ages['oldest_pending_review_seconds'], 900.0)
        self.assertEqual(ages['oldest_pending_generation_seconds'], 720.0)

        # Below threshold -> no warning
        self.assertFalse(
            maybe_warn_stale_pending_tasks(
                oldest_pending_review_seconds=120.0,
                oldest_pending_generation_seconds=None,
                threshold_seconds=600,
                now_monotonic=1000.0,
            )
        )

        # Above threshold -> emits structured WARNING, then rate-limits for 10 minutes
        stream = StringIO()
        handler = configure_logging(json_logs=True, stream=stream)
        try:
            first = maybe_warn_stale_pending_tasks(
                oldest_pending_review_seconds=900.0,
                oldest_pending_generation_seconds=720.0,
                worker_heartbeat_stale=False,
                threshold_seconds=600,
                now_monotonic=2000.0,
            )
            suppressed = maybe_warn_stale_pending_tasks(
                oldest_pending_review_seconds=960.0,
                oldest_pending_generation_seconds=780.0,
                worker_heartbeat_stale=False,
                threshold_seconds=600,
                now_monotonic=2300.0,
            )
            after_cooldown = maybe_warn_stale_pending_tasks(
                oldest_pending_review_seconds=1500.0,
                oldest_pending_generation_seconds=1320.0,
                worker_heartbeat_stale=True,
                threshold_seconds=600,
                now_monotonic=2601.0,
            )
        finally:
            logging.getLogger().removeHandler(handler)

        self.assertTrue(first)
        self.assertFalse(suppressed)
        self.assertTrue(after_cooldown)

        entries = [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]
        backlog_warnings = [e for e in entries if e.get('event') == 'pending_task_backlog_stale']
        self.assertEqual(len(backlog_warnings), 2)
        self.assertEqual(backlog_warnings[0]['severity'], 'WARNING')
        self.assertEqual(backlog_warnings[0]['serviceContext'], {'service': SERVICE_NAME})
        self.assertEqual(backlog_warnings[0]['oldest_pending_review_seconds'], 900.0)
        self.assertEqual(backlog_warnings[0]['oldest_pending_generation_seconds'], 720.0)
        self.assertEqual(backlog_warnings[1]['worker_heartbeat_stale'], True)

    def test_operational_health_snapshot_and_markdown_include_pending_ages_and_worker_state(self) -> None:
        now = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)
        snapshot = build_operational_health_snapshot(
            tasks=[
                OperationalTaskSample(kind='review', status='PENDING', created_at=now - timedelta(minutes=11)),
                OperationalTaskSample(kind='generation', status='PENDING', created_at=now - timedelta(minutes=4)),
            ],
            costs=[],
            ledger_entries=[],
            payment_events=[],
            gallery_audit_samples=[],
            start_date=now.date(),
            end_date=now.date(),
            now=now,
            worker_health={
                'running': True,
                'heartbeat_stale': True,
                'last_loop_at': (now - timedelta(minutes=3)).isoformat(),
                'last_loop_age_seconds': 180.0,
                'last_error': 'RuntimeError: db lost',
            },
        )

        self.assertEqual(snapshot['tasks']['review']['oldest_pending_seconds'], 660.0)
        self.assertEqual(snapshot['tasks']['generation']['oldest_pending_seconds'], 240.0)
        self.assertEqual(snapshot['worker']['oldest_pending_review_seconds'], 660.0)
        self.assertEqual(snapshot['worker']['oldest_pending_generation_seconds'], 240.0)
        self.assertTrue(snapshot['worker']['heartbeat_stale'])
        self.assertIn('worker_heartbeat_stale', snapshot['warnings'])

        markdown = render_operational_health_markdown(snapshot)
        self.assertIn('## Worker 状态', markdown)
        self.assertIn('心跳是否过期：是', markdown)
        self.assertIn('最早 PENDING 评图任务等待秒数：660.0', markdown)
        self.assertIn('最早 PENDING 生图任务等待秒数：240.0', markdown)
        self.assertIn('RuntimeError: db lost', markdown)


if __name__ == '__main__':
    unittest.main()
