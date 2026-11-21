from __future__ import annotations

import json
import logging
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers import client_errors
from app.api.routers.client_errors import (
    MAX_CLIENT_ERROR_BODY_BYTES,
    get_dropped_expected_csp_count,
    reset_client_error_rate_limiter,
)
from app.core.config import settings
from app.main import _should_capture_audit_body, app
from starlette.requests import Request


class ClientErrorsRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_client_error_rate_limiter()

    def tearDown(self) -> None:
        reset_client_error_rate_limiter()

    def test_accepts_browser_error_and_logs_one_structured_warning_without_db_or_guest(self) -> None:
        with (
            patch('app.main._schedule_audit_task') as schedule_audit_task,
            patch('app.main.SessionLocal', side_effect=AssertionError('must not touch DB')),
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            self.assertLogs('app.api.routers.client_errors', level='WARNING') as captured,
        ):
            with TestClient(app) as client:
                response = client.post(
                    '/api/v1/client-errors',
                    headers={
                        'Origin': 'http://localhost:3000',
                        'User-Agent': 'Mozilla/5.0 TestBrowser',
                    },
                    json={
                        'kind': 'error',
                        'source': 'upload:/share/shr_source_secret?code=src_code',
                        'message': (
                            'Upload failed for https://www.picspeak.art/share/shr_msg_secret'
                            ' and https://api.picspeak.art/api/v1/public/reviews/pub_msg_secret'
                            '?__clerk_ticket=tkt_msg_123&code=oauth_code_1&state=oauth_state_1'
                            '&X-Amz-Signature=supersecret&X-Amz-Date=amzdate_msg&token=tok123'
                        ),
                        'stack': (
                            'Error: fail\n'
                            '    at load (https://www.picspeak.art/share/shr_stack_secret?photo_token=secretphoto&__clerk_ticket=tkt_stack_456:1:2)'
                        ),
                        'url': (
                            'https://user:pass@www.picspeak.art/share/shr_url_secret'
                            '?mode=flash&token=secret1&photo_token=secret2&generation_token=secret3'
                            '&__clerk_ticket=tkt_url_789&code=url_code&state=url_state'
                            '&X-Amz-Expires=amzexp_url&X-Goog-Date=googdate_url#frag'
                        ),
                        'referrer': 'https://www.picspeak.art/api/v1/public/reviews/pub_ref_secret?signature=sig_ref_999&keep=1',
                        'user_agent': 'CustomUA/1.0',
                        'release': 'sha-abc1234',
                    },
                )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json(), {'status': 'accepted'})
        self.assertEqual(response.headers.get('access-control-allow-origin'), 'http://localhost:3000')
        self.assertIsNone(response.headers.get('set-cookie'))
        self.assertIsNone(response.headers.get('x-guest-access-token'))
        schedule_audit_task.assert_not_called()

        self.assertEqual(len(captured.records), 1)
        record = captured.records[0]
        self.assertEqual(record.levelno, logging.WARNING)
        self.assertEqual(getattr(record, 'event', None), 'client_error_reported')
        self.assertEqual(getattr(record, 'kind', None), 'error')
        self.assertEqual(getattr(record, 'release', None), 'sha-abc1234')
        self.assertEqual(getattr(record, 'user_agent', None), 'CustomUA/1.0')
        self.assertEqual(getattr(record, 'url', None), 'https://www.picspeak.art/share/[redacted]?mode=flash')
        self.assertEqual(getattr(record, 'referrer', None), 'https://www.picspeak.art/api/v1/public/reviews/[redacted]?keep=1')
        self.assertEqual(
            getattr(record, 'serviceContext', None),
            {'service': 'picspeak-frontend', 'version': 'sha-abc1234'},
        )
        self.assertEqual(
            getattr(record, 'context', None),
            {
                'httpRequest': {
                    'url': 'https://www.picspeak.art/share/[redacted]?mode=flash',
                    'userAgent': 'CustomUA/1.0',
                    'referrer': 'https://www.picspeak.art/api/v1/public/reviews/[redacted]?keep=1',
                }
            },
        )
        all_logged = ' '.join(
            str(getattr(record, attr, ''))
            for attr in ('error_message', 'stack', 'url', 'source', 'referrer')
        )
        for secret in (
            'shr_source_secret',
            'src_code',
            'shr_msg_secret',
            'pub_msg_secret',
            'tkt_msg_123',
            'oauth_code_1',
            'oauth_state_1',
            'supersecret',
            'amzdate_msg',
            'amzexp_url',
            'googdate_url',
            'tok123',
            'shr_stack_secret',
            'secretphoto',
            'tkt_stack_456',
            'shr_url_secret',
            'secret1',
            'secret2',
            'secret3',
            'tkt_url_789',
            'url_code',
            'url_state',
            'pub_ref_secret',
            'sig_ref_999',
            'user:pass',
            '#frag',
        ):
            self.assertNotIn(secret, all_logged)

    def test_accepts_legacy_csp_report_and_logs_at_info_not_warning(self) -> None:
        payload = {
            'csp-report': {
                'document-uri': 'https://www.picspeak.art/workspace?photo_token=secret&mode=pro',
                'violated-directive': 'script-src-elem',
                'effective-directive': 'script-src-elem',
                'blocked-uri': 'https://evil.example/script.js?token=leak',
                'disposition': 'report',
                'source-file': 'https://www.picspeak.art/_next/static/app.js',
                'line-number': 12,
                'column-number': 34,
            }
        }
        with (
            patch.object(settings, 'client_error_csp_sample_rate', 1.0),
            patch('app.main._schedule_audit_task') as schedule_audit_task,
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            self.assertLogs('app.api.routers.client_errors', level='INFO') as captured,
        ):
            with TestClient(app) as client:
                response = client.post(
                    '/api/v1/client-errors',
                    headers={'Content-Type': 'application/csp-report', 'User-Agent': 'Browser/1.0'},
                    content=json.dumps(payload),
                )

        self.assertEqual(response.status_code, 202)
        schedule_audit_task.assert_not_called()
        self.assertEqual(len(captured.records), 1)
        record = captured.records[0]
        self.assertEqual(record.levelno, logging.INFO)
        self.assertEqual(getattr(record, 'kind', None), 'csp')
        self.assertEqual(getattr(record, 'source', None), 'csp_report')
        self.assertEqual(getattr(record, 'url', None), 'https://www.picspeak.art/workspace?mode=pro')
        csp_details = getattr(record, 'csp', {})
        self.assertEqual(csp_details.get('effective_directive'), 'script-src-elem')
        self.assertEqual(csp_details.get('blocked_uri'), 'https://evil.example/script.js')
        self.assertEqual(csp_details.get('disposition'), 'report')
        self.assertNotIn('secret', str(csp_details))
        self.assertNotIn('leak', str(csp_details))

    def test_drops_expected_inline_script_csp_reports_on_own_document_after_counting(self) -> None:
        expected_cases = [
            {
                'csp-report': {
                    'document-uri': 'https://www.picspeak.art/en',
                    'effective-directive': 'script-src-elem',
                    'violated-directive': 'script-src-elem',
                    'blocked-uri': 'inline',
                    'disposition': 'report',
                }
            },
            {
                'csp-report': {
                    'document-uri': 'http://localhost:3000/workspace',
                    'violated-directive': 'script-src',
                    'blocked-uri': 'inline',
                    'disposition': 'report',
                }
            },
        ]
        with (
            patch.object(settings, 'client_error_csp_sample_rate', 1.0),
            patch.dict(os.environ, {'CLIENT_ERROR_RATE_LIMIT_PER_MINUTE': '2'}),
            patch('app.main._schedule_audit_task'),
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            self.assertNoLogs('app.api.routers.client_errors', level='INFO'),
        ):
            with TestClient(app) as client:
                first = client.post(
                    '/api/v1/client-errors',
                    headers={'Content-Type': 'application/csp-report'},
                    content=json.dumps(expected_cases[0]),
                )
                second = client.post(
                    '/api/v1/client-errors',
                    headers={'Content-Type': 'application/csp-report'},
                    content=json.dumps(expected_cases[1]),
                )
                # Dropped expected reports still count toward per-IP rate limiting.
                third = client.post(
                    '/api/v1/client-errors',
                    headers={'Content-Type': 'application/csp-report'},
                    content=json.dumps(expected_cases[0]),
                )

        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 202)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(get_dropped_expected_csp_count(), 2)

    def test_enforced_inline_script_csp_report_is_not_dropped_and_logs_at_info(self) -> None:
        enforced_batch = [
            {
                'type': 'csp-violation',
                'url': 'https://www.picspeak.art/en',
                'body': {
                    'documentURL': 'https://www.picspeak.art/en',
                    'effectiveDirective': 'script-src-elem',
                    'blockedURL': 'inline',
                    'disposition': 'enforce',
                },
            }
        ]
        with (
            patch.object(settings, 'client_error_csp_sample_rate', 1.0),
            patch('app.main._schedule_audit_task'),
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            self.assertLogs('app.api.routers.client_errors', level='INFO') as captured,
        ):
            with TestClient(app) as client:
                response = client.post(
                    '/api/v1/client-errors',
                    headers={'Content-Type': 'application/reports+json'},
                    content=json.dumps(enforced_batch),
                )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(get_dropped_expected_csp_count(), 0)
        self.assertEqual(len(captured.records), 1)
        self.assertEqual(captured.records[0].levelno, logging.INFO)
        self.assertEqual(getattr(captured.records[0], 'csp', {}).get('disposition'), 'enforce')

    def test_parser_value_error_and_recursion_error_map_to_400_never_500(self) -> None:
        cases = [
            ('app.api.routers.client_errors.json.loads', exc_cls)
            for exc_cls in (ValueError, RecursionError, TypeError, OverflowError)
        ] + [('app.api.routers.client_errors._parse_payload', RecursionError)]
        for target, exc_cls in cases:
            with self.subTest(target=target, exc=exc_cls.__name__):
                reset_client_error_rate_limiter()
                with (
                    patch(target, side_effect=exc_cls('parse limit')),
                    patch('app.main._schedule_audit_task'),
                    patch('app.main.worker.start'),
                    patch('app.main.worker.stop'),
                ):
                    with TestClient(app) as client:
                        response = client.post(
                            '/api/v1/client-errors',
                            headers={'Content-Type': 'application/json'},
                            content='{"kind":"error","message":"x"}',
                        )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()['error']['code'], 'INVALID_CLIENT_ERROR_REPORT')

    def test_inline_script_csp_on_third_party_document_is_not_dropped_as_expected(self) -> None:
        payload = {
            'csp-report': {
                'document-uri': 'https://untrusted.example/page',
                'effective-directive': 'script-src',
                'blocked-uri': 'inline',
                'disposition': 'report',
            }
        }
        with (
            patch.object(settings, 'client_error_csp_sample_rate', 1.0),
            patch('app.main._schedule_audit_task'),
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            self.assertLogs('app.api.routers.client_errors', level='INFO') as captured,
        ):
            with TestClient(app) as client:
                response = client.post(
                    '/api/v1/client-errors',
                    headers={'Content-Type': 'application/csp-report'},
                    content=json.dumps(payload),
                )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(get_dropped_expected_csp_count(), 0)
        self.assertEqual(len(captured.records), 1)
        self.assertEqual(captured.records[0].levelno, logging.INFO)

    def test_reporting_api_batch_drops_expected_inline_and_logs_unexpected_at_info(self) -> None:
        batch = [
            {
                'type': 'csp-violation',
                'url': 'https://www.picspeak.art/gallery?generation_token=secret_gen',
                'user_agent': 'Chrome/130',
                'body': {
                    'documentURL': 'https://www.picspeak.art/gallery?generation_token=secret_gen',
                    'effectiveDirective': 'script-src',
                    'blockedURL': 'inline',
                    'disposition': 'report',
                },
            },
            {
                'type': 'csp-violation',
                'url': 'https://www.picspeak.art/gallery?generation_token=secret_gen',
                'user_agent': 'Chrome/130',
                'body': {
                    'documentURL': 'https://www.picspeak.art/gallery?generation_token=secret_gen',
                    'effectiveDirective': 'connect-src',
                    'blockedURL': 'https://tracker.example/beacon',
                    'disposition': 'report',
                },
            },
        ]
        with (
            patch.object(settings, 'client_error_csp_sample_rate', 1.0),
            patch('app.main._schedule_audit_task'),
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            self.assertLogs('app.api.routers.client_errors', level='INFO') as captured,
        ):
            with TestClient(app) as client:
                response = client.post(
                    '/api/v1/client-errors',
                    headers={'Content-Type': 'application/reports+json'},
                    content=json.dumps(batch),
                )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(get_dropped_expected_csp_count(), 1)
        self.assertEqual(len(captured.records), 1)
        record = captured.records[0]
        self.assertEqual(record.levelno, logging.INFO)
        self.assertEqual(getattr(record, 'kind', None), 'csp')
        self.assertEqual(getattr(record, 'source', None), 'reporting_api')
        self.assertEqual(getattr(record, 'csp', {}).get('effective_directive'), 'connect-src')
        self.assertEqual(getattr(record, 'url', None), 'https://www.picspeak.art/gallery')
        self.assertNotIn('secret_gen', str(getattr(record, 'url', '')))

    def test_samples_remaining_csp_reports_at_default_5_percent_while_keeping_js_errors_unsampled(self) -> None:
        self.assertEqual(settings.client_error_csp_sample_rate, 0.05)

        unexpected_csp = {
            'csp-report': {
                'document-uri': 'https://www.picspeak.art/workspace',
                'effective-directive': 'connect-src',
                'blocked-uri': 'https://unexpected.example/collect',
                'disposition': 'report',
            }
        }

        # Sampled out (random >= 0.05): returns 202 without logging.
        with (
            patch.object(client_errors, '_sample_random', return_value=0.5),
            patch('app.main._schedule_audit_task'),
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            self.assertNoLogs('app.api.routers.client_errors', level='INFO'),
        ):
            with TestClient(app) as client:
                sampled_out = client.post(
                    '/api/v1/client-errors',
                    headers={'Content-Type': 'application/csp-report'},
                    content=json.dumps(unexpected_csp),
                )
        self.assertEqual(sampled_out.status_code, 202)

        # Sampled in (random < 0.05): logs at INFO.
        with (
            patch.object(client_errors, '_sample_random', return_value=0.01),
            patch('app.main._schedule_audit_task'),
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            self.assertLogs('app.api.routers.client_errors', level='INFO') as captured_csp,
        ):
            with TestClient(app) as client:
                sampled_in = client.post(
                    '/api/v1/client-errors',
                    headers={'Content-Type': 'application/csp-report'},
                    content=json.dumps(unexpected_csp),
                )
        self.assertEqual(sampled_in.status_code, 202)
        self.assertEqual(len(captured_csp.records), 1)
        self.assertEqual(captured_csp.records[0].levelno, logging.INFO)

        # JS errors stay unsampled and at WARNING even when CSP sample rate is 0.0.
        with (
            patch.object(settings, 'client_error_csp_sample_rate', 0.0),
            patch.object(client_errors, '_sample_random', return_value=0.99),
            patch('app.main._schedule_audit_task'),
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
            self.assertLogs('app.api.routers.client_errors', level='WARNING') as captured_js,
        ):
            with TestClient(app) as client:
                js_err = client.post('/api/v1/client-errors', json={'kind': 'error', 'message': 'Upload broke'})
                js_rej = client.post('/api/v1/client-errors', json={'kind': 'unhandledrejection', 'message': 'Poll rejected'})
        self.assertEqual(js_err.status_code, 202)
        self.assertEqual(js_rej.status_code, 202)
        self.assertEqual(len(captured_js.records), 2)
        self.assertTrue(all(rec.levelno == logging.WARNING for rec in captured_js.records))

    def test_rejects_oversized_payload_and_invalid_kind(self) -> None:
        oversized = json.dumps({'kind': 'error', 'message': 'x' * (MAX_CLIENT_ERROR_BODY_BYTES + 128)})
        with patch('app.main.worker.start'), patch('app.main.worker.stop'):
            with TestClient(app) as client:
                too_large = client.post(
                    '/api/v1/client-errors',
                    headers={'Content-Type': 'application/json'},
                    content=oversized,
                )
                invalid_kind = client.post(
                    '/api/v1/client-errors',
                    json={'kind': 'invalid_kind', 'message': 'boom'},
                )
                missing_msg = client.post(
                    '/api/v1/client-errors',
                    json={'kind': 'unhandledrejection', 'message': '   '},
                )

        self.assertEqual(too_large.status_code, 413)
        self.assertEqual(too_large.json()['error']['code'], 'REQUEST_TOO_LARGE')
        self.assertEqual(invalid_kind.status_code, 422)
        self.assertEqual(missing_msg.status_code, 422)

    def test_rate_limits_per_ip_without_db_and_allows_cors_preflight(self) -> None:
        with (
            patch.dict(os.environ, {'CLIENT_ERROR_RATE_LIMIT_PER_MINUTE': '2'}),
            patch('app.main.worker.start'),
            patch('app.main.worker.stop'),
        ):
            with TestClient(app) as client:
                preflight = client.options(
                    '/api/v1/client-errors',
                    headers={
                        'Origin': 'http://localhost:3000',
                        'Access-Control-Request-Method': 'POST',
                        'Access-Control-Request-Headers': 'Content-Type',
                    },
                )
                self.assertEqual(preflight.status_code, 200)
                self.assertEqual(preflight.headers.get('access-control-allow-origin'), 'http://localhost:3000')

                first = client.post('/api/v1/client-errors', json={'kind': 'error', 'message': 'one'})
                second = client.post('/api/v1/client-errors', json={'kind': 'unhandledrejection', 'message': 'two'})
                third = client.post('/api/v1/client-errors', json={'kind': 'error', 'message': 'three'})

        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 202)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.json()['error']['code'], 'RATE_LIMIT_EXCEEDED')
        self.assertTrue(int(third.headers.get('retry-after', '0')) >= 1)

    def test_excluded_from_audit_body_even_if_allowlisted(self) -> None:
        req = Request({
            'type': 'http',
            'method': 'POST',
            'path': '/api/v1/client-errors',
            'headers': [(b'content-type', b'application/json'), (b'content-length', b'64')],
        })
        with patch('app.main._AUDIT_BODY_ALLOW_PATHS', frozenset({'/api/v1/client-errors'})):
            self.assertFalse(_should_capture_audit_body(req))


if __name__ == '__main__':
    unittest.main()
