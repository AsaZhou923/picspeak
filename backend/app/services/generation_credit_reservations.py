from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import literal, select, union_all
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import GenerationCreditReservation, ImageGenerationTask, UsageLedger, User, UserPlan


HELD = 'held'
CONSUMED = 'consumed'
RELEASED = 'released'
PURCHASED_BALANCE_VERSION = 'persistent-v1'


class GenerationCreditReservationError(RuntimeError):
    pass


def monthly_generation_credit_period(*, now: datetime | None = None) -> tuple[date, date]:
    current = now.astimezone(timezone.utc) if now is not None else datetime.now(timezone.utc)
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
    return generation_credit_balance_snapshot(db, user, now=now)['monthly_used']


def count_monthly_generation_credit_grants(db: Session, user: User, *, now: datetime | None = None) -> int:
    snapshot = generation_credit_balance_snapshot(db, user, now=now)
    return snapshot['monthly_total'] - monthly_generation_credit_limit_for_plan(user.plan)


def count_monthly_generation_credit_holds(db: Session, user: User, *, now: datetime | None = None) -> int:
    return generation_credit_balance_snapshot(db, user, now=now)['monthly_held']


def count_monthly_generation_credits(db: Session, user: User, *, now: datetime | None = None) -> int:
    return count_monthly_generation_credit_consumed(db, user, now=now)


def available_generation_credits(db: Session, user: User, *, now: datetime | None = None) -> int:
    return generation_credit_balance_snapshot(db, user, now=now)['available_total']


def _credit_allocation(payload: dict[str, Any], credits: int) -> dict[str, int] | None:
    if 'credit_allocation' not in payload:
        return None  # Existing reservations and consumption belong to the legacy monthly pool.
    allocation = payload['credit_allocation']
    if (
        not isinstance(allocation, dict)
        or type(allocation.get('version')) is not int
        or allocation['version'] != 1
        or any(type(allocation.get(key)) is not int or allocation[key] < 0 for key in ('monthly', 'purchased'))
        or allocation['monthly'] + allocation['purchased'] != credits
    ):
        raise GenerationCreditReservationError('Invalid generation credit allocation')
    return allocation


def generation_credit_balance_snapshot(
    db: Session, user: User, *, now: datetime | None = None, plan: UserPlan | None = None,
) -> dict[str, int]:
    """Read grants, spending and holds in one statement snapshot.

    A worker can replace a hold with consumption concurrently. Separate queries
    could miss both under READ COMMITTED and make the same credits spendable twice.
    The reservation join also recovers source allocations written by old workers
    during a rolling deployment, before they copied allocations into the ledger.
    """
    ledger = select(
        literal('ledger'), UsageLedger.amount, UsageLedger.bill_date,
        UsageLedger.metadata_json, ImageGenerationTask.request_payload,
    ).select_from(UsageLedger).outerjoin(
        GenerationCreditReservation,
        (GenerationCreditReservation.consumed_usage_ledger_id == UsageLedger.id)
        & (GenerationCreditReservation.user_id == UsageLedger.user_id),
    ).outerjoin(
        ImageGenerationTask, ImageGenerationTask.id == GenerationCreditReservation.generation_task_id,
    ).where(UsageLedger.user_id == user.id, UsageLedger.usage_type == 'image_generation_credit')
    holds = select(
        literal('held'), GenerationCreditReservation.credits, GenerationCreditReservation.bill_period_start,
        literal(None), ImageGenerationTask.request_payload,
    ).select_from(GenerationCreditReservation).join(
        ImageGenerationTask, ImageGenerationTask.id == GenerationCreditReservation.generation_task_id,
    ).where(GenerationCreditReservation.user_id == user.id, GenerationCreditReservation.status == HELD)
    rows = db.execute(union_all(ledger, holds)).all()
    period_start, period_end = monthly_generation_credit_period(now=now)
    snapshot = {
        'monthly_total': monthly_generation_credit_limit_for_plan(plan if plan is not None else user.plan),
        'monthly_used': 0, 'monthly_held': 0,
        'purchased_total': 0, 'purchased_used': 0, 'purchased_held': 0,
    }
    for kind, raw_amount, bill_date, raw_metadata, raw_payload in rows:
        amount = int(raw_amount)
        if amount != raw_amount:
            raise GenerationCreditReservationError('Invalid generation credit amount')
        metadata = raw_metadata or {}
        in_month = period_start <= bill_date < period_end
        if kind == 'ledger' and amount < 0:
            if metadata.get('balance_version') == PURCHASED_BALANCE_VERSION:
                snapshot['purchased_total'] -= amount
            elif in_month:
                snapshot['monthly_total'] -= amount
            continue
        if amount < 0:
            raise GenerationCreditReservationError('Invalid generation credit hold')
        allocation = _credit_allocation(
            metadata if 'credit_allocation' in metadata else (raw_payload or {}), amount,
        )
        monthly = allocation['monthly'] if allocation else amount
        purchased = allocation['purchased'] if allocation else 0
        suffix = 'held' if kind == 'held' else 'used'
        if in_month:
            snapshot[f'monthly_{suffix}'] += monthly
        snapshot[f'purchased_{suffix}'] += purchased
    for pool in ('monthly', 'purchased'):
        snapshot[f'{pool}_remaining'] = max(
            snapshot[f'{pool}_total'] - snapshot[f'{pool}_used'] - snapshot[f'{pool}_held'], 0,
        )
    snapshot['available_total'] = snapshot['monthly_remaining'] + snapshot['purchased_remaining']
    return snapshot


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
    if type(credits) is not int or credits <= 0:
        raise GenerationCreditReservationError('Invalid generation credit reservation amount')
    snapshot = generation_credit_balance_snapshot(db, user, now=now)
    if snapshot['available_total'] < credits:
        raise ValueError('IMAGE_GENERATION_CREDITS_EXHAUSTED')
    monthly = min(snapshot['monthly_remaining'], credits)
    task.request_payload = {
        **(getattr(task, 'request_payload', None) or {}),
        'credit_allocation': {'version': 1, 'monthly': monthly, 'purchased': credits - monthly},
    }
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
    # Load from the persisted task, never from provider/caller usage metadata.
    payload = db.query(ImageGenerationTask.request_payload).filter(ImageGenerationTask.id == task.id).scalar()
    allocation = _credit_allocation(payload or {}, reservation.credits)
    metadata = {key: value for key, value in usage_metadata.items() if key != 'credit_allocation'}
    if allocation is not None:
        metadata['credit_allocation'] = allocation
    ledger = UsageLedger(
        user_id=reservation.user_id,
        review_id=None,
        task_id=None,
        usage_type='image_generation_credit',
        amount=Decimal(reservation.credits),
        unit='credits',
        bill_date=reservation.bill_period_start,
        metadata_json={
            **metadata,
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
