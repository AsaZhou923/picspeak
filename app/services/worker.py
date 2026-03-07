from __future__ import annotations

import time
from datetime import date, datetime, timezone
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.api.deps import new_public_id
from app.core.config import settings
from app.db.models import Photo, PhotoStatus, Review, ReviewMode, ReviewStatus, ReviewTask, TaskStatus, UsageLedger, User
from app.db.session import SessionLocal
from app.services.ai import AIReviewError, run_ai_review
from app.services.content_audit import ContentAuditError, run_content_audit
from app.services.guard import enforce_user_quota, increment_quota


class ReviewWorker:
    def __init__(self) -> None:
        self._running = False
        self._threads = []

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        import threading

        worker_count = max(int(settings.review_worker_concurrency), 1)
        self._threads = []
        for idx in range(worker_count):
            thread = threading.Thread(target=self._loop, name=f'review-worker-{idx + 1}', daemon=True)
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

                self._process_task(db, task)
            except Exception:
                db.rollback()
            finally:
                db.close()
                time.sleep(0.05)

    def _claim_next_task(self, db: Session) -> ReviewTask | None:
        candidate = (
            db.query(ReviewTask)
            .filter(ReviewTask.status == TaskStatus.PENDING)
            .order_by(ReviewTask.created_at.asc())
            .first()
        )
        if candidate is None:
            return None

        now = datetime.now(timezone.utc)
        updated = (
            db.query(ReviewTask)
            .filter(ReviewTask.id == candidate.id, ReviewTask.status == TaskStatus.PENDING)
            .update(
                {
                    ReviewTask.status: TaskStatus.RUNNING,
                    ReviewTask.progress: 20,
                    ReviewTask.started_at: now,
                },
                synchronize_session=False,
            )
        )
        if updated != 1:
            db.rollback()
            return None

        db.commit()
        return db.query(ReviewTask).filter(ReviewTask.id == candidate.id).first()

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
        if tasks:
            db.commit()

    def _process_task(self, db: Session, task: ReviewTask) -> None:
        task.attempt_count += 1
        task.progress = 40 if settings.image_audit_enabled else 70
        db.add(task)
        db.commit()

        photo = db.query(Photo).filter(Photo.id == task.photo_id).first()
        if photo is None:
            task.status = TaskStatus.FAILED
            task.progress = 100
            task.finished_at = datetime.now(timezone.utc)
            task.error_code = 'PHOTO_NOT_FOUND'
            task.error_message = 'Photo record not found for task'
            db.add(task)
            db.commit()
            return

        image_url = f'{settings.object_base_url.rstrip("/")}/{quote(photo.object_key)}'
        payload_locale = (task.request_payload or {}).get('locale', 'zh')
        if payload_locale not in {'zh', 'en', 'ja'}:
            payload_locale = 'zh'
        if settings.image_audit_enabled and photo.nsfw_label is None:
            try:
                audit_result = run_content_audit(image_url=image_url)
            except ContentAuditError as exc:
                task.status = TaskStatus.FAILED
                task.progress = 100
                task.finished_at = datetime.now(timezone.utc)
                task.error_code = 'IMAGE_AUDIT_FAILED'
                task.error_message = str(exc)[:500]
                db.add(task)
                db.commit()
                return
            photo.nsfw_label = audit_result.label
            photo.nsfw_score = audit_result.nsfw_score
            photo.rejected_reason = None if audit_result.safe else (audit_result.reason or 'Image content is not allowed')
            photo.status = PhotoStatus.READY if audit_result.safe else PhotoStatus.REJECTED
            if not audit_result.safe:
                task.status = TaskStatus.FAILED
                task.progress = 100
                task.finished_at = datetime.now(timezone.utc)
                task.error_code = 'IMAGE_NOT_ALLOWED'
                task.error_message = photo.rejected_reason
                db.add(photo)
                db.add(task)
                db.commit()
                return
            db.add(photo)
            db.commit()

        # Stage: AI analysis
        task.progress = 70
        db.add(task)
        db.commit()

        try:
            ai_response = run_ai_review(
                task.mode.value if isinstance(task.mode, ReviewMode) else str(task.mode),
                image_url=image_url,
                locale=payload_locale,
            )
        except AIReviewError as exc:
            task.status = TaskStatus.FAILED
            task.progress = 100
            task.finished_at = datetime.now(timezone.utc)
            task.error_code = 'AI_CALL_FAILED'
            task.error_message = str(exc)[:500]
            db.add(task)
            db.commit()
            return

        result = ai_response.result
        owner = db.query(User).filter(User.id == task.owner_user_id).first()
        if owner is None:
            task.status = TaskStatus.FAILED
            task.progress = 100
            task.finished_at = datetime.now(timezone.utc)
            task.error_code = 'USER_NOT_FOUND'
            task.error_message = 'Task owner not found'
            db.add(task)
            db.commit()
            return

        try:
            enforce_user_quota(db, owner)
        except HTTPException as exc:
            db.rollback()
            task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first() or task
            task.status = TaskStatus.FAILED
            task.progress = 100
            task.finished_at = datetime.now(timezone.utc)
            task.error_code = 'QUOTA_EXCEEDED'
            task.error_message = str(exc.detail)[:500]
            db.add(task)
            db.commit()
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
        task.error_code = None
        task.error_message = None
        db.add(task)
        db.commit()


worker = ReviewWorker()
