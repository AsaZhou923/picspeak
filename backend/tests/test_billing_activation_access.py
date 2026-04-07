from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import BillingActivationCode, BillingSubscription, User, UserPlan, UserStatus
from app.services.billing_access import (
    ACTIVATION_CODE_PROVIDER,
    activation_code_hash,
    activation_code_prefix,
    redeem_activation_code_for_user,
    subscription_grants_pro_access,
    sync_user_billing_plan,
)


def _query_mock(*, first=None, all_rows=None):
    query = MagicMock()
    query.filter.return_value = query
    query.order_by.return_value = query
    query.first.return_value = first
    query.all.return_value = all_rows if all_rows is not None else []
    return query


class BillingActivationAccessTests(unittest.TestCase):
    def test_active_subscription_with_past_end_date_does_not_grant_access(self) -> None:
        subscription = BillingSubscription(
            provider=ACTIVATION_CODE_PROVIDER,
            status='active',
            ends_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )

        self.assertFalse(subscription_grants_pro_access(subscription))

    def test_sync_user_billing_plan_downgrades_expired_paid_user_to_free(self) -> None:
        user = User(
            id=11,
            public_id='usr_sync',
            email='sync@example.com',
            username='sync_user',
            plan=UserPlan.pro,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        expired = BillingSubscription(
            user_id=user.id,
            provider=ACTIVATION_CODE_PROVIDER,
            status='active',
            ends_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db = MagicMock()
        db.query.return_value = _query_mock(all_rows=[expired])

        target_plan = sync_user_billing_plan(db, user)

        self.assertEqual(target_plan, UserPlan.free)
        self.assertEqual(user.plan, UserPlan.free)

    def test_sync_user_billing_plan_keeps_guest_when_no_paid_access_exists(self) -> None:
        user = User(
            id=12,
            public_id='gst_sync',
            email='guest-sync@example.com',
            username='guest_sync',
            plan=UserPlan.guest,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        db = MagicMock()
        db.query.return_value = _query_mock(all_rows=[])

        target_plan = sync_user_billing_plan(db, user)

        self.assertEqual(target_plan, UserPlan.guest)
        self.assertEqual(user.plan, UserPlan.guest)

    def test_redeem_activation_code_extends_existing_manual_subscription(self) -> None:
        now = datetime.now(timezone.utc)
        raw_code = 'PSCN-ABCD-EFGH-JKLM'
        code = BillingActivationCode(
            code_hash=activation_code_hash(raw_code),
            code_prefix=activation_code_prefix(raw_code),
            duration_days=30,
            source='ifdian',
        )
        existing_subscription = BillingSubscription(
            user_id=21,
            provider=ACTIVATION_CODE_PROVIDER,
            provider_subscription_id='act_usr_redeem',
            status='active',
            cancelled=True,
            ends_at=now + timedelta(days=10),
            updated_at=now,
        )
        user = User(
            id=21,
            public_id='usr_redeem',
            email='redeem@example.com',
            username='redeem_user',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )

        db = MagicMock()
        db.query.side_effect = [
            _query_mock(first=code),
            _query_mock(first=existing_subscription),
            _query_mock(all_rows=[existing_subscription]),
        ]

        redeemed_code, updated_subscription = redeem_activation_code_for_user(db, user=user, raw_code=raw_code)

        self.assertIs(redeemed_code, code)
        self.assertIs(updated_subscription, existing_subscription)
        self.assertEqual(redeemed_code.redeemed_by_user_id, user.id)
        self.assertIsNotNone(redeemed_code.redeemed_at)
        self.assertEqual(user.plan, UserPlan.pro)
        self.assertEqual(updated_subscription.provider, ACTIVATION_CODE_PROVIDER)
        self.assertTrue(updated_subscription.cancelled)
        self.assertAlmostEqual(
            updated_subscription.ends_at.timestamp(),
            (now + timedelta(days=40)).timestamp(),
            delta=3,
        )


if __name__ == '__main__':
    unittest.main()
