from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

from app.api.routers import billing as routes
from app.api.routers.billing import _best_subscription_for_portal, _customer_portal_destination, _refresh_subscription_portal_urls
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
    def test_prefers_customer_portal_url_over_update_subscription_url(self) -> None:
        subscription = _subscription(
            status='active',
            updated_minutes_ago=1,
            portal_url='https://portal.example.com/billing',
            update_subscription_url='https://portal.example.com/subscription',
            payment_url='https://portal.example.com/payment',
        )

        destination = _customer_portal_destination(subscription)

        self.assertEqual(destination, 'https://portal.example.com/billing')

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

    def test_uses_store_billing_page_when_dashboard_url_is_returned(self) -> None:
        subscription = _subscription(status='active', updated_minutes_ago=1, portal_url='https://app.lemonsqueezy.com/dashboard')

        with patch.object(
            routes.settings,
            'lemonsqueezy_pro_checkout_url',
            'https://picspeak.lemonsqueezy.com/checkout/buy/example',
        ):
            destination = _customer_portal_destination(subscription)

        self.assertEqual(destination, 'https://picspeak.lemonsqueezy.com/billing')

    def test_rejects_dashboard_url_when_no_store_billing_fallback_exists(self) -> None:
        subscription = _subscription(status='active', updated_minutes_ago=1, portal_url='https://app.lemonsqueezy.com/dashboard')

        with patch.object(routes.settings, 'lemonsqueezy_pro_checkout_url', ''):
            destination = _customer_portal_destination(subscription)

        self.assertIsNone(destination)

    def test_refreshes_portal_urls_from_latest_subscription_api_response(self) -> None:
        subscription = _subscription(status='active', updated_minutes_ago=1, portal_url='https://old.example.com/portal')
        subscription.provider_subscription_id = 'sub_123'
        db = Mock()

        with patch(
            'app.api.routers.billing.retrieve_subscription',
            return_value={
                'attributes': {
                    'urls': {
                        'customer_portal': 'https://picspeak.lemonsqueezy.com/billing?expires=123',
                        'customer_portal_update_subscription': 'https://picspeak.lemonsqueezy.com/billing/subscription?expires=123',
                    }
                }
            },
        ):
            refreshed = _refresh_subscription_portal_urls(db, subscription)

        self.assertIs(refreshed, subscription)
        self.assertEqual(refreshed.customer_portal_url, 'https://picspeak.lemonsqueezy.com/billing?expires=123')
        self.assertEqual(
            refreshed.customer_portal_update_subscription_url,
            'https://picspeak.lemonsqueezy.com/billing/subscription?expires=123',
        )
        db.add.assert_called_once_with(subscription)
        db.flush.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
