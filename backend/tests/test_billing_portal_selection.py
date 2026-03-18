from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from app.api.routes import _best_subscription_for_portal
from app.db.models import BillingSubscription


def _subscription(
    *,
    status: str,
    updated_minutes_ago: int,
    portal_url: str | None = None,
    update_subscription_url: str | None = None,
    payment_url: str | None = None,
    ends_in_days: int | None = None,
) -> BillingSubscription:
    now = datetime.now(timezone.utc)
    ends_at = now + timedelta(days=ends_in_days) if ends_in_days is not None else None
    return BillingSubscription(
        status=status,
        updated_at=now - timedelta(minutes=updated_minutes_ago),
        customer_portal_url=portal_url,
        customer_portal_update_subscription_url=update_subscription_url,
        update_payment_method_url=payment_url,
        ends_at=ends_at,
    )


class BillingPortalSelectionTests(unittest.TestCase):
    def test_prefers_active_subscription_with_portal_over_newer_pending_record(self) -> None:
        subscriptions = [
            _subscription(status='pending', updated_minutes_ago=1),
            _subscription(status='active', updated_minutes_ago=5, portal_url='https://portal.example.com/active'),
        ]

        selected = _best_subscription_for_portal(subscriptions)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.customer_portal_url, 'https://portal.example.com/active')

    def test_prefers_active_subscription_that_has_portal_over_active_without_portal(self) -> None:
        subscriptions = [
            _subscription(status='active', updated_minutes_ago=1),
            _subscription(status='active', updated_minutes_ago=5, update_subscription_url='https://portal.example.com/manage'),
        ]

        selected = _best_subscription_for_portal(subscriptions)

        self.assertIsNotNone(selected)
        self.assertEqual(
            selected.customer_portal_update_subscription_url,
            'https://portal.example.com/manage',
        )

    def test_falls_back_to_active_subscription_when_no_portal_url_exists(self) -> None:
        subscriptions = [
            _subscription(status='active', updated_minutes_ago=1),
            _subscription(status='cancelled', updated_minutes_ago=5, ends_in_days=-1, portal_url='https://portal.example.com/old'),
        ]

        selected = _best_subscription_for_portal(subscriptions)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.status, 'active')

    def test_falls_back_to_latest_portal_url_when_no_active_subscription_exists(self) -> None:
        subscriptions = [
            _subscription(status='expired', updated_minutes_ago=1, payment_url='https://portal.example.com/recover'),
            _subscription(status='cancelled', updated_minutes_ago=5, ends_in_days=-1),
        ]

        selected = _best_subscription_for_portal(subscriptions)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.update_payment_method_url, 'https://portal.example.com/recover')


if __name__ == '__main__':
    unittest.main()
