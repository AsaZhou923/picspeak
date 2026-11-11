from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.http_client import PooledHTTPRequestError, PooledHTTPResponse, PooledHTTPStatusError
from app.services.openai_fallback import (
    OFFICIAL_RESPONSES_ENDPOINT,
    redact_provider_error,
    request_with_openai_fallback,
)


def _status_error(status: int, *, headers: dict | None = None) -> PooledHTTPStatusError:
    return PooledHTTPStatusError(PooledHTTPResponse(status, b'provider error', headers or {}, 'failed'))


class OpenAIFallbackTests(unittest.TestCase):
    def setUp(self) -> None:
        self.success = PooledHTTPResponse(200, b'{"model":"gpt-6-sol"}', {}, 'OK')
        self.request = Mock()
        self.failed = Mock()
        self.sleep_patch = patch('app.services.openai_fallback.time.sleep')
        self.sleep = self.sleep_patch.start()
        self.addCleanup(self.sleep_patch.stop)

    def call(self, *, fallback_api_key: str = 'official-secret', primary_attempts: int = 3):
        return request_with_openai_fallback(
            primary_endpoint='https://primary.example/v1/responses',
            primary_api_key='primary-secret',
            fallback_api_key=fallback_api_key,
            primary_attempts=primary_attempts,
            body=b'{"model":"gpt-6-sol","reasoning":{"effort":"low"}}',
            timeout_seconds=120,
            request=self.request,
            on_primary_failure=self.failed,
        )

    def test_primary_success_makes_one_request(self) -> None:
        self.request.return_value = self.success
        self.assertIs(self.call(), self.success)
        self.assertEqual(self.request.call_count, 1)
        self.failed.assert_not_called()
        self.sleep.assert_not_called()

    def test_primary_recovers_before_fallback(self) -> None:
        self.request.side_effect = [_status_error(401), self.success]
        self.assertIs(self.call(), self.success)
        self.assertEqual(self.failed.call_count, 1)
        self.assertEqual(self.request.call_count, 2)
        self.assertTrue(all(call.args[1].startswith('https://primary.example/') for call in self.request.call_args_list))

    def test_each_eligible_failure_switches_after_three_primary_attempts(self) -> None:
        failures = [_status_error(status) for status in (401, 403, 408, 429, 500, 503, 599)]
        failures.append(PooledHTTPRequestError('connection failed'))
        for failure in failures:
            with self.subTest(failure=str(failure)):
                self.request.reset_mock()
                self.failed.reset_mock()
                self.sleep.reset_mock()
                self.request.side_effect = [failure, failure, failure, self.success]
                self.assertIs(self.call(), self.success)
                self.assertEqual(self.request.call_count, 4)
                self.assertEqual(self.failed.call_count, 3)
                self.assertEqual([call.args[0] for call in self.sleep.call_args_list], [1, 2])
                calls = self.request.call_args_list
                for call in calls[:3]:
                    self.assertEqual(call.args[1], 'https://primary.example/v1/responses')
                    self.assertEqual(call.kwargs['headers']['Authorization'], 'Bearer primary-secret')
                self.assertEqual(calls[3].args, ('POST', OFFICIAL_RESPONSES_ENDPOINT))
                self.assertEqual(calls[3].kwargs['headers']['Authorization'], 'Bearer official-secret')
                self.assertTrue(all(call.kwargs['body'] == calls[0].kwargs['body'] for call in calls))
                self.assertEqual([call.kwargs['timeout_seconds'] for call in calls], [120, 30, 30, 120])

    def test_missing_fallback_preserves_single_primary_failure(self) -> None:
        failure = _status_error(401)
        self.request.side_effect = failure
        with self.assertRaises(PooledHTTPStatusError) as raised:
            self.call(fallback_api_key='  ')
        self.assertIs(raised.exception, failure)
        self.assertEqual(self.request.call_count, 1)
        self.failed.assert_not_called()
        self.sleep.assert_not_called()

    def test_invalid_request_does_not_retry_or_switch(self) -> None:
        for status in (400, 404, 409, 422):
            with self.subTest(status=status):
                self.request.reset_mock()
                self.request.side_effect = _status_error(status)
                with self.assertRaises(PooledHTTPStatusError):
                    self.call()
                self.assertEqual(self.request.call_count, 1)
                self.failed.assert_not_called()
                self.sleep.assert_not_called()

    def test_fallback_failure_propagates_without_another_retry(self) -> None:
        fallback_error = _status_error(401)
        self.request.side_effect = [_status_error(503)] * 3 + [fallback_error]
        with self.assertRaises(PooledHTTPStatusError) as raised:
            self.call()
        self.assertIs(raised.exception, fallback_error)
        self.assertEqual(self.request.call_count, 4)
        self.assertEqual(self.failed.call_count, 3)

    def test_retry_after_is_respected(self) -> None:
        self.request.side_effect = [_status_error(429, headers={'Retry-After': '7'}), self.success]
        self.assertIs(self.call(), self.success)
        self.sleep.assert_called_once_with(7)

    def test_long_retry_after_uses_fallback_without_retrying_primary_early(self) -> None:
        failure = _status_error(429, headers={'retry-after': '120'})
        self.request.side_effect = [failure, self.success]
        self.assertIs(self.call(), self.success)
        self.assertEqual(self.request.call_count, 2)
        self.assertEqual(self.request.call_args.args[1], OFFICIAL_RESPONSES_ENDPOINT)
        self.failed.assert_called_once_with()
        self.sleep.assert_not_called()

    def test_primary_attempt_setting_controls_threshold(self) -> None:
        self.request.side_effect = [_status_error(401), self.success]
        self.assertIs(self.call(primary_attempts=1), self.success)
        self.assertEqual(self.request.call_count, 2)
        self.assertEqual(self.request.call_args.args[1], OFFICIAL_RESPONSES_ENDPOINT)

    def test_provider_error_redacts_both_keys_and_unrecognized_openai_key(self) -> None:
        text = redact_provider_error(
            'Invalid primary-secret and official-secret with sk-proj-another_credential123',
            'primary-secret',
            'official-secret',
        )
        self.assertEqual(text, 'Invalid [REDACTED] and [REDACTED] with [REDACTED]')

    def test_fallback_warning_contains_no_credentials_or_provider_body(self) -> None:
        self.request.side_effect = [_status_error(401)] * 3 + [self.success]
        with self.assertLogs('app.services.openai_fallback', level='WARNING') as logs:
            self.call()
        self.assertEqual(len(logs.output), 1)
        for secret in ('primary-secret', 'official-secret', 'provider error', 'https://primary.example'):
            self.assertNotIn(secret, logs.output[0])


if __name__ == '__main__':
    unittest.main()
