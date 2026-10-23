from __future__ import annotations

import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import BillingSubscription, BillingWebhookEvent, UsageLedger, User, UserPlan, UserStatus
from app.services.generation_credit_reservations import generation_credit_balance_snapshot
from app.services.lemonsqueezy_webhooks import LemonSqueezyWebhookEvent, process_lemonsqueezy_webhook_event
from app.services.operational_health import _is_credit_refund_entry

USER_PUBLIC_ID = 'usr_refund_owner'


def _user(plan: UserPlan = UserPlan.free) -> User:
    return User(
        id=71,
        public_id=USER_PUBLIC_ID,
        email='refund-owner@example.com',
        username='refund_owner',
        plan=plan,
        daily_quota_total=0,
        daily_quota_used=0,
        status=UserStatus.active,
    )


def _order_event(
    event_name: str,
    *,
    order_id: str = 'ord_300',
    status: str = 'refunded',
    custom: dict | None = None,
) -> LemonSqueezyWebhookEvent:
    data = {'type': 'orders', 'id': order_id, 'attributes': {'status': status, 'first_order_item': {}}}
    return LemonSqueezyWebhookEvent(
        event_name=event_name,
        payload={'meta': {'event_name': event_name}, 'data': data},
        meta={'custom_data': {'user_id': USER_PUBLIC_ID, **(custom or {})}},
        data=data,
        event_hash=f'hash_{event_name}_{order_id}_{status}',
        test_mode=False,
        resource_type='orders',
        resource_id=order_id,
    )


def _credit_grant(order_id: str = 'ord_300') -> UsageLedger:
    return UsageLedger(
        user_id=71,
        usage_type='image_generation_credit',
        amount=-300,
        unit='credits',
        metadata_json={'grant_type': 'lemonsqueezy_credit_pack', 'order_id': order_id, 'balance_version': 'persistent-v1'},
    )


def _one_time_subscription(order_id: str = 'ord_pro_30') -> BillingSubscription:
    now = datetime.now(timezone.utc)
    return BillingSubscription(
        id=81,
        user_id=71,
        provider='lemonsqueezy',
        provider_order_id=order_id,
        status='active',
        cancelled=True,
        ends_at=now + timedelta(days=20),
        raw_payload={'billing_access': {'billing_mode': 'one_time_pro', 'duration_days': 30}},
    )


def _db(user: User, *, ledger=(), subscriptions=(), webhook_events=()) -> MagicMock:
    db = MagicMock()

    def query(model, *_args):
        result = MagicMock()
        for method in ('filter', 'order_by', 'with_for_update', 'populate_existing'):
            getattr(result, method).return_value = result
        if model is User:
            result.first.return_value = user
            result.one.return_value = user
        elif model is UsageLedger:
            result.all.return_value = list(ledger)
        elif model is BillingSubscription:
            result.first.return_value = subscriptions[0] if subscriptions else None
            result.all.return_value = list(subscriptions)
        elif model is BillingWebhookEvent:
            result.all.return_value = list(webhook_events)
        return result

    db.query.side_effect = query
    return db


def _added(db: MagicMock, model) -> list:
    return [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], model)]


class CreditPackRefundTests(unittest.TestCase):
    def _process(self, db: MagicMock, event: LemonSqueezyWebhookEvent, *, purchased_remaining: int = 300):
        with patch(
            'app.services.lemonsqueezy_webhooks.generation_credit_balance_snapshot',
            return_value={'purchased_remaining': purchased_remaining},
        ):
            return process_lemonsqueezy_webhook_event(db, event)

    def test_full_refund_revokes_only_unspent_credits(self) -> None:
        db = _db(_user(), ledger=[_credit_grant()])

        outcome, user_public_id = self._process(db, _order_event('order_refunded'), purchased_remaining=120)

        self.assertEqual((outcome, user_public_id), ('credit_pack_refunded', USER_PUBLIC_ID))
        [revocation] = _added(db, UsageLedger)
        self.assertEqual(revocation.amount, 120)
        self.assertEqual(revocation.usage_type, 'image_generation_credit')
        self.assertEqual(revocation.metadata_json['grant_type'], 'lemonsqueezy_credit_pack_refund')
        self.assertEqual(revocation.metadata_json['credit_allocation'], {'version': 1, 'monthly': 0, 'purchased': 120})
        self.assertEqual(revocation.metadata_json['credits_already_spent'], 180)
        self.assertEqual(revocation.metadata_json['order_id'], 'ord_300')

    def test_full_refund_never_revokes_more_than_the_pack(self) -> None:
        db = _db(_user(), ledger=[_credit_grant()])

        self._process(db, _order_event('order_refunded'), purchased_remaining=900)

        self.assertEqual(_added(db, UsageLedger)[0].amount, 300)

    def test_repeated_refund_is_applied_once(self) -> None:
        previous = UsageLedger(
            amount=300,
            usage_type='image_generation_credit',
            metadata_json={'grant_type': 'lemonsqueezy_credit_pack_refund', 'order_id': 'ord_300'},
        )
        db = _db(_user(), ledger=[_credit_grant(), previous])

        outcome, _ = self._process(db, _order_event('order_refunded'))

        self.assertEqual(outcome, 'credit_pack_refund_already_applied')
        db.add.assert_not_called()

    def test_partial_refund_keeps_credits(self) -> None:
        db = _db(_user(), ledger=[_credit_grant()])

        outcome, _ = self._process(db, _order_event('order_refunded', status='partial_refund'))

        self.assertEqual(outcome, 'credit_pack_partial_refund_recorded')
        db.add.assert_not_called()

    def test_refund_received_before_purchase_blocks_the_grant(self) -> None:
        refund = SimpleNamespace(payload_json=_order_event('order_refunded').payload)
        db = _db(_user(), webhook_events=[refund])
        purchase = _order_event('order_created', status='paid', custom={'kind': 'image_credit_pack'})
        purchase.data['attributes']['first_order_item'] = {'variant_id': '1574509'}

        with patch('app.services.lemonsqueezy_webhooks.settings.lemonsqueezy_image_credit_pack_variant_id', '1574509'):
            outcome, _ = process_lemonsqueezy_webhook_event(db, purchase)

        self.assertEqual(outcome, 'ignored_credit_pack_already_refunded')
        db.add.assert_not_called()


class OneTimeProRefundTests(unittest.TestCase):
    def test_full_refund_ends_one_time_pro_access(self) -> None:
        user = _user(UserPlan.pro)
        subscription = _one_time_subscription()
        db = _db(user, subscriptions=[subscription])

        with patch('app.services.lemonsqueezy_webhooks.record_subscription_changed') as notify:
            outcome, _ = process_lemonsqueezy_webhook_event(db, _order_event('order_refunded', order_id='ord_pro_30'))

        self.assertEqual(outcome, 'one_time_pro_refunded')
        self.assertEqual(subscription.status, 'refunded')
        self.assertLessEqual(subscription.ends_at, datetime.now(timezone.utc))
        self.assertEqual(subscription.raw_payload['billing_access']['billing_mode'], 'one_time_pro')
        self.assertIn('refunded_at', subscription.raw_payload['billing_access'])
        self.assertEqual(user.plan, UserPlan.free)
        notify.assert_called_once()

    def test_repeated_one_time_pro_refund_is_a_no_op(self) -> None:
        subscription = _one_time_subscription()
        subscription.status = 'refunded'
        db = _db(_user(), subscriptions=[subscription])

        outcome, _ = process_lemonsqueezy_webhook_event(db, _order_event('order_refunded', order_id='ord_pro_30'))

        self.assertEqual(outcome, 'one_time_pro_refund_already_applied')
        db.add.assert_not_called()

    def test_partial_refund_keeps_one_time_pro(self) -> None:
        subscription = _one_time_subscription()
        db = _db(_user(UserPlan.pro), subscriptions=[subscription])

        outcome, _ = process_lemonsqueezy_webhook_event(
            db, _order_event('order_refunded', order_id='ord_pro_30', status='partial_refund'),
        )

        self.assertEqual(outcome, 'one_time_pro_partial_refund_recorded')
        self.assertEqual(subscription.status, 'active')

    def test_subscription_order_refund_leaves_subscription_state_to_subscription_events(self) -> None:
        subscription = _one_time_subscription(order_id='ord_sub_1')
        subscription.provider_subscription_id = 'sub_1'
        subscription.raw_payload = {}
        db = _db(_user(UserPlan.pro), subscriptions=[subscription])

        outcome, _ = process_lemonsqueezy_webhook_event(db, _order_event('order_refunded', order_id='ord_sub_1'))

        self.assertEqual(outcome, 'refund_recorded')
        self.assertEqual(subscription.status, 'active')
        db.add.assert_not_called()


class RefundLedgerAccountingTests(unittest.TestCase):
    def test_balance_snapshot_subtracts_revoked_credits_from_purchased_pool(self) -> None:
        today = date.today()
        grant = {'balance_version': 'persistent-v1', 'grant_type': 'lemonsqueezy_credit_pack'}
        spend = {'credit_allocation': {'version': 1, 'monthly': 0, 'purchased': 180}}
        refund = {
            'grant_type': 'lemonsqueezy_credit_pack_refund',
            'balance_version': 'persistent-v1',
            'credit_allocation': {'version': 1, 'monthly': 0, 'purchased': 120},
        }
        db = MagicMock()
        db.execute.return_value.all.return_value = [
            ('ledger', -300, today, grant, None),
            ('ledger', 180, today, spend, None),
            ('ledger', 120, today, refund, None),
        ]

        snapshot = generation_credit_balance_snapshot(db, _user(), plan=UserPlan.free)

        self.assertEqual(snapshot['purchased_total'], 300)
        self.assertEqual(snapshot['purchased_used'], 300)
        self.assertEqual(snapshot['purchased_remaining'], 0)

    def test_operational_health_does_not_count_refunds_as_spend(self) -> None:
        self.assertTrue(_is_credit_refund_entry(SimpleNamespace(metadata_json={'grant_type': 'lemonsqueezy_credit_pack_refund'})))
        self.assertFalse(_is_credit_refund_entry(SimpleNamespace(metadata_json={'credit_allocation': {}})))


if __name__ == '__main__':
    unittest.main()
