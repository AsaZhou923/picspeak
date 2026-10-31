from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import BillingSubscription, BillingWebhookEvent
from app.services.billing_reconciliation import build_billing_reconciliation

NOW = datetime(2026, 10, 31, tzinfo=timezone.utc)


def event(name='subscription_payment_success', *, resource_id='inv_1', resource_type='subscription-invoices',
          test_mode=False, attributes=None, custom=None, outcome='payment_recorded'):
    return BillingWebhookEvent(
        provider='lemonsqueezy', event_name=name, resource_id=resource_id, resource_type=resource_type,
        test_mode=test_mode, outcome=outcome, created_at=NOW, payload_json={
            'meta': {'custom_data': custom or {}},
            'data': {'type': resource_type, 'id': resource_id, 'attributes': attributes or {}},
        },
    )


class BillingReconciliationTests(unittest.TestCase):
    def test_deduplicates_invoice_success_recovery_and_excludes_initial_checkout_order(self):
        attributes = {'status': 'paid', 'currency': 'USD', 'total': 399, 'tax': 30}
        report = build_billing_reconciliation([
            event(attributes=attributes),
            event('subscription_payment_recovered', attributes=attributes),
            event('order_created', resource_id='ord_1', resource_type='orders', attributes=attributes),
        ], [])
        self.assertEqual(report['unique_payment_transactions'], 1)
        self.assertEqual(report['duplicate_payment_callbacks'], 1)
        self.assertEqual(report['excluded_recurring_or_unclassified_order_callbacks'], 1)
        self.assertEqual(report['currency_totals']['USD']['known_gross_cents'], 399)
        self.assertEqual(report['currency_totals']['USD']['known_tax_cents'], 30)

    def test_missing_money_is_unknown_and_currencies_are_not_added_together(self):
        report = build_billing_reconciliation([
            event(attributes={'status': 'paid', 'currency': 'USD', 'total': 399}),
            event(resource_id='inv_2', attributes={'status': 'paid', 'currency': 'JPY', 'total': 600}),
            event(resource_id='inv_3'),
        ], [])
        self.assertEqual(report['unique_payment_transactions'], 3)
        self.assertEqual(report['gross_unknown_transactions'], 1)
        self.assertEqual(report['currency_totals']['USD']['known_gross_cents'], 399)
        self.assertEqual(report['currency_totals']['JPY']['known_gross_cents'], 600)
        self.assertEqual(report['currency_totals']['UNKNOWN']['gross_unknown_transactions'], 1)
        self.assertIsNone(report['provider_net_settlement'])

    def test_refund_is_transaction_level_and_active_subscription_is_a_manual_review_signal(self):
        report = build_billing_reconciliation([
            event(attributes={'status': 'paid', 'currency': 'USD', 'total': 399}),
            event('subscription_payment_refunded', attributes={
                'status': 'refunded', 'currency': 'USD', 'total': 399, 'refunded_amount': 399, 'subscription_id': 'sub_1',
            }),
            event('subscription_payment_refunded', attributes={
                'status': 'refunded', 'currency': 'USD', 'total': 399, 'refunded_amount': 399, 'subscription_id': 'sub_1',
            }),
        ], [BillingSubscription(provider='lemonsqueezy', provider_subscription_id='sub_1', status='active', test_mode=False)])
        self.assertEqual(report['unique_payment_transactions'], 1)
        self.assertEqual(report['fully_refunded_transactions'], 1)
        self.assertEqual(report['currency_totals']['USD']['known_refunded_cents'], 399)
        self.assertEqual(report['refunded_but_still_active_subscriptions'], 1)

    def test_partial_refund_keeps_unknown_refunded_amount_unknown(self):
        report = build_billing_reconciliation([
            event('subscription_payment_refunded', attributes={'status': 'partial_refund', 'currency': 'USD', 'total': 399}),
        ], [])
        self.assertEqual(report['partially_refunded_transactions'], 1)
        self.assertEqual(report['refund_amount_unknown_transactions'], 1)
        self.assertEqual(report['currency_totals']['USD']['refund_unknown_transactions'], 1)

    def test_live_and_test_transactions_never_share_a_deduplication_key(self):
        rows = [event(attributes={'status': 'paid', 'currency': 'USD', 'total': 399}),
                event(test_mode=True, attributes={'status': 'paid', 'currency': 'USD', 'total': 999})]
        self.assertEqual(build_billing_reconciliation(rows, [])['currency_totals']['USD']['known_gross_cents'], 399)
        self.assertEqual(build_billing_reconciliation(rows, [], test_mode=True)['currency_totals']['USD']['known_gross_cents'], 999)

    def test_pending_order_and_failed_invoice_are_not_revenue(self):
        report = build_billing_reconciliation([
            event('order_created', resource_type='orders', custom={'kind': 'image_credit_pack'}, attributes={'status': 'pending', 'total': 399}),
            event('subscription_payment_failed', resource_id='inv_2', outcome='payment_failed_recorded'),
        ], [])
        self.assertEqual(report['unique_payment_transactions'], 0)
        self.assertEqual(report['failed_or_pending_only_transactions'], 2)

    def test_unknown_mode_is_not_assumed_to_be_live(self):
        row = event(test_mode=None, attributes={'status': 'paid', 'currency': 'USD', 'total': 399})
        report = build_billing_reconciliation([row], [])
        self.assertEqual(report['unique_payment_transactions'], 0)
        self.assertEqual(report['unknown_mode_callbacks'], 1)

    def test_missing_latest_gross_cannot_be_filled_from_another_currency(self):
        report = build_billing_reconciliation([
            event(attributes={'status': 'paid', 'currency': 'USD', 'total': 399}),
            event('subscription_payment_refunded', attributes={'status': 'refunded', 'currency': 'JPY', 'refunded_amount': 600}),
        ], [])
        self.assertEqual(report['gross_unknown_transactions'], 1)
        self.assertEqual(report['currency_totals']['JPY']['known_gross_cents'], 0)

    def test_boolean_or_negative_money_does_not_become_known_revenue(self):
        for invalid in (True, -1, '399', 3.99):
            with self.subTest(invalid=invalid):
                report = build_billing_reconciliation([event(attributes={'status': 'paid', 'currency': 'USD', 'total': invalid})], [])
                self.assertEqual(report['gross_unknown_transactions'], 1)


if __name__ == '__main__':
    unittest.main()
