from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
from app.db.base import Base
from app.db.models import BillingSubscription, NotificationEvent, User, UserPlan, UserStatus
from app.services.lemonsqueezy_webhooks import LemonSqueezyWebhookEvent, process_lemonsqueezy_webhook_event


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


if __name__ == '__main__':
    unittest.main()
