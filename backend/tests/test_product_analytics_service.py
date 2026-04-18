from __future__ import annotations

import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.product_analytics import (  # noqa: E402
    STAGE_A_EVENT_CATALOG,
    AnalyticsEventSample,
    ReviewSample,
    build_stage_a_snapshot,
    render_stage_a_snapshot_markdown,
)


class ProductAnalyticsServiceTests(unittest.TestCase):
    def test_stage_a_event_catalog_covers_required_funnel_events(self) -> None:
        required_events = {
            'home_viewed',
            'workspace_viewed',
            'image_selected',
            'upload_succeeded',
            'start_review_clicked',
            'review_requested',
            'review_result_viewed',
            'reanalysis_clicked',
            'share_clicked',
            'export_clicked',
            'upgrade_pro_clicked',
            'checkout_started',
            'paid_success',
            'sign_in_completed',
            'blog_post_viewed',
            'gallery_viewed',
            'share_viewed',
        }

        self.assertTrue(required_events.issubset(STAGE_A_EVENT_CATALOG.keys()))

    def test_build_stage_a_snapshot_calculates_core_rates_and_breakdowns(self) -> None:
        events = [
            AnalyticsEventSample(
                event_name='home_viewed',
                occurred_at=datetime(2026, 4, 10, 9, 0, tzinfo=timezone.utc),
                device_id='dev-1',
                session_id='sess-1',
                plan='guest',
                source='home_direct',
            ),
            AnalyticsEventSample(
                event_name='workspace_viewed',
                occurred_at=datetime(2026, 4, 10, 9, 1, tzinfo=timezone.utc),
                device_id='dev-1',
                session_id='sess-1',
                plan='guest',
                source='home_direct',
            ),
            AnalyticsEventSample(
                event_name='image_selected',
                occurred_at=datetime(2026, 4, 10, 9, 2, tzinfo=timezone.utc),
                device_id='dev-1',
                session_id='sess-1',
                plan='guest',
                source='home_direct',
            ),
            AnalyticsEventSample(
                event_name='upload_succeeded',
                occurred_at=datetime(2026, 4, 10, 9, 3, tzinfo=timezone.utc),
                device_id='dev-1',
                session_id='sess-1',
                plan='guest',
                source='home_direct',
            ),
            AnalyticsEventSample(
                event_name='start_review_clicked',
                occurred_at=datetime(2026, 4, 10, 9, 4, tzinfo=timezone.utc),
                device_id='dev-1',
                session_id='sess-1',
                plan='guest',
                source='home_direct',
            ),
            AnalyticsEventSample(
                event_name='review_requested',
                occurred_at=datetime(2026, 4, 10, 9, 5, tzinfo=timezone.utc),
                device_id='dev-1',
                session_id='sess-1',
                plan='guest',
                source='home_direct',
            ),
            AnalyticsEventSample(
                event_name='review_result_viewed',
                occurred_at=datetime(2026, 4, 10, 9, 8, tzinfo=timezone.utc),
                device_id='dev-1',
                session_id='sess-1',
                plan='guest',
                source='home_direct',
            ),
            AnalyticsEventSample(
                event_name='sign_in_completed',
                occurred_at=datetime(2026, 4, 10, 9, 12, tzinfo=timezone.utc),
                device_id='dev-1',
                session_id='sess-2',
                user_public_id='usr-1',
                plan='free',
                source='home_direct',
            ),
            AnalyticsEventSample(
                event_name='checkout_started',
                occurred_at=datetime(2026, 4, 10, 9, 15, tzinfo=timezone.utc),
                device_id='dev-1',
                session_id='sess-2',
                user_public_id='usr-1',
                plan='free',
                source='home_direct',
            ),
            AnalyticsEventSample(
                event_name='paid_success',
                occurred_at=datetime(2026, 4, 10, 9, 16, tzinfo=timezone.utc),
                device_id='dev-1',
                session_id='sess-2',
                user_public_id='usr-1',
                plan='pro',
                source='home_direct',
            ),
            AnalyticsEventSample(
                event_name='blog_post_viewed',
                occurred_at=datetime(2026, 4, 11, 10, 0, tzinfo=timezone.utc),
                device_id='dev-2',
                session_id='sess-3',
                plan='guest',
                source='blog',
            ),
            AnalyticsEventSample(
                event_name='workspace_viewed',
                occurred_at=datetime(2026, 4, 11, 10, 3, tzinfo=timezone.utc),
                device_id='dev-2',
                session_id='sess-3',
                plan='guest',
                source='blog',
            ),
            AnalyticsEventSample(
                event_name='review_requested',
                occurred_at=datetime(2026, 4, 11, 10, 5, tzinfo=timezone.utc),
                device_id='dev-2',
                session_id='sess-3',
                plan='guest',
                source='blog',
            ),
            AnalyticsEventSample(
                event_name='review_result_viewed',
                occurred_at=datetime(2026, 4, 11, 10, 8, tzinfo=timezone.utc),
                device_id='dev-2',
                session_id='sess-3',
                plan='guest',
                source='blog',
            ),
        ]
        reviews = [
            ReviewSample(
                owner_public_id='usr-1',
                created_at=datetime(2026, 4, 10, 9, 8, tzinfo=timezone.utc),
            ),
            ReviewSample(
                owner_public_id='usr-1',
                created_at=datetime(2026, 4, 16, 10, 0, tzinfo=timezone.utc),
            ),
            ReviewSample(
                owner_public_id='usr-2',
                created_at=datetime(2026, 4, 11, 10, 8, tzinfo=timezone.utc),
            ),
        ]

        snapshot = build_stage_a_snapshot(
            events=events,
            reviews=reviews,
            start_date=date(2026, 4, 10),
            end_date=date(2026, 4, 11),
        )

        self.assertEqual(snapshot['window_start'], '2026-04-10')
        self.assertEqual(snapshot['window_end'], '2026-04-11')
        self.assertEqual(len(snapshot['daily_rows']), 2)

        first_day = snapshot['daily_rows'][0]
        self.assertEqual(first_day['date'], '2026-04-10')
        self.assertEqual(first_day['dau'], 1)
        self.assertEqual(first_day['wau'], 1)
        self.assertEqual(first_day['first_review_completion']['base_users'], 1)
        self.assertEqual(first_day['first_review_completion']['users'], 1)
        self.assertEqual(first_day['first_review_completion']['rate'], 1.0)
        self.assertEqual(first_day['guest_to_sign_in']['base_users'], 1)
        self.assertEqual(first_day['guest_to_sign_in']['users'], 1)
        self.assertEqual(first_day['guest_to_sign_in']['rate'], 1.0)
        self.assertEqual(first_day['free_to_checkout']['base_users'], 1)
        self.assertEqual(first_day['free_to_checkout']['users'], 1)
        self.assertEqual(first_day['free_to_checkout']['rate'], 1.0)
        self.assertEqual(first_day['checkout_to_paid']['base_users'], 1)
        self.assertEqual(first_day['checkout_to_paid']['users'], 1)
        self.assertEqual(first_day['checkout_to_paid']['rate'], 1.0)
        self.assertEqual(first_day['second_review_within_7d']['base_users'], 1)
        self.assertEqual(first_day['second_review_within_7d']['users'], 1)
        self.assertEqual(first_day['second_review_within_7d']['rate'], 1.0)

        source_breakdown = snapshot['source_breakdown']
        self.assertEqual(source_breakdown['home_direct']['visitors'], 1)
        self.assertEqual(source_breakdown['home_direct']['workspace_entries'], 1)
        self.assertEqual(source_breakdown['home_direct']['review_requests'], 1)
        self.assertEqual(source_breakdown['home_direct']['review_results'], 1)
        self.assertEqual(source_breakdown['home_direct']['workspace_entry_rate'], 1.0)
        self.assertEqual(source_breakdown['blog']['visitors'], 1)
        self.assertEqual(source_breakdown['blog']['workspace_entries'], 1)
        self.assertEqual(source_breakdown['blog']['review_requests'], 1)
        self.assertEqual(source_breakdown['blog']['review_results'], 1)

        plan_breakdown = snapshot['plan_breakdown']
        self.assertEqual(plan_breakdown['guest']['active_users'], 2)
        self.assertEqual(plan_breakdown['guest']['review_requests'], 2)
        self.assertEqual(plan_breakdown['free']['checkout_started'], 1)
        self.assertEqual(plan_breakdown['pro']['paid_success'], 1)

    def test_render_stage_a_snapshot_markdown_outputs_a_daily_table(self) -> None:
        snapshot = build_stage_a_snapshot(
            events=[
                AnalyticsEventSample(
                    event_name='home_viewed',
                    occurred_at=datetime(2026, 4, 10, 9, 0, tzinfo=timezone.utc),
                    device_id='dev-1',
                    session_id='sess-1',
                    plan='guest',
                    source='home_direct',
                )
            ],
            reviews=[],
            start_date=date(2026, 4, 10),
            end_date=date(2026, 4, 10),
        )

        markdown = render_stage_a_snapshot_markdown(snapshot)

        self.assertIn('# PicSpeak 阶段 A 基线快照', markdown)
        self.assertIn('| 日期 | DAU | WAU | 首评完成率 | 7 日二次使用率 |', markdown)
        self.assertIn('| 2026-04-10 | 1 | 1 | 0.0% | 0.0% |', markdown)


if __name__ == '__main__':
    unittest.main()
