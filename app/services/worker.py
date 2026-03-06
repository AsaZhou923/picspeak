from __future__ import annotations

import time
from datetime import date, datetime, timezone
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.api.deps import new_public_id
from app.core.config import settings
from app.db.models import Photo, Review, ReviewMode, ReviewStatus, ReviewTask, TaskStatus, UsageLedger
from app.db.session import SessionLocal
from app.services.ai import AIReviewError, run_ai_review


class ReviewWorker:
    def __init__(self) -> None:
        self._running = False
        self._thread = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        import threading

        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

    def _loop(self) -> None:
        while self._running:
            db = SessionLocal()
            try:
                self._expire_tasks(db)
                task = (
                    db.query(ReviewTask)
                    .filter(ReviewTask.status == TaskStatus.PENDING)
                    .order_by(ReviewTask.created_at.asc())
                    .first()
                )
                if task is None:
                    time.sleep(1.0)
                    continue

                task.status = TaskStatus.RUNNING
                task.progress = 20
                task.started_at = datetime.now(timezone.utc)
                db.add(task)
                db.commit()
                db.refresh(task)

                self._process_task(db, task)
            except Exception:
                db.rollback()
            finally:
                db.close()
                time.sleep(0.2)

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
        task.progress = 60
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

        task.status = TaskStatus.SUCCEEDED
        task.progress = 100
        task.finished_at = datetime.now(timezone.utc)
        task.error_code = None
        task.error_message = None
        db.add(task)
        db.commit()


worker = ReviewWorker()
