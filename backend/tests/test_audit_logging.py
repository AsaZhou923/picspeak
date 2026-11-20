from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from starlette.requests import Request

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import _should_capture_audit_body, app
from app.services.audit import (
    MAX_LOG_BODY_CHARS,
    _safe_query_string,
    _safe_text_from_body,
    _truncate_client_ip,
    log_api_request,
    mask_capability_url_text,
)


def _json_request(path: str, *, method: str = 'POST', content_length: int = 128) -> Request:
    return Request(
        {
            'type': 'http',
            'method': method,
            'path': path,
            'headers': [
                (b'content-type', b'application/json'),
                (b'content-length', str(content_length).encode('ascii')),
            ],
        }
    )


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

    def test_request_bodies_are_not_captured_by_default(self) -> None:
        for path in (
            '/api/v1/generations',
            '/api/v1/reviews/rev_123/meta',
            '/api/v1/practice/sessions',
            '/api/v1/reviews/rev_123/score-feedback',
            '/api/v1/analytics/events',
            '/api/v1/billing/activation-code/redeem',
        ):
            self.assertFalse(_should_capture_audit_body(_json_request(path)), msg=path)

    def test_allowlisted_path_captures_bounded_body_but_skip_path_stays_blocked(self) -> None:
        with patch(
            'app.main._AUDIT_BODY_ALLOW_PATHS',
            frozenset({'/api/v1/debug/ping', '/api/v1/billing/activation-code/redeem'}),
        ):
            self.assertTrue(_should_capture_audit_body(_json_request('/api/v1/debug/ping')))
            self.assertFalse(_should_capture_audit_body(_json_request('/api/v1/billing/activation-code/redeem')))
            self.assertFalse(_should_capture_audit_body(_json_request('/api/v1/generations')))

    def test_middleware_persists_empty_body_for_non_allowlisted_post(self) -> None:
        with (
            patch('app.main._persist_audit_log') as persist_audit_log,
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
        ):
            with TestClient(app) as client:
                client.post(
                    '/api/v1/analytics/events',
                    json={'event_name': 'test', 'metadata': {'secret_note': 'do not log'}},
                )

        persist_audit_log.assert_called_once()
        self.assertEqual(persist_audit_log.call_args.kwargs['request_body'], b'')

    def test_middleware_persists_body_only_for_allowlisted_path(self) -> None:
        with (
            patch('app.main._AUDIT_BODY_ALLOW_PATHS', frozenset({'/api/v1/analytics/events'})),
            patch('app.main._persist_audit_log') as persist_audit_log,
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
        ):
            with TestClient(app) as client:
                client.post(
                    '/api/v1/analytics/events',
                    json={'event_name': 'test', 'metadata': {'secret_note': 'do not log'}},
                )

        persist_audit_log.assert_called_once()
        self.assertIn(b'"event_name"', persist_audit_log.call_args.kwargs['request_body'])

    def test_safe_text_from_body_redacts_user_free_text_and_nested_fields(self) -> None:
        body = (
            b'{"mode":"flash","prompt":"golden hour portrait","note":"private note",'
            b'"notes":"more notes","tags":["family","tokyo"],"feedback":"too high",'
            b'"comment":"private comment","metadata":{"page":"/reviews/1","extra":"secret"},'
            b'"text":"free text","activation_code":"PSCN-1234"}'
        )

        sanitized = _safe_text_from_body(body)

        self.assertIsNotNone(sanitized)
        assert sanitized is not None
        for leaked in (
            'golden hour portrait',
            'private note',
            'more notes',
            'family',
            'tokyo',
            'too high',
            'private comment',
            '/reviews/1',
            'free text',
            'PSCN-1234',
        ):
            self.assertNotIn(leaked, sanitized)
        self.assertIn('"mode":"flash"', sanitized)

    def test_capability_url_masking_preserves_provider_error_messages(self) -> None:
        provider_error = '{"error":{"message":"Rate limit exceeded","token":"secret-tok"}}'
        masked = mask_capability_url_text(provider_error)
        self.assertIn('Rate limit exceeded', masked)
        self.assertNotIn('secret-tok', masked)

    def test_truncate_client_ip_and_log_api_request_coarsen_addresses(self) -> None:
        self.assertEqual(_truncate_client_ip('203.0.113.42'), '203.0.113.0/24')
        self.assertEqual(_truncate_client_ip('::ffff:203.0.113.42'), '203.0.113.0/24')
        self.assertEqual(_truncate_client_ip('2001:db8:85a3:1234:5678::9'), '2001:db8:85a3::/48')
        self.assertIsNone(_truncate_client_ip('testclient'))
        self.assertIsNone(_truncate_client_ip(None))

        db = MagicMock()
        log_api_request(
            db,
            request_id='req_1',
            method='POST',
            path='/api/v1/generations',
            query_string=None,
            endpoint='/api/v1/generations',
            client_ip='198.51.100.77',
            user_public_id='usr_1',
            user_agent='agent',
            request_body=b'',
            status_code=200,
            duration_ms=12,
        )
        record = db.add.call_args.args[0]
        self.assertEqual(record.client_ip, '198.51.100.0/24')
        self.assertIsNone(record.request_body)


if __name__ == '__main__':
    unittest.main()
