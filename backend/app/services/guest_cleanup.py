from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import exists, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ApiRequestLog, IdempotencyKey, Photo, Review, ReviewTask, ReviewTaskEvent, TaskStatus, UsageLedger, User, UserPlan, UserStatus


def cleanup_stale_guest_users(db: Session, *, dry_run: bool = False) -> int:
    stale_days = max(int(settings.guest_user_stale_days), 1)
    batch_size = max(int(settings.guest_user_cleanup_batch_size), 1)
    cutoff = datetime.now(timezone.utc) - timedelta(days=stale_days)

    has_review = exists().where(Review.owner_user_id == User.id)
    has_live_task = exists().where(
        ReviewTask.owner_user_id == User.id,
        ReviewTask.status.in_([TaskStatus.PENDING, TaskStatus.RUNNING]),
    )

    stale_users = (
        db.query(User.id, User.public_id)
        .filter(
            User.plan == UserPlan.guest,
            User.status == UserStatus.active,
            func.coalesce(User.last_login_at, User.created_at) < cutoff,
            ~has_review,
            ~has_live_task,
        )
        .order_by(func.coalesce(User.last_login_at, User.created_at).asc(), User.id.asc())
        .limit(batch_size)
        .all()
    )
    if not stale_users:
        return 0
    if dry_run:
        return len(stale_users)

    user_ids = [row.id for row in stale_users]
    user_public_ids = [row.public_id for row in stale_users]
    task_ids = [task_id for (task_id,) in db.query(ReviewTask.id).filter(ReviewTask.owner_user_id.in_(user_ids)).all()]

    if task_ids:
        db.query(ReviewTaskEvent).filter(ReviewTaskEvent.task_id.in_(task_ids)).delete(synchronize_session=False)
    db.query(UsageLedger).filter(UsageLedger.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(IdempotencyKey).filter(IdempotencyKey.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(ReviewTask).filter(ReviewTask.owner_user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(Photo).filter(Photo.owner_user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(ApiRequestLog).filter(ApiRequestLog.user_public_id.in_(user_public_ids)).delete(synchronize_session=False)
    deleted_count = db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
    db.commit()
    return deleted_count
