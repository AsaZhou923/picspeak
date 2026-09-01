from __future__ import annotations

import sys
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_current_actor  # noqa: E402
from app.api.routers.generations import (  # noqa: E402
    _generation_item_payload,
    _mark_generation_dispatch_failed,
    _record_generation_event,
    download_generation,
    get_generation_task_status,
)
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
        ):
            _mark_generation_dispatch_failed(db, 'igt_dispatch_failed', 'queue unavailable')

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

        payload = _generation_item_payload(db, image)

        self.assertEqual(payload.source_photo_id, 'pho_source')
        self.assertEqual(payload.source_review_id, 'rev_source')
        self.assertEqual(payload.prompt, 'next shoot reference')

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
