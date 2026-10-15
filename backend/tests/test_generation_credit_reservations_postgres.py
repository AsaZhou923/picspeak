from __future__ import annotations

import os
import sys
import threading
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import (  # noqa: E402
    GenerationCreditReservation,
    ImageGenerationTask,
    ProductAnalyticsEvent,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
    UsageLedger,
)
from app.services.generation_credit_reservations import (  # noqa: E402
    reserve_generation_credits_for_task, consume_generation_credit_reservation,
    release_generation_credit_reservation, generation_credit_balance_snapshot,
    GenerationCreditReservationError,
)
from app.services.image_generation_task_processor import (  # noqa: E402
    _claim_generation_task,
    deliver_generation_request_event,
    deliver_generation_terminal_event,
    stage_generation_request_event,
    stage_generation_terminal_event,
)
from app.services.product_analytics import AnalyticsEventSample, build_stage_a_snapshot  # noqa: E402


TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class GenerationCreditReservationPostgresTests(unittest.TestCase):
    def test_generation_request_event_outbox_is_durable(self) -> None:
        engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        suffix = uuid4().hex

        with Session() as db:
            user = User(
                public_id=f'usr_request_outbox_{suffix}',
                email=f'request-outbox-{suffix}@example.test',
                username=f'request_outbox_{suffix}',
                plan=UserPlan.free,
                status=UserStatus.active,
                daily_quota_total=0,
                daily_quota_used=0,
            )
            db.add(user)
            db.flush()
            task = ImageGenerationTask(
                public_id=f'igt_request_outbox_{suffix}',
                owner_user_id=user.id,
                status=TaskStatus.PENDING,
                generation_mode='general',
                intent='photo_inspiration',
                prompt='request analytics outbox test',
                prompt_hash=f'request-outbox-hash-{suffix}',
                request_payload={'analytics_source': 'gallery'},
            )
            stage_generation_request_event(
                task,
                page_path='/generate',
                source='gallery',
                metadata={'generation_mode': 'general', 'credits_reserved': 1},
            )
            db.add(task)
            db.commit()
            task_id = task.id
            user_id = user.id

        with Session() as db:
            task = db.query(ImageGenerationTask).filter(ImageGenerationTask.id == task_id).one()
            owner = db.query(User).filter(User.id == user_id).one()
            self.assertTrue(deliver_generation_request_event(db, task=task, owner=owner))
            db.refresh(task)
            self.assertNotIn('pending_request_event', dict(task.request_payload or {}))
            event = (
                db.query(ProductAnalyticsEvent)
                .filter(
                    ProductAnalyticsEvent.event_name == 'generation_requested',
                    ProductAnalyticsEvent.user_public_id == owner.public_id,
                    ProductAnalyticsEvent.page_path == '/generate',
                    ProductAnalyticsEvent.metadata_json.contains({'task_id': task.public_id}),
                )
                .one_or_none()
            )
            self.assertIsNotNone(event)

    def test_recovered_outbox_events_preserve_original_cohort_times(self) -> None:
        engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        suffix = uuid4().hex
        request_at = datetime(2026, 5, 1, 23, 59, tzinfo=timezone.utc)
        terminal_at = datetime(2026, 5, 2, 0, 1, tzinfo=timezone.utc)

        with Session() as db:
            user = User(
                public_id=f'usr_outbox_cohort_{suffix}',
                email=f'outbox-cohort-{suffix}@example.test',
                username=f'outbox_cohort_{suffix}',
                plan=UserPlan.free,
                status=UserStatus.active,
                daily_quota_total=0,
                daily_quota_used=0,
            )
            db.add(user)
            db.flush()
            task = ImageGenerationTask(
                public_id=f'igt_outbox_cohort_{suffix}',
                owner_user_id=user.id,
                status=TaskStatus.SUCCEEDED,
                generation_mode='general',
                intent='photo_inspiration',
                prompt='outbox cohort timestamp test',
                prompt_hash=f'outbox-cohort-hash-{suffix}',
                request_payload={'analytics_source': 'gallery'},
            )
            stage_generation_request_event(
                task,
                page_path='/generate',
                source='gallery',
                metadata={'generation_mode': 'general'},
            )
            stage_generation_terminal_event(
                task,
                event_name='generation_succeeded',
                metadata={'generation_id': f'gen_outbox_cohort_{suffix}', 'generation_mode': 'general'},
            )
            payload = dict(task.request_payload or {})
            request_marker = dict(payload['pending_request_event'])
            request_marker['staged_at'] = request_at.isoformat()
            terminal_marker = dict(payload['pending_terminal_event'])
            terminal_marker['staged_at'] = terminal_at.isoformat()
            payload['pending_request_event'] = request_marker
            payload['pending_terminal_event'] = terminal_marker
            task.request_payload = payload
            db.add(task)
            db.commit()
            task_id = task.id
            user_id = user.id

        with Session() as db:
            task = db.query(ImageGenerationTask).filter(ImageGenerationTask.id == task_id).one()
            owner = db.query(User).filter(User.id == user_id).one()
            # Deliver out of order to reproduce recovery after a delayed request event.
            self.assertTrue(deliver_generation_terminal_event(db, task=task, owner=owner))
            self.assertTrue(deliver_generation_request_event(db, task=task, owner=owner))
            rows = (
                db.query(ProductAnalyticsEvent)
                .filter(
                    ProductAnalyticsEvent.user_public_id == owner.public_id,
                    ProductAnalyticsEvent.metadata_json.contains({'task_id': task.public_id}),
                )
                .all()
            )

        samples = [
            AnalyticsEventSample(
                event_name=row.event_name,
                occurred_at=row.created_at,
                user_public_id=row.user_public_id,
                plan=row.plan,
                source=row.source,
                page_path=row.page_path,
                metadata=dict(row.metadata_json or {}),
            )
            for row in rows
        ]
        snapshot = build_stage_a_snapshot(
            events=samples,
            reviews=[],
            start_date=date(2026, 5, 1),
            end_date=date(2026, 5, 1),
        )
        overall = snapshot['generation_funnel']['overall']
        self.assertEqual(overall['generation_requested'], 1)
        self.assertEqual(overall['generation_succeeded'], 1)
        self.assertEqual(snapshot['generation_funnel']['request_success_rate'], 1.0)

    def test_concurrent_reservations_allow_only_the_affordable_task(self) -> None:
        engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        suffix = uuid4().hex

        with Session() as db:
            user = User(
                public_id=f'usr_reservation_{suffix}',
                email=f'reservation-{suffix}@example.test',
                username=f'reservation_{suffix}',
                plan=UserPlan.free,
                status=UserStatus.active,
                daily_quota_total=0,
                daily_quota_used=0,
            )
            db.add(user)
            db.commit()
            user_id = user.id

        barrier = threading.Barrier(2)
        outcomes: list[str] = []
        outcome_lock = threading.Lock()

        def attempt_reservation(index: int) -> None:
            outcome = 'error'
            with Session() as db:
                user = db.query(User).filter(User.id == user_id).one()
                task = ImageGenerationTask(
                    public_id=f'igt_reservation_{suffix}_{index}',
                    owner_user_id=user_id,
                    status=TaskStatus.PENDING,
                    generation_mode='general',
                    intent='photo_inspiration',
                    prompt='concurrency reservation test',
                    prompt_hash=f'hash-{suffix}-{index}',
                    request_payload={'credits_reserved': 2},
                )
                db.add(task)
                barrier.wait(timeout=10)
                try:
                    reserve_generation_credits_for_task(db, user=user, task=task, credits=2)
                    db.commit()
                    outcome = 'reserved'
                except ValueError:
                    db.rollback()
                    outcome = 'exhausted'
            with outcome_lock:
                outcomes.append(outcome)

        threads = [threading.Thread(target=attempt_reservation, args=(index,)) for index in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)

        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertCountEqual(outcomes, ['reserved', 'exhausted'])
        with Session() as db:
            held = (
                db.query(GenerationCreditReservation)
                .filter(
                    GenerationCreditReservation.user_id == user_id,
                    GenerationCreditReservation.status == 'held',
                )
                .all()
            )
            self.assertEqual(len(held), 1)
            self.assertEqual(held[0].credits, 2)

    def test_generation_claim_gate_keeps_global_running_count_within_limit(self) -> None:
        engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        suffix = uuid4().hex

        with Session() as db:
            user = User(
                public_id=f'usr_claim_{suffix}',
                email=f'claim-{suffix}@example.test',
                username=f'claim_{suffix}',
                plan=UserPlan.free,
                status=UserStatus.active,
                daily_quota_total=0,
                daily_quota_used=0,
            )
            db.add(user)
            db.flush()
            tasks = [
                ImageGenerationTask(
                    public_id=f'igt_claim_{suffix}_{index}',
                    owner_user_id=user.id,
                    status=TaskStatus.PENDING,
                    generation_mode='general',
                    intent='photo_inspiration',
                    prompt='atomic claim gate test',
                    prompt_hash=f'claim-hash-{suffix}-{index}',
                    request_payload={'credits_reserved': 1},
                )
                for index in range(2)
            ]
            db.add_all(tasks)
            db.commit()
            task_ids = [task.id for task in tasks]

        barrier = threading.Barrier(2)
        outcomes: list[bool] = []
        outcome_lock = threading.Lock()

        def attempt_claim(index: int) -> None:
            with Session() as db:
                barrier.wait(timeout=10)
                claimed = _claim_generation_task(db, task_ids[index], f'pg-worker:{index}')
            with outcome_lock:
                outcomes.append(claimed)

        with patch(
            'app.services.image_generation_task_processor.settings.image_generation_worker_concurrency',
            1,
        ):
            threads = [threading.Thread(target=attempt_claim, args=(index,)) for index in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=15)

        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertCountEqual(outcomes, [True, False])
        with Session() as db:
            running = db.query(ImageGenerationTask).filter(ImageGenerationTask.status == TaskStatus.RUNNING).count()
            self.assertEqual(running, 1)

    def test_terminal_event_outbox_delivery_is_durable_and_idempotent(self) -> None:
        engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        suffix = uuid4().hex

        with Session() as db:
            user = User(
                public_id=f'usr_outbox_{suffix}',
                email=f'outbox-{suffix}@example.test',
                username=f'outbox_{suffix}',
                plan=UserPlan.free,
                status=UserStatus.active,
                daily_quota_total=0,
                daily_quota_used=0,
            )
            db.add(user)
            db.flush()
            task = ImageGenerationTask(
                public_id=f'igt_outbox_{suffix}',
                owner_user_id=user.id,
                status=TaskStatus.SUCCEEDED,
                generation_mode='general',
                intent='photo_inspiration',
                prompt='terminal analytics outbox test',
                prompt_hash=f'outbox-hash-{suffix}',
                request_payload={'analytics_source': 'gallery'},
            )
            stage_generation_terminal_event(
                task,
                event_name='generation_succeeded',
                metadata={'generation_id': f'gen_outbox_{suffix}'},
            )
            db.add(task)
            db.commit()
            task_id = task.id
            user_id = user.id

        with Session() as db:
            task = db.query(ImageGenerationTask).filter(ImageGenerationTask.id == task_id).one()
            owner = db.query(User).filter(User.id == user_id).one()
            self.assertTrue(deliver_generation_terminal_event(db, task=task, owner=owner))
            db.refresh(task)
            self.assertNotIn('pending_terminal_event', dict(task.request_payload or {}))

            stage_generation_terminal_event(
                task,
                event_name='generation_succeeded',
                metadata={'generation_id': f'gen_outbox_{suffix}'},
            )
            db.add(task)
            db.commit()
            self.assertTrue(deliver_generation_terminal_event(db, task=task, owner=owner))

            events = (
                db.query(ProductAnalyticsEvent)
                .filter(
                    ProductAnalyticsEvent.event_name == 'generation_succeeded',
                    ProductAnalyticsEvent.user_public_id == owner.public_id,
                    ProductAnalyticsEvent.metadata_json.contains({'task_id': task.public_id}),
                )
                .all()
            )
            self.assertEqual(len(events), 1)

    def test_terminal_event_outbox_delivery_is_concurrency_safe(self) -> None:
        engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        Session = sessionmaker(bind=engine, expire_on_commit=False)
        suffix = uuid4().hex

        with Session() as db:
            user = User(
                public_id=f'usr_outbox_concurrent_{suffix}',
                email=f'outbox-concurrent-{suffix}@example.test',
                username=f'outbox_concurrent_{suffix}',
                plan=UserPlan.free,
                status=UserStatus.active,
                daily_quota_total=0,
                daily_quota_used=0,
            )
            db.add(user)
            db.flush()
            task = ImageGenerationTask(
                public_id=f'igt_outbox_concurrent_{suffix}',
                owner_user_id=user.id,
                status=TaskStatus.SUCCEEDED,
                generation_mode='general',
                intent='photo_inspiration',
                prompt='concurrent terminal analytics outbox test',
                prompt_hash=f'outbox-concurrent-hash-{suffix}',
                request_payload={'analytics_source': 'gallery'},
            )
            stage_generation_terminal_event(
                task,
                event_name='generation_succeeded',
                metadata={'generation_id': f'gen_outbox_concurrent_{suffix}'},
            )
            db.add(task)
            db.commit()
            task_id = task.id
            user_id = user.id

        barrier = threading.Barrier(2)
        outcomes: list[bool] = []
        outcome_lock = threading.Lock()

        def attempt_delivery() -> None:
            with Session() as db:
                task = db.query(ImageGenerationTask).filter(ImageGenerationTask.id == task_id).one()
                owner = db.query(User).filter(User.id == user_id).one()
                barrier.wait(timeout=10)
                delivered = deliver_generation_terminal_event(db, task=task, owner=owner)
            with outcome_lock:
                outcomes.append(delivered)

        threads = [threading.Thread(target=attempt_delivery) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)

        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(outcomes, [True, True])
        with Session() as db:
            task = db.query(ImageGenerationTask).filter(ImageGenerationTask.id == task_id).one()
            self.assertNotIn('pending_terminal_event', dict(task.request_payload or {}))
            events = (
                db.query(ProductAnalyticsEvent)
                .filter(
                    ProductAnalyticsEvent.event_name == 'generation_succeeded',
                    ProductAnalyticsEvent.user_public_id == f'usr_outbox_concurrent_{suffix}',
                    ProductAnalyticsEvent.metadata_json.contains({'task_id': task.public_id}),
                )
                .all()
            )
            self.assertEqual(len(events), 1)


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class PersistentGenerationCreditPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.Session()
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.limit = patch('app.services.generation_credit_reservations.monthly_generation_credit_limit_for_plan', return_value=3)
        self.limit.start()
        self.addCleanup(self.limit.stop)
        self.user = self.new_user()
        self.may = datetime(2026, 5, 31, 23, 59, tzinfo=timezone.utc)
        self.june = datetime(2026, 6, 1, tzinfo=timezone.utc)

    def new_user(self):
        suffix = uuid4().hex
        user = User(public_id=f'usr_persistent_{suffix}', email=f'{suffix}@example.test', username=suffix,
                    plan=UserPlan.free, status=UserStatus.active, daily_quota_total=0, daily_quota_used=0)
        self.db.add(user)
        self.db.flush()
        return user

    def grant(self, credits=300, *, persistent=True):
        ledger = UsageLedger(user_id=self.user.id, usage_type='image_generation_credit', amount=-credits,
                             unit='credits', bill_date=self.may.date(), metadata_json={
                                 'grant_type': 'lemonsqueezy_credit_pack',
                                 **({'balance_version': 'persistent-v1'} if persistent else {}),
                             })
        self.db.add(ledger)
        self.db.flush()
        return ledger

    def task(self, *, credits, now):
        suffix = uuid4().hex
        task = ImageGenerationTask(public_id=f'igt_persistent_{suffix}', owner_user_id=self.user.id,
                                   status=TaskStatus.PENDING, generation_mode='general', intent='photo_inspiration',
                                   prompt='persistent credits', prompt_hash=suffix, request_payload={})
        self.db.add(task)
        reservation = reserve_generation_credits_for_task(self.db, user=self.user, task=task, credits=credits, now=now)
        return task, reservation

    def balance(self, now):
        return generation_credit_balance_snapshot(self.db, self.user, now=now)

    def test_month_end_purchase_hold_success_and_duplicate_consumption(self):
        self.grant()
        task, reservation = self.task(credits=10, now=self.may)
        self.assertEqual(task.request_payload['credit_allocation'], {'version': 1, 'monthly': 3, 'purchased': 7})
        before = self.balance(self.june)
        self.assertEqual((before['monthly_remaining'], before['purchased_remaining']), (3, 293))
        consume_generation_credit_reservation(self.db, task=task, usage_metadata={
            'credit_allocation': {'version': 1, 'monthly': 10, 'purchased': 0},
        })
        consume_generation_credit_reservation(self.db, task=task, usage_metadata={})
        after = self.balance(self.june)
        self.assertEqual(after['purchased_used'], 7)
        self.assertEqual(after['purchased_held'], 0)
        self.assertEqual(after['available_total'], before['available_total'])
        self.assertEqual(self.db.query(UsageLedger).filter(UsageLedger.id == reservation.consumed_usage_ledger_id).one()
                         .metadata_json['credit_allocation']['purchased'], 7)

    def test_month_end_failure_releases_purchased_hold(self):
        self.grant()
        task, _ = self.task(credits=10, now=self.may)
        self.assertEqual(self.balance(self.june)['purchased_held'], 7)
        release_generation_credit_reservation(self.db, task=task, reason='provider_failed')
        release_generation_credit_reservation(self.db, task=task, reason='retry')
        self.assertEqual(self.balance(self.june)['purchased_remaining'], 300)

    def test_purchase_consumption_never_revives_and_isolated_from_other_users(self):
        self.grant(credits=7)
        task, _ = self.task(credits=10, now=self.may)
        consume_generation_credit_reservation(self.db, task=task, usage_metadata={})
        self.assertEqual(self.balance(self.june)['available_total'], 3)
        other = self.new_user()
        self.assertEqual(generation_credit_balance_snapshot(self.db, other, now=self.june)['purchased_total'], 0)
        self.assertEqual(self.balance(datetime(2026, 7, 1, tzinfo=timezone.utc))['purchased_remaining'], 0)

    def test_legacy_grant_remains_monthly_and_is_not_restored(self):
        self.grant(persistent=False)
        self.assertEqual(self.balance(self.may)['monthly_remaining'], 303)
        self.assertEqual(self.balance(self.june)['available_total'], 3)

    def test_downgrade_cannot_deduct_from_purchased_pool(self):
        self.grant()
        with patch('app.services.generation_credit_reservations.monthly_generation_credit_limit_for_plan', return_value=20):
            task, _ = self.task(credits=20, now=self.may)
            consume_generation_credit_reservation(self.db, task=task, usage_metadata={})
        self.user.plan = UserPlan.free
        balance = self.balance(self.may)
        self.assertEqual(balance['monthly_remaining'], 0)
        self.assertEqual(balance['available_total'], 300)

    def test_rolling_deployment_legacy_worker_ledger_uses_reservation_allocation(self):
        self.grant()
        task, reservation = self.task(credits=10, now=self.may)
        ledger = UsageLedger(user_id=self.user.id, usage_type='image_generation_credit', amount=10,
                             unit='credits', bill_date=self.may.date(), metadata_json={})
        self.db.add(ledger)
        self.db.flush()
        reservation.status = 'consumed'
        reservation.consumed_usage_ledger_id = ledger.id
        self.db.flush()
        balance = self.balance(self.june)
        self.assertEqual(balance['purchased_used'], 7)
        self.assertEqual(balance['purchased_remaining'], 293)

    def test_malformed_allocation_fails_closed(self):
        self.grant()
        task, _ = self.task(credits=10, now=self.may)
        for allocation in ({'version': 1, 'monthly': -1, 'purchased': 11},
                           {'version': 1, 'monthly': 3, 'purchased': 6},
                           {'version': 1, 'monthly': True, 'purchased': 9}, None):
            task.request_payload = {'credit_allocation': allocation}
            self.db.flush()
            with self.assertRaises(GenerationCreditReservationError):
                self.balance(self.june)
            with self.assertRaises(GenerationCreditReservationError):
                consume_generation_credit_reservation(self.db, task=task, usage_metadata={})

    def test_distinct_webhook_deliveries_for_same_order_grant_once(self):
        from app.services.lemonsqueezy_webhooks import LemonSqueezyWebhookEvent, _process_image_credit_pack_order

        self.db.commit()
        user_id = self.user.id
        order_id = f'order_{uuid4().hex}'
        barrier = threading.Barrier(2)
        outcomes, errors = [], []

        def deliver(index):
            try:
                with self.Session() as db:
                    user = db.query(User).filter(User.id == user_id).one()
                    event = LemonSqueezyWebhookEvent(
                        event_name='order_created', payload={}, meta={'custom_data': {'credits': '300'}},
                        data={'attributes': {'first_order_item': {'variant_id': 'test_persistent_variant'}}},
                        event_hash=f'{order_id}_{index}', test_mode=False, resource_type='orders', resource_id=order_id,
                    )
                    barrier.wait(timeout=10)
                    result, _ = _process_image_credit_pack_order(db, event, user)
                    db.commit()
                    outcomes.append(result)
            except Exception as error:
                errors.append(error)

        with patch('app.services.lemonsqueezy_webhooks.settings.lemonsqueezy_image_credit_pack_variant_id', 'test_persistent_variant'), \
             patch('app.services.lemonsqueezy_webhooks.record_credit_confirmed'), \
             patch('app.services.lemonsqueezy_webhooks.record_product_event'):
            threads = [threading.Thread(target=deliver, args=(index,)) for index in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=15)
        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(errors, [])
        self.assertCountEqual(outcomes, ['credit_pack_granted', 'credit_pack_already_granted'])
        self.assertEqual(self.db.query(UsageLedger).filter(
            UsageLedger.user_id == user_id,
            UsageLedger.metadata_json.contains({'grant_type': 'lemonsqueezy_credit_pack', 'order_id': order_id}),
        ).count(), 1)


if __name__ == '__main__':
    unittest.main()
