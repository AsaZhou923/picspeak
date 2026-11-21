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
from app.core.http_client import PooledHTTPRequestError, PooledHTTPResponse, PooledHTTPStatusError
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
from app.db.session import create_readiness_engine, engine as shared_engine, readiness_engine
from app.main import _check_database_readiness, _reset_readiness_state, app
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
    def test_static_ast_forbids_exception_interpolation_and_unvetted_message_vars_in_api_errors(self) -> None:
        """Ensure api_error / HTTPException never interpolates exceptions or passes unvetted message variables."""
        app_root = BACKEND_ROOT / 'app'
        offenders: list[str] = []
        allowed_non_literal_messages = {
            ('app/core/errors.py', 'message'),
            ('app/api/routers/analytics.py', 'exc.message'),
            ('app/api/routers/review_create.py', 'PHOTO_NOT_APPLICABLE_MESSAGE'),
            ('app/services/guard.py', "f'Rate limit exceeded ({scope})'"),
        }

        for path in sorted(app_root.rglob('*.py')):
            rel = path.relative_to(BACKEND_ROOT).as_posix()
            source = path.read_text(encoding='utf-8-sig')
            tree = ast.parse(source, filename=str(path))

            # 1) Reject any exception interpolation in args/kwargs of api_error / HTTPException
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
                            if (
                                isinstance(sub, ast.Call)
                                and isinstance(sub.func, ast.Name)
                                and sub.func.id in {'str', 'repr'}
                                and any(isinstance(a, ast.Name) and a.id == exc_name for a in sub.args)
                            ):
                                offenders.append(f'{rel}:{inner.lineno}: {ast.get_source_segment(source, inner)}')
                            if isinstance(sub, ast.FormattedValue) and any(
                                isinstance(v, ast.Name) and v.id == exc_name for v in ast.walk(sub.value)
                            ):
                                offenders.append(f'{rel}:{inner.lineno}: {ast.get_source_segment(source, inner)}')

            # 2) Reject any non-literal message argument passed to api_error / ApiHTTPException
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                fn = node.func
                fn_name = fn.id if isinstance(fn, ast.Name) else (fn.attr if isinstance(fn, ast.Attribute) else '')
                msg_node = None
                if fn_name == 'api_error':
                    if len(node.args) >= 3:
                        msg_node = node.args[2]
                    else:
                        msg_node = next((kw.value for kw in node.keywords if kw.arg == 'message'), None)
                elif fn_name == 'ApiHTTPException':
                    msg_node = next((kw.value for kw in node.keywords if kw.arg == 'message'), None)
                if msg_node is None or isinstance(msg_node, ast.Constant):
                    continue
                msg_src = ast.get_source_segment(source, msg_node) or ''
                if (rel, msg_src) not in allowed_non_literal_messages:
                    offenders.append(f'{rel}:{node.lineno}: non-literal message {msg_src!r}')

        self.assertEqual(offenders, [], msg='Found unsafe API error messages:\n' + '\n'.join(offenders))

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

    def test_clerk_http_errors_and_unreachable_omit_upstream_details(self) -> None:
        secret = 'SENTINEL_CLERK_UPSTREAM_BODY_DETAIL'
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

        for status_code, expected_code, expected_message in (
            (401, 'CLERK_API_UNAUTHORIZED', 'Clerk authentication failed'),
            (500, 'CLERK_API_FAILED', 'Clerk API request failed'),
        ):
            with self.subTest(status_code=status_code):
                response = PooledHTTPResponse(
                    status=status_code,
                    reason=f'Upstream {secret}',
                    data=json.dumps({'errors': [{'long_message': secret}]}).encode('utf-8'),
                    headers={},
                )
                with (
                    patch('app.services.clerk_auth._require_clerk_secret_key', return_value='sk_test_123'),
                    patch('app.services.clerk_auth.pooled_request', side_effect=PooledHTTPStatusError(response)),
                    self.assertLogs('app.services.clerk_auth', level='WARNING') as status_logs,
                    self.assertRaises(HTTPException) as status_raised,
                ):
                    clerk_auth._clerk_request('GET', '/v1/users/user_1')

                self.assertEqual(status_raised.exception.detail['code'], expected_code)
                self.assertEqual(status_raised.exception.detail['message'], expected_message)
                self.assertNotIn(secret, json.dumps(status_raised.exception.detail))
                self.assertTrue(any(secret in rec.getMessage() for rec in status_logs.records))

    def test_task_status_realtime_generation_and_practice_omit_stored_diagnostics(self) -> None:
        from app.api.routers import realtime, tasks as tasks_router
        from app.db.models import TaskStatus
        from app.services.image_generation_task_processor import _serialize_generation_task_status
        from app.services.practice import _attempt_summary

        secret = 'SENTINEL_STORED_DIAGNOSTIC_TRACE_999'
        now = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)

        # 1) Review task status with unmapped error_code
        review_task = SimpleNamespace(
            public_id='tsk_unmapped',
            status=TaskStatus.FAILED,
            progress=100,
            attempt_count=1,
            max_attempts=3,
            next_attempt_at=None,
            last_heartbeat_at=None,
            started_at=now,
            finished_at=now,
            error_code='UNMAPPED_INTERNAL_CODE',
            error_message=secret,
        )
        task_payload = tasks_router._serialize_task_status(review_task, None)
        self.assertEqual(task_payload['error']['code'], 'UNMAPPED_INTERNAL_CODE')
        self.assertEqual(task_payload['error']['message'], 'Review task could not be completed')
        self.assertNotIn(secret, json.dumps(task_payload, default=str))

        # 2) Realtime WebSocket payload including task event with sensitive stored message
        event = SimpleNamespace(
            event_type='TASK_DISPATCH_FAILED',
            error_code=None,
            message=secret,
            created_at=now,
        )
        session_cm = MagicMock()
        session_cm.__enter__.return_value = MagicMock()
        session_cm.__exit__.return_value = False
        with (
            patch.object(realtime, 'SessionLocal', return_value=session_cm),
            patch.object(realtime, '_load_task_snapshot', return_value=(review_task, None, event)),
        ):
            ws_payload, terminal = realtime._load_task_stream_update('tsk_unmapped', 1)
        self.assertTrue(terminal)
        self.assertNotIn(secret, json.dumps(ws_payload))
        self.assertEqual(ws_payload['event']['message'], 'Failed to enqueue async review task')

        # 3) Generation task status with unmapped error_code
        gen_task = SimpleNamespace(
            public_id='igt_unmapped',
            status=TaskStatus.FAILED,
            progress=100,
            generation_mode='general',
            intent='custom_creation',
            request_payload={},
            attempt_count=1,
            max_attempts=2,
            next_attempt_at=None,
            last_heartbeat_at=None,
            started_at=now,
            finished_at=now,
            error_code='UNMAPPED_GEN_CODE',
            error_message=secret,
        )
        gen_payload = _serialize_generation_task_status(gen_task, None)
        self.assertEqual(gen_payload['error']['code'], 'UNMAPPED_GEN_CODE')
        self.assertEqual(gen_payload['error']['message'], 'Image generation could not be completed')
        self.assertNotIn(secret, json.dumps(gen_payload, default=str))

        # 4) Practice attempt summary with stored diagnostic on task
        attempt = SimpleNamespace(
            public_id='pat_1',
            task_id=42,
            review_id=None,
            photo_id=9,
            sequence=1,
            attempt_kind='retake',
            created_at=now,
        )
        session_obj = SimpleNamespace(id=1, owner_user_id=7)
        actor = SimpleNamespace(user=SimpleNamespace(id=7, public_id='usr_7'), plan=UserPlan.free)
        source_access = SimpleNamespace(access='available')
        with patch(
            'app.services.practice.attempt_access_summary',
            return_value=SimpleNamespace(
                task_public_id='tsk_unmapped',
                review_public_id=None,
                review_access='unavailable',
                photo_public_id='pho_9',
            ),
        ):
            summary = _attempt_summary(
                attempt,
                session=session_obj,
                source_access=source_access,
                tasks_by_id={42: review_task},
                reviews_by_id={},
                photos_by_id={},
                actor=actor,
            )
        self.assertEqual(summary.error['code'], 'UNMAPPED_INTERNAL_CODE')
        self.assertEqual(summary.error['message'], 'Review task could not be completed')
        self.assertNotIn(secret, json.dumps(summary.model_dump(mode='json')))

        # 5) Generation dispatch failure writer stores fixed text and cannot receive raw exception text
        failed_gen_task = SimpleNamespace(
            public_id='igt_dispatch',
            owner_user_id=7,
            status=TaskStatus.PENDING,
            progress=0,
            finished_at=None,
            last_heartbeat_at=None,
            error_code=None,
            error_message=None,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [failed_gen_task, None]
        with patch('app.api.routers.generations.release_generation_credit_reservation'):
            generations_router._mark_generation_dispatch_failed(db, 'igt_dispatch')
        self.assertEqual(failed_gen_task.error_code, 'TASK_DISPATCH_FAILED')
        self.assertEqual(failed_gen_task.error_message, 'Failed to enqueue async image generation task')
        self.assertNotIn(secret, failed_gen_task.error_message)

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
        _reset_readiness_state()

    def tearDown(self) -> None:
        reset_pending_task_alert_cooldown()
        _reset_readiness_state()

    def test_readyz_returns_minimal_ok_without_backlog_queries_and_skips_audit(self) -> None:
        with (
            patch('app.main._schedule_audit_task') as schedule_audit,
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            patch('app.main._check_database_readiness') as check_db,
            patch('app.main.SessionLocal') as session_local,
            patch('app.main.worker.heartbeat_snapshot') as heartbeat_snapshot,
        ):
            with TestClient(app) as client:
                response = client.get('/readyz')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})
        check_db.assert_called_once()
        session_local.assert_not_called()
        heartbeat_snapshot.assert_not_called()
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
        import threading

        release = threading.Event()

        def slow_db(_timeout_seconds: float) -> None:
            release.wait(timeout=2.0)

        try:
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
        finally:
            release.set()

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'status': 'unavailable'})
        self.assertLess(elapsed, 0.45)

    def test_readyz_uses_dedicated_nullpool_engine_and_caps_concurrent_probes(self) -> None:
        import threading
        from sqlalchemy.pool import NullPool

        self.assertIsNot(readiness_engine, shared_engine)
        self.assertIsInstance(readiness_engine.pool, NullPool)

        pg_probe_engine = create_readiness_engine(
            'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak_test',
            timeout_seconds=2.0,
        )
        try:
            self.assertIsInstance(pg_probe_engine.pool, NullPool)
        finally:
            pg_probe_engine.dispose()

        # Verify single in-flight probe concurrency cap and 1s cache behavior.
        import app.main as app_main

        probe_started = threading.Event()
        release_probe = threading.Event()
        probe_calls = 0

        def blocking_probe(_timeout_seconds: float) -> None:
            nonlocal probe_calls
            probe_calls += 1
            probe_started.set()
            release_probe.wait(timeout=3.0)

        with (
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            patch('app.main._check_database_readiness', side_effect=blocking_probe),
        ):
            with TestClient(app) as client:
                # 1) Seed a fresh cached OK result (<1s old), then hold one probe in-flight.
                with app_main._readyz_state_lock:
                    app_main._readyz_last_ok = True
                    app_main._readyz_last_checked_monotonic = time.monotonic()

                first_result: list[int] = []

                def call_first() -> None:
                    first_result.append(client.get('/readyz').status_code)

                t = threading.Thread(target=call_first)
                t.start()
                self.assertTrue(probe_started.wait(timeout=2.0))

                # Concurrent caller while probe is in-flight gets cached 200 without starting a 2nd probe.
                cached_ok = client.get('/readyz')
                self.assertEqual(cached_ok.status_code, 200)
                self.assertEqual(cached_ok.json(), {'status': 'ok'})
                self.assertEqual(probe_calls, 1)

                # Once cache is stale (>1s old), concurrent caller gets 503 without starting a 2nd probe.
                with app_main._readyz_state_lock:
                    app_main._readyz_last_checked_monotonic = time.monotonic() - 2.0
                stale_concurrent = client.get('/readyz')
                self.assertEqual(stale_concurrent.status_code, 503)
                self.assertEqual(stale_concurrent.json(), {'status': 'unavailable'})
                self.assertEqual(probe_calls, 1)

                release_probe.set()
                t.join(timeout=2.0)
                self.assertEqual(first_result, [200])

    def test_healthz_stays_lightweight_without_touching_db(self) -> None:
        with (
            patch('app.main._schedule_audit_task') as schedule_audit,
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            patch('app.main._check_database_readiness') as check_db,
        ):
            with TestClient(app) as client:
                response = client.get('/healthz')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})
        check_db.assert_not_called()
        schedule_audit.assert_not_called()

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

        with patch('app.main.readiness_engine.begin', return_value=cm):
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

    def test_configure_logging_is_idempotent_and_preserves_uvicorn_logs_in_both_modes(self) -> None:
        from uvicorn.logging import AccessFormatter, DefaultFormatter

        root_logger = logging.getLogger()
        original_handlers = list(root_logger.handlers)
        uvicorn_logger = logging.getLogger('uvicorn')
        uvicorn_access_logger = logging.getLogger('uvicorn.access')
        uvicorn_error_logger = logging.getLogger('uvicorn.error')
        orig_uvicorn = (list(uvicorn_logger.handlers), list(uvicorn_logger.filters), uvicorn_logger.propagate, uvicorn_logger.level)
        orig_access = (list(uvicorn_access_logger.handlers), list(uvicorn_access_logger.filters), uvicorn_access_logger.propagate, uvicorn_access_logger.level)
        orig_error = (list(uvicorn_error_logger.handlers), list(uvicorn_error_logger.filters), uvicorn_error_logger.propagate, uvicorn_error_logger.level)

        independent_stream = StringIO()
        independent_handler = logging.StreamHandler(independent_stream)
        root_logger.addHandler(independent_handler)

        try:
            # Configure uvicorn loggers as stock Uvicorn LOGGING_CONFIG does.
            uv_err_stream = StringIO()
            uv_acc_stream = StringIO()
            uv_default_handler = logging.StreamHandler(uv_err_stream)
            uv_default_handler.setFormatter(DefaultFormatter('%(levelprefix)s %(message)s', use_colors=False))
            uv_access_handler = logging.StreamHandler(uv_acc_stream)
            uv_access_handler.setFormatter(AccessFormatter('%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s', use_colors=False))

            uvicorn_logger.handlers = [uv_default_handler]
            uvicorn_logger.propagate = False
            uvicorn_logger.setLevel(logging.INFO)
            uvicorn_error_logger.handlers = []
            uvicorn_error_logger.propagate = True
            uvicorn_error_logger.setLevel(logging.INFO)
            uvicorn_access_logger.handlers = [uv_access_handler]
            uvicorn_access_logger.propagate = False
            uvicorn_access_logger.setLevel(logging.INFO)

            # 1) Text mode: repeated configure_logging keeps 1 managed handler, preserves independent handler & uvicorn handlers.
            dev_stream = StringIO()
            configure_logging(json_logs=False, stream=dev_stream)
            configure_logging(json_logs=False, stream=dev_stream)
            dev_handler = configure_logging(json_logs=False, stream=dev_stream)

            managed = [h for h in root_logger.handlers if getattr(h, '_picspeak_managed', False)]
            self.assertEqual(len(managed), 1)
            self.assertIs(managed[0], dev_handler)
            self.assertIn(independent_handler, root_logger.handlers)

            logging.getLogger('app.idempotency_probe').info('single-line-dev')
            self.assertEqual(len([line for line in dev_stream.getvalue().splitlines() if 'single-line-dev' in line]), 1)
            self.assertIn('single-line-dev', independent_stream.getvalue())

            uvicorn_error_logger.info('uvicorn-error-dev')
            uvicorn_access_logger.info(
                '%s - "%s %s HTTP/%s" %d',
                '127.0.0.1:1234',
                'GET',
                '/api/v1/public/reviews/SECRET_SHARE_DEV?photo_token=SECRET_PHOTO_DEV&X-Amz-Signature=SECRET_SIG_DEV',
                '1.1',
                200,
            )
            self.assertIn('uvicorn-error-dev', uv_err_stream.getvalue())
            self.assertIn('/api/v1/public/reviews/***', uv_acc_stream.getvalue())
            self.assertNotIn('SECRET_SHARE_DEV', uv_acc_stream.getvalue())
            self.assertNotIn('SECRET_PHOTO_DEV', uv_acc_stream.getvalue())
            self.assertNotIn('SECRET_SIG_DEV', uv_acc_stream.getvalue())

            # 2) JSON mode: independent handler still survives; uvicorn routes through the single JSON handler (no plain-text mix).
            json_stream = StringIO()
            configure_logging(json_logs=True, stream=json_stream)
            configure_logging(json_logs=True, stream=json_stream)
            json_handler = configure_logging(json_logs=True, stream=json_stream)

            managed = [h for h in root_logger.handlers if getattr(h, '_picspeak_managed', False)]
            self.assertEqual(len(managed), 1)
            self.assertIs(managed[0], json_handler)
            self.assertIn(independent_handler, root_logger.handlers)

            uv_err_before = len(uv_err_stream.getvalue())
            uv_acc_before = len(uv_acc_stream.getvalue())

            uvicorn_error_logger.info('uvicorn-error-json')
            uvicorn_access_logger.info(
                '%s - "%s %s HTTP/%s" %d',
                '127.0.0.1:5678',
                'GET',
                '/api/v1/generations/gen_1/image?generation_token=SECRET_GEN_JSON&signature=SECRET_SIG2&token=SECRET_TOK&share_token=SECRET_SH&X-Amz-Credential=SECRET_CRED',
                '1.1',
                200,
            )
            # Plain-text uvicorn handlers received nothing new in JSON mode.
            self.assertEqual(len(uv_err_stream.getvalue()), uv_err_before)
            self.assertEqual(len(uv_acc_stream.getvalue()), uv_acc_before)

            json_lines = [line for line in json_stream.getvalue().splitlines() if line.strip()]
            parsed_lines = [json.loads(line) for line in json_lines]
            self.assertTrue(any(e['logger'] == 'uvicorn.error' and 'uvicorn-error-json' in e['message'] for e in parsed_lines))
            access_entries = [e for e in parsed_lines if e['logger'] == 'uvicorn.access']
            self.assertEqual(len(access_entries), 1)
            self.assertEqual(access_entries[0]['serviceContext'], {'service': SERVICE_NAME})
            for secret in ('SECRET_GEN_JSON', 'SECRET_SIG2', 'SECRET_TOK', 'SECRET_SH', 'SECRET_CRED'):
                self.assertNotIn(secret, json_stream.getvalue())

            # 3) Switching back to text mode restores uvicorn's handlers.
            configure_logging(json_logs=False, stream=dev_stream)
            self.assertIn(uv_access_handler, uvicorn_access_logger.handlers)
            self.assertIn(uv_default_handler, uvicorn_logger.handlers)
        finally:
            root_logger.handlers = original_handlers
            uvicorn_logger.handlers, uvicorn_logger.filters, uvicorn_logger.propagate, uvicorn_logger.level = orig_uvicorn
            uvicorn_access_logger.handlers, uvicorn_access_logger.filters, uvicorn_access_logger.propagate, uvicorn_access_logger.level = orig_access
            uvicorn_error_logger.handlers, uvicorn_error_logger.filters, uvicorn_error_logger.propagate, uvicorn_error_logger.level = orig_error

    def test_capability_masking_covers_request_path_url_extras_and_exceptions(self) -> None:
        from app.core.logging_config import CapabilityMaskingFilter

        secrets = (
            'TOK_SHARE_999',
            'TOK_PHOTO_888',
            'TOK_GEN_777',
            'TOK_AMZ_666',
            'TOK_SIG_555',
            'TOK_GENERIC_444',
        )
        for json_mode in (False, True):
            with self.subTest(json_mode=json_mode):
                stream = StringIO()
                handler = configure_logging(json_logs=json_mode, stream=stream)
                try:
                    tokens = bind_request_log_context(
                        request_id='req_mask_1',
                        request_path=f'/api/v1/public/reviews/{secrets[0]}',
                    )
                    try:
                        try:
                            raise RuntimeError(
                                f'fetch failed https://r2.example/x?photo_token={secrets[1]}'
                                f'&generation_token={secrets[2]}&X-Amz-Security-Token={secrets[3]}'
                                f'&signature={secrets[4]}&token={secrets[5]}'
                            )
                        except RuntimeError:
                            logging.getLogger('app.mask_probe').exception(
                                'failed on /share/%s',
                                secrets[0],
                                extra={'url': f'/api/v1/public/reviews/{secrets[0]}?photo_token={secrets[1]}'},
                            )
                    finally:
                        reset_request_log_context(tokens)
                finally:
                    logging.getLogger().removeHandler(handler)

                rendered = stream.getvalue()
                self.assertTrue(rendered.strip())
                for secret in secrets:
                    self.assertNotIn(secret, rendered)
                self.assertIn('/share/***', rendered)
                if json_mode:
                    entry = json.loads(rendered.strip().splitlines()[-1])
                    self.assertEqual(entry['request_path'], '/api/v1/public/reviews/***')
                    self.assertEqual(entry['url'], '/api/v1/public/reviews/***?photo_token=***')

        # Direct filter check on url and request_path attributes
        flt = CapabilityMaskingFilter()
        rec = logging.LogRecord('app.test', logging.INFO, __file__, 1, 'ok', (), None)
        rec.request_path = '/api/v1/public/reviews/SECRET_SHARE_DIRECT'
        rec.url = 'https://example.com/share/SECRET_SHARE_DIRECT?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=SECRET_AMZ'
        flt.filter(rec)
        self.assertEqual(rec.request_path, '/api/v1/public/reviews/***')
        self.assertNotIn('SECRET_SHARE_DIRECT', rec.url)
        self.assertNotIn('SECRET_AMZ', rec.url)

    def test_duplicate_uvicorn_asgi_exception_is_suppressed_and_fallback_omits_error_reporting_type(self) -> None:
        from app.core.logging_config import mark_exception_reported

        stream = StringIO()
        handler = configure_logging(json_logs=True, stream=stream)
        try:
            # 1) Marked exception (as done by unhandled_exception_handler) is suppressed on uvicorn.error.
            try:
                raise RuntimeError('already-reported-boom')
            except RuntimeError as exc:
                mark_exception_reported(exc)
                logging.getLogger('uvicorn.error').error('Exception in ASGI application\n', exc_info=exc)

            self.assertEqual(stream.getvalue().strip(), '')

            # 2) Belt-and-suspenders: if an unmarked uvicorn ASGI error somehow reaches CloudLoggingJsonFormatter,
            #    it still formats as JSON at ERROR without @type ReportedErrorEvent.
            formatter = CloudLoggingJsonFormatter()
            try:
                raise RuntimeError('unmarked-uvicorn-boom')
            except RuntimeError as exc:
                record = logging.LogRecord(
                    'uvicorn.error',
                    logging.ERROR,
                    __file__,
                    1,
                    'Exception in ASGI application\n',
                    (),
                    (type(exc), exc, exc.__traceback__),
                )
            parsed = json.loads(formatter.format(record))
            self.assertEqual(parsed['severity'], 'ERROR')
            self.assertNotIn('@type', parsed)
            self.assertIn('unmarked-uvicorn-boom', parsed['message'])
        finally:
            logging.getLogger().removeHandler(handler)


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

    def test_worker_maintenance_backlog_check_emits_rate_limited_warning(self) -> None:
        worker = ReviewWorker(worker_name='maint-backlog-worker')
        self.addCleanup(worker._gen_executor.shutdown, False, cancel_futures=True)
        worker.record_heartbeat(now_monotonic=1000.0)

        stream = StringIO()
        handler = configure_logging(json_logs=True, stream=stream)
        db = MagicMock()
        clock = [1000.0]
        try:
            with (
                patch('app.db.session.SessionLocal', return_value=db),
                patch(
                    'app.services.worker.oldest_pending_task_ages_seconds',
                    return_value={
                        'oldest_pending_review_seconds': 750.0,
                        'oldest_pending_generation_seconds': None,
                    },
                ),
                patch('app.services.worker_health.settings.worker_pending_task_alert_threshold_seconds', 600),
                patch('time.monotonic', side_effect=lambda: clock[0]),
            ):
                worker._run_pending_backlog_check_if_due()
                # 100s later: maintenance check runs again, but warning cooldown (600s) suppresses duplicate warning.
                clock[0] = 1100.0
                worker._run_pending_backlog_check_if_due()
                # 700s after first warning: cooldown elapsed, second warning fires.
                clock[0] = 1700.0
                worker._run_pending_backlog_check_if_due()
        finally:
            logging.getLogger().removeHandler(handler)

        self.assertEqual(db.close.call_count, 3)
        entries = [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]
        warnings = [e for e in entries if e.get('event') == 'pending_task_backlog_stale']
        self.assertEqual(len(warnings), 2)
        self.assertEqual(warnings[0]['severity'], 'WARNING')
        self.assertEqual(warnings[0]['serviceContext'], {'service': SERVICE_NAME})
        self.assertEqual(warnings[0]['oldest_pending_review_seconds'], 750.0)
        self.assertEqual(warnings[1]['worker_heartbeat_stale'], True)

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
