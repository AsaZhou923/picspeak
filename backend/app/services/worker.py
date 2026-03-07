from __future__ import annotations

import time

from app.core.config import settings
from app.services.review_task_processor import claim_next_pending_review_task, process_review_task


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
            task = None
            try:
                from app.db.session import SessionLocal

                db = SessionLocal()
                try:
                    task = claim_next_pending_review_task(db, worker_name=self.worker_name)
                finally:
                    db.close()

                if task is None:
                    time.sleep(idle_sleep_seconds)
                    continue

                process_review_task(task.public_id, worker_name=self.worker_name)
            except Exception:
                time.sleep(idle_sleep_seconds)
            finally:
                time.sleep(0.05)


worker = ReviewWorker()
