from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from PIL import Image

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import GeneratedImage, TaskStatus  # noqa: E402
from app.services.generation_credit_reservations import GenerationCreditReservationError  # noqa: E402
from app.services.image_generation import ImageGenerationResult  # noqa: E402
from app.services.image_generation_task_processor import (  # noqa: E402
    _load_reference_image,
    _claim_generation_task,
    _reconcile_pending_generation_terminal_events,
    _record_terminal_generation_events_after_state_commit,
    _process_generation_task,
    process_image_generation_task,
    count_monthly_generation_credit_consumed,
    count_monthly_generation_credit_grants,
    expire_image_generation_tasks,
    _output_format_for_content_type,
    _persist_successful_generation,
    record_generation_task_event_once,
    deliver_generation_request_event,
    deliver_generation_terminal_event,
    stage_generation_request_event,
    stage_generation_terminal_event,
    _serialize_generation_task_status,
    claim_next_pending_image_generation_task,
    make_generation_task,
)


class ImageGenerationTaskProcessorTests(unittest.TestCase):
    def test_pending_cloud_task_retries_when_global_generation_capacity_is_full(self) -> None:
        task = SimpleNamespace(
            id=42,
            public_id='igt_pending_capacity',
            status=TaskStatus.PENDING,
            next_attempt_at=None,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [task, task]

        with (
            patch('app.services.image_generation_task_processor.SessionLocal', return_value=db),
            patch('app.services.image_generation_task_processor.expire_image_generation_tasks'),
            patch('app.services.image_generation_task_processor._claim_generation_task', return_value=False),
            patch('app.services.image_generation_task_processor._process_generation_task') as process_task,
        ):
            result = process_image_generation_task('igt_pending_capacity', worker_name='cloud-tasks')

        self.assertEqual(result, {'result': 'delayed', 'status': 'PENDING', 'reason': 'capacity'})
        process_task.assert_not_called()
        db.close.assert_called_once_with()

    def test_duplicate_running_invocation_without_lease_is_noop(self) -> None:
        task = SimpleNamespace(
            id=42,
            public_id='igt_running',
            status=TaskStatus.RUNNING,
            claimed_by='worker:lease-token',
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = task

        with patch('app.services.image_generation_task_processor.SessionLocal', return_value=db), patch(
            'app.services.image_generation_task_processor._process_generation_task'
        ) as process_task:
            result = process_image_generation_task('igt_running', worker_name='cloud-tasks')

        self.assertEqual(result, {'result': 'noop', 'status': 'RUNNING', 'reason': 'lease_mismatch'})
        process_task.assert_not_called()

    def test_serialize_generation_task_status_includes_generation_id_when_succeeded(self) -> None:
        task = SimpleNamespace(
            public_id='igt_123',
            status=TaskStatus.SUCCEEDED,
            progress=100,
            attempt_count=1,
            max_attempts=2,
            next_attempt_at=None,
            last_heartbeat_at=None,
            started_at=None,
            finished_at=None,
            error_code=None,
            error_message=None,
        )
        image = SimpleNamespace(public_id='gen_123')

        payload = _serialize_generation_task_status(task, image)

        self.assertEqual(payload['task_id'], 'igt_123')
        self.assertEqual(payload['generation_id'], 'gen_123')
        self.assertIsNone(payload['error'])

    def test_serialize_generation_task_status_only_says_retry_scheduled_when_pending(self) -> None:
        base_task = {
            'public_id': 'igt_failed',
            'progress': 100,
            'attempt_count': 2,
            'max_attempts': 2,
            'last_heartbeat_at': None,
            'started_at': None,
            'finished_at': None,
            'error_code': 'OPENAI_IMAGE_GENERATION_FAILED',
            'error_message': 'provider detail',
        }
        failed_payload = _serialize_generation_task_status(
            SimpleNamespace(**base_task, status=TaskStatus.FAILED, next_attempt_at=None),
            None,
        )
        pending_payload = _serialize_generation_task_status(
            SimpleNamespace(**base_task, status=TaskStatus.PENDING, next_attempt_at='2026-04-28T14:20:00Z'),
            None,
        )

        self.assertEqual(failed_payload['error']['message'], 'Image generation is temporarily unavailable')
        self.assertFalse(failed_payload['error']['retryable'])
        self.assertEqual(
            pending_payload['error']['message'],
            'Image generation is temporarily unavailable; retry scheduled',
        )
        self.assertTrue(pending_payload['error']['retryable'])

    def test_persist_successful_generation_records_generated_image_without_usage_ledger(self) -> None:
        db = MagicMock()
        task = SimpleNamespace(
            id=10,
            public_id='igt_success',
            owner_user_id=20,
            source_photo_id=None,
            source_review_id=None,
            generation_mode='general',
            intent='social_visual',
            prompt='final prompt',
            request_payload={
                'quality': 'medium',
                'size': '1024x1536',
                'output_format': 'webp',
                'template_key': 'social_visual',
                'model_snapshot': 'gpt-image-2-2026-04-21',
            },
        )
        owner = SimpleNamespace(id=20, public_id='usr_abc')
        result = ImageGenerationResult(
            image_bytes=b'fake',
            content_type='image/webp',
            revised_prompt='revised prompt',
            input_text_tokens=12,
            input_image_tokens=0,
            output_image_tokens=100,
            cost_usd=0.041,
            model_name='gpt-image-2',
        )

        generated = _persist_successful_generation(
            db,
            task=task,
            owner=owner,
            result=result,
            bucket='bucket',
            object_key='generated/user_usr_abc/2026/04/gen_abc.webp',
            credits_charged=8,
            generated_public_id='gen_abc',
        )

        self.assertIsInstance(generated, GeneratedImage)
        self.assertEqual(generated.public_id, 'gen_abc')
        self.assertEqual(generated.credits_charged, 8)
        added_records = [call.args[0] for call in db.add.call_args_list]
        self.assertTrue(any(isinstance(record, GeneratedImage) for record in added_records))
        self.assertEqual(len(added_records), 1)

    def test_claim_generation_task_respects_worker_concurrency_limit(self) -> None:
        db = MagicMock()
        running_query = MagicMock()
        running_query.filter.return_value.scalar.return_value = 1
        db.query.return_value = running_query

        with (
            unittest.mock.patch('app.services.image_generation_task_processor.settings') as mocked_settings,
        ):
            mocked_settings.image_generation_worker_concurrency = 1
            claimed = _claim_generation_task(db, task_id=10, claim_token='embedded-worker-0:token')

        self.assertFalse(claimed)
        running_query.filter.return_value.scalar.assert_called_once()
        running_query.filter.return_value.update.assert_not_called()
        db.rollback.assert_called_once()

    def test_claim_generation_task_takes_postgresql_advisory_lock_before_count(self) -> None:
        db = MagicMock()
        db.bind = None
        db.get_bind.return_value.dialect.name = 'postgresql'
        running_query = MagicMock()
        running_query.filter.return_value.scalar.return_value = 0
        update_query = MagicMock()
        update_query.filter.return_value.update.return_value = 1
        db.query.side_effect = [running_query, update_query]

        with unittest.mock.patch('app.services.image_generation_task_processor.settings') as mocked_settings, unittest.mock.patch(
            'app.services.image_generation_task_processor._reconcile_pending_generation_request_events'
        ), unittest.mock.patch(
            'app.services.image_generation_task_processor._reconcile_pending_generation_terminal_events'
        ):
            mocked_settings.image_generation_worker_concurrency = 1
            claimed = _claim_generation_task(db, task_id=10, claim_token='embedded-worker-0:token')

        self.assertTrue(claimed)
        db.execute.assert_called_once()
        running_query.filter.return_value.scalar.assert_called_once()
        update_query.filter.return_value.update.assert_called_once()
        db.commit.assert_called_once()

    def test_expire_image_generation_tasks_requeues_stalled_running_task(self) -> None:
        now = datetime.now(timezone.utc)
        task = SimpleNamespace(
            owner_user_id=20,
            status=TaskStatus.RUNNING,
            progress=60,
            attempt_count=1,
            max_attempts=2,
            error_code=None,
            error_message=None,
            next_attempt_at=None,
            claimed_by='embedded-worker',
            started_at=now - timedelta(hours=1),
            finished_at=None,
            last_heartbeat_at=now - timedelta(hours=1),
            public_id='igt_stalled',
            generation_mode='general',
            intent='social_visual',
            request_payload={},
        )
        db = MagicMock()
        completed_query = MagicMock()
        completed_query.join.return_value.filter.return_value.all.return_value = []
        stalled_query = MagicMock()
        stalled_query.filter.return_value.all.return_value = [task]
        owner_query = MagicMock()
        owner_query.filter.return_value.first.return_value = None
        db.query.side_effect = [completed_query, stalled_query, owner_query]

        with unittest.mock.patch('app.services.image_generation_task_processor.settings') as mocked_settings, unittest.mock.patch(
            'app.services.image_generation_task_processor._reconcile_pending_generation_request_events'
        ), unittest.mock.patch('app.services.image_generation_task_processor._reconcile_pending_generation_terminal_events'):
            mocked_settings.image_generation_task_stale_timeout_seconds = 600
            mocked_settings.image_generation_timeout_seconds = 180
            mocked_settings.review_retry_base_delay_seconds = 10
            mocked_settings.review_retry_max_delay_seconds = 300
            expire_image_generation_tasks(db)

        self.assertEqual(task.status, TaskStatus.PENDING)
        self.assertEqual(task.progress, 0)
        self.assertEqual(task.error_code, 'TASK_STALLED')
        self.assertEqual(task.claimed_by, None)
        self.assertEqual(task.started_at, None)
        self.assertIsNotNone(task.next_attempt_at)
        db.add.assert_called_once_with(task)
        db.commit.assert_called_once()

    def test_expire_image_generation_tasks_dead_letters_exhausted_stalled_task(self) -> None:
        now = datetime.now(timezone.utc)
        task = SimpleNamespace(
            owner_user_id=20,
            status=TaskStatus.RUNNING,
            progress=60,
            attempt_count=2,
            max_attempts=2,
            error_code=None,
            error_message=None,
            next_attempt_at=None,
            claimed_by='embedded-worker',
            started_at=now - timedelta(hours=1),
            finished_at=None,
            last_heartbeat_at=now - timedelta(hours=1),
            public_id='igt_stalled',
            generation_mode='general',
            intent='social_visual',
            request_payload={},
        )
        db = MagicMock()
        completed_query = MagicMock()
        completed_query.join.return_value.filter.return_value.all.return_value = []
        stalled_query = MagicMock()
        stalled_query.filter.return_value.all.return_value = [task]
        owner_query = MagicMock()
        owner_query.filter.return_value.first.return_value = SimpleNamespace(id=20, public_id='usr_owner', plan='pro')
        db.query.side_effect = [completed_query, stalled_query, owner_query]

        with (
            unittest.mock.patch('app.services.image_generation_task_processor.settings') as mocked_settings,
            unittest.mock.patch('app.services.image_generation_task_processor._reconcile_pending_generation_request_events'),
            unittest.mock.patch('app.services.image_generation_task_processor._reconcile_pending_generation_terminal_events'),
            unittest.mock.patch('app.services.image_generation_task_processor.release_generation_credit_reservation') as release_reservation,
            unittest.mock.patch('app.services.image_generation_task_processor.deliver_generation_terminal_event') as deliver_event,
        ):
            mocked_settings.image_generation_task_stale_timeout_seconds = 600
            mocked_settings.image_generation_timeout_seconds = 180
            expire_image_generation_tasks(db)

        self.assertEqual(task.status, TaskStatus.DEAD_LETTER)
        self.assertEqual(task.progress, 100)
        self.assertEqual(task.error_code, 'TASK_STALLED')
        self.assertIsNotNone(task.finished_at)
        db.add.assert_called_once_with(task)
        self.assertEqual(db.commit.call_count, 1)
        release_reservation.assert_called_once()
        deliver_event.assert_called_once()
        self.assertEqual(task.request_payload['pending_terminal_event']['event_name'], 'generation_failed')

    def test_make_generation_task_uses_null_next_attempt_for_immediate_claim(self) -> None:
        task = make_generation_task(
            owner_user_id=20,
            prompt='final prompt',
            request_payload={'quality': 'low', 'size': '1024x1024', 'output_format': 'webp'},
            generation_mode='general',
            intent='social_visual',
        )

        self.assertEqual(task.status, TaskStatus.PENDING)
        self.assertIsNone(task.next_attempt_at)

    def test_output_format_follows_downloaded_content_type(self) -> None:
        self.assertEqual(_output_format_for_content_type('image/png', fallback='webp'), 'png')
        self.assertEqual(_output_format_for_content_type('image/jpeg; charset=binary', fallback='webp'), 'jpeg')
        self.assertEqual(_output_format_for_content_type('', fallback='webp'), 'webp')

    def test_load_reference_image_uploads_normalized_public_object_url(self) -> None:
        db = MagicMock()
        photo = SimpleNamespace(
            id=11,
            public_id='pho_source',
            owner_user_id=20,
            status='READY',
            bucket='source-bucket',
            object_key='uploads/user 20/source image.png',
            content_type='image/png',
        )
        photo_query = MagicMock()
        photo_query.filter.return_value.first.return_value = photo
        db.query.return_value = photo_query
        storage = MagicMock()
        source_image = BytesIO()
        Image.new('RGB', (1536, 2048), color=(120, 80, 40)).save(source_image, format='JPEG')
        storage.get_object.return_value = {
            'ContentType': 'image/png',
            'Body': SimpleNamespace(read=lambda: source_image.getvalue()),
        }
        task = SimpleNamespace(public_id='igt_source', source_photo_id=11, owner_user_id=20)
        storage_client_path = 'app.services.image_generation_task_processor.get_object_storage_client'

        with (
            unittest.mock.patch(storage_client_path, return_value=storage),
            unittest.mock.patch(
                'app.services.image_generation_task_processor.settings.object_base_url',
                'https://cdn.example.com',
            ),
            unittest.mock.patch('app.services.image_generation_task_processor.settings.object_bucket', 'reference-bucket'),
        ):
            reference = _load_reference_image(db, task)

        self.assertEqual(reference['content_type'], 'image/jpeg')
        self.assertEqual(reference['filename'], 'pho_source.jpg')
        self.assertEqual(reference['url'], 'https://cdn.example.com/generated/reference-inputs/igt_source/pho_source.jpg')
        upload = storage.put_object.call_args.kwargs
        self.assertEqual(upload['Bucket'], 'reference-bucket')
        self.assertEqual(upload['Key'], 'generated/reference-inputs/igt_source/pho_source.jpg')
        self.assertEqual(upload['ContentType'], 'image/jpeg')
        self.assertTrue(upload['Body'].startswith(b'\xff\xd8'))

    def test_process_generation_task_fails_before_provider_without_held_reservation(self) -> None:
        db = MagicMock()
        owner = SimpleNamespace(id=20, public_id='usr_owner', plan='pro')
        owner_query = MagicMock()
        owner_query.filter.return_value.first.return_value = owner
        reservation_query = MagicMock()
        reservation_query.filter.return_value.with_for_update.return_value.first.return_value = None
        db.query.side_effect = [owner_query, reservation_query]
        task = SimpleNamespace(
            id=10,
            public_id='igt_missing_hold',
            owner_user_id=20,
            request_payload={'quality': 'low', 'size': '1024x1024', 'reference_image_count': 0, 'output_format': 'webp'},
        )

        with (
            unittest.mock.patch('app.services.image_generation_task_processor._handle_generation_failure') as handle_failure,
            unittest.mock.patch('app.services.image_generation_task_processor.OpenAIImageGenerationClient') as generation_client,
        ):
            _process_generation_task(db, task)

        generation_client.assert_not_called()
        handle_failure.assert_called_once()
        self.assertEqual(handle_failure.call_args.kwargs['error_code'], 'IMAGE_GENERATION_RESERVATION_INVALID')

    def test_process_generation_task_deletes_uploaded_object_when_persist_fails(self) -> None:
        db = MagicMock()
        owner = SimpleNamespace(id=20, public_id='usr_owner', plan='pro')
        owner_query = MagicMock()
        owner_query.filter.return_value.first.return_value = owner
        committed_query = MagicMock()
        committed_query.filter.return_value.first.return_value = None
        db.query.side_effect = [owner_query, committed_query]
        task = SimpleNamespace(
            id=10,
            public_id='igt_persist_fails',
            owner_user_id=20,
            source_photo_id=None,
            source_review_id=None,
            generation_mode='general',
            intent='social_visual',
            prompt='final prompt',
            request_payload={'quality': 'low', 'size': '1024x1024', 'reference_image_count': 0, 'output_format': 'webp'},
        )
        result = ImageGenerationResult(
            image_bytes=b'fake-image',
            content_type='image/webp',
            revised_prompt=None,
            input_text_tokens=10,
            input_image_tokens=0,
            output_image_tokens=20,
            cost_usd=0.01,
            model_name='gpt-image-2',
        )
        storage = MagicMock()
        client = MagicMock()
        client.generate.return_value = result

        with (
            unittest.mock.patch('app.services.image_generation_task_processor.require_held_generation_credit_reservation'),
            unittest.mock.patch('app.services.image_generation_task_processor.OpenAIImageGenerationClient', return_value=client),
            unittest.mock.patch('app.services.image_generation_task_processor.get_object_storage_client', return_value=storage),
            unittest.mock.patch('app.services.image_generation_task_processor.new_public_id', return_value='gen_cleanup'),
            unittest.mock.patch('app.services.image_generation_task_processor.settings.object_bucket', 'generated-bucket'),
            unittest.mock.patch(
                'app.services.image_generation_task_processor._persist_successful_generation',
                side_effect=RuntimeError('database insert failed'),
            ),
            unittest.mock.patch('app.services.image_generation_task_processor._generated_image_was_committed', return_value=False),
            unittest.mock.patch('app.services.image_generation_task_processor._handle_generation_failure') as handle_failure,
        ):
            _process_generation_task(db, task)

        storage.put_object.assert_called_once()
        storage.delete_object.assert_called_once()
        self.assertEqual(storage.delete_object.call_args.kwargs['Bucket'], 'generated-bucket')
        self.assertIn('gen_cleanup.webp', storage.delete_object.call_args.kwargs['Key'])
        db.rollback.assert_called_once()
        handle_failure.assert_called_once()
        self.assertEqual(handle_failure.call_args.kwargs['error_code'], 'IMAGE_GENERATION_PERSISTENCE_FAILED')
        self.assertEqual(handle_failure.call_args.kwargs['event_metadata']['uploaded_object_cleanup'], 'deleted')

    def test_process_generation_task_deletes_uploaded_object_when_reservation_consume_fails(self) -> None:
        db = MagicMock()
        owner = SimpleNamespace(id=20, public_id='usr_owner', plan='pro')
        owner_query = MagicMock()
        owner_query.filter.return_value.first.return_value = owner
        db.query.return_value = owner_query
        task = SimpleNamespace(
            id=10,
            public_id='igt_consume_failed',
            owner_user_id=20,
            source_photo_id=None,
            source_review_id=None,
            generation_mode='general',
            intent='social_visual',
            prompt='final prompt',
            request_payload={'quality': 'low', 'size': '1024x1024', 'reference_image_count': 0, 'output_format': 'webp'},
        )
        result = ImageGenerationResult(
            image_bytes=b'fake-image',
            content_type='image/webp',
            revised_prompt=None,
            input_text_tokens=10,
            input_image_tokens=0,
            output_image_tokens=20,
            cost_usd=0.01,
            model_name='gpt-image-2',
        )
        storage = MagicMock()
        client = MagicMock()
        client.generate.return_value = result

        with (
            unittest.mock.patch('app.services.image_generation_task_processor.require_held_generation_credit_reservation'),
            unittest.mock.patch('app.services.image_generation_task_processor.OpenAIImageGenerationClient', return_value=client),
            unittest.mock.patch('app.services.image_generation_task_processor.get_object_storage_client', return_value=storage),
            unittest.mock.patch('app.services.image_generation_task_processor.new_public_id', return_value='gen_consume_failed'),
            unittest.mock.patch('app.services.image_generation_task_processor.settings.object_bucket', 'generated-bucket'),
            unittest.mock.patch(
                'app.services.image_generation_task_processor.consume_generation_credit_reservation',
                side_effect=GenerationCreditReservationError('released'),
            ),
            unittest.mock.patch('app.services.image_generation_task_processor._handle_generation_failure') as handle_failure,
        ):
            _process_generation_task(db, task)

        storage.delete_object.assert_called_once()
        self.assertEqual(storage.delete_object.call_args.kwargs['Bucket'], 'generated-bucket')
        handle_failure.assert_called_once()
        self.assertEqual(handle_failure.call_args.kwargs['error_code'], 'IMAGE_GENERATION_RESERVATION_INVALID')
        self.assertFalse(handle_failure.call_args.kwargs['retryable'])
        self.assertEqual(handle_failure.call_args.kwargs['event_metadata']['uploaded_object_cleanup'], 'deleted')

    def test_process_generation_task_preserves_uploaded_object_when_commit_may_have_succeeded(self) -> None:
        db = MagicMock()
        owner = SimpleNamespace(id=20, public_id='usr_owner', plan='pro')
        owner_query = MagicMock()
        owner_query.filter.return_value.first.return_value = owner
        committed_query = MagicMock()
        committed_query.filter.return_value.first.return_value = (123,)
        db.query.side_effect = [owner_query, committed_query]
        db.commit.side_effect = [None, RuntimeError('network lost during commit')]
        task = SimpleNamespace(
            id=10,
            public_id='igt_commit_uncertain',
            owner_user_id=20,
            source_photo_id=None,
            source_review_id=None,
            generation_mode='general',
            intent='social_visual',
            prompt='final prompt',
            request_payload={'quality': 'low', 'size': '1024x1024', 'reference_image_count': 0, 'output_format': 'webp'},
        )
        result = ImageGenerationResult(
            image_bytes=b'fake-image',
            content_type='image/webp',
            revised_prompt=None,
            input_text_tokens=10,
            input_image_tokens=0,
            output_image_tokens=20,
            cost_usd=0.01,
            model_name='gpt-image-2',
        )
        storage = MagicMock()
        client = MagicMock()
        client.generate.return_value = result

        with (
            unittest.mock.patch('app.services.image_generation_task_processor.require_held_generation_credit_reservation'),
            unittest.mock.patch('app.services.image_generation_task_processor.OpenAIImageGenerationClient', return_value=client),
            unittest.mock.patch('app.services.image_generation_task_processor.get_object_storage_client', return_value=storage),
            unittest.mock.patch('app.services.image_generation_task_processor.new_public_id', return_value='gen_commit_uncertain'),
            unittest.mock.patch('app.services.image_generation_task_processor.consume_generation_credit_reservation'),
            unittest.mock.patch('app.services.image_generation_task_processor.record_generation_task_event_once') as record_event,
            unittest.mock.patch('app.services.image_generation_task_processor._handle_generation_failure') as handle_failure,
        ):
            _process_generation_task(db, task)

        storage.delete_object.assert_not_called()
        record_event.assert_not_called()
        handle_failure.assert_not_called()

    def test_record_generation_task_event_once_skips_existing_terminal_event_for_task(self) -> None:
        db = MagicMock()
        event_query = MagicMock()
        event_query.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
            SimpleNamespace(metadata_json={'task_id': 'igt_existing'})
        ]
        db.query.return_value = event_query
        task = SimpleNamespace(public_id='igt_existing', request_payload={})
        owner = SimpleNamespace(public_id='usr_owner', plan='pro')

        with unittest.mock.patch('app.services.image_generation_task_processor.record_product_event') as record_event:
            record_generation_task_event_once(
                db,
                task=task,
                owner=owner,
                event_name='generation_failed',
                metadata={'task_id': 'igt_existing', 'error_code': 'TASK_STALLED'},
            )

        record_event.assert_not_called()

    def test_terminal_event_outbox_marker_remains_when_delivery_fails(self) -> None:
        task = SimpleNamespace(
            id=42,
            public_id='igt_outbox_pending',
            request_payload={'analytics_source': 'gallery'},
        )
        owner = SimpleNamespace(id=20, public_id='usr_owner', plan='pro')
        db = MagicMock()
        stage_generation_terminal_event(
            task,
            event_name='generation_failed',
            metadata={'error_code': 'TASK_STALLED'},
        )

        with patch(
            'app.services.image_generation_task_processor.record_generation_task_event_once',
            return_value=False,
        ):
            delivered = deliver_generation_terminal_event(db, task=task, owner=owner)

        self.assertFalse(delivered)
        self.assertIn('pending_terminal_event', task.request_payload)
        db.commit.assert_not_called()

    def test_request_event_outbox_marker_remains_when_delivery_fails(self) -> None:
        task = SimpleNamespace(
            id=42,
            public_id='igt_request_outbox_pending',
            request_payload={'analytics_source': 'gallery'},
        )
        owner = SimpleNamespace(id=20, public_id='usr_owner', plan='pro')
        db = MagicMock()
        stage_generation_request_event(
            task,
            page_path='/generate',
            source='gallery',
            metadata={'generation_mode': 'general'},
        )

        with patch(
            'app.services.image_generation_task_processor.record_generation_task_event_once',
            return_value=False,
        ):
            delivered = deliver_generation_request_event(db, task=task, owner=owner)

        self.assertFalse(delivered)
        self.assertIn('pending_request_event', task.request_payload)
        db.commit.assert_not_called()

    def test_terminal_event_delivery_commits_event_and_clears_outbox_marker_together(self) -> None:
        task = SimpleNamespace(
            id=42,
            public_id='igt_outbox_delivered',
            request_payload={'analytics_source': 'gallery'},
        )
        owner = SimpleNamespace(id=20, public_id='usr_owner', plan='pro')
        db = MagicMock()
        stage_generation_terminal_event(
            task,
            event_name='generation_succeeded',
            metadata={'generation_id': 'gen_outbox'},
        )

        with patch(
            'app.services.image_generation_task_processor.record_generation_task_event_once',
            return_value=True,
        ):
            delivered = deliver_generation_terminal_event(db, task=task, owner=owner)

        self.assertTrue(delivered)
        self.assertNotIn('pending_terminal_event', task.request_payload)
        db.add.assert_called_once_with(task)
        db.commit.assert_called_once_with()

    def test_terminal_event_reconciler_retries_persisted_outbox_marker(self) -> None:
        task = SimpleNamespace(
            id=42,
            owner_user_id=20,
            public_id='igt_outbox_retry',
            status=TaskStatus.SUCCEEDED,
            request_payload={},
        )
        owner = SimpleNamespace(id=20, public_id='usr_owner', plan='pro')
        stage_generation_terminal_event(
            task,
            event_name='generation_succeeded',
            metadata={'generation_id': 'gen_retry'},
        )
        db = MagicMock()
        task_query = MagicMock()
        task_query.filter.return_value.all.return_value = [task]
        owner_query = MagicMock()
        owner_query.filter.return_value.first.return_value = owner
        db.query.side_effect = [task_query, owner_query]

        with patch(
            'app.services.image_generation_task_processor.deliver_generation_terminal_event'
        ) as deliver_event:
            _reconcile_pending_generation_terminal_events(db)

        deliver_event.assert_called_once_with(db, task=task, owner=owner)

    def test_terminal_delivery_requires_marker_to_be_staged_before_state_commit(self) -> None:
        task = SimpleNamespace(
            id=42,
            public_id='igt_missing_outbox',
            request_payload={},
        )
        owner = SimpleNamespace(id=20, public_id='usr_owner', plan='pro')

        with self.assertRaisesRegex(RuntimeError, 'without a durable outbox marker'):
            _record_terminal_generation_events_after_state_commit(
                MagicMock(),
                [(task, owner, 'generation_failed', {'error_code': 'TASK_STALLED'})],
            )

    def test_handle_generation_failure_persists_cleanup_metadata_before_terminal_event(self) -> None:
        from app.services.image_generation_task_processor import _handle_generation_failure

        db = MagicMock()
        owner = SimpleNamespace(id=20, public_id='usr_owner', plan='pro')
        owner_query = MagicMock()
        owner_query.filter.return_value.first.return_value = owner
        db.query.return_value = owner_query
        task = SimpleNamespace(
            id=10,
            public_id='igt_cleanup_failed',
            owner_user_id=20,
            attempt_count=2,
            max_attempts=2,
            request_payload={'quality': 'low', 'size': '1024x1024'},
            generation_mode='general',
            intent='social_visual',
        )

        with (
            unittest.mock.patch('app.services.image_generation_task_processor.release_generation_credit_reservation'),
            unittest.mock.patch('app.services.image_generation_task_processor._record_terminal_generation_events_after_state_commit') as record_events,
        ):
            _handle_generation_failure(
                db,
                task,
                error_code='IMAGE_GENERATION_PERSISTENCE_FAILED',
                error_message='commit failed',
                retryable=False,
                event_metadata={'uploaded_object_cleanup': 'failed'},
            )

        self.assertEqual(task.request_payload['terminal_failure_metadata']['uploaded_object_cleanup'], 'failed')
        db.commit.assert_called_once()
        record_events.assert_called_once()

    def test_generation_credit_counts_split_consumption_and_grants(self) -> None:
        db = MagicMock()
        consumed_query = MagicMock()
        grant_query = MagicMock()
        consumed_query.filter.return_value.scalar.return_value = 26
        grant_query.filter.return_value.scalar.return_value = -30
        db.query.side_effect = [consumed_query, grant_query]
        user = SimpleNamespace(id=20)

        consumed = count_monthly_generation_credit_consumed(db, user)
        granted = count_monthly_generation_credit_grants(db, user)

        self.assertEqual(consumed, 26)
        self.assertEqual(granted, 30)


if __name__ == '__main__':
    unittest.main()
