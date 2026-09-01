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
    render_content_conversion_weekly_markdown,
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
            'content_workspace_clicked',
            'prompt_library_viewed',
            'next_shoot_action_clicked',
            'generation_page_viewed',
            'generation_template_selected',
            'generation_prompt_example_applied',
            'generation_requested',
            'generation_succeeded',
            'generation_failed',
            'generation_viewed',
            'generation_reuse_clicked',
            'generation_credit_exhausted',
            'generation_upgrade_clicked',
            'credit_pack_checkout_started',
            'web_vital_reported',
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
                metadata={'task_id': 'rt_home'},
            ),
            AnalyticsEventSample(
                event_name='review_result_viewed',
                occurred_at=datetime(2026, 4, 10, 9, 8, tzinfo=timezone.utc),
                device_id='dev-1',
                session_id='sess-1',
                plan='guest',
                source='home_direct',
                metadata={'task_id': 'rt_home'},
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
                metadata={'task_id': 'rt_blog', 'has_source_review_id': True, 'retake_intent': 'new_photo_retake'},
            ),
            AnalyticsEventSample(
                event_name='review_result_viewed',
                occurred_at=datetime(2026, 4, 11, 10, 8, tzinfo=timezone.utc),
                device_id='dev-2',
                session_id='sess-3',
                plan='guest',
                source='blog',
                metadata={'task_id': 'rt_blog'},
            ),
            AnalyticsEventSample(
                event_name='prompt_library_viewed',
                occurred_at=datetime(2026, 4, 11, 11, 0, tzinfo=timezone.utc),
                device_id='dev-3',
                session_id='sess-4',
                plan='free',
                source='prompt_library',
                locale='en',
            ),
            AnalyticsEventSample(
                event_name='generation_prompt_example_applied',
                occurred_at=datetime(2026, 4, 11, 11, 1, tzinfo=timezone.utc),
                device_id='dev-3',
                session_id='sess-4',
                plan='free',
                source='prompt_library',
                locale='en',
                metadata={
                    'prompt_example_id': 'neon-portrait',
                    'prompt_example_category': 'photography',
                    'template_key': 'photo_inspiration',
                },
            ),
            AnalyticsEventSample(
                event_name='generation_requested',
                occurred_at=datetime(2026, 4, 11, 11, 2, tzinfo=timezone.utc),
                device_id='dev-3',
                session_id='sess-4',
                plan='free',
                source='prompt_library',
                locale='en',
                metadata={
                    'task_id': 'igt_prompt',
                    'prompt_example_id': 'neon-portrait',
                    'prompt_example_category': 'photography',
                    'template_key': 'photo_inspiration',
                    'generation_mode': 'general',
                },
            ),
            AnalyticsEventSample(
                event_name='generation_succeeded',
                occurred_at=datetime(2026, 4, 11, 11, 4, tzinfo=timezone.utc),
                device_id='dev-3',
                session_id='sess-4',
                plan='free',
                source='prompt_library',
                locale='en',
                metadata={'task_id': 'igt_prompt', 'quality': 'low', 'size': '1024x1024', 'credits_charged': 1, 'cost_usd': 0.01},
            ),
            AnalyticsEventSample(
                event_name='generation_used_for_retake',
                occurred_at=datetime(2026, 4, 11, 11, 6, tzinfo=timezone.utc),
                device_id='dev-3',
                session_id='sess-4',
                plan='free',
                source='prompt_library',
                locale='en',
                metadata={'generation_id': 'gen-1'},
            ),
            AnalyticsEventSample(
                event_name='generation_credit_exhausted',
                occurred_at=datetime(2026, 4, 11, 11, 12, tzinfo=timezone.utc),
                device_id='dev-4',
                session_id='sess-5',
                user_public_id='usr-4',
                plan='free',
                source='prompt_library',
                locale='en',
            ),
            AnalyticsEventSample(
                event_name='credit_pack_checkout_started',
                occurred_at=datetime(2026, 4, 11, 11, 13, tzinfo=timezone.utc),
                device_id='dev-4',
                session_id='sess-5',
                user_public_id='usr-4',
                plan='free',
                source='prompt_library',
                locale='en',
            ),
            AnalyticsEventSample(
                event_name='paid_success',
                occurred_at=datetime(2026, 4, 11, 11, 16, tzinfo=timezone.utc),
                device_id='dev-4',
                session_id='sess-5',
                user_public_id='usr-4',
                plan='free',
                source='checkout',
                locale='en',
                metadata={'kind': 'image_credit_pack', 'credits_granted': 300, 'revenue_usd': 3.99},
            ),
            AnalyticsEventSample(
                event_name='generation_reuse_clicked',
                occurred_at=datetime(2026, 4, 11, 11, 18, tzinfo=timezone.utc),
                device_id='dev-3',
                session_id='sess-4',
                plan='free',
                source='prompt_library',
                locale='en',
                metadata={'entrypoint': 'generation_detail_reuse', 'generation_id': 'gen-1'},
            ),
            AnalyticsEventSample(
                event_name='next_shoot_action_clicked',
                occurred_at=datetime(2026, 4, 11, 11, 8, tzinfo=timezone.utc),
                device_id='dev-2',
                session_id='sess-3',
                plan='guest',
                source='blog',
                locale='zh',
                metadata={'dimension': 'lighting', 'retake_intent': 'new_photo_retake'},
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
        self.assertEqual(source_breakdown['blog']['workspace_clicks'], 0)
        self.assertEqual(source_breakdown['blog']['uploads'], 0)
        self.assertEqual(source_breakdown['prompt_library']['visitors'], 1)

        plan_breakdown = snapshot['plan_breakdown']
        self.assertEqual(plan_breakdown['guest']['active_users'], 2)
        self.assertEqual(plan_breakdown['guest']['review_requests'], 2)
        self.assertEqual(plan_breakdown['free']['checkout_started'], 1)
        self.assertEqual(plan_breakdown['pro']['paid_success'], 1)

        generation_funnel = snapshot['generation_funnel']
        self.assertEqual(generation_funnel['overall']['prompt_library_viewed'], 1)
        self.assertEqual(generation_funnel['overall']['generation_prompt_example_applied'], 1)
        self.assertEqual(generation_funnel['overall']['generation_requested'], 1)
        self.assertEqual(generation_funnel['overall']['generation_succeeded'], 1)
        self.assertEqual(generation_funnel['overall']['generation_reuse_clicked'], 1)
        self.assertEqual(generation_funnel['request_success_rate'], 1.0)
        self.assertEqual(generation_funnel['by_source']['prompt_library']['requests'], 1)
        self.assertEqual(generation_funnel['by_source']['prompt_library']['credit_exhausted'], 1)
        self.assertEqual(generation_funnel['by_source']['prompt_library']['credit_pack_checkout'], 1)
        self.assertEqual(generation_funnel['by_entrypoint']['prompt_library']['prompt_examples_applied'], 1)
        self.assertEqual(generation_funnel['by_entrypoint']['history_reuse']['reuse_clicks'], 1)
        self.assertEqual(generation_funnel['prompt_examples']['requests_with_example'], 1)
        self.assertEqual(generation_funnel['prompt_examples']['by_category']['photography'], 1)
        self.assertEqual(generation_funnel['credit_exhausted_followup']['credit_pack_checkout_users'], 1)

        locale_breakdown = snapshot['locale_breakdown']
        self.assertEqual(locale_breakdown['en']['generation_requests'], 1)
        self.assertEqual(locale_breakdown['en']['generation_successes'], 1)

        unit_economics = snapshot['generation_unit_economics']
        self.assertEqual(unit_economics['metered_successes'], 1)
        self.assertEqual(unit_economics['credits_charged'], 1)
        self.assertEqual(unit_economics['cost_usd'], 0.01)
        self.assertEqual(unit_economics['credit_pack_paid_orders'], 1)
        self.assertEqual(unit_economics['credit_pack_revenue_proxy_usd'], 3.99)

        data_health = snapshot['data_health']
        self.assertEqual(data_health['total_events'], len(events))
        self.assertEqual(data_health['unknown_source_events'], 0)

        retake_contribution = snapshot['retake_contribution']
        self.assertEqual(retake_contribution['review_requests'], 2)
        self.assertEqual(retake_contribution['retake_review_requests'], 1)
        self.assertEqual(retake_contribution['retake_review_request_rate'], 0.5)
        self.assertEqual(retake_contribution['generation_used_for_retake'], 1)
        self.assertEqual(retake_contribution['by_intent']['new_photo_retake']['review_requests'], 1)
        self.assertEqual(retake_contribution['by_intent']['new_photo_retake']['next_shoot_actions'], 1)

    def test_build_stage_a_snapshot_calculates_content_conversion_weekly_report(self) -> None:
        events = [
            AnalyticsEventSample(
                event_name='blog_post_viewed',
                occurred_at=datetime(2026, 4, 20, 9, 0, tzinfo=timezone.utc),
                device_id='blog-dev',
                session_id='blog-session',
                plan='guest',
                source='blog',
                page_path='/zh/blog/five-photo-composition-checks',
                metadata={'content_slug': 'five-photo-composition-checks'},
            ),
            AnalyticsEventSample(
                event_name='content_workspace_clicked',
                occurred_at=datetime(2026, 4, 20, 9, 2, tzinfo=timezone.utc),
                device_id='blog-dev',
                session_id='blog-session',
                plan='guest',
                source='blog',
                page_path='/zh/blog/five-photo-composition-checks',
                metadata={'entrypoint': 'blog_same_critique'},
            ),
            AnalyticsEventSample(
                event_name='workspace_viewed',
                occurred_at=datetime(2026, 4, 20, 9, 3, tzinfo=timezone.utc),
                device_id='blog-dev',
                session_id='blog-session',
                plan='guest',
                source='blog',
            ),
            AnalyticsEventSample(
                event_name='upload_succeeded',
                occurred_at=datetime(2026, 4, 20, 9, 4, tzinfo=timezone.utc),
                device_id='blog-dev',
                session_id='blog-session',
                plan='guest',
                source='blog',
            ),
            AnalyticsEventSample(
                event_name='review_requested',
                occurred_at=datetime(2026, 4, 20, 9, 5, tzinfo=timezone.utc),
                device_id='blog-dev',
                session_id='blog-session',
                plan='guest',
                source='blog',
                metadata={'task_id': 'rt_content_blog'},
            ),
            AnalyticsEventSample(
                event_name='review_result_viewed',
                occurred_at=datetime(2026, 4, 20, 9, 8, tzinfo=timezone.utc),
                device_id='blog-dev',
                session_id='blog-session',
                plan='guest',
                source='blog',
                metadata={'task_id': 'rt_content_blog'},
            ),
            AnalyticsEventSample(
                event_name='gallery_viewed',
                occurred_at=datetime(2026, 4, 20, 10, 0, tzinfo=timezone.utc),
                device_id='gallery-dev',
                session_id='gallery-session',
                plan='guest',
                source='gallery',
                page_path='/gallery',
            ),
            AnalyticsEventSample(
                event_name='content_workspace_clicked',
                occurred_at=datetime(2026, 4, 20, 10, 1, tzinfo=timezone.utc),
                device_id='gallery-dev',
                session_id='gallery-session',
                plan='guest',
                source='gallery',
                page_path='/gallery',
                metadata={'entrypoint': 'gallery_score_standard'},
            ),
            AnalyticsEventSample(
                event_name='workspace_viewed',
                occurred_at=datetime(2026, 4, 20, 10, 3, tzinfo=timezone.utc),
                device_id='gallery-dev',
                session_id='gallery-session',
                plan='guest',
                source='gallery',
            ),
            AnalyticsEventSample(
                event_name='upload_succeeded',
                occurred_at=datetime(2026, 4, 20, 10, 4, tzinfo=timezone.utc),
                device_id='gallery-dev',
                session_id='gallery-session',
                plan='guest',
                source='gallery',
            ),
            AnalyticsEventSample(
                event_name='prompt_library_viewed',
                occurred_at=datetime(2026, 4, 20, 11, 0, tzinfo=timezone.utc),
                device_id='prompt-dev',
                session_id='prompt-session',
                plan='guest',
                source='prompt_library',
                page_path='/generate/prompts',
            ),
            AnalyticsEventSample(
                event_name='content_workspace_clicked',
                occurred_at=datetime(2026, 4, 20, 11, 1, tzinfo=timezone.utc),
                device_id='prompt-dev',
                session_id='prompt-session',
                plan='guest',
                source='prompt_library',
                page_path='/generate/prompts',
                metadata={'entrypoint': 'prompt_library_retake'},
            ),
        ]

        snapshot = build_stage_a_snapshot(
            events=events,
            reviews=[],
            start_date=date(2026, 4, 20),
            end_date=date(2026, 4, 26),
        )

        content_report = snapshot['content_conversion_weekly']
        self.assertEqual(content_report['blog']['visitors'], 1)
        self.assertEqual(content_report['blog']['workspace_clicks'], 1)
        self.assertEqual(content_report['blog']['workspace_entries'], 1)
        self.assertEqual(content_report['blog']['uploads'], 1)
        self.assertEqual(content_report['blog']['article_to_workspace_click_rate'], 1.0)
        self.assertEqual(content_report['blog']['first_review_completion_rate'], 1.0)
        self.assertEqual(content_report['gallery']['visitors'], 1)
        self.assertEqual(content_report['gallery']['workspace_clicks'], 1)
        self.assertEqual(content_report['gallery']['uploads'], 1)
        self.assertEqual(content_report['gallery']['gallery_to_upload_conversion_rate'], 1.0)
        self.assertEqual(content_report['prompt_library']['visitors'], 1)
        self.assertEqual(content_report['prompt_library']['workspace_clicks'], 1)
        self.assertEqual(content_report['prompt_library']['prompt_library_to_workspace_click_rate'], 1.0)

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
        self.assertIn('## 数据健康检查', markdown)
        self.assertIn('## 复拍贡献拆分', markdown)
        self.assertIn('## AI Create 漏斗', markdown)
        self.assertIn('### Prompt example 应用漏斗', markdown)
        self.assertIn('### Credit exhausted 承接', markdown)
        self.assertIn('### AI Create 单位经济模型', markdown)
        self.assertIn('| 日期 | DAU | WAU | 请求 cohort 首次结果查看率 | 7 日二次使用率 |', markdown)
        self.assertIn('| 2026-04-10 | 1 | 1 | 0.0% | 0.0% |', markdown)

    def test_render_content_conversion_weekly_markdown_outputs_stage_d_table(self) -> None:
        snapshot = build_stage_a_snapshot(
            events=[
                AnalyticsEventSample(
                    event_name='blog_post_viewed',
                    occurred_at=datetime(2026, 4, 20, 9, 0, tzinfo=timezone.utc),
                    device_id='dev-1',
                    session_id='sess-1',
                    plan='guest',
                    source='blog',
                ),
                AnalyticsEventSample(
                    event_name='content_workspace_clicked',
                    occurred_at=datetime(2026, 4, 20, 9, 1, tzinfo=timezone.utc),
                    device_id='dev-1',
                    session_id='sess-1',
                    plan='guest',
                    source='blog',
                ),
            ],
            reviews=[],
            start_date=date(2026, 4, 20),
            end_date=date(2026, 4, 26),
        )

        markdown = render_content_conversion_weekly_markdown(snapshot)

        self.assertIn('# PicSpeak 内容来源转化周报', markdown)
        self.assertIn('| 来源 | 浏览访客 | 工作台点击 | 工作台进入 | 上传成功 | 发起点评 | cohort 查看结果 | 点击率 | 上传转化率 | cohort 结果查看率 |', markdown)
        self.assertIn('| blog | 1 | 1 | 0 | 0 | 0 | 0 | 100.0% | 0.0% | 0.0% |', markdown)
        self.assertIn('| prompt_library | 0 | 0 | 0 | 0 | 0 | 0 | 0.0% | 0.0% | 0.0% |', markdown)

    def test_review_completion_uses_causal_d_plus_one_request_cohort(self) -> None:
        events = [
            AnalyticsEventSample(
                event_name='review_requested',
                occurred_at=datetime(2026, 5, 1, 0, 1, tzinfo=timezone.utc),
                device_id='same-browser',
                plan='guest',
                source='blog',
                metadata={'task_id': 'rt_a'},
            ),
            AnalyticsEventSample(
                event_name='review_result_viewed',
                occurred_at=datetime(2026, 5, 1, 0, 2, tzinfo=timezone.utc),
                device_id='same-browser',
                plan='guest',
                source='blog',
                metadata={'task_id': 'rt_unrelated'},
            ),
            AnalyticsEventSample(
                event_name='review_result_viewed',
                occurred_at=datetime(2026, 5, 2, 23, 45, tzinfo=timezone.utc),
                device_id='another-browser',
                plan='guest',
                source='blog',
                metadata={'task_id': 'rt_a'},
            ),
            AnalyticsEventSample(
                event_name='review_result_viewed',
                occurred_at=datetime(2026, 5, 2, 23, 46, tzinfo=timezone.utc),
                device_id='another-browser',
                plan='guest',
                source='blog',
                metadata={'task_id': 'rt_a'},
            ),
        ]

        snapshot = build_stage_a_snapshot(
            events=events,
            reviews=[],
            start_date=date(2026, 5, 1),
            end_date=date(2026, 5, 1),
        )

        first_review = snapshot['daily_rows'][0]['first_review_completion']
        self.assertEqual(first_review['base_users'], 1)
        self.assertEqual(first_review['users'], 1)
        self.assertEqual(first_review['rate'], 1.0)
        self.assertEqual(snapshot['source_breakdown']['blog']['review_results'], 1)
        self.assertEqual(snapshot['content_conversion_weekly']['blog']['first_review_completion_rate'], 1.0)

    def test_review_completion_excludes_missing_causal_keys_without_identity_fallback(self) -> None:
        events = [
            AnalyticsEventSample(
                event_name='review_requested',
                occurred_at=datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc),
                device_id='dev-legacy',
                source='blog',
            ),
            AnalyticsEventSample(
                event_name='review_result_viewed',
                occurred_at=datetime(2026, 5, 1, 9, 5, tzinfo=timezone.utc),
                device_id='dev-legacy',
                source='blog',
            ),
        ]

        snapshot = build_stage_a_snapshot(
            events=events,
            reviews=[],
            start_date=date(2026, 5, 1),
            end_date=date(2026, 5, 1),
        )

        first_review = snapshot['daily_rows'][0]['first_review_completion']
        self.assertEqual(first_review['base_users'], 0)
        self.assertEqual(first_review['users'], 0)
        self.assertEqual(first_review['rate'], 0.0)
        self.assertEqual(snapshot['data_health']['review_causal_key_missing']['review_requested'], 1)
        self.assertIn('review_causal_key_missing', snapshot['data_health']['warnings'])

    def test_generation_lifecycle_and_unit_economics_dedupe_by_task(self) -> None:
        events = [
            AnalyticsEventSample(
                event_name='generation_succeeded',
                occurred_at=datetime(2026, 5, 3, 9, 0, tzinfo=timezone.utc),
                source='unknown',
                metadata={'task_id': 'igt_prior', 'credits_charged': 40, 'cost_usd': 1.0},
            ),
            AnalyticsEventSample(
                event_name='generation_requested',
                occurred_at=datetime(2026, 5, 3, 10, 0, tzinfo=timezone.utc),
                device_id='request-browser',
                source='prompt_library',
                metadata={'task_id': 'igt_one', 'prompt_example_id': 'portrait', 'quality': 'low', 'size': '1024x1024'},
            ),
            AnalyticsEventSample(
                event_name='generation_failed',
                occurred_at=datetime(2026, 5, 3, 10, 1, tzinfo=timezone.utc),
                source='unknown',
                metadata={'task_id': 'igt_one', 'error_code': 'LEGACY_CONTRADICTION'},
            ),
            AnalyticsEventSample(
                event_name='generation_succeeded',
                occurred_at=datetime(2026, 5, 3, 10, 2, tzinfo=timezone.utc),
                device_id='server',
                source='unknown',
                metadata={'task_id': 'igt_one', 'quality': 'low', 'size': '1024x1024', 'credits_charged': 1, 'cost_usd': 0.02},
            ),
            AnalyticsEventSample(
                event_name='generation_succeeded',
                occurred_at=datetime(2026, 5, 3, 10, 3, tzinfo=timezone.utc),
                device_id='browser-tab',
                source='prompt_library',
                metadata={'task_id': 'igt_one', 'quality': 'low', 'size': '1024x1024', 'credits_charged': 1, 'cost_usd': 0.02},
            ),
        ]

        snapshot = build_stage_a_snapshot(
            events=events,
            reviews=[],
            start_date=date(2026, 5, 3),
            end_date=date(2026, 5, 3),
        )

        funnel = snapshot['generation_funnel']
        self.assertEqual(funnel['overall']['generation_requested'], 1)
        self.assertEqual(funnel['overall']['generation_succeeded'], 1)
        self.assertEqual(funnel['overall']['generation_failed'], 0)
        self.assertEqual(funnel['request_success_rate'], 1.0)
        self.assertEqual(funnel['by_source']['prompt_library']['successes'], 1)
        self.assertEqual(funnel['prompt_examples']['requests_with_example'], 1)
        unit_economics = snapshot['generation_unit_economics']
        self.assertEqual(unit_economics['metered_successes'], 1)
        self.assertEqual(unit_economics['credits_charged'], 1)
        self.assertEqual(unit_economics['cost_usd'], 0.02)

    def test_generation_request_cohort_counts_next_day_terminal_event(self) -> None:
        events = [
            AnalyticsEventSample(
                event_name='generation_requested',
                occurred_at=datetime(2026, 5, 3, 23, 59, tzinfo=timezone.utc),
                device_id='request-browser',
                source='prompt_library',
                metadata={'task_id': 'igt_late', 'prompt_example_id': 'late-template'},
            ),
            AnalyticsEventSample(
                event_name='generation_succeeded',
                occurred_at=datetime(2026, 5, 4, 0, 2, tzinfo=timezone.utc),
                device_id='server',
                source='unknown',
                metadata={'task_id': 'igt_late', 'quality': 'low', 'size': '1024x1024', 'credits_charged': 1, 'cost_usd': 0.02},
            ),
        ]

        snapshot = build_stage_a_snapshot(
            events=events,
            reviews=[],
            start_date=date(2026, 5, 3),
            end_date=date(2026, 5, 3),
        )

        funnel = snapshot['generation_funnel']
        self.assertEqual(funnel['overall']['generation_requested'], 1)
        self.assertEqual(funnel['overall']['generation_succeeded'], 1)
        self.assertEqual(funnel['request_success_rate'], 1.0)
        self.assertEqual(funnel['by_source']['prompt_library']['successes'], 1)
        self.assertEqual(snapshot['generation_unit_economics']['metered_successes'], 1)

    def test_generation_lifecycle_uses_d_plus_one_terminal_events_for_request_cohort(self) -> None:
        events = [
            AnalyticsEventSample(
                event_name='generation_requested',
                occurred_at=datetime(2026, 5, 3, 23, 58, tzinfo=timezone.utc),
                device_id='prompt-browser',
                source='prompt_library',
                locale='en',
                metadata={'task_id': 'igt_boundary_success', 'prompt_example_id': 'portrait'},
            ),
            AnalyticsEventSample(
                event_name='generation_requested',
                occurred_at=datetime(2026, 5, 3, 23, 59, tzinfo=timezone.utc),
                device_id='review-browser',
                source='gallery',
                locale='ja',
                metadata={'task_id': 'igt_boundary_failure', 'generation_mode': 'review_linked'},
            ),
            AnalyticsEventSample(
                event_name='generation_succeeded',
                occurred_at=datetime(2026, 5, 4, 0, 1, tzinfo=timezone.utc),
                source='unknown',
                metadata={'task_id': 'igt_boundary_success', 'quality': 'low', 'size': '1024x1024', 'credits_charged': 1, 'cost_usd': 0.02},
            ),
            AnalyticsEventSample(
                event_name='generation_failed',
                occurred_at=datetime(2026, 5, 4, 0, 2, tzinfo=timezone.utc),
                source='unknown',
                metadata={'task_id': 'igt_boundary_failure', 'error_code': 'OPENAI_IMAGE_GENERATION_FAILED'},
            ),
            AnalyticsEventSample(
                event_name='generation_requested',
                occurred_at=datetime(2026, 5, 4, 0, 3, tzinfo=timezone.utc),
                source='prompt_library',
                metadata={'task_id': 'igt_outside_request'},
            ),
            AnalyticsEventSample(
                event_name='generation_succeeded',
                occurred_at=datetime(2026, 5, 4, 0, 4, tzinfo=timezone.utc),
                source='unknown',
                metadata={'task_id': 'igt_outside_request', 'credits_charged': 50, 'cost_usd': 1.25},
            ),
            AnalyticsEventSample(
                event_name='generation_succeeded',
                occurred_at=datetime(2026, 5, 5, 0, 0, tzinfo=timezone.utc),
                source='unknown',
                metadata={'task_id': 'igt_boundary_failure', 'credits_charged': 50, 'cost_usd': 1.25},
            ),
        ]

        snapshot = build_stage_a_snapshot(
            events=events,
            reviews=[],
            start_date=date(2026, 5, 3),
            end_date=date(2026, 5, 3),
        )

        funnel = snapshot['generation_funnel']
        self.assertEqual(funnel['overall']['generation_requested'], 2)
        self.assertEqual(funnel['overall']['generation_succeeded'], 1)
        self.assertEqual(funnel['overall']['generation_failed'], 1)
        self.assertEqual(funnel['by_source']['prompt_library']['successes'], 1)
        self.assertEqual(funnel['by_entrypoint']['review_linked']['failures'], 1)
        self.assertEqual(snapshot['locale_breakdown']['en']['generation_successes'], 1)
        self.assertEqual(snapshot['locale_breakdown']['ja']['generation_successes'], 0)
        unit_economics = snapshot['generation_unit_economics']
        self.assertEqual(unit_economics['metered_successes'], 1)
        self.assertEqual(unit_economics['credits_charged'], 1)
        self.assertEqual(unit_economics['cost_usd'], 0.02)

    def test_data_health_excludes_system_performance_from_product_unknown_source_rate(self) -> None:
        events = [
            *[
                AnalyticsEventSample(
                    event_name='web_vital_reported',
                    occurred_at=datetime(2026, 5, 4, 10, minute, tzinfo=timezone.utc),
                    source='system_performance',
                    metadata={'metric_name': 'LCP', 'value': 1200 + minute},
                )
                for minute in range(5)
            ],
            AnalyticsEventSample(
                event_name='web_vital_reported',
                occurred_at=datetime(2026, 5, 4, 11, 0, tzinfo=timezone.utc),
                source='unknown',
                metadata={'metric_name': 'LCP', 'value': 1400},
            ),
            AnalyticsEventSample(
                event_name='workspace_viewed',
                occurred_at=datetime(2026, 5, 4, 11, 0, tzinfo=timezone.utc),
                device_id='dev-product',
                source='unknown',
            ),
        ]

        snapshot = build_stage_a_snapshot(
            events=events,
            reviews=[],
            start_date=date(2026, 5, 4),
            end_date=date(2026, 5, 4),
        )

        data_health = snapshot['data_health']
        self.assertEqual(data_health['performance_events'], 6)
        self.assertEqual(data_health['ops_events'], 6)
        self.assertEqual(data_health['product_events'], 1)
        self.assertEqual(data_health['unknown_source_events'], 1)
        self.assertEqual(data_health['unknown_source_rate'], 1.0)


if __name__ == '__main__':
    unittest.main()
