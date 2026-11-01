from __future__ import annotations

from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
import logging
import hashlib

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiHTTPException, api_error
from app.db.models import ReviewMode, ReviewQuotaReservation, ReviewTask, User, UserPlan
from app.services.guard import enforce_pro_review_soft_rate_limit, enforce_user_quota

logger = logging.getLogger(__name__)


@contextmanager
def synchronous_review_idempotency_lease(db: Session, *, user_id: int, key: str):
    """Keep one keyed synchronous request in flight across its main commits.

    A separate transaction owns this lock so admission/result commits cannot
    release it early. Transaction exit releases it before connection pool reuse.
    """
    bind = db.get_bind()
    if bind.dialect.name != 'postgresql':
        # The production concurrency contract is PostgreSQL; local SQLite
        # fixtures retain the pre-existing best-effort settlement protection.
        yield
        return
    basis = f'picspeak:sync-review-idempotency-v1:{user_id}:{key}'.encode()
    lock_key = int.from_bytes(hashlib.sha256(basis).digest()[:8], 'big', signed=True)
    with bind.engine.connect() as connection, connection.begin():
        acquired = connection.execute(text('SELECT pg_try_advisory_xact_lock(:key)'), {'key': lock_key}).scalar_one()
        if not acquired:
            raise ApiHTTPException(
                status_code=409, code='IDEMPOTENCY_IN_PROGRESS',
                message='This critique request is already in progress. Retry with the same key shortly.',
                headers={'Retry-After': '1'}, extra={'retry_after_seconds': 1},
            )
        yield


@contextmanager
def synchronous_review_quota(db: Session, user: User, *, mode: ReviewMode):
    reservation = reserve_review_quota(db, user, mode=mode)
    try:
        enforce_pro_review_soft_rate_limit(db, user)
        db.commit()
    except BaseException:
        db.rollback()
        raise
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
