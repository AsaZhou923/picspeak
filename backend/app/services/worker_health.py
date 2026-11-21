from __future__ import annotations

from datetime import datetime, timezone
import logging
import threading
import time
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ImageGenerationTask, ReviewTask, TaskStatus, User

logger = logging.getLogger(__name__)

PENDING_TASK_ALERT_COOLDOWN_SECONDS = 600.0

_pending_alert_lock = threading.Lock()
_last_pending_alert_monotonic: float | None = None


def _as_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _age_seconds(oldest_created_at: Any, now_utc: datetime) -> float | None:
    if not isinstance(oldest_created_at, datetime):
        return None
    return round(max(0.0, (now_utc - _as_utc_datetime(oldest_created_at)).total_seconds()), 1)


def oldest_pending_task_ages_seconds(db: Session, *, now: datetime | None = None) -> dict[str, float | None]:
    """Return age in seconds of the oldest PENDING review and generation tasks."""
    now_utc = _as_utc_datetime(now or datetime.now(timezone.utc))
    oldest_review = (
        db.query(func.min(ReviewTask.created_at))
        .filter(ReviewTask.status == TaskStatus.PENDING)
        .scalar()
    )
    oldest_generation = (
        db.query(func.min(ImageGenerationTask.created_at))
        .filter(ImageGenerationTask.status == TaskStatus.PENDING)
        .scalar()
    )
    return {
        'oldest_pending_review_seconds': _age_seconds(oldest_review, now_utc),
        'oldest_pending_generation_seconds': _age_seconds(oldest_generation, now_utc),
    }


def task_owner_public_id(db: Session, owner_user_id: int | None) -> str | None:
    """Public ID of a task owner for worker log correlation; never the internal user id."""
    if owner_user_id is None:
        return None
    public_id = db.query(User.public_id).filter(User.id == owner_user_id).scalar()
    return public_id if isinstance(public_id, str) else None


def reset_pending_task_alert_cooldown() -> None:
    """Reset the per-process warning rate limit (primarily for tests)."""
    global _last_pending_alert_monotonic
    with _pending_alert_lock:
        _last_pending_alert_monotonic = None


def maybe_warn_stale_pending_tasks(
    *,
    oldest_pending_review_seconds: float | None,
    oldest_pending_generation_seconds: float | None,
    worker_heartbeat_stale: bool | None = None,
    threshold_seconds: int | None = None,
    cooldown_seconds: float = PENDING_TASK_ALERT_COOLDOWN_SECONDS,
    now_monotonic: float | None = None,
) -> bool:
    """Emit a rate-limited structured WARNING when the oldest pending task exceeds threshold."""
    global _last_pending_alert_monotonic

    ages = [
        age
        for age in (oldest_pending_review_seconds, oldest_pending_generation_seconds)
        if isinstance(age, (int, float))
    ]
    if not ages:
        return False

    threshold = int(
        settings.worker_pending_task_alert_threshold_seconds
        if threshold_seconds is None
        else threshold_seconds
    )
    max_age = max(ages)
    if max_age <= threshold:
        return False

    current_monotonic = time.monotonic() if now_monotonic is None else float(now_monotonic)
    with _pending_alert_lock:
        if (
            _last_pending_alert_monotonic is not None
            and (current_monotonic - _last_pending_alert_monotonic) < cooldown_seconds
        ):
            return False
        _last_pending_alert_monotonic = current_monotonic

    logger.warning(
        'Oldest pending task age (%.1fs) exceeded threshold (%ss)',
        max_age,
        threshold,
        extra={
            'event': 'pending_task_backlog_stale',
            'threshold_seconds': threshold,
            'oldest_pending_review_seconds': oldest_pending_review_seconds,
            'oldest_pending_generation_seconds': oldest_pending_generation_seconds,
            'max_pending_task_age_seconds': max_age,
            'worker_heartbeat_stale': worker_heartbeat_stale,
        },
    )
    return True
