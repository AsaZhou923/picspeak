from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from urllib.parse import quote

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.api.deps import new_public_id
from app.core.config import settings
from app.core.errors import ApiHTTPException
from app.db.models import Photo, PhotoStatus, Review, ReviewMode, ReviewStatus, ReviewTask, TaskStatus, UsageLedger, User, UserPlan
from app.db.session import SessionLocal
from app.services.ai import AIReviewError, run_ai_review
from app.services.content_audit import ContentAuditError, run_content_audit
from app.services.guard import enforce_user_quota, guest_usage_snapshot, increment_quota, user_usage_snapshot
from app.services.task_events import record_task_event


logger = logging.getLogger(__name__)


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


def _normalize_review_result_payload(
    result_json: dict | None,
    *,
    final_score: float | None,
    prompt_version: str,
    model_name: str,
    model_version: str,
    exif_info: dict | None,
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
        'model_name': str(raw_payload.get('model_name') or model_name),
        'model_version': str(raw_payload.get('model_version') or model_version),
        'scores': scores,
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
        .all()
    )
    for task in expired_tasks:
        task.status = TaskStatus.EXPIRED
        task.finished_at = now
        task.error_code = 'TASK_EXPIRED'
        task.error_message = 'Task expired before completion'
        db.add(task)
        record_task_event(db, task, event_type='TASK_EXPIRED', message=task.error_message)
    if expired_tasks:
        db.commit()

    stale_timeout = max(int(settings.review_task_stale_timeout_seconds), 30)
    stale_cutoff = now - timedelta(seconds=stale_timeout)
    stalled_tasks = (
        db.query(ReviewTask)
        .filter(
            ReviewTask.status == TaskStatus.RUNNING,
            ReviewTask.finished_at.is_(None),
            ReviewTask.last_heartbeat_at.is_not(None),
            ReviewTask.last_heartbeat_at < stale_cutoff,
            (ReviewTask.expire_at.is_(None) | (ReviewTask.expire_at >= now)),
        )
        .all()
    )
    for task in stalled_tasks:
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
    db.commit()


def process_review_task(task_public_id: str, *, worker_name: str) -> dict[str, str]:
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
            if not _claim_task(db, task.id, worker_name):
                fresh_task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first()
                if fresh_task is None:
                    return {'result': 'missing'}
                return {'result': 'noop', 'status': fresh_task.status.value}
        elif task.status != TaskStatus.RUNNING:
            return {'result': 'noop', 'status': task.status.value}
        task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first()
        if task is None:
            return {'result': 'missing'}
        try:
            _process_task(db, task)
        except Exception as exc:
            logger.exception('Unhandled review task error for task %s', task_public_id)
            db.rollback()
            fresh_task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first()
            if fresh_task is None:
                return {'result': 'missing'}
            if fresh_task.status == TaskStatus.RUNNING:
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
    if not _claim_task(db, candidate.id, worker_name):
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
                ReviewTask.started_at: now,
                ReviewTask.claimed_by: worker_name,
                ReviewTask.last_heartbeat_at: now,
            },
            synchronize_session=False,
        )
    )
    if updated != 1:
        db.rollback()
        return False
    db.commit()
    task = db.query(ReviewTask).filter(ReviewTask.id == task_id).first()
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
    db.commit()


def _schedule_retry(db: Session, task: ReviewTask, *, error_code: str, error_message: str) -> None:
    from app.services.task_dispatcher import enqueue_review_task

    delay = _retry_delay_seconds(task.attempt_count)
    retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
    task.status = TaskStatus.PENDING
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
    if retryable and task.attempt_count < task.max_attempts:
        _schedule_retry(db, task, error_code=error_code, error_message=error_message[:500])
        return
    if retryable:
        _complete_task(
            db,
            task,
            status=TaskStatus.DEAD_LETTER,
            error_code=error_code,
            error_message=error_message[:500],
            dead_letter=True,
        )
        return
    _complete_task(db, task, status=TaskStatus.FAILED, error_code=error_code, error_message=error_message[:500])


def _process_task(db: Session, task: ReviewTask) -> None:
    task.attempt_count += 1
    task.next_attempt_at = None
    task.last_heartbeat_at = datetime.now(timezone.utc)
    task.progress = 10
    db.add(task)
    record_task_event(db, task, event_type='TASK_STARTED', message=f'Attempt {task.attempt_count} started')
    db.commit()

    photo = db.query(Photo).filter(Photo.id == task.photo_id).first()
    if photo is None:
        _handle_failure(db, task, error_code='PHOTO_NOT_FOUND', error_message='Photo record not found for task', retryable=False)
        return

    image_url = f'{settings.object_base_url.rstrip("/")}/{quote(photo.object_key)}'
    payload_locale = (task.request_payload or {}).get('locale', 'zh')
    payload_image_type = (task.request_payload or {}).get('image_type', 'default')
    if payload_locale not in {'zh', 'en', 'ja'}:
        payload_locale = 'zh'
    if settings.image_audit_enabled and photo.nsfw_label is None:
        _transition_progress(db, task, 40, 'CONTENT_AUDIT_STARTED', 'Running content audit')
        try:
            audit_result = run_content_audit(image_url=image_url)
        except ContentAuditError as exc:
            _handle_failure(db, task, error_code='IMAGE_AUDIT_FAILED', error_message=str(exc), retryable=True)
            return
        photo.nsfw_label = audit_result.label
        photo.nsfw_score = audit_result.nsfw_score
        photo.rejected_reason = None if audit_result.safe else (audit_result.reason or 'Image content is not allowed')
        photo.status = PhotoStatus.READY if audit_result.safe else PhotoStatus.REJECTED
        if not audit_result.safe:
            db.add(photo)
            db.commit()
            _handle_failure(db, task, error_code='IMAGE_NOT_ALLOWED', error_message=photo.rejected_reason or 'Image content is not allowed', retryable=False)
            return
        db.add(photo)
        record_task_event(db, task, event_type='CONTENT_AUDIT_PASSED', message='Content audit passed')
        db.commit()

    _transition_progress(db, task, 70, 'AI_REVIEW_STARTED', 'Running AI review')

    try:
        ai_response = run_ai_review(
            task.mode.value if isinstance(task.mode, ReviewMode) else str(task.mode),
            image_url=image_url,
            locale=payload_locale,
            exif_data=photo.exif_data or None,
            image_type=payload_image_type,
        )
    except AIReviewError as exc:
        _handle_failure(db, task, error_code='AI_CALL_FAILED', error_message=str(exc), retryable=True)
        return

    result_payload = _normalize_review_result_payload(
        ai_response.result.model_dump(),
        final_score=ai_response.result.final_score,
        prompt_version=ai_response.prompt_version,
        model_name=ai_response.model_name,
        model_version=ai_response.model_version,
        exif_info=photo.exif_data or None,
    )
    owner = db.query(User).filter(User.id == task.owner_user_id).first()
    if owner is None:
        _handle_failure(db, task, error_code='USER_NOT_FOUND', error_message='Task owner not found', retryable=False)
        return

    if owner.plan != UserPlan.guest:
        try:
            enforce_user_quota(db, owner)
        except ApiHTTPException as exc:
            db.rollback()
            task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first() or task
            detail = exc.detail if isinstance(exc.detail, dict) else {'message': str(exc.detail)}
            _handle_failure(
                db,
                task,
                    error_code=str(detail.get('code') or 'QUOTA_EXCEEDED'),
                    error_message=str(detail.get('message') or 'Plan quota exceeded'),
                    retryable=False,
                )
            return

    review = Review(
        public_id=new_public_id('rev'),
        task_id=task.id,
        photo_id=task.photo_id,
        owner_user_id=task.owner_user_id,
        mode=task.mode,
        status=ReviewStatus.SUCCEEDED,
        schema_version=result_payload['schema_version'],
        result_json=result_payload,
        final_score=result_payload['final_score'],
        input_tokens=ai_response.input_tokens,
        output_tokens=ai_response.output_tokens,
        cost_usd=ai_response.cost_usd,
        latency_ms=ai_response.latency_ms,
        model_name=ai_response.model_name,
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
        bill_date=datetime.now(timezone.utc).date(),
        metadata_json={'mode': task.mode.value if isinstance(task.mode, ReviewMode) else str(task.mode)},
    )
    db.add(ledger)
    increment_quota(db, owner)
    guest_scope_key = (task.request_payload or {}).get('_guest_scope_key') if owner.plan == UserPlan.guest else None
    usage = guest_usage_snapshot(db, guest_scope_key) if guest_scope_key else user_usage_snapshot(db, owner)
    result_payload['billing_info'] = {
        'quota_charged': True,
        'remaining_quota': {
            'daily_remaining': usage.get('daily_remaining'),
            'monthly_remaining': usage.get('monthly_remaining'),
        },
    }
    review.result_json = result_payload
    db.add(review)

    task.status = TaskStatus.SUCCEEDED
    task.progress = 100
    task.finished_at = datetime.now(timezone.utc)
    task.last_heartbeat_at = datetime.now(timezone.utc)
    task.error_code = None
    task.error_message = None
    db.add(task)
    record_task_event(db, task, event_type='REVIEW_CREATED', message='Review succeeded', payload={'review_id': review.public_id})
    db.commit()
