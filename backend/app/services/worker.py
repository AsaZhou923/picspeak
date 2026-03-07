from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone
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


class ReviewWorker:
    def __init__(self, worker_name: str | None = None) -> None:
        self._running = False
        self._threads = []
        self.worker_name = worker_name or settings.review_worker_name

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        import threading

        worker_count = max(int(settings.review_worker_concurrency), 1)
        self._threads = []
        for idx in range(worker_count):
            thread = threading.Thread(target=self._loop, name=f'{self.worker_name}-{idx + 1}', daemon=True)
            thread.start()
            self._threads.append(thread)

    def stop(self) -> None:
        self._running = False
        for thread in self._threads:
            if thread.is_alive():
                thread.join(timeout=2)
        self._threads = []

    def _loop(self) -> None:
        idle_sleep_seconds = max(int(settings.review_worker_idle_sleep_ms), 50) / 1000
        while self._running:
            db = SessionLocal()
            try:
                self._expire_tasks(db)
                task = self._claim_next_task(db)
                if task is None:
                    time.sleep(idle_sleep_seconds)
                    continue

                try:
                    self._process_task(db, task)
                except Exception as exc:
                    db.rollback()
                    fresh_task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first()
                    if fresh_task is not None and fresh_task.status == TaskStatus.RUNNING:
                        self._handle_failure(
                            db,
                            fresh_task,
                            error_code='WORKER_UNHANDLED_EXCEPTION',
                            error_message=str(exc) or exc.__class__.__name__,
                            retryable=True,
                        )
            except Exception:
                db.rollback()
            finally:
                db.close()
                time.sleep(0.05)

    def _claim_next_task(self, db: Session) -> ReviewTask | None:
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

        updated = (
            db.query(ReviewTask)
            .filter(ReviewTask.id == candidate.id, ReviewTask.status == TaskStatus.PENDING)
            .update(
                {
                    ReviewTask.status: TaskStatus.RUNNING,
                    ReviewTask.progress: 20,
                    ReviewTask.started_at: now,
                    ReviewTask.claimed_by: self.worker_name,
                    ReviewTask.last_heartbeat_at: now,
                },
                synchronize_session=False,
            )
        )
        if updated != 1:
            db.rollback()
            return None

        db.commit()
        task = db.query(ReviewTask).filter(ReviewTask.id == candidate.id).first()
        if task is not None:
            record_task_event(db, task, event_type='TASK_CLAIMED', message=f'Claimed by {self.worker_name}')
            db.commit()
        return task

    def _expire_tasks(self, db: Session) -> None:
        now = datetime.now(timezone.utc)
        tasks = (
            db.query(ReviewTask)
            .filter(
                ReviewTask.status.in_([TaskStatus.PENDING, TaskStatus.RUNNING]),
                ReviewTask.expire_at.is_not(None),
                ReviewTask.expire_at < now,
            )
            .all()
        )
        for task in tasks:
            task.status = TaskStatus.EXPIRED
            task.finished_at = now
            task.error_code = 'TASK_EXPIRED'
            task.error_message = 'Task expired before completion'
            db.add(task)
            record_task_event(db, task, event_type='TASK_EXPIRED', message=task.error_message)
        if tasks:
            db.commit()

    def _retry_delay_seconds(self, attempt_count: int) -> int:
        base = max(settings.review_retry_base_delay_seconds, 1)
        max_delay = max(settings.review_retry_max_delay_seconds, base)
        return min(base * (2 ** max(attempt_count - 1, 0)), max_delay)

    def _transition_progress(self, db: Session, task: ReviewTask, progress: int, event_type: str, message: str) -> None:
        task.progress = progress
        task.last_heartbeat_at = datetime.now(timezone.utc)
        db.add(task)
        record_task_event(db, task, event_type=event_type, message=message)
        db.commit()

    def _complete_task(self, db: Session, task: ReviewTask, *, status: TaskStatus, error_code: str | None = None, error_message: str | None = None, dead_letter: bool = False) -> None:
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

    def _schedule_retry(self, db: Session, task: ReviewTask, *, error_code: str, error_message: str) -> None:
        delay = self._retry_delay_seconds(task.attempt_count)
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

    def _handle_failure(self, db: Session, task: ReviewTask, *, error_code: str, error_message: str, retryable: bool) -> None:
        if retryable and task.attempt_count < task.max_attempts:
            self._schedule_retry(db, task, error_code=error_code, error_message=error_message[:500])
            return
        if retryable:
            self._complete_task(
                db,
                task,
                status=TaskStatus.DEAD_LETTER,
                error_code=error_code,
                error_message=error_message[:500],
                dead_letter=True,
            )
            return
        self._complete_task(db, task, status=TaskStatus.FAILED, error_code=error_code, error_message=error_message[:500])

    def _process_task(self, db: Session, task: ReviewTask) -> None:
        task.attempt_count += 1
        task.next_attempt_at = None
        task.last_heartbeat_at = datetime.now(timezone.utc)
        task.progress = 20
        db.add(task)
        record_task_event(db, task, event_type='TASK_STARTED', message=f'Attempt {task.attempt_count} started')
        db.commit()

        photo = db.query(Photo).filter(Photo.id == task.photo_id).first()
        if photo is None:
            self._handle_failure(db, task, error_code='PHOTO_NOT_FOUND', error_message='Photo record not found for task', retryable=False)
            return

        image_url = f'{settings.object_base_url.rstrip("/")}/{quote(photo.object_key)}'
        payload_locale = (task.request_payload or {}).get('locale', 'zh')
        if payload_locale not in {'zh', 'en', 'ja'}:
            payload_locale = 'zh'
        if settings.image_audit_enabled and photo.nsfw_label is None:
            self._transition_progress(db, task, 40, 'CONTENT_AUDIT_STARTED', 'Running content audit')
            try:
                audit_result = run_content_audit(image_url=image_url)
            except ContentAuditError as exc:
                self._handle_failure(db, task, error_code='IMAGE_AUDIT_FAILED', error_message=str(exc), retryable=True)
                return
            photo.nsfw_label = audit_result.label
            photo.nsfw_score = audit_result.nsfw_score
            photo.rejected_reason = None if audit_result.safe else (audit_result.reason or 'Image content is not allowed')
            photo.status = PhotoStatus.READY if audit_result.safe else PhotoStatus.REJECTED
            if not audit_result.safe:
                db.add(photo)
                db.commit()
                self._handle_failure(db, task, error_code='IMAGE_NOT_ALLOWED', error_message=photo.rejected_reason or 'Image content is not allowed', retryable=False)
                return
            db.add(photo)
            record_task_event(db, task, event_type='CONTENT_AUDIT_PASSED', message='Content audit passed')
            db.commit()

        self._transition_progress(db, task, 70, 'AI_REVIEW_STARTED', 'Running AI review')

        try:
            ai_response = run_ai_review(
                task.mode.value if isinstance(task.mode, ReviewMode) else str(task.mode),
                image_url=image_url,
                locale=payload_locale,
            )
        except AIReviewError as exc:
            self._handle_failure(db, task, error_code='AI_CALL_FAILED', error_message=str(exc), retryable=True)
            return

        result = ai_response.result
        owner = db.query(User).filter(User.id == task.owner_user_id).first()
        if owner is None:
            self._handle_failure(db, task, error_code='USER_NOT_FOUND', error_message='Task owner not found', retryable=False)
            return

        try:
            enforce_user_quota(db, owner)
        except ApiHTTPException as exc:
            db.rollback()
            task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first() or task
            detail = exc.detail if isinstance(exc.detail, dict) else {'message': str(exc.detail)}
            self._handle_failure(
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
            bill_date=date.today(),
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


worker = ReviewWorker()
