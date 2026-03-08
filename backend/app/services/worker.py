from __future__ import annotations

import logging
import threading
import time

from app.core.config import settings
from app.services.guest_cleanup import cleanup_stale_guest_users
from app.services.review_task_processor import claim_next_pending_review_task, process_review_task


logger = logging.getLogger(__name__)


class ReviewWorker:
    def __init__(self, worker_name: str | None = None) -> None:
        self._running = False
        self._threads = []
        self._maintenance_lock = threading.Lock()
        self._next_guest_cleanup_at = 0.0
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
            task = None
            try:
                self._run_guest_cleanup_if_due()

                from app.db.session import SessionLocal

                db = SessionLocal()
                try:
                    task = claim_next_pending_review_task(db, worker_name=self.worker_name)
                finally:
                    db.close()

                if task is None:
                    time.sleep(idle_sleep_seconds)
                    continue

                logger.info('Review worker claimed task %s', task.public_id)
                process_review_task(task.public_id, worker_name=self.worker_name)
            except Exception:
                logger.exception(
                    'Review worker loop crashed while processing task %s',
                    getattr(task, 'public_id', None),
                )
                time.sleep(idle_sleep_seconds)
            finally:
                time.sleep(0.05)

    def _run_guest_cleanup_if_due(self) -> None:
        if not settings.guest_user_cleanup_enabled:
            return

        now = time.monotonic()
        if now < self._next_guest_cleanup_at:
            return
        if not self._maintenance_lock.acquire(blocking=False):
            return

        try:
            now = time.monotonic()
            if now < self._next_guest_cleanup_at:
                return
            self._next_guest_cleanup_at = now + max(int(settings.guest_user_cleanup_interval_seconds), 60)

            from app.db.session import SessionLocal

            db = SessionLocal()
            try:
                deleted_count = cleanup_stale_guest_users(db)
            finally:
                db.close()

            if deleted_count:
                logger.info('Deleted %s stale guest users without review history', deleted_count)
        except Exception:
            logger.exception('Failed to run stale guest cleanup')
        finally:
            self._maintenance_lock.release()


worker = ReviewWorker()
