from __future__ import annotations

import contextlib
import copy
import io
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.monetization_baseline import (
    build_monetization_baseline, load_monetization_baseline, summarize_local_configuration, utc,
)
from scripts.export_monetization_baseline import main


START = utc('2026-10-01T00:00:00Z')
END = utc('2026-11-01T00:00:00Z')


def data():
    return {
        'users': [
            {'id': 1, 'public_id': 'owner', 'plan': 'free', 'created_at': '2026-09-30T23:59:59Z'},
            {'id': 2, 'public_id': 'guest', 'plan': 'guest', 'created_at': '2026-10-01T00:00:00Z'},
            {'id': 3, 'public_id': 'next-month', 'plan': 'free', 'created_at': '2026-11-01T00:00:00Z'},
        ],
        'reviews': [
            {'public_id': 'r1', 'owner_user_id': 1, 'status': 'SUCCEEDED', 'created_at': '2026-10-02T10:00:00Z'},
            {'public_id': 'r2', 'owner_user_id': 2, 'status': 'SUCCEEDED', 'created_at': '2026-10-31T23:59:59Z'},
            {'public_id': 'failed', 'owner_user_id': 1, 'status': 'FAILED', 'created_at': '2026-10-03T00:00:00Z'},
        ],
        'views': [
            {'user_public_id': 'owner', 'review_id': 'r1', 'created_at': '2026-10-02T10:01:00Z'},
            {'user_public_id': 'owner', 'review_id': 'r1', 'created_at': '2026-10-02T10:02:00Z'},
            {'user_public_id': 'guest', 'review_id': 'r1', 'created_at': '2026-10-02T10:03:00Z'},
            {'user_public_id': 'guest', 'review_id': 'r2', 'created_at': '2026-11-01T00:00:00Z'},
        ],
        'payments': [
            {'resource_id': 'invoice1', 'user_id': 1, 'event_name': 'subscription_payment_success',
             'outcome': 'payment_recorded', 'test_mode': False, 'occurred_at': '2026-09-30T00:00:00Z'},
            {'resource_id': 'invoice2', 'user_id': 1, 'event_name': 'subscription_payment_success',
             'outcome': 'payment_recorded', 'test_mode': False, 'occurred_at': '2026-10-30T00:00:00Z'},
            {'resource_id': 'order2', 'user_id': 1, 'event_name': 'order_created',
             'outcome': 'order_recorded', 'test_mode': False, 'occurred_at': '2026-10-30T00:00:00Z'},
            {'resource_id': 'order3', 'user_id': 2, 'event_name': 'order_created',
             'outcome': 'credit_pack_granted', 'test_mode': True, 'occurred_at': '2026-10-04T00:00:00Z'},
            {'resource_id': 'order4', 'user_id': 3, 'event_name': 'order_created',
             'outcome': 'one_time_pro_granted', 'test_mode': None, 'occurred_at': '2026-10-05T00:00:00Z'},
        ],
        'activations': [{'id': 1, 'redeemed_at': '2026-10-05T00:00:00Z'}],
    }


class MonetizationBaselineTests(unittest.TestCase):
    def snapshot(self, rows=None):
        return build_monetization_baseline(rows or data(), start=START, end=END)

    def test_review_rows_not_client_success_and_owner_view_deduplication(self):
        result = self.snapshot()
        self.assertEqual(result['user_records_created'], {'guest': 1, 'registered': 0})
        self.assertEqual(result['successful_reviews']['registered'], {'reviews': 1, 'distinct_owners': 1})
        self.assertEqual(result['successful_reviews']['guest'], {'reviews': 1, 'distinct_owners': 1})
        self.assertEqual(result['owner_view_proxy']['reviews'], 1)
        self.assertEqual(result['owner_view_proxy']['rate'], 0.5)
        self.assertEqual(result['owner_view_proxy']['unmatched_or_non_owner_event_rows'], 1)

    def test_duplicate_callback_renewal_test_and_legacy_environment(self):
        rows = data()
        rows['payments'].append(copy.deepcopy(rows['payments'][1]))
        rows['payments'].append({**rows['payments'][3], 'event_name': 'order_refunded', 'outcome': 'credit_pack_refunded'})
        rows['payments'].append(copy.deepcopy(rows['payments'][-1]))
        result = self.snapshot(rows)['payments']
        self.assertEqual(result['deduplicated_successful_transactions']['live']['subscription'], 1)
        self.assertEqual(result['deduplicated_successful_transactions']['test']['image_credit_pack'], 1)
        self.assertEqual(result['deduplicated_successful_transactions']['unknown']['legacy_pass'], 1)
        self.assertEqual(result['first_observed_paying_users'], {'live': 0, 'test': 1, 'unknown': 1})
        self.assertEqual(result['refund_resources_observed'], 1)
        self.assertEqual(result['activation_code_redemptions_not_assumed_paid'], 1)
        self.assertIsNone(result['settled_revenue_net_fees_tax_currency'])

    def test_missing_data_fails_and_empty_denominator_is_unknown(self):
        with self.assertRaises(ValueError):
            self.snapshot({'users': []})
        result = self.snapshot({key: [] for key in data()})
        self.assertIsNone(result['owner_view_proxy']['rate'])
        with self.assertRaises(ValueError):
            build_monetization_baseline(data(), start=END, end=START)
        with self.assertRaises(ValueError):
            utc(datetime(2026, 10, 1))

    def test_read_only_guard_fails_before_any_business_select(self):
        calls = []

        class Connection:
            dialect = SimpleNamespace(name='postgresql')

            def execute(self, statement):
                calls.append(str(statement))
                return SimpleNamespace(scalar_one=lambda: 'off')

        with self.assertRaisesRegex(ValueError, 'read-only'):
            load_monetization_baseline(Connection(), start=START, end=END)
        self.assertEqual(calls, ['SHOW transaction_read_only'])

    def test_current_entitlements_keep_overlapping_grants_but_dedupe_users(self):
        rows = data()
        rows['subscriptions'] = [
            {'user_id': 1, 'provider': 'lemonsqueezy', 'status': 'active', 'test_mode': False, 'ends_at': None},
            {'user_id': 1, 'provider': 'activation_code', 'status': 'active', 'test_mode': False, 'ends_at': '2026-11-01T00:00:00Z'},
            {'user_id': 2, 'provider': 'lemonsqueezy', 'status': 'cancelled', 'test_mode': False,
             'ends_at': '2026-11-01T00:00:00Z', 'billing_mode': 'one_time_pro'},
            {'user_id': 3, 'provider': 'lemonsqueezy', 'status': 'expired', 'test_mode': False, 'ends_at': None},
            {'user_id': 4, 'provider': 'lemonsqueezy', 'status': 'active', 'test_mode': True, 'ends_at': None},
            {'user_id': 5, 'provider': 'lemonsqueezy', 'status': 'active', 'test_mode': None, 'ends_at': None},
            {'user_id': 6, 'provider': 'lemonsqueezy', 'status': 'cancelled', 'test_mode': False, 'ends_at': '2026-10-31T00:00:00Z'},
        ]
        result = build_monetization_baseline(rows, start=START, end=END, as_of=utc('2026-10-31T00:00:00Z'))
        entitlements = result['current_entitlements']
        self.assertEqual(entitlements['active_live_grants_by_kind'], {'subscription': 1, 'activation_code': 1, 'legacy_pass': 1})
        self.assertEqual(entitlements['distinct_active_live_users'], 2)
        self.assertEqual(entitlements['excluded_test_or_unknown_rows'], {'test': 1, 'unknown': 1})
        self.assertFalse(entitlements['historical_reconstruction'])

    def test_configuration_only_includes_whitelisted_values(self):
        from app.core.config import Settings

        settings = Settings(_env_file=None, app_secret='secret-must-never-be-printed',
                            lemonsqueezy_pro_checkout_url='https://secret.invalid/private',
                            guest_review_limit_per_day=1)
        result = summarize_local_configuration(settings)
        self.assertEqual(result['values']['guest_review_limit_per_day'], {'default': 3, 'loaded': 1})
        self.assertNotIn('secret-must-never-be-printed', json.dumps(result))
        self.assertNotIn('secret.invalid', json.dumps(result))
        self.assertIsNone(result['provider_product_price_tax_cycle'])

    def test_cli_offline_ignores_environment_database_and_redacts_failure(self):
        scratch_root = Path('D:/Temp') if os.name == 'nt' else Path('/mnt/d/Temp') if Path('/mnt/d/Temp').is_dir() else None
        if scratch_root is not None:
            scratch_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='picspeak-p0-analytics-tests-', dir=scratch_root) as directory:
            fixture = Path(directory) / 'input.json'
            fixture.write_text(json.dumps(data()), encoding='utf-8')
            output = io.StringIO()
            with patch.dict(os.environ, {'DATABASE_URL': 'must-not-connect'}), contextlib.redirect_stdout(output):
                code = main(['--fixtures', str(fixture), '--start', START.isoformat(), '--end', END.isoformat()])
            self.assertEqual(code, 0)
            report = json.loads(output.getvalue())
            self.assertIn('NOT production', report['source'])
            self.assertIsNone(report['configuration'])
            fixture.write_text('{invalid secret-content', encoding='utf-8')
            output_file = Path(directory) / 'must-not-exist.json'
            error = io.StringIO()
            with contextlib.redirect_stderr(error):
                code = main(['--fixtures', str(fixture), '--start', START.isoformat(), '--end', END.isoformat(), '--output', str(output_file)])
            self.assertEqual(code, 1)
            self.assertFalse(output_file.exists())
            self.assertNotIn('secret-content', error.getvalue())


if __name__ == '__main__':
    unittest.main()
