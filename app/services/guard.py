from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import IdempotencyKey, RateLimitCounter, User


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def minute_window_start(now: datetime) -> datetime:
    return now.replace(second=0, microsecond=0)


def enforce_user_quota(user: User) -> None:
    if user.daily_quota_used >= user.daily_quota_total:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail='Daily quota exceeded')


def increment_quota(db: Session, user: User) -> None:
    user.daily_quota_used += 1
    db.add(user)


def enforce_rate_limit(db: Session, user: User, endpoint: str) -> dict:
    now = utc_now()
    window_start = minute_window_start(now)
    window_seconds = 60

    counter = (
        db.query(RateLimitCounter)
        .filter(
            RateLimitCounter.scope == 'user',
            RateLimitCounter.scope_key == user.public_id,
            RateLimitCounter.endpoint == endpoint,
            RateLimitCounter.window_start == window_start,
            RateLimitCounter.window_seconds == window_seconds,
        )
        .first()
    )

    if counter is None:
        counter = RateLimitCounter(
            scope='user',
            scope_key=user.public_id,
            endpoint=endpoint,
            window_start=window_start,
            window_seconds=window_seconds,
            hit_count=0,
        )
        db.add(counter)

    if counter.hit_count >= settings.rate_limit_per_minute:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail='Rate limit exceeded')

    counter.hit_count += 1
    db.add(counter)

    return {
        'limit_per_min': settings.rate_limit_per_minute,
        'remaining': settings.rate_limit_per_minute - counter.hit_count,
        'reset_at': (window_start + timedelta(seconds=window_seconds)).isoformat(),
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
