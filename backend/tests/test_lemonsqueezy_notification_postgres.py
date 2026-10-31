from __future__ import annotations

import os
import sys
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
from app.db.base import Base
from app.db.models import BillingSubscription, BillingWebhookEvent, NotificationEvent, ProductAnalyticsEvent, User, UserPlan, UserStatus
from app.services.lemonsqueezy_webhooks import LemonSqueezyWebhookEvent, process_lemonsqueezy_webhook_event, record_lemonsqueezy_webhook_event


TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


def _subscription_event(
    *,
    event_name: str,
    subscription_id: str,
    status: str,
    cancelled: bool,
    variant_id: str = 'pro_variant',
    updated_at: datetime | None = None,
    event_hash: str | None = None,
    user_public_id: str | None = None,
) -> LemonSqueezyWebhookEvent:
    timestamp = updated_at or datetime.now(timezone.utc)
    return LemonSqueezyWebhookEvent(
        event_name=event_name,
        payload={},
        meta={'custom_data': {'user_id': user_public_id}} if user_public_id else {},
        data={
            'type': 'subscriptions',
            'id': subscription_id,
            'attributes': {
                'status': status,
                'cancelled': cancelled,
                'variant_id': variant_id,
                'product_name': 'PicSpeak Pro',
                'variant_name': 'Monthly Pro',
                'updated_at': timestamp.isoformat(),
            },
        },
        event_hash=event_hash or f'hash_{event_name}_{subscription_id}_{status}_{cancelled}_{uuid4().hex}',
        test_mode=False,
        resource_type='subscriptions',
        resource_id=subscription_id,
    )


@unittest.skipUnless(TEST_DATABASE_URL, 'requires PICSPEAK_TEST_DATABASE_URL PostgreSQL')
class LemonSqueezyNotificationPostgresTests(unittest.TestCase):
    engine = None
    Session = None
    database_name = None
    _capture_enabled_original = None
    _pro_variant_original = None

    @classmethod
    def setUpClass(cls) -> None:
        cls._capture_enabled_original = settings.notifications_event_capture_enabled
        cls._pro_variant_original = settings.lemonsqueezy_pro_variant_id
        settings.notifications_event_capture_enabled = True
        settings.lemonsqueezy_pro_variant_id = 'pro_variant'
        base_url = make_url(TEST_DATABASE_URL)
        cls.database_name = f"picspeak_ls_notif_{uuid4().hex[:12]}"
        admin_engine = create_engine(base_url.set(database='postgres'), isolation_level='AUTOCOMMIT', future=True)
        try:
            with admin_engine.connect() as conn:
                conn.execute(text(f'CREATE DATABASE {cls.database_name} TEMPLATE template0'))
        finally:
            admin_engine.dispose()
        cls.engine = create_engine(base_url.set(database=cls.database_name), future=True)
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False, expire_on_commit=False)

    @classmethod
    def tearDownClass(cls) -> None:
        settings.notifications_event_capture_enabled = cls._capture_enabled_original
        settings.lemonsqueezy_pro_variant_id = cls._pro_variant_original
        if cls.engine is not None:
            cls.engine.dispose()
        if cls.database_name:
            base_url = make_url(TEST_DATABASE_URL)
            admin_engine = create_engine(base_url.set(database='postgres'), isolation_level='AUTOCOMMIT', future=True)
            try:
                with admin_engine.connect() as conn:
                    conn.execute(
                        text(
                            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                            "WHERE datname = :database_name AND pid <> pg_backend_pid()"
                        ),
                        {'database_name': cls.database_name},
                    )
                    conn.execute(text(f'DROP DATABASE IF EXISTS {cls.database_name}'))
            finally:
                admin_engine.dispose()

    def setUp(self) -> None:
        mode = patch('app.services.lemonsqueezy_webhooks.settings.lemonsqueezy_webhook_test_mode', False)
        mode.start()
        self.addCleanup(mode.stop)
        self.db = self.Session()
        tables = ', '.join(f'"{table.name}"' for table in reversed(Base.metadata.sorted_tables))
        self.db.execute(text(f'TRUNCATE {tables} RESTART IDENTITY CASCADE'))
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()

    def user(self) -> User:
        user = User(
            public_id=f'usr_ls_{uuid4().hex[:8]}',
            email=f'ls_{uuid4().hex[:8]}@example.test',
            username=f'ls_{uuid4().hex[:8]}',
            plan=UserPlan.pro,
            daily_quota_total=20,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        self.db.add(user)
        self.db.flush()
        return user

    def existing_subscription(
        self,
        user: User,
        *,
        status: str = 'active',
        cancelled: bool = False,
        last_event_at: datetime | None = None,
    ) -> BillingSubscription:
        subscription = BillingSubscription(
            user_id=user.id,
            provider='lemonsqueezy',
            provider_subscription_id='sub:unsafe/provider-id',
            provider_order_id='ord:unsafe/order-id',
            variant_id='pro_variant',
            status=status,
            cancelled=cancelled,
            last_event_name='subscription_updated',
            last_event_at=last_event_at or datetime.now(timezone.utc) - timedelta(days=1),
            updated_at=last_event_at or datetime.now(timezone.utc) - timedelta(days=1),
            raw_payload={'existing': True},
        )
        self.db.add(subscription)
        self.db.commit()
        return subscription

    def test_stale_same_state_webhook_after_capture_enabled_does_not_backfill_notification(self) -> None:
        user = self.user()
        self.existing_subscription(user, status='active', cancelled=False)

        outcome, public_id = process_lemonsqueezy_webhook_event(
            self.db,
            _subscription_event(
                event_name='subscription_updated',
                subscription_id='sub:unsafe/provider-id',
                status='active',
                cancelled=False,
            ),
        )
        self.db.commit()

        self.assertEqual(outcome, 'subscription_synced')
        self.assertEqual(public_id, user.public_id)
        self.assertEqual(self.db.query(NotificationEvent).count(), 0)

    def test_cancellation_and_reactivation_emit_distinct_safe_subscription_events(self) -> None:
        user = self.user()
        self.existing_subscription(user, status='active', cancelled=False)

        cancel_outcome, _ = process_lemonsqueezy_webhook_event(
            self.db,
            _subscription_event(
                event_name='subscription_cancelled',
                subscription_id='sub:unsafe/provider-id',
                status='cancelled',
                cancelled=True,
            ),
        )
        active_outcome, _ = process_lemonsqueezy_webhook_event(
            self.db,
            _subscription_event(
                event_name='subscription_updated',
                subscription_id='sub:unsafe/provider-id',
                status='active',
                cancelled=False,
            ),
        )
        self.db.commit()

        self.assertEqual(cancel_outcome, 'subscription_synced')
        self.assertEqual(active_outcome, 'subscription_synced')
        events = self.db.query(NotificationEvent).order_by(NotificationEvent.id).all()
        self.assertEqual(len(events), 2)
        self.assertEqual([event.payload_json['status'] for event in events], ['cancelled', 'active'])
        for event in events:
            self.assertRegex(event.payload_json['subscription_id'], r'^[a-f0-9]{24}$')
            self.assertNotIn(':', event.payload_json['subscription_id'])

    def test_initial_active_cancel_reactivate_emits_three_events_and_duplicate_stays_three(self) -> None:
        user = self.user()
        subscription_id = 'sub:unsafe/provider-id'
        t1 = datetime(2026, 10, 10, 1, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 10, 10, 2, 0, tzinfo=timezone.utc)
        t3 = datetime(2026, 10, 10, 3, 0, tzinfo=timezone.utc)

        process_lemonsqueezy_webhook_event(
            self.db,
            _subscription_event(
                event_name='subscription_created',
                subscription_id=subscription_id,
                status='active',
                cancelled=False,
                updated_at=t1,
                event_hash='evt_initial_active',
                user_public_id=user.public_id,
            ),
        )
        process_lemonsqueezy_webhook_event(
            self.db,
            _subscription_event(
                event_name='subscription_cancelled',
                subscription_id=subscription_id,
                status='cancelled',
                cancelled=True,
                updated_at=t2,
                event_hash='evt_cancelled',
            ),
        )
        process_lemonsqueezy_webhook_event(
            self.db,
            _subscription_event(
                event_name='subscription_updated',
                subscription_id=subscription_id,
                status='active',
                cancelled=False,
                updated_at=t3,
                event_hash='evt_reactivated',
            ),
        )
        process_lemonsqueezy_webhook_event(
            self.db,
            _subscription_event(
                event_name='subscription_updated',
                subscription_id=subscription_id,
                status='active',
                cancelled=False,
                updated_at=t3,
                event_hash='evt_reactivated',
            ),
        )
        self.db.commit()

        events = self.db.query(NotificationEvent).order_by(NotificationEvent.id).all()
        self.assertEqual(len(events), 3)
        self.assertEqual([event.payload_json['status'] for event in events], ['active', 'cancelled', 'active'])

    def _assert_payment_recovery(self, *, payment_first: bool) -> None:
        user = self.user()
        user.plan = UserPlan.free
        provider_time = datetime(2026, 10, 10, 12, 1, tzinfo=timezone.utc)
        subscription = self.existing_subscription(
            user, status='past_due', last_event_at=provider_time - timedelta(minutes=1),
        )
        invoice = LemonSqueezyWebhookEvent(
            event_name='subscription_payment_success', payload={}, meta={},
            data={
                'type': 'subscription-invoices', 'id': 'invoice_recovery',
                'attributes': {
                    'subscription_id': subscription.provider_subscription_id,
                    'updated_at': provider_time.isoformat(),
                },
            },
            event_hash='invoice_recovery', test_mode=False,
            resource_type='subscription-invoices', resource_id='invoice_recovery',
        )
        update = _subscription_event(
            event_name='subscription_updated', subscription_id=subscription.provider_subscription_id,
            status='active', cancelled=False, updated_at=provider_time,
        )
        events = [invoice, update] if payment_first else [update, invoice]
        with patch('app.services.lemonsqueezy_webhooks._utc_now', return_value=provider_time + timedelta(seconds=5)), patch(
            'app.services.lemonsqueezy_webhooks.retrieve_subscription',
            side_effect=AssertionError('No provider API calls allowed'),
        ):
            for event in events:
                process_lemonsqueezy_webhook_event(self.db, event)
                self.db.commit()
                self.db.expire_all()
            # Real stale state events and duplicate deliveries must stay harmless.
            process_lemonsqueezy_webhook_event(self.db, _subscription_event(
                event_name='subscription_updated', subscription_id=subscription.provider_subscription_id,
                status='past_due', cancelled=False, updated_at=provider_time - timedelta(seconds=1),
            ))
            process_lemonsqueezy_webhook_event(self.db, update)
            self.db.commit()
            self.db.expire_all()
        self.assertEqual(subscription.status, 'active')
        self.assertEqual(user.plan, UserPlan.pro)
        self.assertEqual(subscription.last_event_name, 'subscription_updated')
        self.assertEqual(subscription.last_event_at, provider_time)
        self.assertEqual(subscription.last_payment_at, provider_time)
        self.assertEqual(subscription.last_invoice_id, 'invoice_recovery')
        self.assertEqual(self.db.query(NotificationEvent).count(), 1)

    def test_payment_first_then_equal_time_state_restores_persisted_access(self) -> None:
        self._assert_payment_recovery(payment_first=True)

    def test_state_first_then_equal_time_payment_preserves_persisted_access(self) -> None:
        self._assert_payment_recovery(payment_first=False)

    def test_legacy_invoice_watermark_after_portal_refresh_recovers_persisted_access(self) -> None:
        user = self.user()
        user.plan = UserPlan.free
        provider_time = datetime(2026, 10, 10, 12, 1, tzinfo=timezone.utc)
        subscription = self.existing_subscription(
            user, status='past_due', last_event_at=provider_time + timedelta(seconds=5),
        )
        update = _subscription_event(
            event_name='subscription_updated', subscription_id=subscription.provider_subscription_id,
            status='active', cancelled=False, updated_at=provider_time,
        )
        subscription.last_event_name = 'subscription_payment_success'
        subscription.raw_payload = update.data
        self.db.commit()
        self.db.expire_all()
        process_lemonsqueezy_webhook_event(self.db, update)
        self.db.commit()
        self.db.expire_all()
        self.assertEqual(subscription.status, 'active')
        self.assertEqual(user.plan, UserPlan.pro)
        self.assertEqual(subscription.last_event_name, 'subscription_updated')
        self.assertEqual(subscription.last_event_at, provider_time)
        self.assertEqual(self.db.query(NotificationEvent).count(), 1)

    def test_old_changed_subscription_payload_does_not_revert_state_or_notify(self) -> None:
        user = self.user()
        current_provider_time = datetime(2026, 10, 10, 3, 0, tzinfo=timezone.utc)
        self.existing_subscription(
            user,
            status='active',
            cancelled=False,
            last_event_at=current_provider_time,
        )

        outcome, _ = process_lemonsqueezy_webhook_event(
            self.db,
            _subscription_event(
                event_name='subscription_cancelled',
                subscription_id='sub:unsafe/provider-id',
                status='cancelled',
                cancelled=True,
                updated_at=current_provider_time - timedelta(hours=1),
                event_hash='evt_old_cancelled',
            ),
        )
        self.db.commit()

        subscription = self.db.query(BillingSubscription).one()
        self.assertEqual(outcome, 'subscription_synced')
        self.assertEqual(subscription.status, 'active')
        self.assertFalse(subscription.cancelled)
        self.assertEqual(self.db.query(NotificationEvent).count(), 0)

    def _assert_concurrent_invoice_deliveries(self, *, same_hash: bool) -> None:
        user = self.user()
        subscription = self.existing_subscription(user)
        user_id = user.public_id
        subscription_id = subscription.provider_subscription_id
        self.db.rollback()
        barrier = threading.Barrier(2)
        outcomes, errors = [], []

        def deliver(index):
            try:
                data = {'type': 'subscription-invoices', 'id': 'invoice_concurrent', 'attributes': {
                    'subscription_id': subscription_id, 'status': 'paid', 'updated_at': datetime.now(timezone.utc).isoformat(),
                }}
                event = LemonSqueezyWebhookEvent(
                    event_name='subscription_payment_success',
                    payload={'meta': {'event_name': 'subscription_payment_success'}, 'data': data},
                    meta={'custom_data': {'user_id': user_id}}, data=data,
                    event_hash='same_invoice_hash' if same_hash else f'invoice_hash_{index}',
                    test_mode=False, resource_type='subscription-invoices', resource_id='invoice_concurrent',
                )
                with self.Session() as db:
                    barrier.wait(timeout=10)
                    record, duplicate = record_lemonsqueezy_webhook_event(db, event)
                    if duplicate:
                        outcomes.append('duplicate')
                    else:
                        outcome, _ = process_lemonsqueezy_webhook_event(db, event)
                        record.outcome = outcome
                        record.processed_at = datetime.now(timezone.utc)
                        outcomes.append(outcome)
                    db.commit()
            except Exception as exc:
                errors.append(exc)

        with patch('app.services.lemonsqueezy_webhooks.retrieve_subscription', side_effect=AssertionError('No provider calls')):
            threads = [threading.Thread(target=deliver, args=(index,)) for index in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=20)
        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(errors, [])
        self.assertCountEqual(outcomes, ['payment_recorded', 'duplicate' if same_hash else 'payment_already_recorded'])
        self.assertEqual(self.db.query(ProductAnalyticsEvent).filter(ProductAnalyticsEvent.event_name == 'paid_success').count(), 1)
        self.assertEqual(self.db.query(BillingWebhookEvent).count(), 1 if same_hash else 2)

    def test_distinct_payloads_for_same_invoice_are_economically_idempotent(self) -> None:
        self._assert_concurrent_invoice_deliveries(same_hash=False)

    def test_identical_hash_concurrent_delivery_returns_duplicate_without_aborting_transaction(self) -> None:
        self._assert_concurrent_invoice_deliveries(same_hash=True)

    def _assert_user_plan_is_refreshed_after_waiting_for_lock(self, *, initial_plan, competing_plan, status):
        from app.services.lemonsqueezy_webhooks import _match_user_for_event

        user = self.user()
        user.plan = initial_plan
        subscription = self.existing_subscription(user)
        user_pk = user.id
        self.db.rollback()
        matched = threading.Event()
        errors = []
        event = _subscription_event(
            event_name='subscription_updated', subscription_id=subscription.provider_subscription_id,
            status=status, cancelled=False, updated_at=datetime.now(timezone.utc) + timedelta(minutes=1),
        )

        def match_then_signal(db, incoming):
            result = _match_user_for_event(db, incoming)
            self.assertEqual(result.plan, initial_plan)
            matched.set()
            return result

        def deliver():
            try:
                with self.Session() as db:
                    process_lemonsqueezy_webhook_event(db, event)
                    db.commit()
            except Exception as exc:
                errors.append(exc)

        with self.Session() as competing_db, patch(
            'app.services.lemonsqueezy_webhooks._match_user_for_event', side_effect=match_then_signal,
        ):
            competing_user = competing_db.query(User).filter(User.id == user_pk).with_for_update().one()
            thread = threading.Thread(target=deliver)
            thread.start()
            try:
                self.assertTrue(matched.wait(timeout=10))
                competing_user.plan = competing_plan
                competing_db.commit()
            finally:
                competing_db.rollback()
                thread.join(timeout=15)
        self.assertFalse(thread.is_alive())
        self.assertEqual(errors, [])
        self.db.expire_all()
        self.assertEqual(self.db.query(User).filter(User.id == user_pk).one().plan, initial_plan)

    def test_waiting_expiry_refreshes_user_plan_before_persisting_downgrade(self) -> None:
        self._assert_user_plan_is_refreshed_after_waiting_for_lock(
            initial_plan=UserPlan.free, competing_plan=UserPlan.pro, status='expired',
        )

    def test_waiting_activation_refreshes_user_plan_before_persisting_upgrade(self) -> None:
        self._assert_user_plan_is_refreshed_after_waiting_for_lock(
            initial_plan=UserPlan.pro, competing_plan=UserPlan.free, status='active',
        )

    def test_reconciliation_uses_an_enforced_read_only_transaction(self) -> None:
        from app.services.billing_reconciliation import load_billing_reconciliation

        self.db.rollback()
        self.db.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'))
        result = load_billing_reconciliation(
            self.db, start=datetime(2026, 10, 1, tzinfo=timezone.utc), end=datetime(2026, 11, 1, tzinfo=timezone.utc),
        )
        self.assertEqual(self.db.execute(text('SHOW transaction_read_only')).scalar_one(), 'on')
        self.assertEqual(result['received_callbacks'], 0)
        self.assertIsNone(result['provider_net_settlement'])
        self.db.rollback()


if __name__ == '__main__':
    unittest.main()
