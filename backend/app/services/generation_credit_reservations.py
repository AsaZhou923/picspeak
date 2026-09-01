from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import GenerationCreditReservation, ImageGenerationTask, UsageLedger, User, UserPlan


HELD = 'held'
CONSUMED = 'consumed'
RELEASED = 'released'


class GenerationCreditReservationError(RuntimeError):
    pass


def monthly_generation_credit_period(*, now: datetime | None = None) -> tuple[date, date]:
    current = now or datetime.now(timezone.utc)
    period_start = current.date().replace(day=1)
    if period_start.month == 12:
        next_period_start = period_start.replace(year=period_start.year + 1, month=1)
    else:
        next_period_start = period_start.replace(month=period_start.month + 1)
    return period_start, next_period_start


def monthly_generation_credit_limit_for_plan(plan: UserPlan) -> int:
    if plan == UserPlan.pro:
        return settings.image_generation_pro_monthly_credits
    if plan == UserPlan.free:
        return settings.image_generation_free_monthly_credits
    return 0


def count_monthly_generation_credit_consumed(db: Session, user: User, *, now: datetime | None = None) -> int:
    return _sum_monthly_generation_credit_ledger(db, user, positive=True, now=now)


def count_monthly_generation_credit_grants(db: Session, user: User, *, now: datetime | None = None) -> int:
    return abs(_sum_monthly_generation_credit_ledger(db, user, positive=False, now=now))


def count_monthly_generation_credit_holds(db: Session, user: User, *, now: datetime | None = None) -> int:
    period_start, next_period_start = monthly_generation_credit_period(now=now)
    held = (
        db.query(func.coalesce(func.sum(GenerationCreditReservation.credits), 0))
        .filter(
            GenerationCreditReservation.user_id == user.id,
            GenerationCreditReservation.status == HELD,
            GenerationCreditReservation.bill_period_start >= period_start,
            GenerationCreditReservation.bill_period_start < next_period_start,
        )
        .scalar()
    )
    return int(held or 0)


def count_monthly_generation_credits(db: Session, user: User, *, now: datetime | None = None) -> int:
    return count_monthly_generation_credit_consumed(db, user, now=now)


def available_generation_credits(db: Session, user: User, *, now: datetime | None = None) -> int:
    limit = monthly_generation_credit_limit_for_plan(user.plan)
    grants = count_monthly_generation_credit_grants(db, user, now=now)
    consumed = count_monthly_generation_credit_consumed(db, user, now=now)
    held = count_monthly_generation_credit_holds(db, user, now=now)
    return max(limit + grants - consumed - held, 0)


def ensure_generation_credits_available(db: Session, user: User, *, credits_needed: int) -> None:
    _lock_user_credit_boundary(db, user.id)
    if available_generation_credits(db, user) < credits_needed:
        raise ValueError('IMAGE_GENERATION_CREDITS_EXHAUSTED')


def reserve_generation_credits_for_task(
    db: Session,
    *,
    user: User,
    task: ImageGenerationTask,
    credits: int,
    now: datetime | None = None,
) -> GenerationCreditReservation:
    # Lock the user before inserting the task. Flushing a task first acquires an
    # FK KeyShare lock and lets two concurrent requests deadlock when both later
    # upgrade to FOR UPDATE on the same user row.
    with db.no_autoflush:
        _lock_user_credit_boundary(db, user.id)
    if task.id is None:
        db.flush()
    existing = _reservation_for_task(db, task.id, lock=True)
    if existing is not None:
        return existing
    if available_generation_credits(db, user, now=now) < credits:
        raise ValueError('IMAGE_GENERATION_CREDITS_EXHAUSTED')
    period_start, period_end = monthly_generation_credit_period(now=now)
    reservation = GenerationCreditReservation(
        generation_task_id=task.id,
        user_id=user.id,
        credits=credits,
        bill_period_start=period_start,
        bill_period_end=period_end,
        status=HELD,
        held_at=now or datetime.now(timezone.utc),
    )
    db.add(reservation)
    db.flush()
    return reservation


def consume_generation_credit_reservation(
    db: Session,
    *,
    task: ImageGenerationTask,
    usage_metadata: dict[str, Any],
) -> GenerationCreditReservation:
    reservation = _require_reservation_for_task(db, task.id)
    if reservation.status == CONSUMED:
        return reservation
    if reservation.status == RELEASED:
        raise GenerationCreditReservationError('Generation credit reservation was already released')
    ledger = UsageLedger(
        user_id=reservation.user_id,
        review_id=None,
        task_id=None,
        usage_type='image_generation_credit',
        amount=Decimal(reservation.credits),
        unit='credits',
        bill_date=reservation.bill_period_start,
        metadata_json={
            **usage_metadata,
            'generation_task_id': task.public_id,
            'reservation_id': reservation.id,
            'reservation_bill_period_start': reservation.bill_period_start.isoformat(),
        },
    )
    db.add(ledger)
    db.flush()
    reservation.status = CONSUMED
    reservation.consumed_at = datetime.now(timezone.utc)
    reservation.consumed_usage_ledger_id = ledger.id
    reservation.release_reason = None
    db.add(reservation)
    db.flush()
    return reservation


def require_held_generation_credit_reservation(
    db: Session,
    *,
    task: ImageGenerationTask,
    expected_credits: int | None = None,
) -> GenerationCreditReservation:
    reservation = _require_reservation_for_task(db, task.id)
    if reservation.status != HELD:
        raise GenerationCreditReservationError(f'Generation credit reservation is {reservation.status}')
    if expected_credits is not None and reservation.credits != expected_credits:
        raise GenerationCreditReservationError('Generation credit reservation credit amount does not match task cost')
    return reservation


def release_generation_credit_reservation(
    db: Session,
    *,
    task: ImageGenerationTask,
    reason: str,
) -> GenerationCreditReservation | None:
    reservation = _reservation_for_task(db, getattr(task, 'id', None), lock=True)
    if reservation is None:
        return None
    if reservation.status in {CONSUMED, RELEASED}:
        return reservation
    reservation.status = RELEASED
    reservation.released_at = datetime.now(timezone.utc)
    reservation.release_reason = reason[:200]
    db.add(reservation)
    db.flush()
    return reservation


def _lock_user_credit_boundary(db: Session, user_id: int) -> User:
    return db.query(User).filter(User.id == user_id).with_for_update().one()


def _sum_monthly_generation_credit_ledger(
    db: Session,
    user: User,
    *,
    positive: bool,
    now: datetime | None,
) -> int:
    period_start, next_period_start = monthly_generation_credit_period(now=now)
    amount_filter = UsageLedger.amount > 0 if positive else UsageLedger.amount < 0
    total = (
        db.query(func.coalesce(func.sum(UsageLedger.amount), 0))
        .filter(
            UsageLedger.user_id == user.id,
            UsageLedger.usage_type == 'image_generation_credit',
            UsageLedger.bill_date >= period_start,
            UsageLedger.bill_date < next_period_start,
            amount_filter,
        )
        .scalar()
    )
    return int(total or 0)


def _require_reservation_for_task(db: Session, generation_task_id: int | None) -> GenerationCreditReservation:
    if generation_task_id is None:
        raise GenerationCreditReservationError('Generation task has no persisted id')
    reservation = _reservation_for_task(db, generation_task_id, lock=True)
    if reservation is None:
        raise GenerationCreditReservationError('Generation task has no credit reservation')
    return reservation


def _reservation_for_task(
    db: Session,
    generation_task_id: int | None,
    *,
    lock: bool,
) -> GenerationCreditReservation | None:
    if generation_task_id is None:
        return None
    query = db.query(GenerationCreditReservation).filter(
        GenerationCreditReservation.generation_task_id == generation_task_id
    )
    if lock:
        query = query.with_for_update()
    return query.first()
