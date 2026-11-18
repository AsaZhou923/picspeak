from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.notifications import router
from app.core.config import settings
from app.db.session import get_db
from app.services.worker import ReviewWorker


class TaskMaintenanceTests(unittest.TestCase):
    def _worker(self) -> ReviewWorker:
        worker = ReviewWorker(worker_name='maintenance-test')
        self.addCleanup(worker._gen_executor.shutdown, False, cancel_futures=True)
        return worker

    def test_task_sweep_is_throttled_and_uses_short_sessions_with_notifications_disabled(self):
        worker = self._worker()
        sessions = [MagicMock(), MagicMock(), MagicMock(), MagicMock()]
        with (
            patch.object(settings, 'notifications_worker_enabled', False),
            patch('app.services.worker.time.monotonic', side_effect=[100, 100, 105, 110, 110]),
            patch('app.db.session.SessionLocal', side_effect=sessions) as factory,
            patch('app.services.worker.expire_review_tasks') as reviews,
            patch('app.services.worker.expire_image_generation_tasks') as generations,
        ):
            worker._run_task_sweep_if_due()
            worker._run_task_sweep_if_due()
            self.assertEqual(factory.call_count, 2)
            worker._run_task_sweep_if_due()
        self.assertEqual(reviews.call_count, 2)
        self.assertEqual(generations.call_count, 2)
        for session in sessions:
            session.close.assert_called_once_with()

    def test_task_sweep_does_not_overlap_and_failure_preserves_next_sweep(self):
        worker = self._worker()
        db = MagicMock()
        with (
            patch('app.services.worker.time.monotonic', return_value=100),
            patch('app.db.session.SessionLocal', return_value=db) as factory,
            patch('app.services.worker.expire_review_tasks', side_effect=RuntimeError('review failure')),
            patch('app.services.worker.expire_image_generation_tasks') as generations,
        ):
            worker._task_sweep_lock.acquire()
            worker._run_task_sweep_if_due()
            factory.assert_not_called()
            worker._task_sweep_lock.release()
            worker._run_task_sweep_if_due()
        generations.assert_called_once_with(db)
        self.assertEqual(db.close.call_count, 2)
        self.assertFalse(worker._task_sweep_lock.locked())

    def test_task_sweep_session_failure_is_recoverable(self):
        worker = self._worker()
        with (
            patch('app.services.worker.time.monotonic', side_effect=[100, 100, 110, 110]),
            patch('app.db.session.SessionLocal', side_effect=[RuntimeError('connection failure'), MagicMock(), MagicMock()]),
            patch('app.services.worker.expire_review_tasks') as reviews,
            patch('app.services.worker.expire_image_generation_tasks') as generations,
        ):
            worker._run_task_sweep_if_due()
            worker._run_task_sweep_if_due()
        reviews.assert_called_once()
        generations.assert_called_once()
        self.assertFalse(worker._task_sweep_lock.locked())

    def test_maintenance_loop_sweeps_tasks_when_notifications_are_disabled(self):
        worker = self._worker()
        worker._running = True
        with (
            patch.object(settings, 'notifications_worker_enabled', False),
            patch.object(worker, '_run_task_sweep_if_due') as sweep,
            patch.object(worker._notification_stop_event, 'wait', side_effect=lambda _seconds: setattr(worker, '_running', False)),
        ):
            worker._notification_maintenance_loop()
        sweep.assert_called_once_with()

    def test_idle_backoff_releases_sessions_and_resets_after_task(self):
        worker = self._worker()
        worker._running = True
        sessions = []
        delays = []
        task = SimpleNamespace(public_id='tsk_work', claimed_by='claim')

        def session_factory():
            db = MagicMock()
            sessions.append(db)
            return db

        def sleep(seconds):
            for db in sessions:
                db.close.assert_called_once_with()
            if seconds != 0.05:
                delays.append(seconds)
                if len(delays) == 7:
                    worker._running = False

        with (
            patch.object(settings, 'review_worker_idle_sleep_ms', 200),
            patch.object(worker, '_run_guest_cleanup_if_due'),
            patch.object(worker, '_run_request_log_cleanup_if_due'),
            patch('app.db.session.SessionLocal', side_effect=session_factory),
            patch('app.services.worker.claim_next_pending_review_task', side_effect=[None] * 5 + [task, None, None]),
            patch('app.services.worker.claim_next_pending_image_generation_task', return_value=None),
            patch('app.services.worker.process_review_task') as process,
            patch('app.services.worker.time.sleep', side_effect=sleep),
        ):
            worker._loop()
        self.assertEqual(delays, [0.2, 0.4, 0.8, 1.6, 2.0, 0.2, 0.4])
        process.assert_called_once_with('tsk_work', worker_name='maintenance-test', claim_token='claim')


class InternalTaskMaintenanceTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(router, prefix='/api/v1')
        self.db = MagicMock()
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def test_scheduler_runs_task_maintenance_without_notification_rollout(self):
        with (
            patch.object(settings, 'cloud_tasks_enabled', True),
            patch.object(settings, 'cloud_tasks_secret', 'test-secret'),
            patch.object(settings, 'notifications_worker_enabled', False),
            patch('app.api.routers.notifications.expire_review_tasks') as reviews,
            patch('app.api.routers.notifications.expire_image_generation_tasks') as generations,
            patch('app.api.routers.notifications.process_pending_notifications', return_value={'processed': 0, 'failed': 0}),
            patch('app.api.routers.notifications.cleanup_expired_notifications', return_value=0),
            patch('app.api.routers.notifications.cleanup_expired_request_logs', return_value=0),
        ):
            response = self.client.post('/api/v1/internal/notifications/process', headers={'X-Task-Dispatch-Secret': 'test-secret'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['cache-control'], 'private, no-store')
        reviews.assert_called_once_with(self.db)
        generations.assert_called_once_with(self.db)

    def test_unauthorized_scheduler_cannot_run_task_maintenance(self):
        with (
            patch.object(settings, 'cloud_tasks_enabled', True),
            patch.object(settings, 'cloud_tasks_secret', 'test-secret'),
            patch('app.api.routers.notifications.expire_review_tasks') as reviews,
            patch('app.api.routers.notifications.expire_image_generation_tasks') as generations,
        ):
            response = self.client.post('/api/v1/internal/notifications/process')
        self.assertEqual(response.status_code, 401)
        reviews.assert_not_called()
        generations.assert_not_called()
