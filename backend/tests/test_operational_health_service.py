from __future__ import annotations

import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.operational_health import (  # noqa: E402
    GalleryAuditSample,
    OperationalCostSample,
    OperationalTaskSample,
    PaymentEventSample,
    UsageLedgerSample,
    build_operational_health_snapshot,
    render_operational_health_markdown,
)


class OperationalHealthServiceTests(unittest.TestCase):
    def test_build_operational_health_snapshot_groups_daily_health_signals(self) -> None:
        now = datetime(2026, 5, 9, 12, 0, tzinfo=timezone.utc)
        started = now - timedelta(minutes=8)
        tasks = [
            OperationalTaskSample(
                kind='review',
                status='SUCCEEDED',
                created_at=now - timedelta(minutes=10),
                started_at=started,
                finished_at=now - timedelta(minutes=6),
            ),
            OperationalTaskSample(
                kind='review',
                status='FAILED',
                created_at=now - timedelta(minutes=9),
                error_code='OPENAI_REVIEW_TIMEOUT',
                error_message='Provider timeout',
            ),
            OperationalTaskSample(
                kind='generation',
                status='PENDING',
                created_at=now - timedelta(minutes=45),
            ),
            OperationalTaskSample(
                kind='generation',
                status='PENDING',
                created_at=now - timedelta(days=1, minutes=45),
            ),
            OperationalTaskSample(
                kind='generation',
                status='RUNNING',
                created_at=now - timedelta(minutes=40),
                started_at=now - timedelta(minutes=35),
                last_heartbeat_at=now - timedelta(minutes=25),
            ),
            OperationalTaskSample(
                kind='generation',
                status='DEAD_LETTER',
                created_at=now - timedelta(minutes=30),
                error_code='IMAGE_GENERATION_STORAGE_FAILED',
                error_message='S3 upload failed',
            ),
        ]

        snapshot = build_operational_health_snapshot(
            tasks=tasks,
            costs=[
                OperationalCostSample(kind='review', created_at=now, cost_usd=0.02),
                OperationalCostSample(kind='generation', created_at=now, cost_usd=0.041, credits_charged=8),
            ],
            ledger_entries=[
                UsageLedgerSample(usage_type='review_request', amount=1, unit='request', bill_date=date(2026, 5, 9)),
                UsageLedgerSample(usage_type='image_generation_credit', amount=8, unit='credits', bill_date=date(2026, 5, 9)),
                UsageLedgerSample(usage_type='image_generation_credit', amount=-300, unit='credits', bill_date=date(2026, 5, 9)),
            ],
            payment_events=[
                PaymentEventSample(event_name='checkout_started', created_at=now, source='analytics'),
                PaymentEventSample(event_name='paid_success', created_at=now, source='analytics'),
                PaymentEventSample(event_name='order_created', created_at=now, source='webhook'),
            ],
            gallery_audit_samples=[
                GalleryAuditSample(
                    review_id='rev_ok',
                    created_at=now,
                    gallery_visible=True,
                    gallery_audit_status='approved',
                    has_thumbnail=True,
                    summary='Strong gallery summary.',
                ),
                GalleryAuditSample(
                    review_id='rev_thumb_missing',
                    created_at=now,
                    gallery_visible=True,
                    gallery_audit_status='approved',
                    has_thumbnail=False,
                    summary='Visible but thumbnail missing.',
                ),
                GalleryAuditSample(
                    review_id='rev_rejected',
                    created_at=now,
                    gallery_visible=False,
                    gallery_audit_status='rejected',
                    has_thumbnail=False,
                    summary='',
                ),
            ],
            start_date=date(2026, 5, 9),
            end_date=date(2026, 5, 9),
            now=now,
        )

        self.assertEqual(snapshot['status'], 'critical')
        self.assertIn('running_tasks_stale', snapshot['warnings'])
        self.assertIn('dead_letter_tasks_present', snapshot['warnings'])
        self.assertIn('unprocessed_billing_webhooks', snapshot['warnings'])
        self.assertIn('public_gallery_thumbnail_missing', snapshot['warnings'])
        self.assertEqual(snapshot['tasks']['review']['by_status']['FAILED'], 1)
        self.assertEqual(snapshot['tasks']['generation']['stale_pending'], 2)
        self.assertEqual(snapshot['tasks']['generation']['stale_running'], 1)
        self.assertEqual(snapshot['tasks']['generation']['by_status']['DEAD_LETTER'], 1)
        self.assertEqual(snapshot['failures']['clusters']['ai'], 1)
        self.assertEqual(snapshot['failures']['clusters']['storage'], 1)
        self.assertEqual(snapshot['costs']['total_ai_cost_usd'], 0.061)
        self.assertEqual(snapshot['costs']['ledger_credits_consumed'], 8)
        self.assertEqual(snapshot['costs']['ledger_credits_granted'], 300)
        self.assertEqual(snapshot['payments']['checkout_to_paid_rate'], 1.0)
        self.assertEqual(snapshot['gallery_audit']['thumbnail_missing'], 1)

    def test_render_operational_health_markdown_outputs_daily_tables(self) -> None:
        now = datetime(2026, 5, 9, 12, 0, tzinfo=timezone.utc)
        snapshot = build_operational_health_snapshot(
            tasks=[],
            costs=[],
            ledger_entries=[],
            payment_events=[],
            gallery_audit_samples=[],
            start_date=date(2026, 5, 9),
            end_date=date(2026, 5, 9),
            now=now,
        )

        markdown = render_operational_health_markdown(snapshot)

        self.assertIn('# PicSpeak 运营健康快照', markdown)
        self.assertIn('## 任务健康', markdown)
        self.assertIn('## 失败聚类', markdown)
        self.assertIn('## 成本与 Credits', markdown)
        self.assertIn('## 支付健康', markdown)
        self.assertIn('## 公开内容抽查', markdown)
        self.assertIn('| review | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.0% | 0.0 |', markdown)


if __name__ == '__main__':
    unittest.main()
