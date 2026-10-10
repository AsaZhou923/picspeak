from __future__ import annotations

from copy import deepcopy

from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
import logging
from uuid import uuid4

from sqlalchemy import case
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.api.deps import new_public_id
from app.core.config import settings
from app.core.errors import ApiHTTPException
from app.db.models import Photo, PhotoStatus, Review, ReviewMode, ReviewStatus, ReviewTask, TaskStatus, UsageLedger, User, UserPlan
from app.db.session import SessionLocal
from app.services.ai import (
    AIProviderCallUsage,
    AIReviewError,
    CanonicalScore,
    observe_ai_provider_calls,
    openai_review_profile_for_mode,
    run_ai_review,
)
from app.services.guard import guest_usage_snapshot, increment_quota, user_usage_snapshot
from app.services.notification_events import record_review_terminal
from app.services.practice import attach_practice_review, resolve_task_practice
from app.services.practice_events import record_practice_analysis_completed
from app.services.retake_comparison import run_retake_comparison
from app.services.review_call_costs import (
    persist_observed_provider_call_costs,
)
from app.services.review_pricing import ReviewModelUsage, estimate_review_usage_cost
from app.services.review_score_cache import (
    canonical_score_cache_lease,
    checkpoint_task_canonical_score,
    clear_task_canonical_score_checkpoint,
    load_task_canonical_score_checkpoint,
)
from app.services.task_events import record_task_event
from app.services.review_quota_reservations import (
    reserve_review_quota, consume_review_quota, release_task_review_quota,
)
from app.services.object_storage import get_object_read_url


logger = logging.getLogger(__name__)


class ReviewTaskLeaseLost(RuntimeError):
    pass


def _ensure_review_claim(db: Session, task: ReviewTask, claim_token: str | None) -> None:
    if claim_token is None:
        return
    with db.no_autoflush:
        claim = db.query(ReviewTask.id).filter(
            ReviewTask.id == task.id,
            ReviewTask.status == TaskStatus.RUNNING,
            ReviewTask.claimed_by == claim_token,
        ).with_for_update().first()
    if claim is None:
        raise ReviewTaskLeaseLost('Review task lease changed')


_PUBLIC_TASK_ERROR_MESSAGES: dict[str, tuple[str, str]] = {
    'AI_CALL_FAILED': (
        'AI review is temporarily unavailable; retry scheduled',
        'AI review could not be completed',
    ),
    'AI_SCORING_FAILED': (
        'AI scoring is temporarily unavailable; retry scheduled',
        'AI scoring could not be completed',
    ),
    'AI_WRITING_FAILED': (
        'AI review writing is temporarily unavailable; retry scheduled',
        'AI review writing could not be completed',
    ),
    'TASK_PROCESSING_FAILED': (
        'Review task failed unexpectedly; retry scheduled',
        'Review task could not be completed',
    ),
}


def review_task_failure_stage(error_code: str | None) -> str:
    if error_code == 'AI_SCORING_FAILED':
        return 'ai_scoring'
    if error_code == 'AI_WRITING_FAILED':
        return 'ai_writing'
    return 'pre_charge'


def _canonical_score_event_payload(score: CanonicalScore) -> dict:
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
    return {
        'scorer_model': score.model_name,
        'input_tokens': score.input_tokens,
        'output_tokens': score.output_tokens,
        'latency_ms': score.latency_ms,
        'estimated_cost_usd': float(estimate.cost_usd) if estimate.cost_usd is not None else None,
        'cost_rate_version': estimate.rate_version,
    }


def _default_visual_analysis_payload() -> dict:
    return {
        'composition_guides': {
            'subject_region': None,
            'horizon_line': None,
            'leading_lines': [],
            'suggested_crop': None,
        }
    }


def _default_tonal_analysis_payload() -> dict:
    return {
        'brightness': None,
        'contrast': None,
        'color_balance': None,
        'saturation': None,
    }


def public_task_error_message(
    error_code: str | None,
    *,
    retryable: bool,
    fallback: str | None = None,
) -> str | None:
    if not error_code:
        return fallback
    mapped = _PUBLIC_TASK_ERROR_MESSAGES.get(error_code)
    if not mapped:
        return fallback
    return mapped[0] if retryable else mapped[1]


def _review_task_stale_timeout_seconds() -> int:
    scorer_timeout = int(getattr(settings, 'openai_score_timeout_seconds', 180) or 180)
    writer_timeout = int(getattr(settings, 'openai_review_timeout_seconds', 180) or 180)
    # A high-scoring candidate gets one additional scoring pass before the writer.
    return max(int(settings.review_task_stale_timeout_seconds), 2 * scorer_timeout + writer_timeout + 60, 30)


def _normalize_review_result_payload(
    result_json: dict | None,
    *,
    final_score: float | None,
    prompt_version: str,
    model_name: str,
    model_version: str,
    exif_info: dict | None,
    scorer_model_name: str | None = None,
    scorer_model_version: str | None = None,
    scorer_reasoning_effort: str | None = None,
    writer_model_name: str | None = None,
    writer_model_version: str | None = None,
    writer_reasoning_effort: str | None = None,
    score_prompt_version: str | None = None,
    scorer_preprocess_version: str | None = None,
    score_cache_hit: bool = False,
) -> dict:
    raw_payload = dict(result_json or {})
    scores = {
        'composition': 0,
        'lighting': 0,
        'color': 0,
        'impact': 0,
        'technical': 0,
    }
    raw_scores = raw_payload.get('scores')
    if isinstance(raw_scores, dict):
        for key in scores:
            value = raw_scores.get(key)
            if value is None and key == 'impact':
                value = raw_scores.get('story')
            try:
                scores[key] = max(0, min(int(value), 10))
            except (TypeError, ValueError):
                continue

    resolved_final_score = final_score
    if resolved_final_score is None:
        try:
            resolved_final_score = float(raw_payload.get('final_score'))
        except (TypeError, ValueError):
            resolved_final_score = round(sum(scores.values()) / len(scores), 1)

    visual_analysis = raw_payload.get('visual_analysis')
    share_info = raw_payload.get('share_info')
    stored_exif_info = raw_payload.get('exif_info')
    tonal_analysis = raw_payload.get('tonal_analysis')
    issue_marks = raw_payload.get('issue_marks')
    billing_info = raw_payload.get('billing_info')
    resolved_visual_analysis = visual_analysis if isinstance(visual_analysis, dict) else {}
    resolved_visual_analysis.setdefault('composition_guides', _default_visual_analysis_payload()['composition_guides'])

    return {
        'schema_version': str(raw_payload.get('schema_version') or '1.0'),
        'prompt_version': str(raw_payload.get('prompt_version') or prompt_version),
        'score_version': str(raw_payload.get('score_version') or 'legacy'),
        'score_prompt_version': str(raw_payload.get('score_prompt_version') or score_prompt_version or ''),
        'model_name': str(raw_payload.get('model_name') or model_name),
        'model_version': str(raw_payload.get('model_version') or model_version),
        'scorer_model_name': str(raw_payload.get('scorer_model_name') or scorer_model_name or ''),
        'scorer_model_version': str(raw_payload.get('scorer_model_version') or scorer_model_version or ''),
        'scorer_reasoning_effort': str(
            raw_payload.get('scorer_reasoning_effort') or scorer_reasoning_effort or ''
        ),
        'writer_model_name': str(raw_payload.get('writer_model_name') or writer_model_name or model_name),
        'writer_model_version': str(raw_payload.get('writer_model_version') or writer_model_version or model_version),
        'writer_reasoning_effort': str(raw_payload.get('writer_reasoning_effort') or writer_reasoning_effort or ''),
        'scorer_preprocess_version': str(
            raw_payload.get('scorer_preprocess_version') or scorer_preprocess_version or ''
        ),
        'score_cache_hit': bool(raw_payload.get('score_cache_hit', score_cache_hit)),
        'scores': scores,
        'score_evidence': deepcopy(raw_payload.get('score_evidence')),
        'final_score': float(resolved_final_score),
        'advantage': str(raw_payload.get('advantage') or ''),
        'critique': str(raw_payload.get('critique') or ''),
        'suggestions': str(raw_payload.get('suggestions') or ''),
        'image_type': str(raw_payload.get('image_type') or 'default'),
        'visual_analysis': resolved_visual_analysis,
        'tonal_analysis': tonal_analysis if isinstance(tonal_analysis, dict) else _default_tonal_analysis_payload(),
        'issue_marks': issue_marks if isinstance(issue_marks, list) else [],
        'billing_info': billing_info if isinstance(billing_info, dict) else {},
        'exif_info': exif_info if isinstance(exif_info, dict) else (stored_exif_info if isinstance(stored_exif_info, dict) else {}),
        'share_info': share_info if isinstance(share_info, dict) else {},
        'comparison': raw_payload.get('comparison') if isinstance(raw_payload.get('comparison'), dict) else None,
        'goal_assessment': deepcopy(raw_payload.get('goal_assessment')) if isinstance(raw_payload.get('goal_assessment'), dict) else None,
    }


def expire_review_tasks(db: Session) -> None:
    _reconcile_completed_tasks(db)
    now = datetime.now(timezone.utc)
    expired_tasks = (
        db.query(ReviewTask)
        .filter(
            ReviewTask.status.in_([TaskStatus.PENDING, TaskStatus.RUNNING]),
            ReviewTask.expire_at.is_not(None),
            ReviewTask.expire_at < now,
        )
        .with_for_update(skip_locked=True)
        .all()
    )
    for task in expired_tasks:
        release_task_review_quota(db, task.id)
        task.status = TaskStatus.EXPIRED
        task.finished_at = now
        task.error_code = 'TASK_EXPIRED'
        task.error_message = 'Task expired before completion'
        db.add(task)
        record_task_event(db, task, event_type='TASK_EXPIRED', message=task.error_message)
        record_review_terminal(db, task)
    if expired_tasks:
        db.commit()

    stale_timeout = _review_task_stale_timeout_seconds()
    stale_cutoff = now - timedelta(seconds=stale_timeout)
    stalled_query = (
        db.query(ReviewTask)
        .filter(
            ReviewTask.status == TaskStatus.RUNNING,
            ReviewTask.finished_at.is_(None),
            ReviewTask.last_heartbeat_at.is_not(None),
            ReviewTask.last_heartbeat_at < stale_cutoff,
            (ReviewTask.expire_at.is_(None) | (ReviewTask.expire_at >= now)),
        )
    )
    stalled_ids = [task.id for task in stalled_query.all()]
    for task_id in stalled_ids:
        # Retry commits release locks; recheck each task under its own lock.
        task = stalled_query.filter(ReviewTask.id == task_id).with_for_update(
            skip_locked=True,
        ).populate_existing().first()
        if task is None:
            continue
        if task.attempt_count < task.max_attempts:
            _schedule_retry(
                db,
                task,
                error_code='TASK_STALLED',
                error_message='Task heartbeat stalled; retry scheduled',
            )
        else:
            _complete_task(
                db,
                task,
                status=TaskStatus.DEAD_LETTER,
                error_code='TASK_STALLED',
                error_message='Task heartbeat stalled and max retries were exhausted',
                dead_letter=True,
            )


def _reconcile_completed_tasks(db: Session) -> None:
    now = datetime.now(timezone.utc)
    completed_pairs = (
        db.query(ReviewTask, Review)
        .join(Review, Review.task_id == ReviewTask.id)
        .filter(ReviewTask.status.in_([TaskStatus.PENDING, TaskStatus.RUNNING]))
        .all()
    )
    if not completed_pairs:
        return

    for task, review in completed_pairs:
        task.status = TaskStatus.SUCCEEDED
        task.progress = 100
        task.finished_at = task.finished_at or now
        task.last_heartbeat_at = now
        task.error_code = None
        task.error_message = None
        db.add(task)
        record_task_event(
            db,
            task,
            event_type='TASK_RECONCILED',
            message='Task status reconciled from persisted review',
            payload={'review_id': review.public_id},
        )
        record_review_terminal(db, task, review)
    db.commit()


def process_review_task(task_public_id: str, *, worker_name: str, claim_token: str | None = None) -> dict[str, str]:
    db = SessionLocal()
    try:
        expire_review_tasks(db)
        task = db.query(ReviewTask).filter(ReviewTask.public_id == task_public_id).first()
        if task is None:
            return {'result': 'missing'}
        if task.status in {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.EXPIRED, TaskStatus.DEAD_LETTER}:
            return {'result': 'noop', 'status': task.status.value}
        if task.status == TaskStatus.PENDING and task.next_attempt_at and task.next_attempt_at > datetime.now(timezone.utc):
            return {'result': 'delayed', 'status': task.status.value}
        if task.status == TaskStatus.PENDING:
            # A delayed invocation must never reuse an earlier attempt's token.
            claim_token = f'{worker_name}:{uuid4().hex}'
            if not _claim_task(db, task.id, claim_token):
                fresh_task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first()
                if fresh_task is None:
                    return {'result': 'missing'}
                return {'result': 'noop', 'status': fresh_task.status.value}
            db.refresh(task)
        elif task.status == TaskStatus.RUNNING:
            if not claim_token or task.claimed_by != claim_token:
                return {'result': 'noop', 'status': task.status.value, 'reason': 'lease_mismatch'}
        else:
            return {'result': 'noop', 'status': task.status.value}
        try:
            _process_task(db, task, claim_token=claim_token)
        except ReviewTaskLeaseLost:
            db.rollback()
            return {'result': 'noop', 'reason': 'lease_mismatch'}
        except Exception as exc:
            logger.exception('Unhandled review task error for task %s', task_public_id)
            db.rollback()
            fresh_task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first()
            if fresh_task is None:
                return {'result': 'missing'}
            if fresh_task.status == TaskStatus.RUNNING and fresh_task.claimed_by == claim_token:
                try:
                    _ensure_review_claim(db, fresh_task, claim_token)
                except ReviewTaskLeaseLost:
                    db.rollback()
                    return {'result': 'noop', 'reason': 'lease_mismatch'}
                _handle_failure(
                    db,
                    fresh_task,
                    error_code='TASK_PROCESSING_FAILED',
                    error_message=f'Unexpected worker error: {exc}',
                    retryable=True,
                )
                return {'result': 'failed', 'status': fresh_task.status.value}
            return {'result': 'noop', 'status': fresh_task.status.value}
        return {'result': 'processed', 'status': task.status.value}
    finally:
        db.close()


def claim_next_pending_review_task(db: Session, *, worker_name: str) -> ReviewTask | None:
    expire_review_tasks(db)
    now = datetime.now(timezone.utc)
    candidate = (
        db.query(ReviewTask)
        .join(User, User.id == ReviewTask.owner_user_id)
        .filter(
            ReviewTask.status == TaskStatus.PENDING,
            (ReviewTask.next_attempt_at.is_(None) | (ReviewTask.next_attempt_at <= now)),
        )
        .order_by(
            case((User.plan == UserPlan.pro, 0), else_=1),
            ReviewTask.next_attempt_at.asc().nullsfirst(),
            ReviewTask.created_at.asc(),
        )
        .first()
    )
    if candidate is None:
        return None
    if not _claim_task(db, candidate.id, f'{worker_name}:{uuid4().hex}'):
        return None
    return db.query(ReviewTask).filter(ReviewTask.id == candidate.id).first()


def _claim_task(db: Session, task_id: int, worker_name: str) -> bool:
    now = datetime.now(timezone.utc)
    updated = (
        db.query(ReviewTask)
        .filter(ReviewTask.id == task_id, ReviewTask.status == TaskStatus.PENDING)
        .update(
            {
                ReviewTask.status: TaskStatus.RUNNING,
                # Keep claimed tasks in the queue stage until a concrete processing step starts.
                ReviewTask.progress: 10,
                ReviewTask.attempt_count: ReviewTask.attempt_count + 1,
                ReviewTask.started_at: now,
                ReviewTask.claimed_by: worker_name,
                ReviewTask.last_heartbeat_at: now,
                ReviewTask.error_code: None,
                ReviewTask.error_message: None,
            },
            synchronize_session=False,
        )
    )
    if updated != 1:
        db.rollback()
        return False
    db.commit()
    task = db.query(ReviewTask).filter(ReviewTask.id == task_id).populate_existing().first()
    if task is not None:
        record_task_event(db, task, event_type='TASK_CLAIMED', message=f'Claimed by {worker_name}')
        db.commit()
    return True


def _retry_delay_seconds(attempt_count: int) -> int:
    base = max(settings.review_retry_base_delay_seconds, 1)
    max_delay = max(settings.review_retry_max_delay_seconds, base)
    return min(base * (2 ** max(attempt_count - 1, 0)), max_delay)


def _transition_progress(db: Session, task: ReviewTask, progress: int, event_type: str, message: str) -> None:
    task.progress = progress
    task.last_heartbeat_at = datetime.now(timezone.utc)
    db.add(task)
    record_task_event(db, task, event_type=event_type, message=message)
    db.commit()


def _complete_task(
    db: Session,
    task: ReviewTask,
    *,
    status: TaskStatus,
    error_code: str | None = None,
    error_message: str | None = None,
    dead_letter: bool = False,
) -> None:
    now = datetime.now(timezone.utc)
    task.status = status
    task.progress = 100
    task.finished_at = now
    task.last_heartbeat_at = now
    task.error_code = error_code
    task.error_message = error_message
    if status != TaskStatus.SUCCEEDED:
        release_task_review_quota(db, task.id)
    if dead_letter:
        task.dead_lettered_at = now
    db.add(task)
    record_task_event(
        db,
        task,
        event_type='TASK_DEAD_LETTERED' if dead_letter else 'TASK_COMPLETED',
        message=error_message,
        payload={'error_code': error_code} if error_code else None,
    )
    record_review_terminal(db, task)
    db.commit()


def _schedule_retry(db: Session, task: ReviewTask, *, error_code: str, error_message: str) -> None:
    from app.services.task_dispatcher import enqueue_review_task

    delay = _retry_delay_seconds(task.attempt_count)
    retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
    task.status = TaskStatus.PENDING
    task.claimed_by = None
    release_task_review_quota(db, task.id)
    task.progress = 0
    task.error_code = error_code
    task.error_message = error_message
    task.next_attempt_at = retry_at
    task.last_heartbeat_at = datetime.now(timezone.utc)
    db.add(task)
    record_task_event(
        db,
        task,
        event_type='TASK_RETRY_SCHEDULED',
        message=error_message,
        payload={'retry_at': retry_at.isoformat(), 'delay_seconds': delay, 'error_code': error_code},
    )
    db.commit()
    if settings.cloud_tasks_enabled:
        enqueue_review_task(task.public_id, delay_seconds=delay)


def _handle_failure(db: Session, task: ReviewTask, *, error_code: str, error_message: str, retryable: bool) -> None:
    retry_scheduled = retryable and task.attempt_count < task.max_attempts
    public_error = public_task_error_message(
        error_code,
        retryable=retry_scheduled,
        fallback=error_message[:500],
    )
    if public_error != error_message[:500]:
        logger.warning(
            'Review task %s failed with internal detail hidden from clients: %s',
            task.public_id,
            error_message,
        )
    if retry_scheduled:
        _schedule_retry(db, task, error_code=error_code, error_message=public_error or 'Task retry scheduled')
        return
    if retryable:
        _complete_task(
            db,
            task,
            status=TaskStatus.DEAD_LETTER,
            error_code=error_code,
            error_message=public_task_error_message(error_code, retryable=False, fallback=public_error or error_message[:500]),
            dead_letter=True,
        )
        return
    _complete_task(
        db,
        task,
        status=TaskStatus.FAILED,
        error_code=error_code,
        error_message=public_task_error_message(error_code, retryable=False, fallback=public_error or error_message[:500]),
    )


def _process_task(db: Session, task: ReviewTask, *, claim_token: str | None = None) -> None:
    _ensure_review_claim(db, task, claim_token)
    task.next_attempt_at = None
    task.last_heartbeat_at = datetime.now(timezone.utc)
    task.progress = 10
    task.error_code = None
    task.error_message = None
    db.add(task)
    record_task_event(db, task, event_type='TASK_STARTED', message=f'Attempt {task.attempt_count} started')
    db.commit()

    photo = db.query(Photo).filter(Photo.id == task.photo_id).first()
    if photo is None:
        _handle_failure(db, task, error_code='PHOTO_NOT_FOUND', error_message='Photo record not found for task', retryable=False)
        return

    # Fetch owner and enforce quota BEFORE calling the AI, so we don't burn tokens
    # on a request that would be rejected anyway.
    owner = db.query(User).filter(User.id == task.owner_user_id).first()
    if owner is None:
        _handle_failure(db, task, error_code='USER_NOT_FOUND', error_message='Task owner not found', retryable=False)
        return

    # Resolve the accepted goal through the persisted attempt and session. Request
    # metadata (including a copied goal or URL parameters) is never an authority.
    try:
        practice_context = resolve_task_practice(db, task)
        goal_context = practice_context.goal_context if practice_context is not None else None
    except (ApiHTTPException, ValidationError) as exc:
        detail = exc.detail if isinstance(exc, ApiHTTPException) and isinstance(exc.detail, dict) else {}
        _handle_failure(
            db, task,
            error_code=str(detail.get('code') or 'PRACTICE_GOAL_INVALID'),
            error_message=str(detail.get('message') or 'The saved practice goal is invalid'),
            retryable=False,
        )
        return

    quota_reservation = None
    _ensure_review_claim(db, task, claim_token)
    if owner.plan != UserPlan.guest:
        try:
            quota_reservation = reserve_review_quota(
                db, owner, task=task,
                mode=task.mode if isinstance(task.mode, ReviewMode) else ReviewMode(task.mode),
            )
        except ApiHTTPException as exc:
            db.rollback()
            task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first() or task
            _ensure_review_claim(db, task, claim_token)
            detail = exc.detail if isinstance(exc.detail, dict) else {'message': str(exc.detail)}
            _handle_failure(
                db,
                task,
                error_code=str(detail.get('code') or 'QUOTA_EXCEEDED'),
                error_message=str(detail.get('message') or 'Plan quota exceeded'),
                retryable=False,
            )
            return

    image_url = get_object_read_url(photo.object_key, bucket=photo.bucket)
    payload_locale = (task.request_payload or {}).get('locale', 'en')
    if practice_context is not None:
        payload_locale = practice_context.session.locale
    payload_image_type = (task.request_payload or {}).get('image_type', 'default')
    analysis_type = (task.request_payload or {}).get('analysis_type', 'single')
    review_model = (task.request_payload or {}).get('review_model', 'qwen')
    task_mode = task.mode.value if isinstance(task.mode, ReviewMode) else str(task.mode)
    if payload_locale not in {'zh', 'en', 'ja'}:
        payload_locale = 'en'
    _transition_progress(db, task, 70, 'AI_REVIEW_STARTED', 'Running AI review')

    cost_task_id = int(task.id)
    cost_owner_user_id = int(task.owner_user_id)
    cost_attempt_count = int(task.attempt_count or 0)
    provider_calls: list[AIProviderCallUsage] = []
    try:
        with observe_ai_provider_calls(provider_calls.append):
            if analysis_type == 'retake_compare':
                if practice_context is not None:
                    source_row = (practice_context.source_review, practice_context.source_photo)
                else:
                    source_review_id = (task.request_payload or {}).get('source_review_internal_id')
                    source_row = (
                        db.query(Review, Photo)
                        .join(Photo, Photo.id == Review.photo_id)
                        .filter(
                            Review.id == source_review_id,
                            Review.owner_user_id == task.owner_user_id,
                            Photo.owner_user_id == task.owner_user_id,
                            Review.deleted_at.is_(None),
                        )
                        .first()
                    )
                if source_row is None:
                    _handle_failure(
                        db,
                        task,
                        error_code='RETAKE_SOURCE_NOT_FOUND',
                        error_message='Source review or original photo not found for retake comparison',
                        retryable=False,
                    )
                    return
                source_review, source_photo = source_row
                if source_review.status != ReviewStatus.SUCCEEDED or source_photo.status != PhotoStatus.READY:
                    _handle_failure(
                        db,
                        task,
                        error_code='RETAKE_SOURCE_NOT_READY',
                        error_message='Source review or original photo is not ready for retake comparison',
                        retryable=False,
                    )
                    return
                original_image_url = get_object_read_url(source_photo.object_key, bucket=source_photo.bucket)
                ai_response = run_retake_comparison(
                    original_image_url=original_image_url,
                    retake_image_url=image_url,
                    original_review_id=source_review.public_id,
                    original_photo_id=source_photo.public_id,
                    retake_photo_id=photo.public_id,
                    locale=payload_locale,
                    image_type=payload_image_type,
                    mode=task_mode,
                    **({'goal_context': goal_context} if goal_context is not None else {}),
                )
            else:
                profile = openai_review_profile_for_mode(task_mode)
                checkpointed_score = load_task_canonical_score_checkpoint(
                    task,
                    scorer_model_name=profile.scorer_model_name,
                    scorer_reasoning_effort=profile.scorer_reasoning_effort,
                )
                score_context = (
                    nullcontext(checkpointed_score)
                    if checkpointed_score is not None
                    else canonical_score_cache_lease(
                        db,
                        photo=photo,
                        image_type=payload_image_type,
                        scorer_model_name=profile.scorer_model_name,
                        scorer_reasoning_effort=profile.scorer_reasoning_effort,
                    )
                )
                with score_context as canonical_score:
                    if checkpointed_score is not None:
                        record_task_event(
                            db,
                            task,
                            event_type='AI_SCORING_REUSED',
                            message='Reusing completed canonical score from an earlier attempt',
                            payload={'scorer_model': checkpointed_score.model_name},
                        )

                    def save_score_checkpoint(score: CanonicalScore) -> None:
                        checkpoint_task_canonical_score(task, score)
                        db.add(task)
                        record_task_event(
                            db,
                            task,
                            event_type='AI_SCORING_COMPLETED',
                            message='Canonical score completed and checkpointed',
                            payload=_canonical_score_event_payload(score),
                        )

                    ai_response = run_ai_review(
                        task_mode,
                        image_url=image_url,
                        locale=payload_locale,
                        exif_data=photo.exif_data or None,
                        image_type=payload_image_type,
                        enforce_suggestion_structure=task.attempt_count < task.max_attempts,
                        review_model=review_model,
                        canonical_score=canonical_score,
                        on_canonical_score=save_score_checkpoint,
                    )
        persist_observed_provider_call_costs(
            task_id=cost_task_id,
            owner_user_id=cost_owner_user_id,
            attempt_count=cost_attempt_count,
            calls=provider_calls,
            failed=False,
        )
        _ensure_review_claim(db, task, claim_token)
    except AIReviewError as exc:
        error_code = {
            'scoring': 'AI_SCORING_FAILED',
            'writing': 'AI_WRITING_FAILED',
        }.get(exc.stage, 'AI_CALL_FAILED')
        persist_observed_provider_call_costs(
            task_id=cost_task_id,
            owner_user_id=cost_owner_user_id,
            attempt_count=cost_attempt_count,
            calls=provider_calls,
            failed=True,
        )
        _ensure_review_claim(db, task, claim_token)
        logger.warning('AI review failed for task %s at %s stage: %s', task.public_id, exc.stage or 'unknown', exc)
        _handle_failure(db, task, error_code=error_code, error_message=str(exc), retryable=True)
        return
    except Exception:
        persist_observed_provider_call_costs(
            task_id=cost_task_id,
            owner_user_id=cost_owner_user_id,
            attempt_count=cost_attempt_count,
            calls=provider_calls,
            failed=None,
        )
        raise

    clear_task_canonical_score_checkpoint(task)

    result_payload = _normalize_review_result_payload(
        ai_response.result.model_dump(),
        final_score=ai_response.result.final_score,
        prompt_version=ai_response.prompt_version,
        model_name=ai_response.model_name,
        model_version=ai_response.model_version,
        exif_info=photo.exif_data or None,
        scorer_model_name=ai_response.scorer_model_name,
        scorer_model_version=ai_response.scorer_model_version,
        scorer_reasoning_effort=getattr(ai_response.result, 'scorer_reasoning_effort', ''),
        writer_model_name=ai_response.writer_model_name,
        writer_model_version=ai_response.writer_model_version,
        writer_reasoning_effort=getattr(ai_response.result, 'writer_reasoning_effort', ''),
        score_prompt_version=ai_response.score_prompt_version,
        scorer_preprocess_version=ai_response.scorer_preprocess_version,
        score_cache_hit=ai_response.score_cache_hit,
    )
    if ai_response.cost_rate_version:
        result_payload.setdefault('billing_info', {})['cost_rate_version'] = ai_response.cost_rate_version
    if goal_context is None:
        # Same-image rechecks and legacy reviews cannot claim goal completion.
        result_payload['goal_assessment'] = None

    review = Review(
        public_id=new_public_id('rev'),
        task_id=task.id,
        photo_id=task.photo_id,
        owner_user_id=task.owner_user_id,
        source_review_id=(
            practice_context.source_review.id if practice_context is not None
            else (task.request_payload or {}).get('source_review_internal_id')
        ),
        mode=task.mode,
        status=ReviewStatus.SUCCEEDED,
        image_type=payload_image_type,
        schema_version=result_payload['schema_version'],
        result_json=result_payload,
        final_score=result_payload['final_score'],
        input_tokens=ai_response.input_tokens,
        output_tokens=ai_response.output_tokens,
        cost_usd=ai_response.cost_usd,
        cost_rate_version=ai_response.cost_rate_version,
        latency_ms=ai_response.latency_ms,
        model_name=ai_response.model_name,
        scorer_model_name=ai_response.scorer_model_name,
        writer_model_name=ai_response.writer_model_name,
    )
    db.add(review)
    db.flush()

    ledger = UsageLedger(
        user_id=task.owner_user_id,
        review_id=review.id,
        task_id=task.id,
        usage_type='review_request',
        amount=1,
        unit='count',
        bill_date=quota_reservation.bill_date if quota_reservation is not None else datetime.now(timezone.utc).date(),
        metadata_json={
            'mode': task.mode.value if isinstance(task.mode, ReviewMode) else str(task.mode),
            'analysis_type': analysis_type,
            'review_model': review_model,
            'scorer_model': ai_response.scorer_model_name,
            'writer_model': ai_response.writer_model_name,
        },
    )
    db.add(ledger)
    consume_review_quota(db, quota_reservation)
    increment_quota(db, owner, **({'bill_date': quota_reservation.bill_date} if quota_reservation is not None else {}))
    db.flush()
    guest_scope_key = (task.request_payload or {}).get('_guest_scope_key') if owner.plan == UserPlan.guest else None
    usage = guest_usage_snapshot(db, guest_scope_key) if guest_scope_key else user_usage_snapshot(db, owner)
    # Keep the persisted JSON value intact so SQLAlchemy detects this update.
    result_payload = deepcopy(result_payload)
    result_payload['billing_info'] = {
        'quota_charged': True,
        'cost_rate_version': ai_response.cost_rate_version,
        'remaining_quota': {
            'daily_remaining': usage.get('daily_remaining'),
            'monthly_remaining': usage.get('monthly_remaining'),
            'pro_monthly_remaining': usage.get('pro_monthly_remaining'),
        },
    }
    review.result_json = result_payload
    db.add(review)
    if practice_context is not None:
        attach_practice_review(db, task, review)
        record_practice_analysis_completed(db, task, review)

    task.status = TaskStatus.SUCCEEDED
    task.progress = 100
    task.finished_at = datetime.now(timezone.utc)
    task.last_heartbeat_at = datetime.now(timezone.utc)
    task.error_code = None
    task.error_message = None
    db.add(task)
    record_task_event(db, task, event_type='REVIEW_CREATED', message='Review succeeded', payload={'review_id': review.public_id})
    record_review_terminal(db, task, review)
    db.commit()
