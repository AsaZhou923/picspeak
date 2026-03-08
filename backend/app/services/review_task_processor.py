from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.api.deps import new_public_id
from app.core.config import settings
from app.core.errors import ApiHTTPException
from app.db.models import Photo, PhotoStatus, Review, ReviewMode, ReviewStatus, ReviewTask, TaskStatus, UsageLedger, User
from app.db.session import SessionLocal
from app.services.ai import AIReviewError, run_ai_review
from app.services.content_audit import ContentAuditError, run_content_audit
from app.services.guard import enforce_user_quota, increment_quota
from app.services.task_events import record_task_event


def expire_review_tasks(db: Session) -> None:
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
        _process_task(db, task)
        return {'result': 'processed', 'status': task.status.value}
    finally:
        db.close()


def claim_next_pending_review_task(db: Session, *, worker_name: str) -> ReviewTask | None:
    expire_review_tasks(db)
    now = datetime.now(timezone.utc)
    candidate = (
        db.query(ReviewTask)
        .filter(
            ReviewTask.status == TaskStatus.PENDING,
            (ReviewTask.next_attempt_at.is_(None) | (ReviewTask.next_attempt_at <= now)),
        )
        .order_by(ReviewTask.next_attempt_at.asc().nullsfirst(), ReviewTask.created_at.asc())
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
        )
    except AIReviewError as exc:
        _handle_failure(db, task, error_code='AI_CALL_FAILED', error_message=str(exc), retryable=True)
        return

    result = ai_response.result
    owner = db.query(User).filter(User.id == task.owner_user_id).first()
    if owner is None:
        _handle_failure(db, task, error_code='USER_NOT_FOUND', error_message='Task owner not found', retryable=False)
        return

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
            error_message=str(detail.get('message') or 'Daily quota exceeded'),
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
        schema_version=result.schema_version,
        result_json=result.model_dump(),
        final_score=result.final_score,
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

    task.status = TaskStatus.SUCCEEDED
    task.progress = 100
    task.finished_at = datetime.now(timezone.utc)
    task.last_heartbeat_at = datetime.now(timezone.utc)
    task.error_code = None
    task.error_message = None
    db.add(task)
    record_task_event(db, task, event_type='REVIEW_CREATED', message='Review succeeded', payload={'review_id': review.public_id})
    db.commit()
