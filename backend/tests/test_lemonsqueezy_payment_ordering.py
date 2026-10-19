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

from app.db.models import BillingSubscription, User, UserPlan, UserStatus
from app.services.lemonsqueezy_webhooks import LemonSqueezyWebhookEvent, process_lemonsqueezy_webhook_event

T0 = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)
T1 = T0 + timedelta(minutes=1)


def payment_event(timestamp: datetime | None = T1, *, invoice_id: str = 'invoice_1', created_at: datetime | None = None):
    attributes = {'subscription_id': 'subscription_1'}
    if timestamp is not None:
        attributes['updated_at'] = timestamp.isoformat()
    if created_at is not None:
        attributes['created_at'] = created_at.isoformat()
    return LemonSqueezyWebhookEvent(
        event_name='subscription_payment_success', payload={}, meta={},
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


if __name__ == '__main__':
    unittest.main()
