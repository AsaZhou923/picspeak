from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


SCRIPT_PATH = Path(__file__).resolve().parents[1] / 'scripts' / 'verify_notification_scale.py'
SPEC = importlib.util.spec_from_file_location('verify_notification_scale', SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
script = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(script)


class VerifyNotificationScaleScriptTests(unittest.TestCase):
    def test_create_database_rejects_existing_database_by_default(self) -> None:
        with patch.object(script, '_database_exists', return_value=True):
            with self.assertRaises(SystemExit) as rejected:
                script._create_database(MagicMock(), 'picspeak_existing')

        self.assertIn('already exists', str(rejected.exception))

    def test_verification_failures_include_api_visibility_and_processor_checks(self) -> None:
        result = {
            'status': 'ok',
            'target': {'api_p95_ms': 100.0},
            'list_query': {'p95_ms': 10.0},
            'unread_count_query': {'p95_ms': 11.0},
            'actual_api': {'p95_ms': 120.0},
            'visibility_mix': {
                'seed': {'status': 'ok'},
                'api': {'status': 'failed'},
            },
            'event_batch': {
                'status': 'ok',
                'processor': {'status': 'failed'},
            },
        }

        failures = script._verification_failures(result)

        self.assertEqual(failures, ['actual_api', 'visibility_mix.api', 'event_batch.processor'])


if __name__ == '__main__':
    unittest.main()
