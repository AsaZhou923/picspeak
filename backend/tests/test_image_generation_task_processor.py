from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import GeneratedImage, TaskStatus, UsageLedger  # noqa: E402
from app.services.image_generation import ImageGenerationResult  # noqa: E402
from app.services.image_generation_task_processor import (  # noqa: E402
    count_monthly_generation_credit_consumed,
    count_monthly_generation_credit_grants,
    _output_format_for_content_type,
    _persist_successful_generation,
    _serialize_generation_task_status,
    claim_next_pending_image_generation_task,
)


class ImageGenerationTaskProcessorTests(unittest.TestCase):
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

    def test_persist_successful_generation_records_generated_image_and_usage_ledger(self) -> None:
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
        ledger_records = [record for record in added_records if isinstance(record, UsageLedger)]
        self.assertEqual(len(ledger_records), 1)
        self.assertEqual(ledger_records[0].usage_type, 'image_generation_credit')
        self.assertEqual(float(ledger_records[0].amount), 8.0)

    def test_claim_next_pending_generation_task_respects_worker_concurrency_limit(self) -> None:
        db = MagicMock()
        running_query = MagicMock()
        running_query.filter.return_value.scalar.return_value = 1
        db.query.return_value = running_query

        with unittest.mock.patch('app.services.image_generation_task_processor.settings') as mocked_settings:
            mocked_settings.image_generation_worker_concurrency = 1
            claimed = claim_next_pending_image_generation_task(db, worker_name='embedded-worker-0')

        self.assertIsNone(claimed)
        running_query.join.assert_not_called()

    def test_output_format_follows_downloaded_content_type(self) -> None:
        self.assertEqual(_output_format_for_content_type('image/png', fallback='webp'), 'png')
        self.assertEqual(_output_format_for_content_type('image/jpeg; charset=binary', fallback='webp'), 'jpeg')
        self.assertEqual(_output_format_for_content_type('', fallback='webp'), 'webp')

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
