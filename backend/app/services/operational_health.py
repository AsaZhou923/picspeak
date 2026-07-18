from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable


TASK_KINDS = ('review', 'generation')
TASK_STATUSES = ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'EXPIRED')
CHECKOUT_EVENTS = {'checkout_started', 'credit_pack_checkout_started'}


@dataclass(slots=True)
class OperationalTaskSample:
    kind: str
    status: str
    created_at: datetime
    updated_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    next_attempt_at: datetime | None = None
    last_heartbeat_at: datetime | None = None
    error_code: str | None = None
    error_message: str | None = None


@dataclass(slots=True)
class OperationalCostSample:
    kind: str
    created_at: datetime
    cost_usd: Decimal | float | int | None = None
    credits_charged: Decimal | float | int | None = None
    quality: str | None = None
    size: str | None = None


@dataclass(slots=True)
class UsageLedgerSample:
    usage_type: str
    amount: Decimal | float | int
    unit: str
    bill_date: date
    metadata: dict[str, Any] | None = None


@dataclass(slots=True)
class PaymentEventSample:
    event_name: str
    created_at: datetime
    source: str = 'analytics'
    outcome: str | None = None
    processed_at: datetime | None = None
    metadata: dict[str, Any] | None = None


@dataclass(slots=True)
class GalleryAuditSample:
    review_id: str
    created_at: datetime
    gallery_visible: bool
    gallery_audit_status: str
    has_thumbnail: bool
    summary: str | None = None


def _as_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _money(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _status_value(value: str) -> str:
    normalized = str(value or '').strip().upper()
    return normalized if normalized in TASK_STATUSES else 'UNKNOWN'


def _kind_value(value: str) -> str:
    normalized = str(value or '').strip().lower()
    return normalized if normalized in TASK_KINDS else 'unknown'


def _in_datetime_window(value: datetime, start_date: date, end_date: date) -> bool:
    current = _as_utc_datetime(value).date()
    return start_date <= current <= end_date


def _failure_cluster(error_code: str | None, error_message: str | None) -> str:
    haystack = f'{error_code or ""} {error_message or ""}'.lower()
    if any(token in haystack for token in ('storage', 's3', 'object', 'thumbnail', 'upload')):
        return 'storage'
    if any(token in haystack for token in ('openai', 'ai_', 'model', 'prompt', 'generation')):
        return 'ai'
    if any(token in haystack for token in ('quota', 'credit', 'exhausted', 'limit')):
        return 'quota'
    if any(token in haystack for token in ('auth', 'permission', 'forbidden', 'unauthorized', 'user_not_found')):
        return 'auth'
    if any(token in haystack for token in ('schema', 'json', 'parse', 'validation', 'payload')):
        return 'schema'
    if any(token in haystack for token in ('network', 'timeout', 'connection', '503', '502')):
        return 'network'
    if any(token in haystack for token in ('worker', 'dispatch', 'stalled', 'dead_letter', 'expired')):
        return 'worker'
    return 'unknown'


def _avg_seconds(tasks: Iterable[OperationalTaskSample]) -> float:
    durations: list[float] = []
    for task in tasks:
        if task.started_at is None or task.finished_at is None:
            continue
        started_at = _as_utc_datetime(task.started_at)
        finished_at = _as_utc_datetime(task.finished_at)
        if finished_at >= started_at:
            durations.append((finished_at - started_at).total_seconds())
    if not durations:
        return 0.0
    return round(sum(durations) / len(durations), 1)


def build_operational_health_snapshot(
    *,
    tasks: list[OperationalTaskSample],
    costs: list[OperationalCostSample],
    ledger_entries: list[UsageLedgerSample],
    payment_events: list[PaymentEventSample],
    gallery_audit_samples: list[GalleryAuditSample],
    start_date: date,
    end_date: date,
    now: datetime | None = None,
    pending_timeout_minutes: int = 20,
    running_timeout_minutes: int = 15,
) -> dict[str, Any]:
    now_utc = _as_utc_datetime(now or datetime.now(timezone.utc))
    period_tasks = [
        task
        for task in tasks
        if _in_datetime_window(task.created_at, start_date, end_date)
        or (
            _status_value(task.status) in {'PENDING', 'RUNNING'}
            and _as_utc_datetime(task.created_at).date() <= end_date
        )
    ]
    period_costs = [cost for cost in costs if _in_datetime_window(cost.created_at, start_date, end_date)]
    period_ledger = [entry for entry in ledger_entries if start_date <= entry.bill_date <= end_date]
    period_payments = [event for event in payment_events if _in_datetime_window(event.created_at, start_date, end_date)]

    task_rows: dict[str, dict[str, Any]] = {}
    stale_pending: list[OperationalTaskSample] = []
    stale_running: list[OperationalTaskSample] = []
    failed_tasks: list[OperationalTaskSample] = []

    for kind in TASK_KINDS:
        kind_tasks = [task for task in period_tasks if _kind_value(task.kind) == kind]
        status_counts = Counter(_status_value(task.status) for task in kind_tasks)
        kind_stale_pending = [
            task
            for task in kind_tasks
            if _status_value(task.status) == 'PENDING'
            and now_utc - _as_utc_datetime(task.next_attempt_at or task.created_at) > timedelta(minutes=pending_timeout_minutes)
        ]
        kind_stale_running = [
            task
            for task in kind_tasks
            if _status_value(task.status) == 'RUNNING'
            and now_utc - _as_utc_datetime(task.last_heartbeat_at or task.started_at or task.updated_at or task.created_at)
            > timedelta(minutes=running_timeout_minutes)
        ]
        kind_failed = [
            task
            for task in kind_tasks
            if _status_value(task.status) in {'FAILED', 'DEAD_LETTER'} or task.error_code
        ]
        stale_pending.extend(kind_stale_pending)
        stale_running.extend(kind_stale_running)
        failed_tasks.extend(kind_failed)

        task_rows[kind] = {
            'total': len(kind_tasks),
            'by_status': {status: status_counts.get(status, 0) for status in TASK_STATUSES},
            'stale_pending': len(kind_stale_pending),
            'stale_running': len(kind_stale_running),
            'failed_or_dead_letter': len(kind_failed),
            'failure_rate': round(len(kind_failed) / len(kind_tasks), 4) if kind_tasks else 0.0,
            'avg_processing_seconds': _avg_seconds(kind_tasks),
        }

    failure_clusters = Counter(_failure_cluster(task.error_code, task.error_message) for task in failed_tasks)
    top_failure_reasons = Counter(
        f"{_kind_value(task.kind)}:{task.error_code or 'missing_error_code'}"
        for task in failed_tasks
    )

    review_cost_usd = sum(_money(cost.cost_usd) for cost in period_costs if _kind_value(cost.kind) == 'review')
    generation_cost_usd = sum(_money(cost.cost_usd) for cost in period_costs if _kind_value(cost.kind) == 'generation')
    generated_credits = sum(_money(cost.credits_charged) for cost in period_costs if _kind_value(cost.kind) == 'generation')
    ledger_credits_consumed = sum(
        _money(entry.amount)
        for entry in period_ledger
        if entry.usage_type == 'image_generation_credit' and _money(entry.amount) > 0
    )
    ledger_credits_granted = sum(
        abs(_money(entry.amount))
        for entry in period_ledger
        if entry.usage_type == 'image_generation_credit' and _money(entry.amount) < 0
    )
    review_quota_used = sum(
        _money(entry.amount)
        for entry in period_ledger
        if entry.usage_type == 'review_request'
    )

    checkout_started = sum(
        1
        for event in period_payments
        if event.source == 'analytics' and event.event_name in CHECKOUT_EVENTS
    )
    paid_success = sum(
        1
        for event in period_payments
        if event.source == 'analytics' and event.event_name == 'paid_success'
    )
    webhook_events = [event for event in period_payments if event.source == 'webhook']
    processed_webhooks = [
        event for event in webhook_events if event.processed_at is not None or str(event.outcome or '').strip()
    ]

    visible_gallery = [sample for sample in gallery_audit_samples if sample.gallery_visible]
    approved_gallery = [
        sample for sample in visible_gallery if sample.gallery_audit_status.strip().lower() == 'approved'
    ]
    rejected_gallery = [
        sample for sample in gallery_audit_samples if sample.gallery_audit_status.strip().lower() == 'rejected'
    ]
    thumbnail_missing = [sample for sample in approved_gallery if not sample.has_thumbnail]
    summary_missing = [sample for sample in approved_gallery if not str(sample.summary or '').strip()]

    warnings: list[str] = []
    if stale_pending:
        warnings.append('pending_tasks_stale')
    if stale_running:
        warnings.append('running_tasks_stale')
    if any(row['by_status']['DEAD_LETTER'] for row in task_rows.values()):
        warnings.append('dead_letter_tasks_present')
    if checkout_started > 0 and paid_success == 0:
        warnings.append('checkout_without_paid_success')
    if len(webhook_events) > len(processed_webhooks):
        warnings.append('unprocessed_billing_webhooks')
    if thumbnail_missing:
        warnings.append('public_gallery_thumbnail_missing')
    if summary_missing:
        warnings.append('public_gallery_summary_missing')

    status = 'healthy'
    if warnings:
        status = 'attention'
    if stale_running or any(row['by_status']['DEAD_LETTER'] for row in task_rows.values()):
        status = 'critical'

    return {
        'window_start': start_date.isoformat(),
        'window_end': end_date.isoformat(),
        'generated_at': now_utc.isoformat(),
        'status': status,
        'warnings': warnings,
        'tasks': task_rows,
        'failures': {
            'total': len(failed_tasks),
            'clusters': dict(sorted(failure_clusters.items())),
            'top_reasons': [
                {'reason': reason, 'count': count}
                for reason, count in top_failure_reasons.most_common(5)
            ],
        },
        'costs': {
            'review_cost_usd': round(review_cost_usd, 4),
            'generation_cost_usd': round(generation_cost_usd, 4),
            'total_ai_cost_usd': round(review_cost_usd + generation_cost_usd, 4),
            'generated_image_credits_charged': round(generated_credits, 2),
            'ledger_credits_consumed': round(ledger_credits_consumed, 2),
            'ledger_credits_granted': round(ledger_credits_granted, 2),
            'review_quota_used': round(review_quota_used, 2),
        },
        'payments': {
            'checkout_started': checkout_started,
            'paid_success': paid_success,
            'checkout_to_paid_rate': round(paid_success / checkout_started, 4) if checkout_started else 0.0,
            'webhook_events': len(webhook_events),
            'processed_webhooks': len(processed_webhooks),
            'unprocessed_webhooks': len(webhook_events) - len(processed_webhooks),
        },
        'gallery_audit': {
            'sampled_reviews': len(gallery_audit_samples),
            'visible_reviews': len(visible_gallery),
            'approved_visible_reviews': len(approved_gallery),
            'rejected_reviews': len(rejected_gallery),
            'thumbnail_missing': len(thumbnail_missing),
            'summary_missing': len(summary_missing),
        },
    }


def _format_percent(value: float) -> str:
    return f'{value * 100:.1f}%'


def render_operational_health_markdown(snapshot: dict[str, Any]) -> str:
    warnings = ', '.join(snapshot.get('warnings') or []) or '无'
    lines = [
        '# PicSpeak 运营健康快照',
        '',
        f"- 时间窗口：{snapshot['window_start']} -> {snapshot['window_end']}",
        f"- 生成时间：{snapshot.get('generated_at', '')}",
        f"- 总体状态：{snapshot.get('status', 'unknown')}",
        f"- 告警：{warnings}",
        '',
        '## 任务健康',
        '',
        '| 任务类型 | 总数 | PENDING | RUNNING | SUCCEEDED | FAILED | DEAD_LETTER | stale pending | stale running | 失败率 | 平均处理秒 |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ]
    for kind in TASK_KINDS:
        row = snapshot.get('tasks', {}).get(kind, {})
        status_counts = row.get('by_status', {})
        lines.append(
            '| {kind} | {total} | {pending} | {running} | {succeeded} | {failed} | {dead_letter} | {stale_pending} | {stale_running} | {failure_rate} | {avg_processing_seconds} |'.format(
                kind=kind,
                total=row.get('total', 0),
                pending=status_counts.get('PENDING', 0),
                running=status_counts.get('RUNNING', 0),
                succeeded=status_counts.get('SUCCEEDED', 0),
                failed=status_counts.get('FAILED', 0),
                dead_letter=status_counts.get('DEAD_LETTER', 0),
                stale_pending=row.get('stale_pending', 0),
                stale_running=row.get('stale_running', 0),
                failure_rate=_format_percent(row.get('failure_rate', 0.0)),
                avg_processing_seconds=row.get('avg_processing_seconds', 0),
            )
        )

    lines.extend(
        [
            '',
            '## 失败聚类',
            '',
            '| 聚类 | 数量 |',
            '| --- | ---: |',
        ]
    )
    clusters = snapshot.get('failures', {}).get('clusters') or {}
    for cluster, count in clusters.items():
        lines.append(f'| {cluster} | {count} |')
    if not clusters:
        lines.append('| 无 | 0 |')

    lines.extend(
        [
            '',
            '| 失败原因 | 数量 |',
            '| --- | ---: |',
        ]
    )
    top_reasons = snapshot.get('failures', {}).get('top_reasons') or []
    for item in top_reasons:
        lines.append(f"| {item.get('reason', 'unknown')} | {item.get('count', 0)} |")
    if not top_reasons:
        lines.append('| 无 | 0 |')

    costs = snapshot.get('costs', {})
    lines.extend(
        [
            '',
            '## 成本与 Credits',
            '',
            '| 指标 | 数值 |',
            '| --- | ---: |',
            f"| review AI cost USD | {costs.get('review_cost_usd', 0)} |",
            f"| generation AI cost USD | {costs.get('generation_cost_usd', 0)} |",
            f"| total AI cost USD | {costs.get('total_ai_cost_usd', 0)} |",
            f"| generated image credits charged | {costs.get('generated_image_credits_charged', 0)} |",
            f"| ledger credits consumed | {costs.get('ledger_credits_consumed', 0)} |",
            f"| ledger credits granted | {costs.get('ledger_credits_granted', 0)} |",
            f"| review quota used | {costs.get('review_quota_used', 0)} |",
        ]
    )

    payments = snapshot.get('payments', {})
    lines.extend(
        [
            '',
            '## 支付健康',
            '',
            '| 指标 | 数值 |',
            '| --- | ---: |',
            f"| checkout started | {payments.get('checkout_started', 0)} |",
            f"| paid success | {payments.get('paid_success', 0)} |",
            f"| checkout -> paid | {_format_percent(payments.get('checkout_to_paid_rate', 0.0))} |",
            f"| webhook events | {payments.get('webhook_events', 0)} |",
            f"| processed webhooks | {payments.get('processed_webhooks', 0)} |",
            f"| unprocessed webhooks | {payments.get('unprocessed_webhooks', 0)} |",
        ]
    )

    gallery = snapshot.get('gallery_audit', {})
    lines.extend(
        [
            '',
            '## 公开内容抽查',
            '',
            '| 指标 | 数值 |',
            '| --- | ---: |',
            f"| sampled reviews | {gallery.get('sampled_reviews', 0)} |",
            f"| visible reviews | {gallery.get('visible_reviews', 0)} |",
            f"| approved visible reviews | {gallery.get('approved_visible_reviews', 0)} |",
            f"| rejected reviews | {gallery.get('rejected_reviews', 0)} |",
            f"| thumbnail missing | {gallery.get('thumbnail_missing', 0)} |",
            f"| server-visible summary missing | {gallery.get('summary_missing', 0)} |",
        ]
    )
    return '\n'.join(lines) + '\n'


def _review_summary_from_result(result_json: dict[str, Any] | None) -> str:
    result = dict(result_json or {})
    for key in ('summary', 'overall_summary', 'short_summary', 'final_summary'):
        value = str(result.get(key) or '').strip()
        if value:
            return value
    return ''


def load_operational_health_snapshot_from_db(
    db,
    *,
    start_date: date,
    end_date: date,
    now: datetime | None = None,
    gallery_sample_limit: int = 20,
) -> dict[str, Any]:
    from sqlalchemy import or_

    from app.db.models import (
        BillingWebhookEvent,
        GeneratedImage,
        ImageGenerationTask,
        Photo,
        ProductAnalyticsEvent,
        Review,
        ReviewTask,
        TaskStatus,
        UsageLedger,
    )

    window_start = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    window_end = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    stale_floor = window_start - timedelta(days=7)

    review_tasks = (
        db.query(ReviewTask)
        .filter(
            ReviewTask.created_at >= stale_floor,
            ReviewTask.created_at < window_end,
            or_(
                ReviewTask.created_at >= window_start,
                ReviewTask.status.in_([TaskStatus.PENDING, TaskStatus.RUNNING]),
            ),
        )
        .all()
    )
    generation_tasks = (
        db.query(ImageGenerationTask)
        .filter(
            ImageGenerationTask.created_at >= stale_floor,
            ImageGenerationTask.created_at < window_end,
            or_(
                ImageGenerationTask.created_at >= window_start,
                ImageGenerationTask.status.in_([TaskStatus.PENDING, TaskStatus.RUNNING]),
            ),
        )
        .all()
    )
    review_rows = (
        db.query(Review)
        .filter(Review.created_at >= window_start, Review.created_at < window_end, Review.deleted_at.is_(None))
        .all()
    )
    generated_rows = (
        db.query(GeneratedImage)
        .filter(GeneratedImage.created_at >= window_start, GeneratedImage.created_at < window_end, GeneratedImage.deleted_at.is_(None))
        .all()
    )
    ledger_rows = (
        db.query(UsageLedger)
        .filter(UsageLedger.bill_date >= start_date, UsageLedger.bill_date <= end_date)
        .all()
    )
    analytics_payment_rows = (
        db.query(ProductAnalyticsEvent)
        .filter(
            ProductAnalyticsEvent.created_at >= window_start,
            ProductAnalyticsEvent.created_at < window_end,
            ProductAnalyticsEvent.event_name.in_(['checkout_started', 'credit_pack_checkout_started', 'paid_success']),
        )
        .all()
    )
    webhook_rows = (
        db.query(BillingWebhookEvent)
        .filter(BillingWebhookEvent.created_at >= window_start, BillingWebhookEvent.created_at < window_end)
        .all()
    )
    gallery_rows = (
        db.query(Review, Photo)
        .join(Photo, Photo.id == Review.photo_id)
        .filter(
            Review.gallery_visible.is_(True),
            Review.deleted_at.is_(None),
        )
        .order_by(Review.gallery_added_at.desc().nullslast(), Review.created_at.desc())
        .limit(max(1, int(gallery_sample_limit)))
        .all()
    )

    tasks = [
        OperationalTaskSample(
            kind='review',
            status=row.status.value if hasattr(row.status, 'value') else str(row.status),
            created_at=row.created_at,
            updated_at=row.updated_at,
            started_at=row.started_at,
            finished_at=row.finished_at,
            next_attempt_at=row.next_attempt_at,
            last_heartbeat_at=row.last_heartbeat_at,
            error_code=row.error_code,
            error_message=row.error_message,
        )
        for row in review_tasks
    ]
    tasks.extend(
        OperationalTaskSample(
            kind='generation',
            status=row.status.value if hasattr(row.status, 'value') else str(row.status),
            created_at=row.created_at,
            updated_at=row.updated_at,
            started_at=row.started_at,
            finished_at=row.finished_at,
            next_attempt_at=row.next_attempt_at,
            last_heartbeat_at=row.last_heartbeat_at,
            error_code=row.error_code,
            error_message=row.error_message,
        )
        for row in generation_tasks
    )

    costs = [
        OperationalCostSample(kind='review', created_at=row.created_at, cost_usd=row.cost_usd)
        for row in review_rows
    ]
    costs.extend(
        OperationalCostSample(
            kind='generation',
            created_at=row.created_at,
            cost_usd=row.cost_usd,
            credits_charged=row.credits_charged,
            quality=row.quality,
            size=row.size,
        )
        for row in generated_rows
    )

    payments = [
        PaymentEventSample(
            event_name=row.event_name,
            created_at=row.created_at,
            source='analytics',
            metadata=dict(row.metadata_json or {}),
        )
        for row in analytics_payment_rows
    ]
    payments.extend(
        PaymentEventSample(
            event_name=row.event_name,
            created_at=row.created_at,
            source='webhook',
            outcome=row.outcome,
            processed_at=row.processed_at,
            metadata=dict(row.payload_json or {}),
        )
        for row in webhook_rows
    )

    gallery_samples = [
        GalleryAuditSample(
            review_id=review.public_id,
            created_at=review.created_at,
            gallery_visible=bool(review.gallery_visible),
            gallery_audit_status=str(review.gallery_audit_status or 'none'),
            has_thumbnail=bool(dict(photo.client_meta or {}).get('gallery_thumbnail_key')),
            summary=_review_summary_from_result(review.result_json),
        )
        for review, photo in gallery_rows
    ]

    return build_operational_health_snapshot(
        tasks=tasks,
        costs=costs,
        ledger_entries=[
            UsageLedgerSample(
                usage_type=row.usage_type,
                amount=row.amount,
                unit=row.unit,
                bill_date=row.bill_date,
                metadata=dict(row.metadata_json or {}),
            )
            for row in ledger_rows
        ],
        payment_events=payments,
        gallery_audit_samples=gallery_samples,
        start_date=start_date,
        end_date=end_date,
        now=now,
    )
