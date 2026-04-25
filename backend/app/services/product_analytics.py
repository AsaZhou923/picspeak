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
    'share',
    'checkout',
    'unknown',
}

VISITOR_EVENT_BY_SOURCE = {
    'home_direct': 'home_viewed',
    'blog': 'blog_post_viewed',
    'gallery': 'gallery_viewed',
    'share': 'share_viewed',
}

CONTENT_CONVERSION_SOURCES = ('blog', 'gallery')


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

        report[source] = row

    return report


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
    }


def _format_percent(value: float) -> str:
    return f'{value * 100:.1f}%'


def render_stage_a_snapshot_markdown(snapshot: dict[str, Any]) -> str:
    lines = [
        '# PicSpeak 阶段 A 基线快照',
        '',
        f"- 时间窗口：{snapshot['window_start']} -> {snapshot['window_end']}",
        '',
        '## 日度漏斗总览',
        '',
        '| 日期 | DAU | WAU | 首评完成率 | 7 日二次使用率 | guest -> sign-in | free -> checkout | checkout -> paid |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ]

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

    return '\n'.join(lines) + '\n'


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
