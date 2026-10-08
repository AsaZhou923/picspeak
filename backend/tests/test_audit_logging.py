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
from app.services.audit import MAX_LOG_BODY_CHARS, _safe_query_string, _safe_text_from_body, mask_capability_url_text


class AuditLoggingTests(unittest.TestCase):
    def test_safe_text_from_body_truncates_after_max_chars(self) -> None:
        payload = ('x' * (MAX_LOG_BODY_CHARS + 10)).encode('utf-8')

        truncated = _safe_text_from_body(payload)

        self.assertIsNotNone(truncated)
        assert truncated is not None
        self.assertTrue(truncated.endswith('...<truncated>'))
        self.assertEqual(len(truncated), MAX_LOG_BODY_CHARS + len('...<truncated>'))

    def test_capability_url_text_masks_signed_image_access_tokens(self) -> None:
        raw = (
            'provider echoed {"url":"https://r2.example/object.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256'
            '&X-Amz-Credential=AKIA_TEST%2F20261008%2Fauto'
            '&X-Amz-Security-Token=session-secret'
            '&X-Amz-Signature=deadbeef'
            '&photo_token=photo-secret","ok":true}'
        )
        escaped = raw.replace('&', r'\u0026')
        encoded = 'https%3A%2F%2Fr2.example%2Fobject.jpg%3FX-Amz-Signature%3Dencodedsecret%26photo_token%3Dencodedphoto'

        masked = mask_capability_url_text(f'{raw} {escaped} {encoded}')

        for secret in ('AKIA_TEST', 'session-secret', 'deadbeef', 'photo-secret', 'encodedsecret', 'encodedphoto'):
            self.assertNotIn(secret, masked)
        self.assertIn('AWS4-HMAC-SHA256', masked)
        self.assertIn('"ok":true', masked)

    def test_safe_query_string_masks_signed_image_access_tokens(self) -> None:
        query = 'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=cred-secret&photo_token=photo-secret&plain=value'

        masked = _safe_query_string(query)

        self.assertEqual(masked, 'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=%2A%2A%2A&photo_token=%2A%2A%2A&plain=value')

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
