from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import get_db
from app.api.routers import billing
from app.core.security import create_access_token
from app.db.models import BillingSubscription, User, UserPlan, UserStatus
from app.services.lemonsqueezy import LemonSqueezyAPIError, LemonSqueezyConfigurationError


class BillingPortalRouteTests(unittest.TestCase):
    """Exercise HTTP, real bearer authentication and ORM ownership filters.

    Copied SQLite table types avoid global model changes. Quota snapshots and
    provider calls are stubbed; these tests do not claim live-provider coverage.
    """

    def setUp(self) -> None:
        self.engine = sa.create_engine(
            'sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool,
        )
        metadata = sa.MetaData()
        for model in (User, BillingSubscription):
            table = model.__table__.to_metadata(metadata)
            for column in table.columns:
                if isinstance(column.type, JSONB):
                    column.type = sa.JSON()
                elif isinstance(column.type, sa.BigInteger):
                    column.type = sa.Integer()
        metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.user_count = 0
        self.subscription_count = 0

        def db_dependency():
            with self.Session() as db:
                try:
                    yield db
                except Exception:
                    db.rollback()
                    raise

        app = FastAPI()
        app.include_router(billing.router, prefix='/api/v1')
        app.dependency_overrides[get_db] = db_dependency
        self.client = TestClient(app)
        self.client.__enter__()
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.client.__exit__, None, None, None)
        self.retrieve = self.start_patch(patch.object(billing, 'retrieve_subscription', return_value={'attributes': {}}))
        self.start_patch(patch.object(billing.settings, 'lemonsqueezy_pro_checkout_url', ''))
        self.start_patch(patch.object(billing, 'user_usage_snapshot', return_value={}))
        self.start_patch(patch.object(billing, 'guest_usage_snapshot', return_value={}))
        self.start_patch(patch.object(billing, '_generation_credit_usage_snapshot', return_value={}))
        self.start_patch(patch('app.api.deps.enforce_guest_api_rate_limit'))

    def start_patch(self, patcher):
        result = patcher.start()
        self.addCleanup(patcher.stop)
        return result

    def user(self, plan: UserPlan = UserPlan.free) -> User:
        self.user_count += 1
        user = User(
            id=self.user_count, public_id=f'usr_portal_{self.user_count}',
            email=f'portal{self.user_count}@example.test', username=f'portal{self.user_count}',
            plan=plan, status=UserStatus.active,
        )
        with self.Session() as db:
            db.add(user)
            db.commit()
        return user

    def subscription(
        self, user: User, *, status: str = 'active', provider: str = 'lemonsqueezy',
        portal_url: str | None = 'https://picspeak.lemonsqueezy.com/billing?token=stored',
        ends_at: datetime | None = None,
    ) -> BillingSubscription:
        self.subscription_count += 1
        subscription = BillingSubscription(
            id=self.subscription_count, user_id=user.id, provider=provider,
            provider_subscription_id=f'sub_{self.subscription_count}', status=status,
            customer_portal_url=portal_url, ends_at=ends_at,
        )
        with self.Session() as db:
            db.add(subscription)
            db.commit()
        return subscription

    def get(self, path: str, user: User):
        token = create_access_token({'sub': user.public_id, 'role': 'guest' if user.plan == UserPlan.guest else 'user'})
        return self.client.get(f'/api/v1{path}', headers={'Authorization': f'Bearer {token}'})

    def test_usage_and_portal_remain_accessible_after_entitlement_downgrade(self) -> None:
        for subscription_status in ('active', 'past_due', 'unpaid', 'expired'):
            with self.subTest(status=subscription_status):
                user = self.user(UserPlan.pro)
                subscription = self.subscription(user, status=subscription_status)
                expected_plan = 'pro' if subscription_status == 'active' else 'free'

                usage = self.get('/me/usage', user)
                self.assertEqual(usage.status_code, 200, usage.text)
                self.assertEqual(usage.json()['plan'], expected_plan)
                self.assertTrue(usage.json()['billing_portal_available'])
                if expected_plan == 'free':
                    self.assertIsNone(usage.json()['subscription'])
                self.retrieve.reset_mock()

                response = self.get('/billing/portal', user)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()['portal_url'], subscription.customer_portal_url)
                self.retrieve.assert_called_once_with(subscription.provider_subscription_id)
                with self.Session() as db:
                    self.assertEqual(db.get(User, user.id).plan.value, expected_plan)
                    self.assertEqual(db.get(BillingSubscription, subscription.id).status, subscription_status)

    def test_cancelled_subscription_can_manage_after_its_paid_period_ends(self) -> None:
        user = self.user()
        subscription = self.subscription(
            user, status='cancelled', ends_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        response = self.get('/billing/portal', user)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['portal_url'], subscription.customer_portal_url)
        with self.Session() as db:
            self.assertEqual(db.get(User, user.id).plan, UserPlan.free)

    def test_guest_with_provider_record_is_rejected_before_lookup_or_refresh(self) -> None:
        user = self.user(UserPlan.guest)
        self.subscription(user)
        response = self.get('/billing/portal', user)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['detail']['code'], 'AUTH_LOGIN_REQUIRED')
        self.retrieve.assert_not_called()
        with self.Session() as db:
            self.assertEqual(db.get(User, user.id).plan, UserPlan.guest)

    def test_missing_auth_does_not_create_a_guest(self) -> None:
        response = self.client.get('/api/v1/billing/portal')
        self.assertEqual(response.status_code, 401)
        self.assertNotIn('set-cookie', response.headers)
        self.retrieve.assert_not_called()
        with self.Session() as db:
            self.assertEqual(db.query(User).count(), 0)

    def test_users_without_provider_subscription_cannot_use_store_fallback(self) -> None:
        for plan in (UserPlan.free, UserPlan.pro):
            with self.subTest(plan=plan):
                user = self.user(plan)
                with patch.object(billing.settings, 'lemonsqueezy_pro_checkout_url', 'https://picspeak.lemonsqueezy.com/buy/pro'):
                    response = self.get('/billing/portal', user)
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json()['detail']['code'], 'BILLING_SUBSCRIPTION_NOT_FOUND')
                self.retrieve.assert_not_called()
                usage = self.get('/me/usage', user)
                self.assertFalse(usage.json()['billing_portal_available'])

    def test_activation_only_account_and_other_owners_records_do_not_grant_portal(self) -> None:
        user = self.user()
        other = self.user(UserPlan.pro)
        self.subscription(user, provider='activation_code')
        self.subscription(other)

        response = self.get('/billing/portal', user)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['detail']['code'], 'BILLING_SUBSCRIPTION_NOT_FOUND')
        self.retrieve.assert_not_called()
        usage = self.get('/me/usage', user)
        self.assertEqual(usage.json()['plan'], 'pro')
        self.assertEqual(usage.json()['subscription']['provider'], 'activation_code')
        self.assertFalse(usage.json()['billing_portal_available'])

    def test_portal_selects_only_the_owners_lemonsqueezy_record(self) -> None:
        user = self.user()
        other = self.user(UserPlan.pro)
        owned = self.subscription(user, status='past_due')
        self.subscription(other, portal_url='https://other.example.test/private')
        activation = self.subscription(user, provider='activation_code', portal_url='https://activation.example.test/private')

        response = self.get('/billing/portal', user)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['portal_url'], owned.customer_portal_url)
        self.retrieve.assert_called_once_with(owned.provider_subscription_id)
        with self.Session() as db:
            self.assertEqual(db.get(BillingSubscription, activation.id).raw_payload, {})

    def test_provider_refresh_persists_new_url_without_restoring_pro(self) -> None:
        user = self.user()
        subscription = self.subscription(user, status='unpaid')
        fresh_url = 'https://picspeak.lemonsqueezy.com/billing?token=fresh'
        self.retrieve.return_value = {'attributes': {'urls': {'customer_portal': fresh_url}}}

        response = self.get('/billing/portal', user)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['portal_url'], fresh_url)
        with self.Session() as db:
            self.assertEqual(db.get(BillingSubscription, subscription.id).customer_portal_url, fresh_url)
            self.assertEqual(db.get(User, user.id).plan, UserPlan.free)

    def test_provider_failures_keep_cached_recovery_link_available(self) -> None:
        user = self.user()
        subscription = self.subscription(user, status='expired')
        for error in (LemonSqueezyAPIError('unavailable'), LemonSqueezyConfigurationError('not configured')):
            with self.subTest(error=type(error).__name__):
                self.retrieve.side_effect = error
                response = self.get('/billing/portal', user)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['portal_url'], subscription.customer_portal_url)

    def test_provider_failure_uses_store_fallback_for_owned_record_without_url(self) -> None:
        user = self.user()
        self.subscription(user, status='past_due', portal_url=None)
        self.retrieve.side_effect = LemonSqueezyAPIError('unavailable')
        with patch.object(billing.settings, 'lemonsqueezy_pro_checkout_url', 'https://picspeak.lemonsqueezy.com/buy/pro'):
            response = self.get('/billing/portal', user)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['portal_url'], 'https://picspeak.lemonsqueezy.com/billing')

    def test_missing_usable_link_returns_status_neutral_error(self) -> None:
        user = self.user()
        self.subscription(user, status='unpaid', portal_url='https://app.lemonsqueezy.com/dashboard')
        self.retrieve.side_effect = LemonSqueezyAPIError('unavailable')
        response = self.get('/billing/portal', user)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['detail']['code'], 'BILLING_PORTAL_UNAVAILABLE')
        self.assertNotIn('active', response.json()['detail']['message'])

    def test_guest_usage_never_advertises_billing_portal(self) -> None:
        user = self.user(UserPlan.guest)
        self.subscription(user, status='expired')
        response = self.get('/me/usage', user)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()['billing_portal_available'])
        self.retrieve.assert_not_called()


if __name__ == '__main__':
    unittest.main()
