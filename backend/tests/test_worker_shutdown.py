from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.worker import ReviewWorker


class WorkerShutdownTests(unittest.TestCase):
    def test_stop_waits_for_alive_threads_before_clearing_registry(self) -> None:
        worker = ReviewWorker(worker_name='test-worker')
        alive_thread = MagicMock()
        alive_thread.is_alive.return_value = True
        idle_thread = MagicMock()
        idle_thread.is_alive.return_value = False
        worker._running = True
        worker._threads = [alive_thread, idle_thread]
        worker._gen_executor = MagicMock()

        worker.stop()

        self.assertFalse(worker._running)
        alive_thread.join.assert_called_once_with(timeout=2)
        idle_thread.join.assert_not_called()
        worker._gen_executor.shutdown.assert_called_once_with(wait=False, cancel_futures=True)
        self.assertEqual(worker._threads, [])


if __name__ == '__main__':
    unittest.main()
