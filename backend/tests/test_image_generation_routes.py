from __future__ import annotations

import sys
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
from unittest.mock import MagicMock, patch

from botocore.exceptions import ClientError
from fastapi import HTTPException
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_current_actor  # noqa: E402
from app.api.routers.generations import (  # noqa: E402
    GENERATION_IMAGE_CACHE_CONTROL,
    GENERATION_IMAGE_STABLE_WINDOW_SECONDS,
    GENERATION_IMAGE_TOKEN_PURPOSE,
    GENERATION_IMAGE_TTL_SECONDS,
    _build_generated_image_url,
    _generation_item_payload,
    _iter_storage_body,
    _mark_generation_dispatch_failed,
    _record_generation_event,
    download_generation,
    get_generation_image,
    get_generation_task_status,
    reuse_generation,
)
from app.core.security import sign_payload  # noqa: E402
from app.db.models import TaskStatus, User, UserPlan, UserStatus  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402


class ImageGenerationRoutesTests(unittest.TestCase):
    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    @contextmanager
    def _client(self):
        with patch('app.main.worker.start'), patch('app.main.worker.stop'):
            with TestClient(app) as client:
                yield client

    def _install_actor(self, plan: UserPlan) -> tuple[MagicMock, User]:
        db = MagicMock()
        user = User(
            id=7,
            public_id='usr_generation',
            email='generation@example.com',
            username='generation_user',
            plan=plan,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )

        def override_db():
            yield db

        def override_actor():
            return SimpleNamespace(user=user, plan=plan)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor
        return db, user

    def test_generation_analytics_failure_rolls_back_its_own_transaction(self) -> None:
        db = MagicMock()
        actor = SimpleNamespace(
            user=SimpleNamespace(public_id='usr_generation'),
            plan=UserPlan.free,
        )

        with patch(
            'app.api.routers.generations.record_product_event',
            side_effect=RuntimeError('analytics unavailable'),
        ):
            _record_generation_event(
                db,
                actor,
                event_name='generation_requested',
                page_path='/generate',
                metadata={'task_id': 'igt_test'},
            )

        db.rollback.assert_called_once_with()
        db.commit.assert_not_called()

    def test_guest_can_view_templates_but_cannot_create_generation(self) -> None:
        self._install_actor(UserPlan.guest)

        with self._client() as client:
            templates = client.get('/api/v1/generations/templates')
            response = client.post(
                '/api/v1/generations',
                json={
                    'generation_mode': 'general',
                    'intent': 'social_visual',
                    'prompt': 'cinematic rainy street portrait',
                    'template_key': 'social_visual',
                    'quality': 'low',
                    'size': '1024x1024',
                    'output_format': 'webp',
                    'async': True,
                },
            )

        self.assertEqual(templates.status_code, 200)
        self.assertGreaterEqual(len(templates.json()['items']), 5)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['error']['code'], 'GENERATION_LOGIN_REQUIRED')

    def test_free_users_are_limited_to_low_quality(self) -> None:
        self._install_actor(UserPlan.free)

        with patch('app.api.routers.generations.reserve_generation_credits_for_task'), self._client() as client:
            response = client.post(
                '/api/v1/generations',
                json={
                    'generation_mode': 'general',
                    'intent': 'photo_inspiration',
                    'prompt': 'golden hour street photo inspiration',
                    'template_key': 'photo_inspiration',
                    'quality': 'medium',
                    'size': '1024x1024',
                    'output_format': 'webp',
                    'async': True,
                },
            )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['error']['code'], 'GENERATION_QUALITY_FORBIDDEN')

    def test_pro_user_creates_general_generation_task(self) -> None:
        db, _user = self._install_actor(UserPlan.pro)
        db.query.return_value.filter.return_value.first.return_value = None

        with self._client() as client:
            response = client.post(
                '/api/v1/generations',
                json={
                    'generation_mode': 'general',
                    'intent': 'social_visual',
                    'prompt': 'cinematic rainy street portrait with neon reflections',
                    'template_key': 'social_visual',
                    'quality': 'medium',
                    'size': '1024x1536',
                    'output_format': 'webp',
                    'async': True,
                    'idempotency_key': 'gen-idempotency-1',
                },
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['status'], 'PENDING')
        self.assertTrue(body['task_id'].startswith('igt_'))
        self.assertEqual(body['credits_reserved'], 8)
        db.add.assert_called()
        db.commit.assert_called()

    def test_reuse_generation_preserves_valid_locale_and_defaults_invalid_locale_to_english(self) -> None:
        db = MagicMock()
        user = User(
            id=7,
            public_id='usr_generation',
            email='generation@example.com',
            username='generation_user',
            plan=UserPlan.pro,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        actor = SimpleNamespace(user=user, plan=UserPlan.pro)
        base_image = SimpleNamespace(
            generation_mode='general',
            intent='social_visual',
            prompt='cinematic rainy street portrait',
            template_key='social_visual',
            quality='low',
            size='1024x1024',
            output_format='webp',
            source_photo_id=None,
            source_review_id=None,
        )

        captured_locales: list[str] = []

        def fake_make_generation_task(**kwargs):
            captured_locales.append(kwargs['request_payload']['locale'])
            return SimpleNamespace(public_id=f'igt_reuse_{len(captured_locales)}', status=TaskStatus.PENDING)

        with (
            patch('app.api.routers.generations._reserve_generation_credits_or_raise'),
            patch('app.api.routers.generations.stage_generation_request_event'),
            patch('app.api.routers.generations.deliver_generation_request_event'),
            patch('app.api.routers.generations.settings.cloud_tasks_enabled', False),
            patch('app.api.routers.generations.make_generation_task', side_effect=fake_make_generation_task),
            patch('app.api.routers.generations._find_generation_owned') as find_generation,
        ):
            for locale in ('ja', 'fr'):
                find_generation.return_value = SimpleNamespace(
                    **{
                        **base_image.__dict__,
                        'metadata_json': {
                            'user_prompt': 'cinematic rainy street portrait',
                            'locale': locale,
                        },
                    }
                )
                reuse_generation(
                    'gen_reuse',
                    SimpleNamespace(query_params={'analytics_source': 'history'}, headers={}),
                    db=db,
                    actor=actor,
                )

        self.assertEqual(captured_locales, ['ja', 'en'])

    def test_cloud_tasks_enabled_dispatches_generation_task(self) -> None:
        db, _user = self._install_actor(UserPlan.pro)
        db.query.return_value.filter.return_value.first.return_value = None

        with (
            patch('app.api.routers.generations.settings.cloud_tasks_enabled', True),
            patch('app.api.routers.generations.reserve_generation_credits_for_task'),
            patch('app.api.routers.generations.enqueue_image_generation_task') as enqueue_task,
            self._client() as client,
        ):
            response = client.post(
                '/api/v1/generations',
                json={
                    'generation_mode': 'general',
                    'intent': 'social_visual',
                    'prompt': 'cinematic rainy street portrait with neon reflections',
                    'template_key': 'social_visual',
                    'quality': 'medium',
                    'size': '1024x1536',
                    'output_format': 'webp',
                    'async': True,
                },
            )

        self.assertEqual(response.status_code, 200)
        enqueue_task.assert_called_once()
        self.assertTrue(enqueue_task.call_args.args[0].startswith('igt_'))

    def test_mark_generation_dispatch_failed_records_terminal_failure_event(self) -> None:
        db = MagicMock()
        task = SimpleNamespace(
            id=10,
            public_id='igt_dispatch_failed',
            owner_user_id=7,
            request_payload={'quality': 'low', 'size': '1024x1024'},
            generation_mode='general',
            intent='social_visual',
        )
        owner = SimpleNamespace(id=7, public_id='usr_generation', plan=UserPlan.pro)
        task_query = MagicMock()
        task_query.filter.return_value.first.return_value = task
        owner_query = MagicMock()
        owner_query.filter.return_value.first.return_value = owner
        db.query.side_effect = [task_query, owner_query]

        with (
            patch('app.api.routers.generations.release_generation_credit_reservation') as release_reservation,
            patch('app.api.routers.generations.stage_generation_terminal_event') as stage_event,
            patch('app.api.routers.generations.deliver_generation_terminal_event') as deliver_event,
            patch('app.api.routers.generations.record_generation_terminal') as notification_event,
        ):
            _mark_generation_dispatch_failed(db, 'igt_dispatch_failed')
        notification_event.assert_called_once_with(db, task)

        self.assertEqual(task.status, TaskStatus.FAILED)
        self.assertEqual(task.error_code, 'TASK_DISPATCH_FAILED')
        release_reservation.assert_called_once_with(db, task=task, reason='TASK_DISPATCH_FAILED')
        stage_event.assert_called_once()
        self.assertEqual(stage_event.call_args.kwargs['event_name'], 'generation_failed')
        deliver_event.assert_called_once_with(db, task=task, owner=owner)
        self.assertEqual(db.commit.call_count, 1)

    def test_internal_generation_task_execute_requires_dispatch_secret(self) -> None:
        with patch('app.api.routers.tasks.settings.cloud_tasks_enabled', True), patch(
            'app.api.routers.tasks.settings.cloud_tasks_secret',
            'secret',
        ), self._client() as client:
            response = client.post('/api/v1/internal/tasks/generations/execute', json={'task_id': 'igt_123'})

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['error']['code'], 'TASK_DISPATCH_UNAUTHORIZED')

    def test_internal_generation_task_execute_processes_task(self) -> None:
        with (
            patch('app.api.routers.tasks.settings.cloud_tasks_enabled', True),
            patch('app.api.routers.tasks.settings.cloud_tasks_secret', 'secret'),
            patch('app.api.routers.tasks.process_image_generation_task', return_value={'result': 'processed', 'status': 'SUCCEEDED'}) as process_task,
            self._client() as client,
        ):
            response = client.post(
                '/api/v1/internal/tasks/generations/execute',
                json={'task_id': 'igt_123'},
                headers={'X-Task-Dispatch-Secret': 'secret'},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['result'], 'processed')
        process_task.assert_called_once_with('igt_123', worker_name='cloud-tasks')

    def test_internal_generation_task_execute_retries_lease_mismatch(self) -> None:
        with (
            patch('app.api.routers.tasks.settings.cloud_tasks_enabled', True),
            patch('app.api.routers.tasks.settings.cloud_tasks_secret', 'secret'),
            patch(
                'app.api.routers.tasks.process_image_generation_task',
                return_value={'result': 'noop', 'status': 'RUNNING', 'reason': 'lease_mismatch'},
            ),
            self._client() as client,
        ):
            response = client.post(
                '/api/v1/internal/tasks/generations/execute',
                json={'task_id': 'igt_123'},
                headers={'X-Task-Dispatch-Secret': 'secret'},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['error']['code'], 'TASK_ALREADY_RUNNING')

    def test_generation_payload_exposes_source_photo_and_review_public_ids(self) -> None:
        db = MagicMock()
        photo_query = MagicMock()
        photo_query.filter.return_value.first.return_value = ('pho_source',)
        review_query = MagicMock()
        review_query.filter.return_value.first.return_value = ('rev_source',)
        db.query.side_effect = [photo_query, review_query]
        image = SimpleNamespace(
            public_id='gen_source',
            task=None,
            object_bucket='generated',
            object_key='generated/user_usr/2026/04/gen_source.webp',
            generation_mode='review_linked',
            intent='retake_reference',
            prompt='final structured prompt',
            revised_prompt=None,
            model_name='gpt-image-2',
            model_snapshot='gpt-image-2-2026-04-21',
            quality='medium',
            size='1024x1536',
            output_format='webp',
            credits_charged=8,
            template_key=None,
            source_photo_id=11,
            source_review_id=22,
            created_at=datetime.now(timezone.utc),
            metadata_json={'user_prompt': 'next shoot reference'},
        )

        request = SimpleNamespace(
            base_url='http://internal/',
            headers={'host': 'internal', 'x-forwarded-host': 'api.picspeak.art', 'x-forwarded-proto': 'https'},
            url_for=lambda _route_name, generation_id: f'http://internal/api/v1/generations/{generation_id}/image',
        )

        with patch('app.api.routers.generations._build_storage_photo_url') as build_storage_url:
            payload = _generation_item_payload(db, image, request=request, owner_public_id='usr_generation')

        self.assertEqual(payload.source_photo_id, 'pho_source')
        self.assertEqual(payload.source_review_id, 'rev_source')
        self.assertEqual(payload.prompt, 'next shoot reference')
        parsed = urlsplit(payload.image_url)
        self.assertEqual(f'{parsed.scheme}://{parsed.netloc}{parsed.path}', 'https://api.picspeak.art/api/v1/generations/gen_source/image')
        self.assertIn('generation_token', parse_qs(parsed.query))
        build_storage_url.assert_not_called()

    def test_generated_image_proxy_url_stays_stable_across_calls_in_window(self) -> None:
        self.assertEqual(GENERATION_IMAGE_TTL_SECONDS, 24 * 3600)
        self.assertEqual(GENERATION_IMAGE_STABLE_WINDOW_SECONDS, 24 * 3600)
        self.assertEqual(GENERATION_IMAGE_CACHE_CONTROL, 'private, max-age=3600, stale-while-revalidate=86400')
        request = SimpleNamespace(
            base_url='https://api.picspeak.art/',
            headers={'host': 'api.picspeak.art'},
            url_for=lambda _route_name, generation_id: f'https://api.picspeak.art/api/v1/generations/{generation_id}/image',
        )
        image = SimpleNamespace(public_id='gen_stable', object_bucket='generated', object_key='generated/user_u/gen_stable.webp')
        window = GENERATION_IMAGE_STABLE_WINDOW_SECONDS

        with patch('app.api.routers.generations.time.time', return_value=window * 100 + 60):
            first = _build_generated_image_url(image, request=request, owner_public_id='usr_owner')
        with patch('app.api.routers.generations.time.time', return_value=window * 100 + 3600 * 12):
            second = _build_generated_image_url(image, request=request, owner_public_id='usr_owner')
        with patch('app.api.routers.generations.time.time', return_value=window * 101 + 60):
            next_window = _build_generated_image_url(image, request=request, owner_public_id='usr_owner')

        self.assertEqual(first, second)
        self.assertNotEqual(first, next_window)

    def test_generation_image_proxy_enforces_byte_limit_while_streaming_unknown_length(self) -> None:
        now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        image = SimpleNamespace(
            public_id='gen_stream_cap',
            object_bucket='generated',
            object_key='generated/user_usr_owner/2026/11/gen_stream_cap.webp',
            content_type='image/webp',
            deleted_at=None,
            object_purged_at=None,
            created_at=now,
            updated_at=now,
        )
        db = MagicMock()
        db.query.return_value.join.return_value.filter.return_value.first.return_value = image
        token = sign_payload({'generation_id': 'gen_stream_cap', 'uid': 'usr_owner'}, ttl_seconds=3600, purpose=GENERATION_IMAGE_TOKEN_PURPOSE)

        closed = False
        read_chunks = 0

        class ChunkedBody:
            def iter_chunks(self, chunk_size: int = 64 * 1024):
                nonlocal read_chunks
                for chunk in (b'12345678', b'abcdefgh', b'never-read'):
                    read_chunks += 1
                    yield chunk

            def close(self):
                nonlocal closed
                closed = True

        storage = MagicMock()
        storage.get_object.return_value = {
            'ContentType': 'image/webp',
            'Body': ChunkedBody(),
        }

        with (
            patch('app.api.routers.generations.get_object_storage_client', return_value=storage),
            patch('app.api.routers.generations.settings.image_generation_download_max_bytes', 10),
        ):
            import asyncio

            response = get_generation_image('gen_stream_cap', generation_token=token, if_none_match=None, db=db)
            emitted: list[bytes] = []

            async def drain() -> None:
                async for chunk in response.body_iterator:
                    emitted.append(chunk)

            with self.assertRaises(HTTPException) as raised:
                asyncio.run(drain())

        self.assertEqual(raised.exception.status_code, 413)
        self.assertEqual(raised.exception.detail['code'], 'GENERATION_IMAGE_TOO_LARGE')
        self.assertEqual(emitted, [b'12345678'])
        self.assertEqual(read_chunks, 2)
        self.assertTrue(closed)

        # Also verify file-like body without iter_chunks stops and closes at limit.
        raw_body = BytesIO(b'x' * 25)
        with self.assertRaises(HTTPException) as raw_raised:
            list(_iter_storage_body(raw_body, max_bytes=10))
        self.assertEqual(raw_raised.exception.status_code, 413)
        self.assertTrue(raw_body.closed)

    def test_generation_image_proxy_serves_private_cached_image_and_304(self) -> None:
        now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        image = SimpleNamespace(
            public_id='gen_proxy_1',
            object_bucket='generated',
            object_key='generated/user_usr_owner/2026/11/gen_proxy_1.webp',
            content_type='image/webp',
            deleted_at=None,
            object_purged_at=None,
            created_at=now,
            updated_at=now,
        )
        db = MagicMock()
        db.query.return_value.join.return_value.filter.return_value.first.return_value = image
        storage = MagicMock()
        storage.get_object.return_value = {
            'ContentLength': 11,
            'ContentType': 'image/webp',
            'Body': BytesIO(b'webp-binary'),
        }
        token = sign_payload({'generation_id': 'gen_proxy_1', 'uid': 'usr_owner'}, ttl_seconds=3600, purpose=GENERATION_IMAGE_TOKEN_PURPOSE)

        def override_db():
            yield db

        app.dependency_overrides[get_db] = override_db
        with patch('app.api.routers.generations.get_object_storage_client', return_value=storage), self._client() as client:
            first = client.get('/api/v1/generations/gen_proxy_1/image', params={'generation_token': token})
            etag = first.headers['etag']
            second = client.get(
                '/api/v1/generations/gen_proxy_1/image',
                params={'generation_token': token},
                headers={'If-None-Match': etag},
            )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.content, b'webp-binary')
        self.assertEqual(first.headers['cache-control'], GENERATION_IMAGE_CACHE_CONTROL)
        self.assertEqual(first.headers['x-content-type-options'], 'nosniff')
        self.assertEqual(first.headers['content-length'], '11')
        self.assertEqual(second.status_code, 304)
        self.assertEqual(second.headers['etag'], etag)
        self.assertEqual(second.headers['cache-control'], GENERATION_IMAGE_CACHE_CONTROL)
        storage.get_object.assert_called_once_with(Bucket='generated', Key='generated/user_usr_owner/2026/11/gen_proxy_1.webp')

    def test_generation_image_proxy_enforces_owner_deleted_purged_and_missing_states(self) -> None:
        now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        base = dict(
            public_id='gen_acl',
            object_bucket='generated',
            object_key='generated/user_usr_owner/2026/11/gen_acl.webp',
            content_type='image/webp',
            deleted_at=None,
            object_purged_at=None,
            created_at=now,
            updated_at=now,
        )
        valid_token = sign_payload({'generation_id': 'gen_acl', 'uid': 'usr_owner'}, ttl_seconds=3600, purpose=GENERATION_IMAGE_TOKEN_PURPOSE)
        other_gen_token = sign_payload({'generation_id': 'gen_other', 'uid': 'usr_owner'}, ttl_seconds=3600, purpose=GENERATION_IMAGE_TOKEN_PURPOSE)

        # Wrong generation_id in token -> 403
        with self.assertRaises(HTTPException) as wrong_gen:
            get_generation_image('gen_acl', generation_token=other_gen_token, if_none_match=None, db=MagicMock())
        self.assertEqual(wrong_gen.exception.status_code, 403)
        self.assertEqual(wrong_gen.exception.detail['code'], 'GENERATION_TOKEN_INVALID')

        # Not owned / missing -> 404
        db_missing = MagicMock()
        db_missing.query.return_value.join.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(HTTPException) as not_found:
            get_generation_image('gen_acl', generation_token=valid_token, if_none_match=None, db=db_missing)
        self.assertEqual(not_found.exception.status_code, 404)
        self.assertEqual(not_found.exception.detail['code'], 'GENERATION_NOT_FOUND')

        # Soft-deleted -> 404
        db_deleted = MagicMock()
        db_deleted.query.return_value.join.return_value.filter.return_value.first.return_value = SimpleNamespace(**{**base, 'deleted_at': now})
        with self.assertRaises(HTTPException) as deleted:
            get_generation_image('gen_acl', generation_token=valid_token, if_none_match=None, db=db_deleted)
        self.assertEqual(deleted.exception.status_code, 404)
        self.assertEqual(deleted.exception.detail['code'], 'GENERATION_NOT_FOUND')

        # Purged -> 410
        db_purged = MagicMock()
        db_purged.query.return_value.join.return_value.filter.return_value.first.return_value = SimpleNamespace(**{**base, 'deleted_at': now, 'object_purged_at': now})
        with self.assertRaises(HTTPException) as purged:
            get_generation_image('gen_acl', generation_token=valid_token, if_none_match=None, db=db_purged)
        self.assertEqual(purged.exception.status_code, 410)
        self.assertEqual(purged.exception.detail['code'], 'GENERATION_IMAGE_EXPIRED')

        # Missing object in storage -> 410
        db_live = MagicMock()
        db_live.query.return_value.join.return_value.filter.return_value.first.return_value = SimpleNamespace(**base)
        storage = MagicMock()
        storage.get_object.side_effect = ClientError({'Error': {'Code': 'NoSuchKey'}}, 'GetObject')
        with patch('app.api.routers.generations.get_object_storage_client', return_value=storage):
            with self.assertRaises(HTTPException) as missing_obj:
                get_generation_image('gen_acl', generation_token=valid_token, if_none_match=None, db=db_live)
        self.assertEqual(missing_obj.exception.status_code, 410)
        self.assertEqual(missing_obj.exception.detail['code'], 'GENERATION_IMAGE_EXPIRED')

    def test_generation_task_status_read_does_not_commit(self) -> None:
        db = MagicMock()
        task = SimpleNamespace(
            id=10,
            public_id='igt_status',
            status=TaskStatus.PENDING,
            progress=0,
            attempt_count=0,
            max_attempts=2,
            next_attempt_at=None,
            last_heartbeat_at=None,
            started_at=None,
            finished_at=None,
            error_code=None,
            error_message=None,
        )
        task_query = MagicMock()
        task_query.filter.return_value.first.return_value = task
        image_query = MagicMock()
        image_query.filter.return_value.first.return_value = None
        db.query.side_effect = [task_query, image_query]

        response = get_generation_task_status(
            'igt_status',
            db=db,
            actor=SimpleNamespace(user=SimpleNamespace(id=7)),
        )

        self.assertEqual(response.task_id, 'igt_status')
        self.assertIsNone(response.generation_id)
        db.commit.assert_not_called()

    def test_generation_download_rejects_oversized_object(self) -> None:
        db = MagicMock()
        image = SimpleNamespace(
            public_id='gen_large',
            object_bucket='generated',
            object_key='generated/gen_large.webp',
            content_type='image/webp',
            output_format='webp',
        )
        storage = MagicMock()
        storage.get_object.return_value = {
            'ContentLength': 25 * 1024 * 1024 + 1,
            'ContentType': 'image/webp',
            'Body': SimpleNamespace(iter_chunks=lambda: iter([b'image-bytes'])),
        }

        with patch('app.api.routers.generations._find_generation_owned', return_value=image), patch(
            'app.api.routers.generations.get_object_storage_client',
            return_value=storage,
        ), self.assertRaises(HTTPException) as raised:
            download_generation(
                'gen_large',
                db=db,
                actor=SimpleNamespace(user=SimpleNamespace(id=7)),
            )

        self.assertEqual(raised.exception.status_code, 413)
        self.assertEqual(raised.exception.detail['code'], 'GENERATION_DOWNLOAD_TOO_LARGE')

    def test_generation_download_rejects_unknown_object_size(self) -> None:
        db = MagicMock()
        image = SimpleNamespace(
            public_id='gen_unknown_size',
            object_bucket='generated',
            object_key='generated/gen_unknown_size.webp',
            content_type='image/webp',
            output_format='webp',
        )
        storage = MagicMock()
        storage.get_object.return_value = {
            'ContentType': 'image/webp',
            'Body': SimpleNamespace(iter_chunks=lambda: iter([b'image-bytes'])),
        }

        with patch('app.api.routers.generations._find_generation_owned', return_value=image), patch(
            'app.api.routers.generations.get_object_storage_client',
            return_value=storage,
        ), self.assertRaises(HTTPException) as raised:
            download_generation(
                'gen_unknown_size',
                db=db,
                actor=SimpleNamespace(user=SimpleNamespace(id=7)),
            )

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.detail['code'], 'GENERATION_DOWNLOAD_SIZE_UNKNOWN')


if __name__ == '__main__':
    unittest.main()
