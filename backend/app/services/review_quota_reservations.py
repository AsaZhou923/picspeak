from __future__ import annotations

from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
import logging

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.db.models import ReviewMode, ReviewQuotaReservation, ReviewTask, User, UserPlan
from app.services.guard import enforce_user_quota

logger = logging.getLogger(__name__)


@contextmanager
def synchronous_review_quota(db: Session, user: User, *, mode: ReviewMode):
    reservation = reserve_review_quota(db, user, mode=mode)
    db.commit()
    try:
        yield reservation
    except BaseException:
        db.rollback()
        try:
            release_review_quota(db, reservation)
            db.commit()
        except Exception:
            logger.exception('Failed to release synchronous review quota')
            db.rollback()
        raise


def reserve_review_quota(
    db: Session, user: User, *, mode: ReviewMode, task: ReviewTask | None = None,
) -> ReviewQuotaReservation | None:
    if user.plan == UserPlan.guest:
        # Guest quota is already atomically charged at request admission.
        return None
    with db.no_autoflush:
        db.query(User).filter(User.id == user.id).with_for_update(
            key_share=True,
        ).populate_existing().one()
    now = datetime.now(timezone.utc)
    reservation = db.query(ReviewQuotaReservation).filter(
        ReviewQuotaReservation.task_id == task.id,
    ).with_for_update().first() if task is not None else None
    if reservation is not None and reservation.status == 'consumed':
        raise api_error(409, 'TASK_ALREADY_CHARGED', 'Review task was already charged')
    enforce_user_quota(
        db, user, mode=mode,
        exclude_reservation_id=reservation.id if reservation is not None else None,
    )
    if reservation is None:
        reservation = ReviewQuotaReservation(user_id=user.id, task_id=task.id if task is not None else None)
    reservation.mode = mode.value
    reservation.bill_date = now.date()
    reservation.status = 'held'
    reservation.expires_at = task.expire_at if task is not None and task.expire_at else now + timedelta(minutes=30)
    db.add(reservation)
    db.flush()
    return reservation


def release_review_quota(db: Session, reservation: ReviewQuotaReservation | None) -> None:
    if reservation is not None:
        db.query(ReviewQuotaReservation).filter(
            ReviewQuotaReservation.id == reservation.id,
            ReviewQuotaReservation.status == 'held',
        ).update({ReviewQuotaReservation.status: 'released'}, synchronize_session='fetch')


def release_task_review_quota(db: Session, task_id: int) -> None:
    db.query(ReviewQuotaReservation).filter(
        ReviewQuotaReservation.task_id == task_id,
        ReviewQuotaReservation.status == 'held',
    ).update({ReviewQuotaReservation.status: 'released'}, synchronize_session='fetch')


def consume_review_quota(db: Session, reservation: ReviewQuotaReservation | None) -> None:
    if reservation is None:
        return
    updated = db.query(ReviewQuotaReservation).filter(
        ReviewQuotaReservation.id == reservation.id,
        ReviewQuotaReservation.status == 'held',
        ReviewQuotaReservation.expires_at > datetime.now(timezone.utc),
    ).update({ReviewQuotaReservation.status: 'consumed'}, synchronize_session='fetch')
    if updated != 1:
        raise api_error(409, 'TASK_QUOTA_RESERVATION_LOST', 'Review quota reservation is no longer valid')
