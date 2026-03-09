from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from fastapi import Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import api_error
from app.core.network import client_ip_from_request, device_key_from_request
from app.db.models import IdempotencyKey, RateLimitCounter, UsageLedger, User, UserPlan

if TYPE_CHECKING:
    from app.api.deps import CurrentActor


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def minute_window_start(now: datetime) -> datetime:
    return now.replace(second=0, microsecond=0)


def day_window_start(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def month_window_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def refresh_user_quota(db: Session, user: User) -> None:
    today = utc_now().date()
    if user.daily_quota_date != today:
        user.daily_quota_date = today
        user.daily_quota_used = 0
    user.daily_quota_total = daily_quota_for_plan(user.plan) or 0
    db.add(user)


def enforce_user_quota(db: Session, user: User) -> None:
    refresh_user_quota(db, user)

    daily_total = daily_quota_for_plan(user.plan)
    if daily_total is not None and user.daily_quota_used >= daily_total:
        raise api_error(429, 'QUOTA_EXCEEDED', 'Daily quota exceeded')

    monthly_total = monthly_quota_for_plan(user.plan)
    if monthly_total is not None and count_monthly_review_usage(db, user) >= monthly_total:
        raise api_error(429, 'QUOTA_EXCEEDED', 'Monthly quota exceeded')


def increment_quota(db: Session, user: User) -> None:
    user.daily_quota_used += 1
    db.add(user)


def daily_quota_for_plan(plan: UserPlan) -> int | None:
    if plan == UserPlan.guest:
        return settings.guest_review_limit_per_day
    if plan == UserPlan.free:
        return settings.free_review_limit_per_day
    if plan == UserPlan.pro:
        return None
    return None


def monthly_quota_for_plan(plan: UserPlan) -> int | None:
    if plan == UserPlan.free:
        return settings.free_review_limit_per_month
    if plan == UserPlan.pro:
        return settings.pro_review_limit_per_month
    return None


def history_retention_days_for_plan(plan: UserPlan) -> int | None:
    if plan == UserPlan.guest:
        return 0
    if plan == UserPlan.free:
        return 30
    if plan == UserPlan.pro:
        return None
    return None


def plan_review_modes(plan: UserPlan) -> list[str]:
    if plan == UserPlan.guest:
        return ['flash']
    return ['flash', 'pro']


def has_priority_queue(plan: UserPlan) -> bool:
    return plan == UserPlan.pro


def review_history_cutoff(plan: UserPlan, *, now: datetime | None = None) -> datetime | None:
    retention_days = history_retention_days_for_plan(plan)
    if retention_days is None or retention_days <= 0:
        return None
    current = now or utc_now()
    return current - timedelta(days=retention_days)


def count_monthly_review_usage(db: Session, user: User, *, now: datetime | None = None) -> int:
    monthly_total = monthly_quota_for_plan(user.plan)
    if monthly_total is None:
        return 0

    current = now or utc_now()
    period_start = current.date().replace(day=1)
    if period_start.month == 12:
        next_period_start = period_start.replace(year=period_start.year + 1, month=1)
    else:
        next_period_start = period_start.replace(month=period_start.month + 1)

    used = (
        db.query(func.coalesce(func.sum(UsageLedger.amount), 0))
        .filter(
            UsageLedger.user_id == user.id,
            UsageLedger.usage_type == 'review_request',
            UsageLedger.bill_date >= period_start,
            UsageLedger.bill_date < next_period_start,
        )
        .scalar()
    )
    return int(used or 0)


def guest_usage_snapshot(db: Session, scope_key: str, *, now: datetime | None = None) -> dict[str, int | None]:
    current = now or utc_now()
    daily_used = _counter_hit_count(
        db,
        scope='guest_review_daily',
        scope_key=scope_key,
        endpoint='review_create',
        window_start=day_window_start(current),
        window_seconds=24 * 3600,
    )
    daily_total = settings.guest_review_limit_per_day
    return {
        'daily_total': daily_total,
        'daily_used': daily_used,
        'daily_remaining': max(daily_total - daily_used, 0),
        'monthly_total': None,
        'monthly_used': None,
        'monthly_remaining': None,
    }


def user_usage_snapshot(db: Session, user: User, *, now: datetime | None = None) -> dict[str, int | None]:
    refresh_user_quota(db, user)
    monthly_used = count_monthly_review_usage(db, user, now=now)
    daily_total = daily_quota_for_plan(user.plan)
    monthly_total = monthly_quota_for_plan(user.plan)
    return {
        'daily_total': daily_total,
        'daily_used': user.daily_quota_used if daily_total is not None else None,
        'daily_remaining': max(daily_total - user.daily_quota_used, 0) if daily_total is not None else None,
        'monthly_total': monthly_total,
        'monthly_used': monthly_used if monthly_total is not None else None,
        'monthly_remaining': max(monthly_total - monthly_used, 0) if monthly_total is not None else None,
    }


def _enforce_scope_rate_limit(
    db: Session,
    *,
    scope: str,
    scope_key: str,
    endpoint: str,
    per_minute_limit: int,
    window_start: datetime,
    window_seconds: int,
) -> dict:
    counter = (
        db.query(RateLimitCounter)
        .filter(
            RateLimitCounter.scope == scope,
            RateLimitCounter.scope_key == scope_key,
            RateLimitCounter.endpoint == endpoint,
            RateLimitCounter.window_start == window_start,
            RateLimitCounter.window_seconds == window_seconds,
        )
        .first()
    )

    if counter is None:
        counter = RateLimitCounter(
            scope=scope,
            scope_key=scope_key,
            endpoint=endpoint,
            window_start=window_start,
            window_seconds=window_seconds,
            hit_count=0,
        )
        db.add(counter)

    if counter.hit_count >= per_minute_limit:
        raise api_error(429, 'RATE_LIMIT_EXCEEDED', f'Rate limit exceeded ({scope})')

    counter.hit_count += 1
    db.add(counter)

    return {
        'limit_per_min': per_minute_limit,
        'remaining': per_minute_limit - counter.hit_count,
        'reset_at': (window_start + timedelta(seconds=window_seconds)).isoformat(),
    }


def _counter_hit_count(
    db: Session,
    *,
    scope: str,
    scope_key: str,
    endpoint: str,
    window_start: datetime,
    window_seconds: int,
) -> int:
    counter = (
        db.query(RateLimitCounter)
        .filter(
            RateLimitCounter.scope == scope,
            RateLimitCounter.scope_key == scope_key,
            RateLimitCounter.endpoint == endpoint,
            RateLimitCounter.window_start == window_start,
            RateLimitCounter.window_seconds == window_seconds,
        )
        .first()
    )
    return int(counter.hit_count) if counter else 0


def guest_rate_limit_scope_key(request: Request) -> str:
    key_basis = device_key_from_request(request) or client_ip_from_request(request) or 'anonymous'
    hashed_basis = hashlib.sha256(key_basis.encode('utf-8')).hexdigest()
    return f'guest:{hashed_basis}'


def enforce_guest_review_limits(db: Session, actor: 'CurrentActor', scope_key: str) -> dict:
    if actor.plan != UserPlan.guest:
        return {}

    now = utc_now()
    minute_rate = _enforce_scope_rate_limit(
        db,
        scope='guest_review_minute',
        scope_key=scope_key,
        endpoint='review_create',
        per_minute_limit=settings.guest_review_rate_limit_per_minute,
        window_start=minute_window_start(now),
        window_seconds=60,
    )
    day_rate = _enforce_scope_rate_limit(
        db,
        scope='guest_review_daily',
        scope_key=scope_key,
        endpoint='review_create',
        per_minute_limit=settings.guest_review_limit_per_day,
        window_start=day_window_start(now),
        window_seconds=24 * 3600,
    )
    return {
        'guest_review_minute': minute_rate,
        'guest_review_daily': day_rate,
    }


def enforce_guest_api_rate_limit(db: Session, actor: 'CurrentActor', endpoint: str, scope_key: str) -> dict:
    if actor.plan != UserPlan.guest:
        return {}

    now = utc_now()
    minute_rate = _enforce_scope_rate_limit(
        db,
        scope='guest_api_minute',
        scope_key=scope_key,
        endpoint=endpoint,
        per_minute_limit=settings.guest_api_rate_limit_per_minute,
        window_start=minute_window_start(now),
        window_seconds=60,
    )
    return {
        'guest_api_minute': minute_rate,
    }


def hash_request(payload: str) -> str:
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def get_idempotency_record(db: Session, user_id: int, endpoint: str, key: str) -> IdempotencyKey | None:
    now = utc_now()
    return (
        db.query(IdempotencyKey)
        .filter(
            IdempotencyKey.user_id == user_id,
            IdempotencyKey.endpoint == endpoint,
            IdempotencyKey.idempotency_key == key,
            IdempotencyKey.expire_at > now,
        )
        .first()
    )


def save_idempotency_record(
    db: Session,
    user_id: int,
    endpoint: str,
    key: str,
    request_hash: str,
    http_status: int,
    response_json: dict,
    ttl_hours: int = 24,
) -> None:
    record = IdempotencyKey(
        user_id=user_id,
        endpoint=endpoint,
        idempotency_key=key,
        request_hash=request_hash,
        http_status=http_status,
        response_json=response_json,
        expire_at=utc_now() + timedelta(hours=ttl_hours),
    )
    db.add(record)
