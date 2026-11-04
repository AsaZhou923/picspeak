from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.reconcile_billing import main


class ReconcileBillingScriptTests(unittest.TestCase):
    def args(self):
        return ['--database-url', 'postgresql://fixture:fixture@localhost/unused',
                '--start-date', '2026-11-01', '--end-date', '2026-11-03']

    def test_default_stdout_requires_no_files_and_rolls_back(self):
        session = MagicMock()
        database = session.return_value.__enter__.return_value
        engine = MagicMock()
        report = {'unique_payment_transactions': 2, 'provider_net_settlement': None}
        output = io.StringIO()
        with patch('scripts.reconcile_billing.create_engine', return_value=engine), \
                patch('scripts.reconcile_billing.Session', session), \
                patch('scripts.reconcile_billing.load_billing_reconciliation', return_value=report) as load, \
                patch('scripts.reconcile_billing.Path.write_text') as write, contextlib.redirect_stdout(output):
            main(self.args())
        self.assertEqual(json.loads(output.getvalue()), report)
        write.assert_not_called()
        self.assertEqual(str(database.execute.call_args.args[0]), 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        database.rollback.assert_called_once()
        engine.dispose.assert_called_once()
        self.assertEqual(load.call_args.kwargs['end'].isoformat(), '2026-11-04T00:00:00+00:00')

    def test_explicit_output_writes_only_requested_temporary_file(self):
        scratch_root = Path('D:/Temp') if os.name == 'nt' else Path('/mnt/d/Temp') if Path('/mnt/d/Temp').is_dir() else None
        with tempfile.TemporaryDirectory(prefix='picspeak-remaining-analytics-test-', dir=scratch_root) as directory:
            target = Path(directory) / 'billing.json'
            with patch('scripts.reconcile_billing.create_engine'), patch('scripts.reconcile_billing.Session'), \
                    patch('scripts.reconcile_billing.load_billing_reconciliation', return_value={'received_callbacks': 1}), \
                    contextlib.redirect_stdout(io.StringIO()):
                main(self.args() + ['--output', str(target)])
            self.assertEqual(json.loads(target.read_text(encoding='utf-8')), {'received_callbacks': 1})

    def test_application_repository_output_and_negative_window_rejected_before_connect(self):
        for args in (
            self.args() + ['--output', str(BACKEND_ROOT / 'must-not-write.json')],
            ['--database-url', 'postgresql://fixture@localhost/unused', '--start-date', '2026-11-04', '--end-date', '2026-11-01'],
        ):
            with self.subTest(args=args), patch('scripts.reconcile_billing.create_engine') as connect, \
                    contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as result:
                main(args)
            self.assertEqual(result.exception.code, 2)
            connect.assert_not_called()

    def test_failure_rolls_back_and_redacts_database_error(self):
        session = MagicMock()
        database = session.return_value.__enter__.return_value
        error = io.StringIO()
        with patch('scripts.reconcile_billing.create_engine') as connect, \
                patch('scripts.reconcile_billing.Session', session), \
                patch('scripts.reconcile_billing.load_billing_reconciliation', side_effect=RuntimeError('private-connection-secret')), \
                contextlib.redirect_stderr(error), self.assertRaises(SystemExit) as result:
            main(self.args())
        self.assertEqual(result.exception.code, 1)
        self.assertNotIn('private-connection-secret', error.getvalue())
        database.rollback.assert_called_once()
        connect.return_value.dispose.assert_called_once()


if __name__ == '__main__':
    unittest.main()
