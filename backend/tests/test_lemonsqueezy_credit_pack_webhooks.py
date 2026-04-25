from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import BillingSubscription, UsageLedger, User, UserPlan, UserStatus
from app.core.security import sign_payload
from app.services.lemonsqueezy_webhooks import LemonSqueezyWebhookEvent, process_lemonsqueezy_webhook_event


def _credit_pack_event() -> LemonSqueezyWebhookEvent:
    return LemonSqueezyWebhookEvent(
        event_name='order_created',
        payload={},
        meta={
            'custom_data': {
                'user_id': 'usr_credit_pack_paid',
                'kind': 'image_credit_pack',
                'pack': 'image_credits_300',
                'credits': '300',
            }
        },
        data={'type': 'orders', 'id': 'ord_300'},
        event_hash='hash_credit_pack',
        test_mode=False,
        resource_type='orders',
        resource_id='ord_300',
    )


def _one_time_pro_grant_token(user_public_id: str) -> str:
    return sign_payload(
        {
            'purpose': 'lemonsqueezy_one_time_pro',
            'user_id': user_public_id,
            'plan': 'pro',
            'billing_mode': 'one_time_pro',
            'duration_days': 30,
        },
        ttl_seconds=3600,
    )


def _one_time_pro_event(*, grant_token: str | None = None, variant_id: str = '1418094') -> LemonSqueezyWebhookEvent:
    user_public_id = 'usr_one_time_pro_paid'
    return LemonSqueezyWebhookEvent(
        event_name='order_created',
        payload={},
        meta={
            'custom_data': {
                'user_id': user_public_id,
                'plan': 'pro',
                'billing_mode': 'one_time_pro',
                'duration_days': '30',
                'grant_token': grant_token if grant_token is not None else _one_time_pro_grant_token(user_public_id),
                'locale': 'zh',
            }
        },
        data={
            'type': 'orders',
            'id': 'ord_pro_30',
            'attributes': {
                'order_id': 'ord_pro_30',
                'status': 'paid',
                'first_order_item': {
                    'variant_id': variant_id,
                    'product_name': 'PicSpeak Pro',
                    'variant_name': '30-day Pro',
                },
            },
        },
        event_hash='hash_one_time_pro',
        test_mode=False,
        resource_type='orders',
        resource_id='ord_pro_30',
    )


class LemonSqueezyCreditPackWebhookTests(unittest.TestCase):
    def test_order_created_grants_image_credit_pack_once(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = User(
            id=51,
            public_id='usr_credit_pack_paid',
            email='paid-credit@example.com',
            username='paid_credit',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        db.query.return_value.filter.return_value.all.return_value = []

        with patch('app.services.lemonsqueezy_webhooks.record_product_event') as record_product_event:
            outcome, user_public_id = process_lemonsqueezy_webhook_event(db, _credit_pack_event())

        self.assertEqual(outcome, 'credit_pack_granted')
        self.assertEqual(user_public_id, 'usr_credit_pack_paid')
        ledger = db.add.call_args.args[0]
        self.assertIsInstance(ledger, UsageLedger)
        self.assertEqual(ledger.usage_type, 'image_generation_credit')
        self.assertEqual(ledger.amount, -300)
        self.assertEqual(ledger.unit, 'credits')
        self.assertEqual(ledger.metadata_json['grant_type'], 'lemonsqueezy_credit_pack')
        self.assertEqual(ledger.metadata_json['pack'], 'image_credits_300')
        self.assertEqual(ledger.metadata_json['order_id'], 'ord_300')
        record_product_event.assert_called_once()

    def test_order_created_skips_duplicate_credit_pack_grant(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = User(
            id=52,
            public_id='usr_credit_pack_duplicate',
            email='duplicate-credit@example.com',
            username='duplicate_credit',
            plan=UserPlan.pro,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        db.query.return_value.filter.return_value.all.return_value = [
            MagicMock(metadata_json={'grant_type': 'lemonsqueezy_credit_pack', 'order_id': 'ord_300'})
        ]

        with patch('app.services.lemonsqueezy_webhooks.record_product_event') as record_product_event:
            outcome, user_public_id = process_lemonsqueezy_webhook_event(db, _credit_pack_event())

        self.assertEqual(outcome, 'credit_pack_already_granted')
        self.assertEqual(user_public_id, 'usr_credit_pack_duplicate')
        db.add.assert_not_called()
        record_product_event.assert_not_called()

    def test_order_created_grants_one_time_pro_without_auto_renewal(self) -> None:
        user = User(
            id=53,
            public_id='usr_one_time_pro_paid',
            email='one-time-pro@example.com',
            username='one_time_pro',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        db = MagicMock()
        user_query = MagicMock()
        user_query.filter.return_value.first.return_value = user
        missing_subscription_query = MagicMock()
        missing_subscription_query.filter.return_value = missing_subscription_query
        missing_subscription_query.order_by.return_value = missing_subscription_query
        missing_subscription_query.first.return_value = None
        active_subscription_query = MagicMock()
        active_subscription_query.filter.return_value = active_subscription_query
        active_subscription_query.order_by.return_value = active_subscription_query
        active_subscription_query.all.side_effect = lambda: [
            item for item in [call.args[0] for call in db.add.call_args_list] if isinstance(item, BillingSubscription)
        ]
        db.query.side_effect = [user_query, missing_subscription_query, missing_subscription_query, active_subscription_query]

        with patch('app.services.lemonsqueezy_webhooks.settings.lemonsqueezy_zh_pro_variant_id', '1418094'), patch(
            'app.services.lemonsqueezy_webhooks.settings.lemonsqueezy_pro_variant_id',
            '1417896',
        ), patch(
            'app.services.lemonsqueezy_webhooks.record_product_event'
        ) as record_product_event:
            outcome, user_public_id = process_lemonsqueezy_webhook_event(db, _one_time_pro_event())

        self.assertEqual(outcome, 'one_time_pro_granted')
        self.assertEqual(user_public_id, 'usr_one_time_pro_paid')
        self.assertEqual(user.plan, UserPlan.pro)
        subscriptions = [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], BillingSubscription)]
        self.assertTrue(subscriptions)
        subscription = subscriptions[-1]
        self.assertEqual(subscription.provider, 'lemonsqueezy')
        self.assertEqual(subscription.provider_order_id, 'ord_pro_30')
        self.assertEqual(subscription.status, 'active')
        self.assertTrue(subscription.cancelled)
        self.assertIsNone(subscription.renews_at)
        self.assertIsNotNone(subscription.ends_at)
        self.assertGreater(subscription.ends_at, datetime.now(timezone.utc) + timedelta(days=29))
        self.assertEqual(subscription.raw_payload['billing_access']['billing_mode'], 'one_time_pro')
        self.assertFalse(subscription.raw_payload['billing_access']['renews'])
        record_product_event.assert_called_once()

    def test_order_created_rejects_one_time_pro_without_valid_grant_token(self) -> None:
        user = User(
            id=54,
            public_id='usr_one_time_pro_paid',
            email='invalid-one-time-pro@example.com',
            username='invalid_one_time_pro',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = user

        with patch('app.services.lemonsqueezy_webhooks.settings.lemonsqueezy_zh_pro_variant_id', '1418094'), patch(
            'app.services.lemonsqueezy_webhooks.record_product_event'
        ) as record_product_event:
            outcome, user_public_id = process_lemonsqueezy_webhook_event(
                db,
                _one_time_pro_event(grant_token='not-a-valid-token'),
            )

        self.assertEqual(outcome, 'ignored_one_time_pro_grant_invalid')
        self.assertEqual(user_public_id, 'usr_one_time_pro_paid')
        self.assertEqual(user.plan, UserPlan.free)
        db.add.assert_not_called()
        record_product_event.assert_not_called()

    def test_order_created_rejects_one_time_pro_wrong_variant(self) -> None:
        user = User(
            id=55,
            public_id='usr_one_time_pro_paid',
            email='wrong-variant@example.com',
            username='wrong_variant',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        db = MagicMock()
        user_query = MagicMock()
        user_query.filter.return_value.first.return_value = user
        missing_subscription_query = MagicMock()
        missing_subscription_query.filter.return_value = missing_subscription_query
        missing_subscription_query.order_by.return_value = missing_subscription_query
        missing_subscription_query.first.return_value = None
        db.query.side_effect = [user_query, missing_subscription_query, missing_subscription_query]

        with patch('app.services.lemonsqueezy_webhooks.settings.lemonsqueezy_zh_pro_variant_id', '1418094'), patch(
            'app.services.lemonsqueezy_webhooks.record_product_event'
        ) as record_product_event:
            outcome, user_public_id = process_lemonsqueezy_webhook_event(
                db,
                _one_time_pro_event(variant_id='1574509'),
            )

        self.assertEqual(outcome, 'ignored_non_pro_variant')
        self.assertEqual(user_public_id, 'usr_one_time_pro_paid')
        self.assertEqual(user.plan, UserPlan.free)
        record_product_event.assert_not_called()


if __name__ == '__main__':
    unittest.main()
