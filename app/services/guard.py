from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, quota_for_plan
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import IdempotencyKey, RateLimitCounter, User, UserPlan


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def minute_window_start(now: datetime) -> datetime:
    return now.replace(second=0, microsecond=0)


def ten_second_window_start(now: datetime) -> datetime:
    aligned = now.second - (now.second % 10)
    return now.replace(second=aligned, microsecond=0)


def enforce_user_quota(db: Session, user: User) -> None:
    today = utc_now().date()
    if user.daily_quota_date != today:
        user.daily_quota_date = today
        user.daily_quota_used = 0
    user.daily_quota_total = quota_for_plan(user.plan)
    db.add(user)

    if user.daily_quota_used >= user.daily_quota_total:
        raise api_error(429, 'QUOTA_EXCEEDED', 'Daily quota exceeded')


def increment_quota(db: Session, user: User) -> None:
    user.daily_quota_used += 1
    db.add(user)


def _tier_rate_limit(plan: UserPlan, base_limit: int) -> int:
    if plan == UserPlan.guest:
        return max(base_limit // 2, 1)
    if plan == UserPlan.pro:
        return base_limit * 2
    return base_limit


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


def enforce_rate_limit(db: Session, actor: CurrentActor, endpoint: str, client_ip: str | None = None) -> dict:
    now = utc_now()
    window_start = minute_window_start(now)
    window_seconds = 60

    user_limit = _tier_rate_limit(actor.plan, settings.rate_limit_per_minute)
    ip_limit = _tier_rate_limit(actor.plan, settings.ip_rate_limit_per_minute)

    user_rate = _enforce_scope_rate_limit(
        db,
        scope='user',
        scope_key=actor.user.public_id,
        endpoint=endpoint,
        per_minute_limit=user_limit,
        window_start=window_start,
        window_seconds=window_seconds,
    )

    ip_rate = None
    if client_ip:
        ip_rate = _enforce_scope_rate_limit(
            db,
            scope='ip',
            scope_key=client_ip,
            endpoint=endpoint,
            per_minute_limit=ip_limit,
            window_start=window_start,
            window_seconds=window_seconds,
        )

    guest_ip_rate = None
    guest_burst_rate = None
    if actor.plan == UserPlan.guest and client_ip:
        guest_ip_rate = _enforce_scope_rate_limit(
            db,
            scope='guest_ip',
            scope_key=client_ip,
            endpoint='guest_all',
            per_minute_limit=settings.guest_ip_rate_limit_per_minute,
            window_start=window_start,
            window_seconds=window_seconds,
        )

        burst_window_start = ten_second_window_start(now)
        guest_burst_rate = _enforce_scope_rate_limit(
            db,
            scope='guest_ip_burst',
            scope_key=client_ip,
            endpoint='guest_all',
            per_minute_limit=settings.guest_burst_limit_per_10s,
            window_start=burst_window_start,
            window_seconds=10,
        )

    return {
        'user': user_rate,
        'ip': ip_rate,
        'guest_ip': guest_ip_rate,
        'guest_burst': guest_burst_rate,
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
