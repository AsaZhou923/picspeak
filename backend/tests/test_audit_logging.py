from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app
from app.services.audit import MAX_LOG_BODY_CHARS, _safe_text_from_body


class AuditLoggingTests(unittest.TestCase):
    def test_safe_text_from_body_truncates_after_max_chars(self) -> None:
        payload = ('x' * (MAX_LOG_BODY_CHARS + 10)).encode('utf-8')

        truncated = _safe_text_from_body(payload)

        self.assertIsNotNone(truncated)
        assert truncated is not None
        self.assertTrue(truncated.endswith('...<truncated>'))
        self.assertEqual(len(truncated), MAX_LOG_BODY_CHARS + len('...<truncated>'))

    def test_health_check_requests_skip_audit_task_scheduling(self) -> None:
        with patch('app.main._schedule_audit_task') as schedule_audit_task, patch('app.main.worker.start'), patch(
            'app.main.worker.stop'
        ):
            with TestClient(app) as client:
                response = client.get('/healthz')

        self.assertEqual(response.status_code, 200)
        schedule_audit_task.assert_not_called()


if __name__ == '__main__':
    unittest.main()
