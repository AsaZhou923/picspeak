from __future__ import annotations

import time
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.api.deps import new_public_id
from app.db.models import Review, ReviewMode, ReviewStatus, ReviewTask, TaskStatus, UsageLedger
from app.db.session import SessionLocal
from app.services.ai import run_mock_review


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

        result = run_mock_review(task.mode.value if isinstance(task.mode, ReviewMode) else str(task.mode))

        review = Review(
            public_id=new_public_id('rev'),
            task_id=task.id,
            photo_id=task.photo_id,
            owner_user_id=task.owner_user_id,
            mode=task.mode,
            status=ReviewStatus.SUCCEEDED,
            schema_version=result.schema_version,
            result_json=result.model_dump(),
            input_tokens=200,
            output_tokens=300,
            cost_usd=0.0025 if task.mode == ReviewMode.flash else 0.01,
            latency_ms=800,
            model_name='mock-vision-v1',
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
            metadata={'mode': task.mode.value if isinstance(task.mode, ReviewMode) else str(task.mode)},
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
