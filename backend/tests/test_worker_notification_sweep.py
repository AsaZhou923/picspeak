from __future__ import annotations

import sys
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.worker import ReviewWorker


class WorkerNotificationSweepTests(unittest.TestCase):
    def _worker(self) -> ReviewWorker:
        worker = ReviewWorker(worker_name='test-worker')
        self.addCleanup(worker._gen_executor.shutdown, False, cancel_futures=True)
        return worker

    def test_due_sweep_processes_notifications_cleans_expired_and_commits(self) -> None:
        worker = self._worker()
        db = MagicMock()
        session_factory = MagicMock(return_value=db)

        with (
            patch('app.services.worker.settings.notifications_worker_enabled', True),
            patch('app.services.worker.settings.notification_sweep_interval_seconds', 60),
            patch('app.services.worker.time.monotonic', side_effect=[100.0, 100.0]),
            patch('app.db.session.SessionLocal', session_factory),
            patch('app.services.worker.process_pending_notifications', return_value={'processed': 2}) as process_pending,
            patch('app.services.worker.cleanup_expired_notifications', return_value=1) as cleanup_expired,
        ):
            worker._run_notification_sweep_if_due()

        process_pending.assert_called_once_with(db, limit=100)
        cleanup_expired.assert_called_once_with(db)
        db.commit.assert_called_once_with()
        db.close.assert_called_once_with()
        self.assertEqual(worker._next_notification_sweep_at, 160.0)

    def test_sweep_does_not_repeat_before_interval(self) -> None:
        worker = self._worker()
        worker._next_notification_sweep_at = 160.0

        with (
            patch('app.services.worker.settings.notifications_worker_enabled', True),
            patch('app.services.worker.time.monotonic', return_value=120.0),
            patch('app.services.worker.process_pending_notifications') as process_pending,
        ):
            worker._run_notification_sweep_if_due()

        process_pending.assert_not_called()

    def test_sweep_skips_when_disabled(self) -> None:
        worker = self._worker()

        with (
            patch('app.services.worker.settings.notifications_worker_enabled', False),
            patch('app.services.worker.process_pending_notifications') as process_pending,
        ):
            worker._run_notification_sweep_if_due()

        process_pending.assert_not_called()


    def test_dedicated_notification_thread_runs_while_review_worker_is_blocked(self) -> None:
        worker = self._worker()
        review_started = threading.Event()
        release_review = threading.Event()
        sweep_while_blocked = threading.Event()
        task = SimpleNamespace(public_id='tsk_blocked', claimed_by='claim_token')
        db = MagicMock()

        def process_review(*_args, **_kwargs) -> None:
            review_started.set()
            release_review.wait(timeout=3)

        def process_pending(_db, limit: int = 100) -> dict:
            if review_started.is_set():
                sweep_while_blocked.set()
            return {'processed': 1}

        with (
            patch('app.services.worker.settings.review_worker_concurrency', 1),
            patch('app.services.worker.settings.review_worker_idle_sleep_ms', 50),
            patch('app.services.worker.settings.notifications_worker_enabled', True),
            patch('app.services.worker.settings.notification_sweep_interval_seconds', 1),
            patch('app.services.worker.settings.guest_user_cleanup_enabled', False),
            patch('app.db.session.SessionLocal', MagicMock(return_value=db)),
            patch('app.services.worker.claim_next_pending_review_task', side_effect=[task, None, None]),
            patch('app.services.worker.claim_next_pending_image_generation_task', return_value=None),
            patch('app.services.worker.process_review_task', side_effect=process_review),
            patch('app.services.worker.process_pending_notifications', side_effect=process_pending),
            patch('app.services.worker.cleanup_expired_notifications', return_value=0),
        ):
            worker.start()
            try:
                self.assertTrue(review_started.wait(timeout=2))
                self.assertTrue(sweep_while_blocked.wait(timeout=3))
            finally:
                release_review.set()
                worker.stop()

    def test_sweep_failure_releases_maintenance_lock_for_next_run(self) -> None:
        worker = self._worker()
        db = MagicMock()
        session_factory = MagicMock(return_value=db)

        with (
            patch('app.services.worker.settings.notifications_worker_enabled', True),
            patch('app.services.worker.settings.notification_sweep_interval_seconds', 60),
            patch('app.services.worker.time.monotonic', side_effect=[100.0, 100.0, 200.0, 200.0]),
            patch('app.db.session.SessionLocal', session_factory),
            patch('app.services.worker.process_pending_notifications', side_effect=[RuntimeError('boom'), {'processed': 1}]) as process_pending,
            patch('app.services.worker.cleanup_expired_notifications', return_value=0),
        ):
            worker._run_notification_sweep_if_due()
            worker._run_notification_sweep_if_due()

        self.assertEqual(process_pending.call_count, 2)
        self.assertFalse(worker._notification_lock.locked())


if __name__ == '__main__':
    unittest.main()
