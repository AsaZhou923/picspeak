"""Synthetic invoice/state events; no provider calls, transactions or production data."""
from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import BillingSubscription, BillingWebhookEvent, User, UserPlan, UserStatus
from app.services.lemonsqueezy_webhooks import LemonSqueezyWebhookEvent, process_lemonsqueezy_webhook_event

T0 = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)
T1 = T0 + timedelta(minutes=1)


def payment_event(timestamp: datetime | None = T1, *, invoice_id: str = 'invoice_1', created_at: datetime | None = None,
                  event_name: str = 'subscription_payment_success', status: str | None = None):
    attributes = {'subscription_id': 'subscription_1'}
    if timestamp is not None:
        attributes['updated_at'] = timestamp.isoformat()
    if created_at is not None:
        attributes['created_at'] = created_at.isoformat()
    if status is not None:
        attributes['status'] = status
    return LemonSqueezyWebhookEvent(
        event_name=event_name, payload={}, meta={},
        data={'type': 'subscription-invoices', 'id': invoice_id, 'attributes': attributes},
        event_hash=f'payment_{invoice_id}', test_mode=False,
        resource_type='subscription-invoices', resource_id=invoice_id,
    )


def state_event(timestamp: datetime = T1, *, status: str = 'active'):
    return LemonSqueezyWebhookEvent(
        event_name='subscription_updated', payload={}, meta={},
        data={
            'type': 'subscriptions', 'id': 'subscription_1',
            'attributes': {'status': status, 'variant_id': 'pro_variant', 'updated_at': timestamp.isoformat()},
        },
        event_hash=f'state_{timestamp}_{status}', test_mode=False,
        resource_type='subscriptions', resource_id='subscription_1',
    )


@patch('app.services.lemonsqueezy_webhooks.settings.lemonsqueezy_webhook_test_mode', False)
class LemonSqueezyPaymentOrderingTests(unittest.TestCase):
    def setUp(self):
        self.user = User(id=1, public_id='usr_payment_ordering', email='ordering@example.test',
                         username='ordering', plan=UserPlan.free, status=UserStatus.active)
        self.subscription = BillingSubscription(
            id=1, user_id=1, provider='lemonsqueezy', provider_subscription_id='subscription_1',
            variant_id='pro_variant', status='past_due', cancelled=False,
            last_event_name='subscription_updated', last_event_at=T0,
            raw_payload=state_event(T0, status='past_due').data,
        )
        self.db = MagicMock()
        # Use the real plan synchronization against our synthetic subscription.
        self.db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [self.subscription]
        for target, kwargs in (
            ('_match_user_for_event', {'return_value': self.user}),
            ('_lookup_subscription', {'return_value': self.subscription}),
            ('_utc_now', {'return_value': T1 + timedelta(seconds=5)}),
            ('record_subscription_changed', {}),
            ('record_product_event', {}),
            ('_processed_invoice_events', {'return_value': []}),
            ('retrieve_subscription', {'side_effect': AssertionError('No provider calls allowed')}),
            ('settings.lemonsqueezy_pro_variant_id', {'new': 'pro_variant'}),
        ):
            patcher = patch(f'app.services.lemonsqueezy_webhooks.{target}', **kwargs)
            self.addCleanup(patcher.stop)
            setattr(self, target.split('.')[-1], patcher.start())

    def process(self, event):
        return process_lemonsqueezy_webhook_event(self.db, event)

    def assert_recovered(self):
        self.assertEqual(self.subscription.status, 'active')
        self.assertEqual(self.user.plan, UserPlan.pro)
        self.assertEqual(self.subscription.last_event_at, T1)
        self.assertEqual(self.subscription.last_event_name, 'subscription_updated')
        self.assertEqual(self.subscription.last_payment_at, T1)

    def test_payment_before_equal_time_subscription_update_recovers_access(self):
        self.assertEqual(self.process(payment_event())[0], 'payment_recorded')
        self.assertEqual(self.subscription.last_event_at, T0)
        self.assertEqual(self.subscription.last_event_name, 'subscription_updated')
        self.assertEqual(self.user.plan, UserPlan.free)
        self.process(state_event())
        self.assert_recovered()
        self.record_subscription_changed.assert_called_once()

    def test_subscription_update_before_equal_time_payment_has_same_result(self):
        self.process(state_event())
        self.process(payment_event())
        self.assert_recovered()
        self.record_subscription_changed.assert_called_once()

    def test_later_invoice_does_not_block_earlier_valid_subscription_snapshot(self):
        self.process(payment_event(T1 + timedelta(seconds=2)))
        self.process(state_event())
        self.assertEqual(self.subscription.status, 'active')
        self.assertEqual(self.user.plan, UserPlan.pro)
        self.assertEqual(self.subscription.last_event_at, T1)

    def test_stale_subscription_and_duplicate_do_not_revert_or_notify_twice(self):
        self.process(payment_event())
        self.process(state_event())
        self.process(state_event(T0, status='past_due'))
        self.process(state_event())
        self.assert_recovered()
        self.record_subscription_changed.assert_called_once()

    def test_old_invoice_cannot_regress_state_watermark_or_newer_payment_metadata(self):
        self.process(state_event())
        self.process(payment_event())
        self.process(payment_event(T0, invoice_id='old_invoice'))
        self.assert_recovered()
        self.assertEqual(self.subscription.last_invoice_id, 'invoice_1')
        self.record_subscription_changed.assert_called_once()

    def test_payment_created_at_is_fallback_provider_timestamp(self):
        self.process(payment_event(None, created_at=T1))
        self.process(state_event())
        self.assert_recovered()

    def test_payment_without_timestamp_does_not_write_receipt_time_as_state_watermark(self):
        self.process(payment_event(None))
        self.assertEqual(self.subscription.last_event_at, T0)
        self.assertIsNone(self.subscription.last_payment_at)
        self.process(state_event())
        self.assertEqual(self.user.plan, UserPlan.pro)
        self.assertEqual(self.subscription.last_event_at, T1)

    def test_legacy_receipt_time_watermark_uses_saved_provider_timestamp(self):
        self.subscription.last_event_name = 'subscription_payment_success'
        self.subscription.last_event_at = T1 + timedelta(seconds=5)
        self.process(state_event())
        self.assertEqual(self.user.plan, UserPlan.pro)
        self.assertEqual(self.subscription.last_event_at, T1)
        self.assertEqual(self.subscription.last_event_name, 'subscription_updated')

    def test_legacy_receipt_time_watermark_accepts_equal_time_portal_refreshed_snapshot(self):
        self.subscription.last_event_name = 'subscription_payment_success'
        self.subscription.last_event_at = T1 + timedelta(seconds=5)
        # Portal refresh stores raw provider data without applying subscription state.
        self.subscription.raw_payload = state_event().data
        self.process(state_event())
        self.assertEqual(self.user.plan, UserPlan.pro)
        self.assertEqual(self.subscription.last_event_at, T1)
        self.record_subscription_changed.assert_called_once()

    def test_legacy_watermark_still_rejects_genuinely_older_subscription(self):
        self.subscription.status = 'active'
        self.subscription.last_event_name = 'subscription_payment_success'
        self.subscription.last_event_at = T1 + timedelta(seconds=5)
        self.subscription.raw_payload = state_event().data
        self.process(state_event(T0, status='past_due'))
        self.assertEqual(self.subscription.status, 'active')
        self.assertEqual(self.user.plan, UserPlan.pro)
        self.record_subscription_changed.assert_not_called()

    def test_legacy_watermark_without_provider_timestamp_accepts_authoritative_snapshot(self):
        self.subscription.last_event_name = 'subscription_payment_success'
        self.subscription.last_event_at = T1 + timedelta(seconds=5)
        self.subscription.raw_payload = {}
        self.process(state_event())
        self.assertEqual(self.user.plan, UserPlan.pro)
        self.assertEqual(self.subscription.last_event_at, T1)

    def test_payment_failed_only_records_invoice_status(self):
        self.subscription.status = 'active'
        outcome, _ = self.process(payment_event(event_name='subscription_payment_failed'))
        self.assertEqual(outcome, 'payment_failed_recorded')
        self.assertEqual(self.subscription.last_payment_status, 'failed')
        self.assertEqual(self.subscription.last_payment_at, T1)
        self.assertEqual(self.subscription.status, 'active')
        self.assertEqual(self.subscription.last_event_at, T0)
        self.record_product_event.assert_not_called()

    def test_full_subscription_refund_records_invoice_without_cancelling_access(self):
        self.subscription.status = 'active'
        outcome, _ = self.process(payment_event(event_name='subscription_payment_refunded', status='refunded'))
        self.assertEqual(outcome, 'payment_refunded')
        self.assertEqual(self.subscription.last_payment_status, 'refunded')
        self.assertEqual(self.user.plan, UserPlan.pro)
        self.assertEqual(self.subscription.status, 'active')
        self.record_product_event.assert_not_called()

    def test_partial_subscription_refund_is_recorded_for_manual_reconciliation(self):
        outcome, _ = self.process(payment_event(event_name='subscription_payment_refunded', status='partial_refund'))
        self.assertEqual(outcome, 'payment_partial_refund_recorded')
        self.assertEqual(self.subscription.last_payment_status, 'partial_refund')

    def test_expired_snapshot_removes_only_this_subscription_access(self):
        self.subscription.status = 'active'
        self.user.plan = UserPlan.pro
        expired = state_event(status='expired')
        expired.event_name = 'subscription_expired'
        self.process(expired)
        self.assertEqual(self.subscription.status, 'expired')
        self.assertEqual(self.user.plan, UserPlan.free)

    def test_expired_subscription_preserves_an_independent_activation_grant(self):
        activation = BillingSubscription(id=2, user_id=1, provider='activation_code', status='active',
                                         ends_at=T1 + timedelta(days=30))
        self.db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [self.subscription, activation]
        with patch('app.services.billing_access.utc_now', return_value=T1):
            self.process(state_event(status='expired'))
        self.assertEqual(self.user.plan, UserPlan.pro)

    def test_cancelled_snapshot_keeps_paid_period_until_its_end(self):
        cancelled = state_event(status='cancelled')
        cancelled.event_name = 'subscription_cancelled'
        cancelled.data['attributes']['ends_at'] = (T1 + timedelta(days=10)).isoformat()
        with patch('app.services.billing_access.utc_now', return_value=T1):
            self.process(cancelled)
        self.assertEqual(self.user.plan, UserPlan.pro)

    def test_success_and_recovered_for_same_invoice_emit_one_purchase(self):
        self.process(payment_event(event_name='subscription_payment_recovered'))
        outcome, _ = self.process(payment_event())
        self.assertEqual(outcome, 'payment_already_recorded')
        self.record_product_event.assert_called_once()

    def test_old_invoice_duplicate_is_deduplicated_by_processed_business_key(self):
        self._processed_invoice_events.return_value = [BillingWebhookEvent(outcome='payment_recorded', event_name='subscription_payment_success')]
        outcome, _ = self.process(payment_event(invoice_id='old_invoice'))
        self.assertEqual(outcome, 'payment_already_recorded')
        self.record_product_event.assert_not_called()

    def test_refund_first_does_not_become_a_fresh_purchase_when_success_arrives_late(self):
        self.process(payment_event(event_name='subscription_payment_refunded', status='refunded'))
        outcome, _ = self.process(payment_event())
        self.assertEqual(outcome, 'payment_already_refunded')
        self.assertEqual(self.subscription.last_payment_status, 'refunded')
        self.record_product_event.assert_not_called()

    def test_equal_time_refund_wins_over_success_and_failure(self):
        self.process(payment_event())
        self.process(payment_event(event_name='subscription_payment_refunded', status='refunded'))
        self.process(payment_event(event_name='subscription_payment_failed'))
        self.assertEqual(self.subscription.last_payment_status, 'refunded')
        self.record_product_event.assert_called_once()

    def test_old_failure_does_not_replace_newer_success(self):
        self.process(payment_event())
        self.process(payment_event(T0, invoice_id='old_invoice', event_name='subscription_payment_failed'))
        self.assertEqual(self.subscription.last_payment_status, 'success')
        self.assertEqual(self.subscription.last_invoice_id, 'invoice_1')

    def test_same_invoice_later_failure_cannot_undo_a_refund(self):
        self.process(payment_event(event_name='subscription_payment_refunded', status='refunded'))
        self.process(payment_event(T1 + timedelta(minutes=10), event_name='subscription_payment_failed'))
        self.assertEqual(self.subscription.last_payment_status, 'refunded')
        self.assertEqual(self.subscription.last_payment_at, T1)

    def test_unknown_variant_is_rejected_before_an_active_row_is_persisted(self):
        event = state_event()
        event.data['attributes']['variant_id'] = 'unknown_variant'
        self.assertEqual(self.process(event)[0], 'ignored_non_pro_variant')
        self.assertEqual(self.subscription.status, 'past_due')
        self.db.add.assert_not_called()

    def test_production_rejects_test_events_even_if_webhook_setting_is_test(self):
        event = state_event()
        event.test_mode = True
        with patch('app.services.lemonsqueezy_webhooks.settings.app_env', 'production'), patch(
            'app.services.lemonsqueezy_webhooks.settings.lemonsqueezy_webhook_test_mode', True
        ):
            self.assertEqual(self.process(event), ('ignored_payment_mode_mismatch', None))
        self._match_user_for_event.assert_not_called()
        self.db.add.assert_not_called()

    def test_live_and_test_receivers_only_accept_their_configured_mode(self):
        event = state_event()
        event.test_mode = True
        self.assertEqual(self.process(event)[0], 'ignored_payment_mode_mismatch')
        event.test_mode = False
        with patch('app.services.lemonsqueezy_webhooks.settings.lemonsqueezy_webhook_test_mode', True):
            self.assertEqual(self.process(event)[0], 'ignored_payment_mode_mismatch')

    def test_disagreeing_meta_and_resource_test_mode_are_rejected(self):
        event = state_event()
        event.data['attributes']['test_mode'] = True
        self.assertEqual(self.process(event)[0], 'ignored_payment_mode_mismatch')

    def test_payment_event_with_subscription_resource_is_rejected(self):
        event = state_event()
        event.event_name = 'subscription_payment_success'
        self.assertEqual(self.process(event)[0], 'ignored_resource_mismatch')


if __name__ == '__main__':
    unittest.main()
