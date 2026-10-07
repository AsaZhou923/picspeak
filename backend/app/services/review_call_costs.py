from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ReviewCallCost, ReviewTask
from app.db.session import SessionLocal
from app.services.ai import AIProviderCallUsage, AIReviewResponse, CanonicalScore
from app.services.review_pricing import ReviewModelUsage, estimate_review_usage_cost


ReviewCallStage = Literal['scorer', 'writer', 'pair']
ReviewCallOutcome = Literal['succeeded', 'failed', 'unknown']
_REVIEW_CALL_COST_UNIQUE_CONSTRAINT = 'uq_review_call_costs_task_call_key'


@dataclass(frozen=True)
class _TaskCostIdentity:
    id: int
    owner_user_id: int
    attempt_count: int


def review_call_key(
    *,
    task: ReviewTask | _TaskCostIdentity,
    stage: ReviewCallStage,
    sequence: str | int | None = None,
) -> str:
    base = f'attempt:{int(task.attempt_count or 0)}:{stage}'
    if sequence is None:
        return base
    return f'{base}:{sequence}'


def _cost_decimal(value: float | Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal('0.000001'))


def _is_review_call_cost_duplicate_error(exc: IntegrityError) -> bool:
    orig = getattr(exc, 'orig', None)
    pgcode = getattr(orig, 'pgcode', None)
    constraint_name = getattr(getattr(orig, 'diag', None), 'constraint_name', None)
    return pgcode == '23505' and constraint_name == _REVIEW_CALL_COST_UNIQUE_CONSTRAINT


def record_review_call_cost(
    db: Session,
    *,
    task: ReviewTask,
    stage: ReviewCallStage,
    outcome: ReviewCallOutcome,
    model_name: str | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    cost_usd: float | Decimal | None = None,
    cost_rate_version: str | None = None,
    sequence: str | int | None = None,
) -> ReviewCallCost:
    call_key = review_call_key(task=task, stage=stage, sequence=sequence)
    existing = (
        db.query(ReviewCallCost)
        .filter(ReviewCallCost.task_id == task.id, ReviewCallCost.call_key == call_key)
        .first()
    )
    if existing is not None:
        return existing

    record = ReviewCallCost(
        task_id=task.id,
        owner_user_id=task.owner_user_id,
        call_key=call_key,
        stage=stage,
        outcome=outcome,
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=_cost_decimal(cost_usd),
        cost_rate_version=cost_rate_version,
    )
    db.add(record)
    return record


def record_scorer_call_cost(db: Session, *, task: ReviewTask, score: CanonicalScore) -> ReviewCallCost:
    estimate = estimate_review_usage_cost(
        [
            ReviewModelUsage(
                model_name=score.model_name,
                input_tokens=score.input_tokens,
                output_tokens=score.output_tokens,
            )
        ],
        overrides=settings.review_pricing_overrides,
    )
    return record_review_call_cost(
        db,
        task=task,
        stage='scorer',
        outcome='succeeded',
        model_name=score.model_name,
        input_tokens=score.input_tokens,
        output_tokens=score.output_tokens,
        cost_usd=estimate.cost_usd,
        cost_rate_version=estimate.rate_version,
    )


def record_response_call_cost(
    db: Session,
    *,
    task: ReviewTask,
    response: AIReviewResponse,
    stage: ReviewCallStage,
) -> ReviewCallCost:
    if stage == 'writer':
        model_name = response.writer_model_name
        input_tokens = response.writer_input_tokens
        output_tokens = response.writer_output_tokens
        cost_usd = response.writer_cost_usd
        cost_rate_version = response.writer_cost_rate_version
    elif stage == 'pair':
        model_name = response.writer_model_name or response.model_name
        input_tokens = response.input_tokens
        output_tokens = response.output_tokens
        cost_usd = response.cost_usd
        cost_rate_version = response.cost_rate_version
    else:
        raise ValueError('record_response_call_cost only supports writer or pair stages')

    return record_review_call_cost(
        db,
        task=task,
        stage=stage,
        outcome='succeeded',
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost_usd,
        cost_rate_version=cost_rate_version,
    )


def _resolved_observed_outcomes(
    calls: list[AIProviderCallUsage],
    *,
    failed: bool | None,
) -> list[tuple[AIProviderCallUsage, ReviewCallOutcome]]:
    if failed is None:
        return [(call, call.outcome) for call in calls]
    if not failed:
        return [(call, 'succeeded' if call.outcome == 'unknown' else call.outcome) for call in calls]

    last_unknown_index = None
    has_explicit_failure = False
    for index, call in enumerate(calls):
        if call.outcome == 'failed':
            has_explicit_failure = True
        elif call.outcome == 'unknown':
            last_unknown_index = index

    resolved: list[tuple[AIProviderCallUsage, ReviewCallOutcome]] = []
    for index, call in enumerate(calls):
        if call.outcome == 'failed':
            outcome: ReviewCallOutcome = 'failed'
        elif call.outcome == 'unknown' and not has_explicit_failure and index == last_unknown_index:
            outcome = 'failed'
        elif call.outcome == 'unknown':
            outcome = 'succeeded'
        else:
            outcome = call.outcome
        resolved.append((call, outcome))
    return resolved


def record_observed_provider_call_costs(
    db: Session,
    *,
    task: ReviewTask,
    calls: list[AIProviderCallUsage],
    failed: bool | None,
) -> list[ReviewCallCost]:
    records: list[ReviewCallCost] = []
    for call, outcome in _resolved_observed_outcomes(calls, failed=failed):
        records.append(
            record_review_call_cost(
                db,
                task=task,
                stage=call.stage,
                outcome=outcome,
                model_name=call.model_name,
                input_tokens=call.input_tokens,
                output_tokens=call.output_tokens,
                cost_usd=call.cost_usd,
                cost_rate_version=call.cost_rate_version,
                sequence=call.sequence,
            )
        )
    return records


def persist_observed_provider_call_costs(
    *,
    task_id: int,
    owner_user_id: int,
    attempt_count: int,
    calls: list[AIProviderCallUsage],
    failed: bool | None,
) -> None:
    task_identity = _TaskCostIdentity(
        id=task_id,
        owner_user_id=owner_user_id,
        attempt_count=attempt_count,
    )
    for call, outcome in _resolved_observed_outcomes(calls, failed=failed):
        call_key = review_call_key(task=task_identity, stage=call.stage, sequence=call.sequence)
        db = SessionLocal()
        try:
            record_review_call_cost(
                db,
                task=task_identity,
                stage=call.stage,
                outcome=outcome,
                model_name=call.model_name,
                input_tokens=call.input_tokens,
                output_tokens=call.output_tokens,
                cost_usd=call.cost_usd,
                cost_rate_version=call.cost_rate_version,
                sequence=call.sequence,
            )
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            if not _is_review_call_cost_duplicate_error(exc):
                raise
            existing = (
                db.query(ReviewCallCost.id)
                .filter(ReviewCallCost.task_id == task_id, ReviewCallCost.call_key == call_key)
                .first()
            )
            if existing is None:
                raise
        finally:
            db.close()
