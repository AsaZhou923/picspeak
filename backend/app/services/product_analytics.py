from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable


STAGE_A_EVENT_CATALOG: dict[str, dict[str, Any]] = {
    'home_viewed': {
        'label': '进入首页',
        'stage': 'A',
        'description': 'Homepage session entry used as the top-of-funnel baseline.',
    },
    'blog_post_viewed': {
        'label': '进入 Blog',
        'stage': 'A',
        'description': 'Blog post session entry used for content-to-workspace attribution.',
    },
    'gallery_viewed': {
        'label': '进入 Gallery',
        'stage': 'A',
        'description': 'Gallery session entry used for source attribution.',
    },
    'share_viewed': {
        'label': '进入分享页',
        'stage': 'A',
        'description': 'Shared review page entry used for source attribution.',
    },
    'workspace_viewed': {
        'label': '进入工作台',
        'stage': 'A',
        'description': 'Workspace entry attributed back to the last meaningful source page.',
    },
    'image_selected': {
        'label': '选择图片',
        'stage': 'A',
        'description': 'The user picked a file and entered the upload flow.',
    },
    'upload_succeeded': {
        'label': '上传成功',
        'stage': 'A',
        'description': 'The upload + confirm flow produced a ready photo.',
    },
    'start_review_clicked': {
        'label': '点击开始点评',
        'stage': 'A',
        'description': 'The user clicked the start-review CTA in the workspace.',
    },
    'review_requested': {
        'label': '成功发起点评',
        'stage': 'A',
        'description': 'The backend accepted a review request.',
    },
    'review_result_viewed': {
        'label': '成功查看点评结果',
        'stage': 'A',
        'description': 'The critique result page loaded successfully.',
    },
    'reanalysis_clicked': {
        'label': '点击再分析',
        'stage': 'A',
        'description': 'The user started a replay / re-analysis flow from an existing result.',
    },
    'share_clicked': {
        'label': '点击分享',
        'stage': 'A',
        'description': 'The share CTA was used on a review result.',
    },
    'export_clicked': {
        'label': '点击导出',
        'stage': 'A',
        'description': 'The export CTA was used on a review result.',
    },
    'content_workspace_clicked': {
        'label': '内容入口点击工作台',
        'stage': 'D',
        'description': 'A Blog, Gallery, or content-oriented CTA sent the user toward the workspace.',
    },
    'prompt_library_viewed': {
        'label': '进入 Prompt Library',
        'stage': 'A',
        'description': 'Prompt library entry used for AI Create and workspace attribution.',
    },
    'next_shoot_action_clicked': {
        'label': '点击下次拍摄动作',
        'stage': 'B',
        'description': 'The user carried a critique-derived next-shoot action back to the workspace.',
    },
    'upgrade_pro_clicked': {
        'label': '点击升级 Pro',
        'stage': 'A',
        'description': 'The user clicked a Pro upgrade / pricing CTA.',
    },
    'checkout_started': {
        'label': '进入结算页',
        'stage': 'A',
        'description': 'A Pro checkout URL was created successfully.',
    },
    'paid_success': {
        'label': '支付成功',
        'stage': 'A',
        'description': 'Billing confirmed a successful Pro payment.',
    },
    'payment_success_viewed': {
        'label': '进入支付成功页',
        'stage': 'A',
        'description': 'The frontend payment success page rendered after checkout.',
    },
    'sign_in_completed': {
        'label': '完成登录',
        'stage': 'A',
        'description': 'A guest or anonymous device completed account sign-in.',
    },
    'generation_page_viewed': {
        'label': '进入 AI 创作',
        'stage': 'A',
        'description': 'Standalone image generation page entry.',
    },
    'generation_template_selected': {
        'label': '选择生图模板',
        'stage': 'A',
        'description': 'The user selected a general image generation template.',
    },
    'generation_prompt_opened': {
        'label': '打开生图模块',
        'stage': 'A',
        'description': 'The user opened an image generation prompt surface.',
    },
    'generation_prompt_example_applied': {
        'label': '应用生图案例',
        'stage': 'A',
        'description': 'The user applied a prompt library example into AI Create.',
    },
    'generation_intent_selected': {
        'label': '选择参考图意图',
        'stage': 'A',
        'description': 'The user selected a review-linked generation intent.',
    },
    'generation_requested': {
        'label': '发起生图',
        'stage': 'A',
        'description': 'The backend accepted an image generation task.',
    },
    'generation_succeeded': {
        'label': '生图成功',
        'stage': 'A',
        'description': 'A generated image was saved successfully.',
    },
    'generation_failed': {
        'label': '生图失败',
        'stage': 'A',
        'description': 'An image generation task failed before charging credits.',
    },
    'generation_viewed': {
        'label': '查看生图详情',
        'stage': 'A',
        'description': 'The user opened a generated image detail page.',
    },
    'generation_download_clicked': {
        'label': '下载生图',
        'stage': 'A',
        'description': 'The user downloaded a generated image.',
    },
    'generation_reuse_clicked': {
        'label': '复用生图',
        'stage': 'A',
        'description': 'The user started another generation from an existing result.',
    },
    'generation_used_for_retake': {
        'label': '生图用于复拍',
        'stage': 'A',
        'description': 'The user sent a generated image back to the workspace as retake inspiration.',
    },
    'generation_credit_exhausted': {
        'label': '生图额度耗尽',
        'stage': 'A',
        'description': 'A generation request was blocked because credits were exhausted.',
    },
    'generation_upgrade_clicked': {
        'label': '生图场景点击升级',
        'stage': 'A',
        'description': 'The user clicked upgrade from an image generation surface.',
    },
    'credit_pack_checkout_started': {
        'label': '生图额度包结算',
        'stage': 'A',
        'description': 'A generation credit pack checkout was started.',
    },
}

KNOWN_SOURCES = {
    'home_direct',
    'blog',
    'gallery',
    'prompt_library',
    'share',
    'checkout',
    'unknown',
}

VISITOR_EVENT_BY_SOURCE = {
    'home_direct': 'home_viewed',
    'blog': 'blog_post_viewed',
    'gallery': 'gallery_viewed',
    'prompt_library': 'prompt_library_viewed',
    'share': 'share_viewed',
}

CONTENT_CONVERSION_SOURCES = ('blog', 'gallery', 'prompt_library')
GENERATION_FUNNEL_EVENTS = (
    'generation_page_viewed',
    'prompt_library_viewed',
    'generation_template_selected',
    'generation_prompt_opened',
    'generation_prompt_example_applied',
    'generation_intent_selected',
    'generation_requested',
    'generation_succeeded',
    'generation_failed',
    'generation_viewed',
    'generation_download_clicked',
    'generation_reuse_clicked',
    'generation_used_for_retake',
    'generation_credit_exhausted',
    'generation_upgrade_clicked',
    'credit_pack_checkout_started',
)
DATA_HEALTH_CORE_EVENTS = (
    'workspace_viewed',
    'review_requested',
    'review_result_viewed',
)


@dataclass(slots=True)
class AnalyticsEventSample:
    event_name: str
    occurred_at: datetime
    device_id: str | None = None
    session_id: str | None = None
    user_public_id: str | None = None
    plan: str = 'guest'
    source: str = 'unknown'
    page_path: str | None = None
    locale: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass(slots=True)
class ReviewSample:
    owner_public_id: str
    created_at: datetime


def _as_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def normalize_stage_a_event_name(value: str) -> str:
    normalized = str(value or '').strip()
    if normalized not in STAGE_A_EVENT_CATALOG:
        raise ValueError(f'Unsupported product analytics event: {normalized}')
    return normalized


def normalize_analytics_source(value: str | None) -> str:
    normalized = str(value or '').strip().lower()
    if not normalized:
        return 'unknown'
    return normalized if normalized in KNOWN_SOURCES else 'unknown'


def _event_identity_key(event: AnalyticsEventSample) -> str | None:
    if event.device_id:
        return f'device:{event.device_id}'
    if event.user_public_id:
        return f'user:{event.user_public_id}'
    if event.session_id:
        return f'session:{event.session_id}'
    return None


def _event_user_key(event: AnalyticsEventSample) -> str | None:
    if event.user_public_id:
        return event.user_public_id
    if event.device_id:
        return f'device:{event.device_id}'
    if event.session_id:
        return f'session:{event.session_id}'
    return None


def _guest_conversion_key(event: AnalyticsEventSample) -> str | None:
    if event.device_id:
        return f'device:{event.device_id}'
    if event.session_id:
        return f'session:{event.session_id}'
    if event.user_public_id:
        return f'user:{event.user_public_id}'
    return None


def _safe_rate(users: int, base_users: int) -> float:
    if base_users <= 0:
        return 0.0
    return round(users / base_users, 4)


def _count_distinct(
    events: Iterable[AnalyticsEventSample],
    *,
    event_names: set[str] | None = None,
    plan: str | None = None,
    source: str | None = None,
    key_builder=_event_identity_key,
) -> int:
    values = set()
    for event in events:
        if event_names is not None and event.event_name not in event_names:
            continue
        if plan is not None and event.plan != plan:
            continue
        if source is not None and event.source != source:
            continue
        key = key_builder(event)
        if key:
            values.add(key)
    return len(values)


def _daily_reviews_with_second_use(reviews: list[ReviewSample]) -> dict[str, dict[str, Any]]:
    review_map: dict[str, list[datetime]] = defaultdict(list)
    for review in reviews:
        review_map[review.owner_public_id].append(_as_utc_datetime(review.created_at))

    rows: dict[str, dict[str, Any]] = {}
    for timestamps in review_map.values():
        ordered = sorted(timestamps)
        if not ordered:
            continue
        first_review_at = ordered[0]
        first_review_date = first_review_at.date().isoformat()
        next_review_within_7d = any(
            candidate <= first_review_at + timedelta(days=7)
            for candidate in ordered[1:]
        )
        metric = rows.setdefault(first_review_date, {'base_users': 0, 'users': 0})
        metric['base_users'] += 1
        if next_review_within_7d:
            metric['users'] += 1

    return rows


def _build_content_conversion_weekly(period_events: list[AnalyticsEventSample]) -> dict[str, dict[str, Any]]:
    report: dict[str, dict[str, Any]] = {}

    for source in CONTENT_CONVERSION_SOURCES:
        visitor_event_name = VISITOR_EVENT_BY_SOURCE[source]
        visitors = _count_distinct(
            period_events,
            event_names={visitor_event_name},
            key_builder=_guest_conversion_key,
        )
        workspace_clicks = _count_distinct(
            period_events,
            event_names={'content_workspace_clicked'},
            source=source,
            key_builder=_guest_conversion_key,
        )
        workspace_entries = _count_distinct(
            period_events,
            event_names={'workspace_viewed'},
            source=source,
            key_builder=_guest_conversion_key,
        )
        uploads = _count_distinct(
            period_events,
            event_names={'upload_succeeded'},
            source=source,
            key_builder=_guest_conversion_key,
        )
        review_requests = _count_distinct(
            period_events,
            event_names={'review_requested'},
            source=source,
            key_builder=_guest_conversion_key,
        )
        review_results = _count_distinct(
            period_events,
            event_names={'review_result_viewed'},
            source=source,
            key_builder=_guest_conversion_key,
        )

        row = {
            'visitors': visitors,
            'workspace_clicks': workspace_clicks,
            'workspace_entries': workspace_entries,
            'uploads': uploads,
            'review_requests': review_requests,
            'review_results': review_results,
            'workspace_click_rate': _safe_rate(workspace_clicks, visitors),
            'workspace_entry_rate': _safe_rate(workspace_entries, visitors),
            'upload_conversion_rate': _safe_rate(uploads, visitors),
            'first_review_completion_rate': _safe_rate(review_results, review_requests),
        }

        if source == 'blog':
            row['article_to_workspace_click_rate'] = row['workspace_click_rate']
            row['article_source_first_review_completion_rate'] = row['first_review_completion_rate']
        elif source == 'gallery':
            row['gallery_to_workspace_click_rate'] = row['workspace_click_rate']
            row['gallery_to_upload_conversion_rate'] = row['upload_conversion_rate']
        elif source == 'prompt_library':
            row['prompt_library_to_workspace_click_rate'] = row['workspace_click_rate']
            row['prompt_library_source_first_review_completion_rate'] = row['first_review_completion_rate']

        report[source] = row

    return report


def _event_count(
    events: Iterable[AnalyticsEventSample],
    *,
    event_names: set[str] | None = None,
    source: str | None = None,
    plan: str | None = None,
    locale: str | None = None,
) -> int:
    count = 0
    for event in events:
        if event_names is not None and event.event_name not in event_names:
            continue
        if source is not None and event.source != source:
            continue
        if plan is not None and event.plan != plan:
            continue
        if locale is not None and _event_locale(event) != locale:
            continue
        count += 1
    return count


def _event_locale(event: AnalyticsEventSample) -> str:
    metadata_locale = ''
    if event.metadata:
        metadata_locale = str(event.metadata.get('locale') or '').strip().lower()
    locale = str(getattr(event, 'locale', '') or metadata_locale).strip().lower()
    if locale in {'zh', 'en', 'ja'}:
        return locale
    return 'unknown'


def _event_metadata_text(event: AnalyticsEventSample, key: str) -> str:
    if not event.metadata:
        return ''
    return str(event.metadata.get(key) or '').strip().lower()


def _event_metadata_bool(event: AnalyticsEventSample, key: str) -> bool:
    if not event.metadata:
        return False
    value = event.metadata.get(key)
    if isinstance(value, bool):
        return value
    return str(value or '').strip().lower() in {'1', 'true', 'yes'}


def _event_metadata_number(event: AnalyticsEventSample, key: str) -> float:
    if not event.metadata:
        return 0.0
    try:
        return float(event.metadata.get(key) or 0)
    except (TypeError, ValueError):
        return 0.0


def _distinct_keys(
    events: Iterable[AnalyticsEventSample],
    *,
    event_names: set[str],
    key_builder=_guest_conversion_key,
) -> set[str]:
    keys = set()
    for event in events:
        if event.event_name not in event_names:
            continue
        key = key_builder(event)
        if key:
            keys.add(key)
    return keys


def _generation_entrypoint(event: AnalyticsEventSample) -> str:
    if event.event_name == 'generation_reuse_clicked':
        return 'history_reuse'
    if event.event_name == 'generation_intent_selected':
        return 'review_linked'
    generation_mode = _event_metadata_text(event, 'generation_mode')
    if generation_mode == 'review_linked' or _event_metadata_text(event, 'source_review_id'):
        return 'review_linked'
    if _event_metadata_text(event, 'entrypoint') == 'generation_detail_reuse':
        return 'history_reuse'
    if event.source == 'prompt_library' or _event_metadata_text(event, 'prompt_example_id'):
        return 'prompt_library'
    if event.source == 'home_direct':
        return 'home'
    return 'direct_or_unknown'


def _build_generation_funnel(period_events: list[AnalyticsEventSample]) -> dict[str, Any]:
    overall = {
        event_name: _count_distinct(
            period_events,
            event_names={event_name},
            key_builder=_guest_conversion_key,
        )
        for event_name in GENERATION_FUNNEL_EVENTS
    }
    requested = overall['generation_requested']
    succeeded = overall['generation_succeeded']
    failed = overall['generation_failed']
    viewed = overall['generation_viewed']

    credit_exhausted_users = _distinct_keys(period_events, event_names={'generation_credit_exhausted'})
    credit_pack_checkout_users = _distinct_keys(period_events, event_names={'credit_pack_checkout_started'})
    generation_upgrade_users = _distinct_keys(
        period_events,
        event_names={'generation_upgrade_clicked', 'upgrade_pro_clicked'},
    )

    by_source = {}
    for source in (*VISITOR_EVENT_BY_SOURCE.keys(), 'checkout', 'unknown'):
        by_source[source] = {
            'page_views': _count_distinct(
                period_events,
                event_names={'generation_page_viewed', 'prompt_library_viewed'},
                source=source,
                key_builder=_guest_conversion_key,
            ),
            'requests': _count_distinct(
                period_events,
                event_names={'generation_requested'},
                source=source,
                key_builder=_guest_conversion_key,
            ),
            'successes': _count_distinct(
                period_events,
                event_names={'generation_succeeded'},
                source=source,
                key_builder=_guest_conversion_key,
            ),
            'credit_exhausted': _count_distinct(
                period_events,
                event_names={'generation_credit_exhausted'},
                source=source,
                key_builder=_guest_conversion_key,
            ),
            'credit_pack_checkout': _count_distinct(
                period_events,
                event_names={'credit_pack_checkout_started'},
                source=source,
                key_builder=_guest_conversion_key,
            ),
        }

    by_entrypoint = {}
    for entrypoint in ('home', 'prompt_library', 'review_linked', 'history_reuse', 'direct_or_unknown'):
        entry_events = [event for event in period_events if _generation_entrypoint(event) == entrypoint]
        by_entrypoint[entrypoint] = {
            'page_views': _count_distinct(
                entry_events,
                event_names={'generation_page_viewed', 'prompt_library_viewed'},
                key_builder=_guest_conversion_key,
            ),
            'prompt_examples_applied': _count_distinct(
                entry_events,
                event_names={'generation_prompt_example_applied'},
                key_builder=_guest_conversion_key,
            ),
            'requests': _count_distinct(
                entry_events,
                event_names={'generation_requested'},
                key_builder=_guest_conversion_key,
            ),
            'successes': _count_distinct(
                entry_events,
                event_names={'generation_succeeded'},
                key_builder=_guest_conversion_key,
            ),
            'failures': _count_distinct(
                entry_events,
                event_names={'generation_failed'},
                key_builder=_guest_conversion_key,
            ),
            'views': _count_distinct(
                entry_events,
                event_names={'generation_viewed'},
                key_builder=_guest_conversion_key,
            ),
            'downloads': _count_distinct(
                entry_events,
                event_names={'generation_download_clicked'},
                key_builder=_guest_conversion_key,
            ),
            'reuse_clicks': _count_distinct(
                entry_events,
                event_names={'generation_reuse_clicked'},
                key_builder=_guest_conversion_key,
            ),
            'retake_uses': _count_distinct(
                entry_events,
                event_names={'generation_used_for_retake'},
                key_builder=_guest_conversion_key,
            ),
            'credit_exhausted': _count_distinct(
                entry_events,
                event_names={'generation_credit_exhausted'},
                key_builder=_guest_conversion_key,
            ),
            'credit_pack_checkout': _count_distinct(
                entry_events,
                event_names={'credit_pack_checkout_started'},
                key_builder=_guest_conversion_key,
            ),
            'pro_upgrade_clicks': _count_distinct(
                entry_events,
                event_names={'generation_upgrade_clicked', 'upgrade_pro_clicked'},
                key_builder=_guest_conversion_key,
            ),
        }

    prompt_examples_by_category: dict[str, int] = {}
    prompt_examples_by_template: dict[str, int] = {}
    for event in period_events:
        if event.event_name != 'generation_prompt_example_applied':
            continue
        category = _event_metadata_text(event, 'prompt_example_category') or 'unknown'
        template_key = _event_metadata_text(event, 'template_key') or 'unknown'
        prompt_examples_by_category[category] = prompt_examples_by_category.get(category, 0) + 1
        prompt_examples_by_template[template_key] = prompt_examples_by_template.get(template_key, 0) + 1

    return {
        'overall': overall,
        'request_success_rate': _safe_rate(succeeded, requested),
        'request_failure_rate': _safe_rate(failed, requested),
        'result_view_rate': _safe_rate(viewed, succeeded),
        'by_source': by_source,
        'by_entrypoint': by_entrypoint,
        'prompt_examples': {
            'applied_users': overall.get('generation_prompt_example_applied', 0),
            'requests_with_example': _count_distinct(
                [
                    event
                    for event in period_events
                    if event.event_name == 'generation_requested' and _event_metadata_text(event, 'prompt_example_id')
                ],
                key_builder=_guest_conversion_key,
            ),
            'by_category': prompt_examples_by_category,
            'by_template': prompt_examples_by_template,
        },
        'credit_exhausted_followup': {
            'credit_exhausted_users': len(credit_exhausted_users),
            'credit_pack_checkout_users': len(credit_exhausted_users & credit_pack_checkout_users),
            'pro_upgrade_click_users': len(credit_exhausted_users & generation_upgrade_users),
            'credit_pack_checkout_rate': _safe_rate(len(credit_exhausted_users & credit_pack_checkout_users), len(credit_exhausted_users)),
            'pro_upgrade_click_rate': _safe_rate(len(credit_exhausted_users & generation_upgrade_users), len(credit_exhausted_users)),
        },
    }


def _build_locale_breakdown(period_events: list[AnalyticsEventSample]) -> dict[str, dict[str, int]]:
    breakdown = {}
    for locale in ('zh', 'en', 'ja', 'unknown'):
        locale_events = [event for event in period_events if _event_locale(event) == locale]
        breakdown[locale] = {
            'active_users': _count_distinct(
                locale_events,
                key_builder=_guest_conversion_key,
            ),
            'workspace_entries': _count_distinct(
                locale_events,
                event_names={'workspace_viewed'},
                key_builder=_guest_conversion_key,
            ),
            'review_requests': _count_distinct(
                locale_events,
                event_names={'review_requested'},
                key_builder=_guest_conversion_key,
            ),
            'review_results': _count_distinct(
                locale_events,
                event_names={'review_result_viewed'},
                key_builder=_guest_conversion_key,
            ),
            'generation_requests': _count_distinct(
                locale_events,
                event_names={'generation_requested'},
                key_builder=_guest_conversion_key,
            ),
            'generation_successes': _count_distinct(
                locale_events,
                event_names={'generation_succeeded'},
                key_builder=_guest_conversion_key,
            ),
            'checkout_started': _count_distinct(
                locale_events,
                event_names={'checkout_started', 'credit_pack_checkout_started'},
                key_builder=_event_user_key,
            ),
        }
    return breakdown


def _build_generation_unit_economics(period_events: list[AnalyticsEventSample]) -> dict[str, Any]:
    success_events = [
        event
        for event in period_events
        if event.event_name == 'generation_succeeded'
        and (_event_metadata_number(event, 'credits_charged') > 0 or _event_metadata_number(event, 'cost_usd') > 0)
    ]
    paid_credit_pack_events = [
        event
        for event in period_events
        if event.event_name == 'paid_success' and _event_metadata_text(event, 'kind') == 'image_credit_pack'
    ]

    credits_charged = sum(_event_metadata_number(event, 'credits_charged') for event in success_events)
    cost_usd = sum(_event_metadata_number(event, 'cost_usd') for event in success_events)
    revenue_proxy_usd = sum(
        _event_metadata_number(event, 'revenue_usd') or 3.99
        for event in paid_credit_pack_events
    )

    by_quality_size: dict[str, dict[str, Any]] = {}
    for event in success_events:
        key = f"{_event_metadata_text(event, 'quality') or 'unknown'}:{_event_metadata_text(event, 'size') or 'unknown'}"
        row = by_quality_size.setdefault(
            key,
            {
                'successes': 0,
                'credits_charged': 0.0,
                'cost_usd': 0.0,
            },
        )
        row['successes'] += 1
        row['credits_charged'] += _event_metadata_number(event, 'credits_charged')
        row['cost_usd'] += _event_metadata_number(event, 'cost_usd')

    for row in by_quality_size.values():
        successes = int(row.get('successes') or 0)
        row['avg_credits'] = round(float(row['credits_charged']) / successes, 2) if successes else 0.0
        row['avg_cost_usd'] = round(float(row['cost_usd']) / successes, 4) if successes else 0.0
        row['credits_charged'] = round(float(row['credits_charged']), 2)
        row['cost_usd'] = round(float(row['cost_usd']), 4)

    success_count = len(success_events)
    return {
        'metered_successes': success_count,
        'credits_charged': round(credits_charged, 2),
        'cost_usd': round(cost_usd, 4),
        'avg_credits_per_success': round(credits_charged / success_count, 2) if success_count else 0.0,
        'avg_cost_usd_per_success': round(cost_usd / success_count, 4) if success_count else 0.0,
        'credit_pack_paid_orders': len(paid_credit_pack_events),
        'credit_pack_credits_granted': int(
            sum(_event_metadata_number(event, 'credits_granted') for event in paid_credit_pack_events)
        ),
        'credit_pack_revenue_proxy_usd': round(revenue_proxy_usd, 2),
        'gross_margin_proxy_usd': round(revenue_proxy_usd - cost_usd, 2),
        'by_quality_size': by_quality_size,
    }


def _build_data_health(period_events: list[AnalyticsEventSample]) -> dict[str, Any]:
    total_events = len(period_events)
    unknown_source_events = _event_count(period_events, source='unknown')
    missing_core_events = [
        event_name
        for event_name in DATA_HEALTH_CORE_EVENTS
        if _event_count(period_events, event_names={event_name}) == 0
    ]
    generation_events = _event_count(period_events, event_names=set(GENERATION_FUNNEL_EVENTS))
    warnings = []
    if total_events == 0:
        warnings.append('no_events_in_window')
    if total_events > 0 and unknown_source_events / total_events > 0.3:
        warnings.append('unknown_source_over_30_percent')
    if missing_core_events:
        warnings.append('missing_core_review_events')
    if _event_count(period_events, event_names={'generation_page_viewed', 'prompt_library_viewed'}) > 0 and generation_events <= 1:
        warnings.append('generation_funnel_events_missing_after_entry')

    return {
        'total_events': total_events,
        'unknown_source_events': unknown_source_events,
        'unknown_source_rate': _safe_rate(unknown_source_events, total_events),
        'missing_core_events': missing_core_events,
        'generation_events': generation_events,
        'warnings': warnings,
    }


def _build_retake_contribution(period_events: list[AnalyticsEventSample]) -> dict[str, Any]:
    review_request_events = [event for event in period_events if event.event_name == 'review_requested']
    retake_request_events = [
        event
        for event in review_request_events
        if _event_metadata_text(event, 'retake_intent') in {'same_photo_fix', 'new_photo_retake'}
        or _event_metadata_bool(event, 'has_source_review_id')
    ]

    by_intent: dict[str, dict[str, int]] = {}
    for intent in ('same_photo_fix', 'new_photo_retake'):
        intent_events = [
            event
            for event in review_request_events
            if _event_metadata_text(event, 'retake_intent') == intent
        ]
        by_intent[intent] = {
            'review_requests': _count_distinct(
                intent_events,
                key_builder=_guest_conversion_key,
            ),
            'next_shoot_actions': _count_distinct(
                [
                    event
                    for event in period_events
                    if event.event_name == 'next_shoot_action_clicked'
                    and _event_metadata_text(event, 'retake_intent') == intent
                ],
                key_builder=_guest_conversion_key,
            ),
        }

    linked_without_intent = [
        event
        for event in review_request_events
        if not _event_metadata_text(event, 'retake_intent')
        and _event_metadata_bool(event, 'has_source_review_id')
    ]
    by_intent['linked_without_intent'] = {
        'review_requests': _count_distinct(
            linked_without_intent,
            key_builder=_guest_conversion_key,
        ),
        'next_shoot_actions': 0,
    }

    review_requests = _count_distinct(
        review_request_events,
        key_builder=_guest_conversion_key,
    )
    retake_review_requests = _count_distinct(
        retake_request_events,
        key_builder=_guest_conversion_key,
    )

    return {
        'review_requests': review_requests,
        'retake_review_requests': retake_review_requests,
        'retake_review_request_rate': _safe_rate(retake_review_requests, review_requests),
        'generation_used_for_retake': _count_distinct(
            period_events,
            event_names={'generation_used_for_retake'},
            key_builder=_guest_conversion_key,
        ),
        'by_intent': by_intent,
    }


def build_stage_a_snapshot(
    *,
    events: list[AnalyticsEventSample],
    reviews: list[ReviewSample],
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    normalized_events: list[AnalyticsEventSample] = []
    for event in events:
        normalized_events.append(
            AnalyticsEventSample(
                event_name=normalize_stage_a_event_name(event.event_name),
                occurred_at=_as_utc_datetime(event.occurred_at),
                device_id=event.device_id,
                session_id=event.session_id,
                user_public_id=event.user_public_id,
                plan=str(event.plan or 'guest').strip().lower() or 'guest',
                source=normalize_analytics_source(event.source),
                page_path=event.page_path,
                locale=event.locale,
                metadata=dict(event.metadata or {}),
            )
        )

    normalized_reviews = [
        ReviewSample(
            owner_public_id=review.owner_public_id,
            created_at=_as_utc_datetime(review.created_at),
        )
        for review in reviews
    ]

    events_by_day: dict[str, list[AnalyticsEventSample]] = defaultdict(list)
    for event in normalized_events:
        event_day = event.occurred_at.date().isoformat()
        events_by_day[event_day].append(event)

    review_reuse_map = _daily_reviews_with_second_use(normalized_reviews)

    daily_rows: list[dict[str, Any]] = []
    current = start_date
    while current <= end_date:
        row_key = current.isoformat()
        day_events = events_by_day.get(row_key, [])
        trailing_window_start = current - timedelta(days=6)
        trailing_events = [
            event
            for event in normalized_events
            if trailing_window_start <= event.occurred_at.date() <= current
        ]

        review_requested_base = _count_distinct(
            day_events,
            event_names={'review_requested'},
        )
        review_requested_users = _count_distinct(
            day_events,
            event_names={'review_result_viewed'},
        )

        guest_active_base = _count_distinct(
            day_events,
            plan='guest',
            key_builder=_guest_conversion_key,
        )
        guest_sign_in_users = _count_distinct(
            day_events,
            event_names={'sign_in_completed'},
            key_builder=_guest_conversion_key,
        )

        free_active_base = _count_distinct(
            day_events,
            plan='free',
            key_builder=_event_user_key,
        )
        free_checkout_users = _count_distinct(
            day_events,
            event_names={'checkout_started'},
            key_builder=_event_user_key,
        )

        checkout_base = _count_distinct(
            day_events,
            event_names={'checkout_started'},
            key_builder=_event_user_key,
        )
        paid_users = _count_distinct(
            day_events,
            event_names={'paid_success'},
            key_builder=_event_user_key,
        )

        second_review_metric = review_reuse_map.get(row_key, {'base_users': 0, 'users': 0})

        daily_rows.append(
            {
                'date': row_key,
                'dau': _count_distinct(day_events),
                'wau': _count_distinct(trailing_events),
                'first_review_completion': {
                    'base_users': review_requested_base,
                    'users': review_requested_users,
                    'rate': _safe_rate(review_requested_users, review_requested_base),
                },
                'second_review_within_7d': {
                    'base_users': second_review_metric['base_users'],
                    'users': second_review_metric['users'],
                    'rate': _safe_rate(
                        second_review_metric['users'],
                        second_review_metric['base_users'],
                    ),
                },
                'guest_to_sign_in': {
                    'base_users': guest_active_base,
                    'users': guest_sign_in_users,
                    'rate': _safe_rate(guest_sign_in_users, guest_active_base),
                },
                'free_to_checkout': {
                    'base_users': free_active_base,
                    'users': free_checkout_users,
                    'rate': _safe_rate(free_checkout_users, free_active_base),
                },
                'checkout_to_paid': {
                    'base_users': checkout_base,
                    'users': paid_users,
                    'rate': _safe_rate(paid_users, checkout_base),
                },
            }
        )
        current += timedelta(days=1)

    period_events = [
        event
        for event in normalized_events
        if start_date <= event.occurred_at.date() <= end_date
    ]
    source_breakdown: dict[str, dict[str, Any]] = {}
    for source, visitor_event_name in VISITOR_EVENT_BY_SOURCE.items():
        visitors = _count_distinct(
            period_events,
            event_names={visitor_event_name},
            key_builder=_guest_conversion_key,
        )
        workspace_entries = _count_distinct(
            period_events,
            event_names={'workspace_viewed'},
            source=source,
            key_builder=_guest_conversion_key,
        )
        workspace_clicks = _count_distinct(
            period_events,
            event_names={'content_workspace_clicked'},
            source=source,
            key_builder=_guest_conversion_key,
        )
        uploads = _count_distinct(
            period_events,
            event_names={'upload_succeeded'},
            source=source,
            key_builder=_guest_conversion_key,
        )
        review_requests = _count_distinct(
            period_events,
            event_names={'review_requested'},
            source=source,
            key_builder=_guest_conversion_key,
        )
        review_results = _count_distinct(
            period_events,
            event_names={'review_result_viewed'},
            source=source,
            key_builder=_guest_conversion_key,
        )
        source_breakdown[source] = {
            'visitors': visitors,
            'workspace_clicks': workspace_clicks,
            'workspace_entries': workspace_entries,
            'uploads': uploads,
            'review_requests': review_requests,
            'review_results': review_results,
            'workspace_click_rate': _safe_rate(workspace_clicks, visitors),
            'workspace_entry_rate': _safe_rate(workspace_entries, visitors),
            'upload_conversion_rate': _safe_rate(uploads, visitors),
            'review_completion_rate': _safe_rate(review_results, review_requests),
        }

    plan_breakdown: dict[str, dict[str, int]] = {}
    for plan in ('guest', 'free', 'pro'):
        plan_breakdown[plan] = {
            'active_users': _count_distinct(period_events, plan=plan),
            'review_requests': _count_distinct(
                period_events,
                event_names={'review_requested'},
                plan=plan,
            ),
            'review_results': _count_distinct(
                period_events,
                event_names={'review_result_viewed'},
                plan=plan,
            ),
            'checkout_started': _count_distinct(
                period_events,
                event_names={'checkout_started'},
                plan=plan,
                key_builder=_event_user_key,
            ),
            'paid_success': _count_distinct(
                period_events,
                event_names={'paid_success'},
                plan=plan,
                key_builder=_event_user_key,
            ),
        }

    return {
        'window_start': start_date.isoformat(),
        'window_end': end_date.isoformat(),
        'event_catalog': STAGE_A_EVENT_CATALOG,
        'daily_rows': daily_rows,
        'source_breakdown': source_breakdown,
        'content_conversion_weekly': _build_content_conversion_weekly(period_events),
        'plan_breakdown': plan_breakdown,
        'locale_breakdown': _build_locale_breakdown(period_events),
        'generation_funnel': _build_generation_funnel(period_events),
        'generation_unit_economics': _build_generation_unit_economics(period_events),
        'retake_contribution': _build_retake_contribution(period_events),
        'data_health': _build_data_health(period_events),
    }


def _format_percent(value: float) -> str:
    return f'{value * 100:.1f}%'


def render_stage_a_snapshot_markdown(snapshot: dict[str, Any]) -> str:
    lines = [
        '# PicSpeak 阶段 A 基线快照',
        '',
        f"- 时间窗口：{snapshot['window_start']} -> {snapshot['window_end']}",
        '',
        '## 数据健康检查',
        '',
        '| 检查项 | 结果 |',
        '| --- | --- |',
    ]

    data_health = snapshot.get('data_health', {})
    missing_core_events = ', '.join(data_health.get('missing_core_events') or []) or '无'
    warnings = ', '.join(data_health.get('warnings') or []) or '无'
    lines.extend(
        [
            f"| 总事件数 | {data_health.get('total_events', 0)} |",
            f"| unknown source 事件数 | {data_health.get('unknown_source_events', 0)} ({_format_percent(data_health.get('unknown_source_rate', 0.0))}) |",
            f"| 缺失核心事件 | {missing_core_events} |",
            f"| 生图漏斗事件数 | {data_health.get('generation_events', 0)} |",
            f"| 告警 | {warnings} |",
            '',
            '## 日度漏斗总览',
            '',
            '| 日期 | DAU | WAU | 首评完成率 | 7 日二次使用率 | guest -> sign-in | free -> checkout | checkout -> paid |',
            '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        ]
    )

    for row in snapshot['daily_rows']:
        lines.append(
            '| {date} | {dau} | {wau} | {first_review_completion} | {second_review_within_7d} | {guest_to_sign_in} | {free_to_checkout} | {checkout_to_paid} |'.format(
                date=row['date'],
                dau=row['dau'],
                wau=row['wau'],
                first_review_completion=_format_percent(row['first_review_completion']['rate']),
                second_review_within_7d=_format_percent(row['second_review_within_7d']['rate']),
                guest_to_sign_in=_format_percent(row['guest_to_sign_in']['rate']),
                free_to_checkout=_format_percent(row['free_to_checkout']['rate']),
                checkout_to_paid=_format_percent(row['checkout_to_paid']['rate']),
            )
        )

    retake_contribution = snapshot.get('retake_contribution', {})
    lines.extend(
        [
            '',
            '## 复拍贡献拆分',
            '',
            '| 指标 | 去重用户数 / 比率 |',
            '| --- | ---: |',
            f"| 发起评图用户 | {retake_contribution.get('review_requests', 0)} |",
            f"| 复拍/再分析评图用户 | {retake_contribution.get('retake_review_requests', 0)} |",
            f"| 复拍/再分析贡献率 | {_format_percent(retake_contribution.get('retake_review_request_rate', 0.0))} |",
            f"| 生图结果用于复拍 | {retake_contribution.get('generation_used_for_retake', 0)} |",
            '',
            '| 复拍意图 | 发起评图 | 下一次拍摄动作点击 |',
            '| --- | ---: | ---: |',
        ]
    )
    for intent, row in retake_contribution.get('by_intent', {}).items():
        lines.append(
            '| {intent} | {review_requests} | {next_shoot_actions} |'.format(
                intent=intent,
                review_requests=row.get('review_requests', 0),
                next_shoot_actions=row.get('next_shoot_actions', 0),
            )
        )

    generation_funnel = snapshot.get('generation_funnel', {})
    generation_overall = generation_funnel.get('overall', {})
    lines.extend(
        [
            '',
            '## AI Create 漏斗',
            '',
            '| 事件 | 去重用户数 |',
            '| --- | ---: |',
        ]
    )
    for event_name in GENERATION_FUNNEL_EVENTS:
        lines.append(f"| {event_name} | {generation_overall.get(event_name, 0)} |")
    lines.extend(
        [
            '',
            '| 指标 | 比率 |',
            '| --- | ---: |',
            f"| 请求成功率 | {_format_percent(generation_funnel.get('request_success_rate', 0.0))} |",
            f"| 请求失败率 | {_format_percent(generation_funnel.get('request_failure_rate', 0.0))} |",
            f"| 成功后查看率 | {_format_percent(generation_funnel.get('result_view_rate', 0.0))} |",
            '',
            '### AI Create 来源拆分',
            '',
            '| 来源 | 入口访问 | 发起生图 | 生图成功 | credits 耗尽 | credit pack checkout |',
            '| --- | ---: | ---: | ---: | ---: | ---: |',
        ]
    )
    for source, row in generation_funnel.get('by_source', {}).items():
        lines.append(
            '| {source} | {page_views} | {requests} | {successes} | {credit_exhausted} | {credit_pack_checkout} |'.format(
                source=source,
                page_views=row.get('page_views', 0),
                requests=row.get('requests', 0),
                successes=row.get('successes', 0),
                credit_exhausted=row.get('credit_exhausted', 0),
                credit_pack_checkout=row.get('credit_pack_checkout', 0),
            )
        )

    lines.extend(
        [
            '',
            '### AI Create 入口拆分',
            '',
            '| 入口 | 访问/进入 | 案例应用 | 发起 | 成功 | 失败 | 查看 | 下载 | 复用 | 复拍 | credits 耗尽 | credit pack | Pro 点击 |',
            '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        ]
    )
    for entrypoint, row in generation_funnel.get('by_entrypoint', {}).items():
        lines.append(
            '| {entrypoint} | {page_views} | {prompt_examples_applied} | {requests} | {successes} | {failures} | {views} | {downloads} | {reuse_clicks} | {retake_uses} | {credit_exhausted} | {credit_pack_checkout} | {pro_upgrade_clicks} |'.format(
                entrypoint=entrypoint,
                page_views=row.get('page_views', 0),
                prompt_examples_applied=row.get('prompt_examples_applied', 0),
                requests=row.get('requests', 0),
                successes=row.get('successes', 0),
                failures=row.get('failures', 0),
                views=row.get('views', 0),
                downloads=row.get('downloads', 0),
                reuse_clicks=row.get('reuse_clicks', 0),
                retake_uses=row.get('retake_uses', 0),
                credit_exhausted=row.get('credit_exhausted', 0),
                credit_pack_checkout=row.get('credit_pack_checkout', 0),
                pro_upgrade_clicks=row.get('pro_upgrade_clicks', 0),
            )
        )

    prompt_examples = generation_funnel.get('prompt_examples', {})
    credit_followup = generation_funnel.get('credit_exhausted_followup', {})
    lines.extend(
        [
            '',
            '### Prompt example 应用漏斗',
            '',
            '| 指标 | 数值 |',
            '| --- | ---: |',
            f"| 应用案例用户 | {prompt_examples.get('applied_users', 0)} |",
            f"| 应用后发起生图用户 | {prompt_examples.get('requests_with_example', 0)} |",
            '',
            '| 类别 | 应用次数 |',
            '| --- | ---: |',
        ]
    )
    for category, count in prompt_examples.get('by_category', {}).items():
        lines.append(f'| {category} | {count} |')
    if not prompt_examples.get('by_category'):
        lines.append('| 无 | 0 |')

    lines.extend(
        [
            '',
            '### Credit exhausted 承接',
            '',
            '| 指标 | 数值 |',
            '| --- | ---: |',
            f"| credits 耗尽用户 | {credit_followup.get('credit_exhausted_users', 0)} |",
            f"| 耗尽后 credit pack checkout 用户 | {credit_followup.get('credit_pack_checkout_users', 0)} |",
            f"| 耗尽后 Pro 点击用户 | {credit_followup.get('pro_upgrade_click_users', 0)} |",
            f"| credit pack 承接率 | {_format_percent(credit_followup.get('credit_pack_checkout_rate', 0.0))} |",
            f"| Pro 点击承接率 | {_format_percent(credit_followup.get('pro_upgrade_click_rate', 0.0))} |",
        ]
    )

    unit_economics = snapshot.get('generation_unit_economics', {})
    lines.extend(
        [
            '',
            '### AI Create 单位经济模型',
            '',
            '| 指标 | 数值 |',
            '| --- | ---: |',
            f"| 带成本读数的成功生图 | {unit_economics.get('metered_successes', 0)} |",
            f"| credits 消耗 | {unit_economics.get('credits_charged', 0)} |",
            f"| 平均 credits / 成功图 | {unit_economics.get('avg_credits_per_success', 0)} |",
            f"| 成本 USD | {unit_economics.get('cost_usd', 0)} |",
            f"| 平均成本 USD / 成功图 | {unit_economics.get('avg_cost_usd_per_success', 0)} |",
            f"| credit pack 支付订单 | {unit_economics.get('credit_pack_paid_orders', 0)} |",
            f"| credit pack credits 发放 | {unit_economics.get('credit_pack_credits_granted', 0)} |",
            f"| credit pack revenue proxy USD | {unit_economics.get('credit_pack_revenue_proxy_usd', 0)} |",
            f"| gross margin proxy USD | {unit_economics.get('gross_margin_proxy_usd', 0)} |",
            '',
            '| 质量/尺寸 | 成功 | credits | 平均 credits | 成本 USD | 平均成本 USD |',
            '| --- | ---: | ---: | ---: | ---: | ---: |',
        ]
    )
    by_quality_size = unit_economics.get('by_quality_size') or {}
    for quality_size, row in by_quality_size.items():
        lines.append(
            '| {quality_size} | {successes} | {credits_charged} | {avg_credits} | {cost_usd} | {avg_cost_usd} |'.format(
                quality_size=quality_size,
                successes=row.get('successes', 0),
                credits_charged=row.get('credits_charged', 0),
                avg_credits=row.get('avg_credits', 0),
                cost_usd=row.get('cost_usd', 0),
                avg_cost_usd=row.get('avg_cost_usd', 0),
            )
        )
    if not by_quality_size:
        lines.append('| 无 | 0 | 0 | 0 | 0 | 0 |')

    lines.extend(
        [
            '',
            '## 来源拆分',
            '',
            '| 来源 | 访客 | 工作台进入 | 发起点评 | 查看结果 | 工作台进入率 | 结果查看率 |',
            '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
        ]
    )
    for source, row in snapshot['source_breakdown'].items():
        lines.append(
            '| {source} | {visitors} | {workspace_entries} | {review_requests} | {review_results} | {workspace_entry_rate} | {review_completion_rate} |'.format(
                source=source,
                visitors=row['visitors'],
                workspace_entries=row['workspace_entries'],
                review_requests=row['review_requests'],
                review_results=row['review_results'],
                workspace_entry_rate=_format_percent(row['workspace_entry_rate']),
                review_completion_rate=_format_percent(row['review_completion_rate']),
            )
        )

    lines.extend(
        [
            '',
            '## 身份拆分',
            '',
            '| 身份 | 活跃用户 | 发起点评 | 查看结果 | checkout 发起 | 支付成功 |',
            '| --- | ---: | ---: | ---: | ---: | ---: |',
        ]
    )
    for plan, row in snapshot['plan_breakdown'].items():
        lines.append(
            '| {plan} | {active_users} | {review_requests} | {review_results} | {checkout_started} | {paid_success} |'.format(
                plan=plan,
                active_users=row['active_users'],
                review_requests=row['review_requests'],
                review_results=row['review_results'],
                checkout_started=row['checkout_started'],
                paid_success=row['paid_success'],
            )
        )

    lines.extend(
        [
            '',
            '## Locale 拆分',
            '',
            '| locale | 活跃用户 | 工作台进入 | 发起点评 | 查看结果 | 发起生图 | 生图成功 | checkout 发起 |',
            '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        ]
    )
    for locale, row in snapshot.get('locale_breakdown', {}).items():
        lines.append(
            '| {locale} | {active_users} | {workspace_entries} | {review_requests} | {review_results} | {generation_requests} | {generation_successes} | {checkout_started} |'.format(
                locale=locale,
                active_users=row['active_users'],
                workspace_entries=row['workspace_entries'],
                review_requests=row['review_requests'],
                review_results=row['review_results'],
                generation_requests=row['generation_requests'],
                generation_successes=row['generation_successes'],
                checkout_started=row['checkout_started'],
            )
        )

    return '\n'.join(lines) + '\n'


def render_product_analytics_weekly_markdown(snapshot: dict[str, Any]) -> str:
    return render_stage_a_snapshot_markdown(snapshot).replace(
        '# PicSpeak 阶段 A 基线快照',
        '# PicSpeak 产品经营周报',
        1,
    )


def render_content_conversion_weekly_markdown(snapshot: dict[str, Any]) -> str:
    lines = [
        '# PicSpeak 内容来源转化周报',
        '',
        f"- 时间窗口：{snapshot['window_start']} -> {snapshot['window_end']}",
        '',
        '## 内容来源漏斗',
        '',
        '| 来源 | 浏览访客 | 工作台点击 | 工作台进入 | 上传成功 | 发起点评 | 查看结果 | 点击率 | 上传转化率 | 首评完成率 |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ]

    for source in CONTENT_CONVERSION_SOURCES:
        row = snapshot['content_conversion_weekly'].get(source, {})
        lines.append(
            '| {source} | {visitors} | {workspace_clicks} | {workspace_entries} | {uploads} | {review_requests} | {review_results} | {workspace_click_rate} | {upload_conversion_rate} | {first_review_completion_rate} |'.format(
                source=source,
                visitors=row.get('visitors', 0),
                workspace_clicks=row.get('workspace_clicks', 0),
                workspace_entries=row.get('workspace_entries', 0),
                uploads=row.get('uploads', 0),
                review_requests=row.get('review_requests', 0),
                review_results=row.get('review_results', 0),
                workspace_click_rate=_format_percent(row.get('workspace_click_rate', 0.0)),
                upload_conversion_rate=_format_percent(row.get('upload_conversion_rate', 0.0)),
                first_review_completion_rate=_format_percent(row.get('first_review_completion_rate', 0.0)),
            )
        )

    lines.extend(
        [
            '',
            '## 读数口径',
            '',
            '- Blog 点击率：`content_workspace_clicked(source=blog) / blog_post_viewed`。',
            '- Blog 首评完成率：`review_result_viewed(source=blog) / review_requested(source=blog)`。',
            '- Gallery 上传转化率：`upload_succeeded(source=gallery) / gallery_viewed`。',
            '- Prompt Library 点击率：`content_workspace_clicked(source=prompt_library) / prompt_library_viewed`。',
            '- 工作台进入和上传成功都继承前端会话级来源，点击事件用来确认具体入口位。',
        ]
    )

    return '\n'.join(lines) + '\n'


def _normalize_text(value: str | None, *, max_length: int) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    return normalized[:max_length]


def record_product_event(
    db,
    *,
    event_name: str,
    user_public_id: str | None = None,
    plan: str = 'guest',
    device_id: str | None = None,
    session_id: str | None = None,
    source: str | None = None,
    page_path: str | None = None,
    locale: str | None = None,
    metadata: dict[str, Any] | None = None,
    created_at: datetime | None = None,
):
    from app.db.models import ProductAnalyticsEvent

    record = ProductAnalyticsEvent(
        event_name=normalize_stage_a_event_name(event_name),
        user_public_id=_normalize_text(user_public_id, max_length=128),
        plan=str(plan or 'guest').strip().lower() or 'guest',
        device_id=_normalize_text(device_id, max_length=128),
        session_id=_normalize_text(session_id, max_length=128),
        source=normalize_analytics_source(source),
        page_path=_normalize_text(page_path, max_length=512),
        locale=_normalize_text(locale, max_length=16),
        metadata_json=dict(metadata or {}),
        created_at=_as_utc_datetime(created_at) if created_at is not None else _as_utc_datetime(datetime.now(timezone.utc)),
    )
    db.add(record)
    db.flush()
    return record


def load_stage_a_snapshot_from_db(
    db,
    *,
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    from app.db.models import ProductAnalyticsEvent, Review, User

    event_window_start = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    event_window_end = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    review_window_end = datetime.combine(end_date + timedelta(days=8), datetime.min.time(), tzinfo=timezone.utc)

    event_rows = (
        db.query(ProductAnalyticsEvent)
        .filter(
            ProductAnalyticsEvent.created_at >= event_window_start,
            ProductAnalyticsEvent.created_at < event_window_end,
        )
        .all()
    )

    review_rows = (
        db.query(User.public_id, Review.created_at)
        .join(User, User.id == Review.owner_user_id)
        .filter(
            Review.created_at < review_window_end,
            Review.deleted_at.is_(None),
        )
        .all()
    )

    snapshot = build_stage_a_snapshot(
        events=[
            AnalyticsEventSample(
                event_name=row.event_name,
                occurred_at=row.created_at,
                device_id=row.device_id,
                session_id=row.session_id,
                user_public_id=row.user_public_id,
                plan=row.plan,
                source=row.source,
                page_path=row.page_path,
                locale=row.locale,
                metadata=dict(row.metadata_json or {}),
            )
            for row in event_rows
        ],
        reviews=[
            ReviewSample(
                owner_public_id=row.public_id,
                created_at=row.created_at,
            )
            for row in review_rows
        ],
        start_date=start_date,
        end_date=end_date,
    )
    snapshot['generated_at'] = _as_utc_datetime(datetime.now(timezone.utc)).isoformat()
    return snapshot
