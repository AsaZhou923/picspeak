from __future__ import annotations

import os
import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.errors import ApiHTTPException
from app.core.config import settings
from app.db.models import (
    Photo, PhotoStatus, Review, ReviewCallCost, ReviewMode, ReviewQuotaReservation, ReviewStatus, ReviewTask,
    IdempotencyKey, RateLimitCounter, ReviewTaskEvent, TaskStatus, UsageLedger, User, UserPlan, UserStatus,
)
from app.services.guard import (
    enforce_guest_review_limits, guest_usage_snapshot, increment_quota,
    enforce_pro_review_soft_rate_limit, release_task_guest_review_quota, user_usage_snapshot,
)
from app.services.ai import AIReviewError, AIReviewResponse, notify_ai_provider_call
from app.services.review_quota_reservations import (
    reserve_review_quota, consume_review_quota, release_review_quota,
    synchronous_review_quota,
)
from app.services.review_task_processor import process_review_task, _claim_task, _ensure_review_claim, ReviewTaskLeaseLost

DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '')


@unittest.skipUnless(DATABASE_URL, 'requires disposable PostgreSQL')
class ReviewReliabilityPostgresTests(unittest.TestCase):
    def setUp(self):
        self._signed_url_patcher = patch(
            'app.services.review_task_processor.get_object_read_url',
            return_value='https://signed.example.test/reliability.jpg',
        )
        self._signed_url_patcher.start()
        self.engine = create_engine(DATABASE_URL)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.suffix = uuid4().hex
        with self.Session() as db:
            user = User(public_id='usr_reliability_' + self.suffix, email=self.suffix + '@example.test',
                        username=self.suffix, plan=UserPlan.free, status=UserStatus.active,
                        daily_quota_date=datetime.now(timezone.utc).date(), daily_quota_used=4, daily_quota_total=5)
            db.add(user)
            db.flush()
            self.user_id = user.id
            photo = Photo(public_id='pho_reliability_' + self.suffix, owner_user_id=user.id,
                          upload_id='upl_' + self.suffix, bucket='fixture', object_key=self.suffix + '.jpg',
                          content_type='image/jpeg', size_bytes=10, status=PhotoStatus.READY)
            db.add(photo)
            db.flush()
            self.photo_id = photo.id
            db.commit()

    def tearDown(self):
        try:
            with self.Session() as db:
                tasks = db.query(ReviewTask.id).filter(ReviewTask.owner_user_id == self.user_id)
                db.query(ReviewTaskEvent).filter(ReviewTaskEvent.task_id.in_(tasks)).delete(synchronize_session=False)
                db.query(ReviewCallCost).filter(ReviewCallCost.task_id.in_(tasks)).delete(synchronize_session=False)
                db.query(UsageLedger).filter(UsageLedger.user_id == self.user_id).delete()
                db.query(IdempotencyKey).filter(IdempotencyKey.user_id == self.user_id).delete()
                db.query(ReviewQuotaReservation).filter(ReviewQuotaReservation.user_id == self.user_id).delete()
                db.query(Review).filter(Review.owner_user_id == self.user_id).delete()
                db.query(ReviewTask).filter(ReviewTask.owner_user_id == self.user_id).delete()
                db.query(Photo).filter(Photo.owner_user_id == self.user_id).delete()
                db.query(User).filter(User.id == self.user_id).delete()
                db.query(RateLimitCounter).filter(RateLimitCounter.scope_key.like(f'%{self.suffix}%')).delete(synchronize_session=False)
                db.commit()
            self.engine.dispose()
        finally:
            self._signed_url_patcher.stop()

    def _task(self):
        with self.Session() as db:
            task = ReviewTask(public_id='tsk_reliability_' + uuid4().hex, owner_user_id=self.user_id,
                              photo_id=self.photo_id, mode=ReviewMode.flash, status=TaskStatus.PENDING,
                              expire_at=datetime.now(timezone.utc) + timedelta(minutes=30))
            db.add(task)
            db.commit()
            return task.public_id

    def test_last_daily_slot_is_reserved_once_by_concurrent_sessions(self):
        barrier = threading.Barrier(2)
        def reserve():
            with self.Session() as db:
                user = db.get(User, self.user_id)
                barrier.wait(timeout=5)
                try:
                    hold = reserve_review_quota(db, user, mode=ReviewMode.flash)
                    db.commit()
                    return hold.id
                except ApiHTTPException as exc:
                    db.rollback()
                    self.assertEqual(exc.detail['code'], 'QUOTA_EXCEEDED')
                    return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: reserve(), range(2)))
        self.assertEqual(sum(item is not None for item in results), 1)
        with self.Session() as db:
            self.assertEqual(user_usage_snapshot(db, db.get(User, self.user_id))['daily_remaining'], 0)
            self.assertEqual(db.get(User, self.user_id).daily_quota_used, 4)

    def test_release_restores_allowance_and_consume_cannot_repeat(self):
        with self.Session() as db:
            user = db.get(User, self.user_id)
            hold = reserve_review_quota(db, user, mode=ReviewMode.flash)
            db.commit()
            release_review_quota(db, hold)
            db.commit()
            hold = reserve_review_quota(db, user, mode=ReviewMode.flash)
            db.commit()
            consume_review_quota(db, hold)
            increment_quota(db, user)
            db.commit()
            self.assertEqual(user.daily_quota_used, 5)
            with self.assertRaises(ApiHTTPException):
                consume_review_quota(db, hold)

    def test_expired_hold_does_not_block_or_allow_late_consumption(self):
        with self.Session() as db:
            user = db.get(User, self.user_id)
            hold = reserve_review_quota(db, user, mode=ReviewMode.flash)
            hold.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()
            with self.assertRaises(ApiHTTPException):
                consume_review_quota(db, hold)
            db.rollback()
            fresh = reserve_review_quota(db, user, mode=ReviewMode.flash)
            db.commit()
            self.assertNotEqual(fresh.id, hold.id)

    def test_monthly_and_pro_limits_include_holds_without_cross_charging_modes(self):
        with self.Session() as db:
            user = db.get(User, self.user_id)
            user.daily_quota_used = 0
            db.commit()
            with patch.object(settings, 'free_review_limit_per_month', 1):
                hold = reserve_review_quota(db, user, mode=ReviewMode.flash)
                db.commit()
                with self.assertRaises(ApiHTTPException):
                    reserve_review_quota(db, user, mode=ReviewMode.flash)
                db.rollback()
                release_review_quota(db, hold)
                db.commit()
            with patch.object(settings, 'free_pro_review_limit_per_month', 1):
                reserve_review_quota(db, user, mode=ReviewMode.pro)
                db.commit()
                reserve_review_quota(db, user, mode=ReviewMode.flash)
                db.commit()
                with self.assertRaises(ApiHTTPException):
                    reserve_review_quota(db, user, mode=ReviewMode.pro)
                db.rollback()

    def test_previous_day_consumption_does_not_charge_the_new_day(self):
        with self.Session() as db:
            user = db.get(User, self.user_id)
            increment_quota(db, user, bill_date=datetime.now(timezone.utc).date() - timedelta(days=1))
            db.commit()
            self.assertEqual(user.daily_quota_used, 4)

    def test_synchronous_provider_failure_releases_durable_hold(self):
        with self.Session() as db:
            with self.assertRaisesRegex(RuntimeError, 'provider failed'):
                with synchronous_review_quota(db, db.get(User, self.user_id), mode=ReviewMode.flash):
                    raise RuntimeError('provider failed')
            self.assertEqual(db.query(ReviewQuotaReservation).filter_by(user_id=self.user_id, status='held').count(), 0)

    def test_atomic_increment_preserves_both_updates_from_stale_sessions(self):
        with self.Session() as one, self.Session() as two:
            a, b = one.get(User, self.user_id), two.get(User, self.user_id)
            increment_quota(one, a)
            one.commit()
            increment_quota(two, b)
            two.commit()
        with self.Session() as db:
            self.assertEqual(db.get(User, self.user_id).daily_quota_used, 6)

    def test_duplicate_cloud_dispatch_does_not_enter_processing(self):
        public_id = self._task()
        entered, release = threading.Event(), threading.Event()
        def process(_db, _task, *, claim_token):
            self.assertTrue(claim_token.startswith('cloud-tasks:'))
            entered.set()
            release.wait(timeout=5)
        with patch('app.services.review_task_processor.SessionLocal', self.Session), patch(
            'app.services.review_task_processor._process_task', side_effect=process,
        ) as provider:
            with ThreadPoolExecutor(max_workers=1) as pool:
                first = pool.submit(process_review_task, public_id, worker_name='cloud-tasks')
                try:
                    self.assertTrue(entered.wait(timeout=5))
                    second = process_review_task(public_id, worker_name='cloud-tasks')
                    self.assertEqual(second['reason'], 'lease_mismatch')
                finally:
                    release.set()
                first.result(timeout=5)
            self.assertEqual(provider.call_count, 1)

    def test_superseded_claim_cannot_write_or_settle_quota(self):
        public_id = self._task()
        with self.Session() as old:
            task = old.query(ReviewTask).filter_by(public_id=public_id).one()
            task.status, task.claimed_by = TaskStatus.RUNNING, 'old:claim'
            old.commit()
            with self.Session() as fresh:
                fresh.query(ReviewTask).filter_by(id=task.id).update({'claimed_by': 'new:claim'})
                fresh.commit()
            with self.assertRaises(ReviewTaskLeaseLost):
                _ensure_review_claim(old, task, 'old:claim')
            old.rollback()

    def test_retry_mints_a_new_token_even_when_invoked_with_an_old_claim(self):
        public_id = self._task()
        with patch('app.services.review_task_processor.SessionLocal', self.Session), patch(
            'app.services.review_task_processor._process_task',
        ) as process:
            process_review_task(public_id, worker_name='worker', claim_token='worker:old')
            token = process.call_args.kwargs['claim_token']
            self.assertNotEqual(token, 'worker:old')
            with self.Session() as db:
                self.assertEqual(db.query(ReviewTask).filter_by(public_id=public_id).one().claimed_by, token)

    def test_claim_refreshes_task_even_when_session_keeps_objects_after_commit(self):
        public_id = self._task()
        with self.Session() as db:
            task = db.query(ReviewTask).filter_by(public_id=public_id).one()
            self.assertTrue(_claim_task(db, task.id, 'worker:new'))
            self.assertEqual(task.status, TaskStatus.RUNNING)
            self.assertEqual(task.claimed_by, 'worker:new')

    def test_worker_settles_last_slot_with_one_review_and_one_ledger_entry(self):
        public_id = self._task()
        response = AIReviewResponse(
            result=SimpleNamespace(final_score=7.0, model_dump=lambda: {'scores': {}, 'final_score': 7.0}),
            model_name='fixture', model_version='fixture', prompt_version='fixture',
        )
        with (
            patch('app.services.review_task_processor.SessionLocal', self.Session),
            patch('app.services.review_task_processor.canonical_score_cache_lease', return_value=nullcontext(None)),
            patch('app.services.review_task_processor.run_ai_review', return_value=response) as provider,
        ):
            process_review_task(public_id, worker_name='worker')
            process_review_task(public_id, worker_name='worker')
            self.assertEqual(provider.call_count, 1)
        with self.Session() as db:
            task = db.query(ReviewTask).filter_by(public_id=public_id).one()
            self.assertEqual(task.status, TaskStatus.SUCCEEDED)
            self.assertEqual(db.get(User, self.user_id).daily_quota_used, 5)
            self.assertEqual(db.query(UsageLedger).filter_by(task_id=task.id).count(), 1)
            self.assertEqual(db.query(ReviewQuotaReservation).filter_by(task_id=task.id).one().status, 'consumed')
            review = db.query(Review).filter_by(task_id=task.id).one()
            self.assertEqual(review.result_json['billing_info']['remaining_quota']['daily_remaining'], 0)

    def test_superseded_success_persists_provider_cost_without_result_mutation(self):
        public_id = self._task()
        response = AIReviewResponse(
            result=SimpleNamespace(final_score=7.0, model_dump=lambda: {'scores': {}, 'final_score': 7.0}),
            model_name='fixture', model_version='fixture', prompt_version='fixture',
        )
        replacement_claim = 'new:claim'

        def provider(*_args, **_kwargs):
            notify_ai_provider_call(
                stage='writer',
                outcome='succeeded',
                model_name='gpt-6-luna',
                usage={'input_tokens': 100, 'output_tokens': 20},
            )
            with self.Session() as fresh:
                fresh.query(ReviewTask).filter_by(public_id=public_id).update({
                    'claimed_by': replacement_claim,
                    'attempt_count': ReviewTask.attempt_count + 1,
                })
                fresh.commit()
            return response

        with (
            patch('app.services.review_task_processor.SessionLocal', self.Session),
            patch('app.services.review_task_processor.canonical_score_cache_lease', return_value=nullcontext(None)),
            patch('app.services.review_call_costs.SessionLocal', self.Session),
            patch('app.services.review_task_processor.run_ai_review', side_effect=provider),
        ):
            result = process_review_task(public_id, worker_name='worker')

        self.assertEqual(result['reason'], 'lease_mismatch')
        with self.Session() as db:
            task = db.query(ReviewTask).filter_by(public_id=public_id).one()
            self.assertEqual(task.status, TaskStatus.RUNNING)
            self.assertEqual(task.claimed_by, 'new:claim')
            self.assertEqual(task.attempt_count, 2)
            self.assertEqual(db.query(Review).filter_by(task_id=task.id).count(), 0)
            self.assertEqual(db.query(UsageLedger).filter_by(task_id=task.id).count(), 0)
            records = db.query(ReviewCallCost).filter_by(task_id=task.id).all()
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0].call_key, 'attempt:1:writer')
            self.assertEqual(records[0].outcome, 'succeeded')
            self.assertEqual(records[0].input_tokens, 100)

    def test_superseded_callback_exception_persists_unknown_cost_for_original_attempt(self):
        public_id = self._task()

        def provider(*_args, **_kwargs):
            notify_ai_provider_call(
                stage='scorer',
                outcome='unknown',
                model_name='gpt-6-luna',
                usage={'input_tokens': 90, 'output_tokens': 15},
                sequence='initial',
            )
            with self.Session() as fresh:
                fresh.query(ReviewTask).filter_by(public_id=public_id).update({
                    'claimed_by': 'new:claim',
                    'attempt_count': ReviewTask.attempt_count + 1,
                })
                fresh.commit()
            raise ReviewTaskLeaseLost('checkpoint lost lease')

        with (
            patch('app.services.review_task_processor.SessionLocal', self.Session),
            patch('app.services.review_task_processor.canonical_score_cache_lease', return_value=nullcontext(None)),
            patch('app.services.review_call_costs.SessionLocal', self.Session),
            patch('app.services.review_task_processor.run_ai_review', side_effect=provider),
        ):
            result = process_review_task(public_id, worker_name='worker')

        self.assertEqual(result['reason'], 'lease_mismatch')
        with self.Session() as db:
            task = db.query(ReviewTask).filter_by(public_id=public_id).one()
            self.assertEqual(task.status, TaskStatus.RUNNING)
            self.assertEqual(task.claimed_by, 'new:claim')
            self.assertEqual(task.attempt_count, 2)
            self.assertEqual(db.query(Review).filter_by(task_id=task.id).count(), 0)
            self.assertEqual(db.query(UsageLedger).filter_by(task_id=task.id).count(), 0)
            records = db.query(ReviewCallCost).filter_by(task_id=task.id).all()
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0].call_key, 'attempt:1:scorer:initial')
            self.assertEqual(records[0].outcome, 'unknown')
            self.assertEqual(records[0].input_tokens, 90)

    def test_superseded_failure_persists_provider_cost_without_retry_mutation(self):
        public_id = self._task()

        def provider(*_args, **_kwargs):
            notify_ai_provider_call(
                stage='writer',
                outcome='failed',
                model_name='gpt-6-luna',
                usage={'input_tokens': 80, 'output_tokens': 10},
            )
            with self.Session() as fresh:
                fresh.query(ReviewTask).filter_by(public_id=public_id).update({'claimed_by': 'new:claim'})
                fresh.commit()
            raise AIReviewError('writer timed out', stage='writing')

        with (
            patch('app.services.review_task_processor.SessionLocal', self.Session),
            patch('app.services.review_task_processor.canonical_score_cache_lease', return_value=nullcontext(None)),
            patch('app.services.review_call_costs.SessionLocal', self.Session),
            patch('app.services.review_task_processor.run_ai_review', side_effect=provider),
        ):
            result = process_review_task(public_id, worker_name='worker')

        self.assertEqual(result['reason'], 'lease_mismatch')
        with self.Session() as db:
            task = db.query(ReviewTask).filter_by(public_id=public_id).one()
            self.assertEqual(task.status, TaskStatus.RUNNING)
            self.assertEqual(task.claimed_by, 'new:claim')
            self.assertIsNone(task.next_attempt_at)
            self.assertIsNone(task.error_code)
            self.assertEqual(db.query(Review).filter_by(task_id=task.id).count(), 0)
            self.assertEqual(db.query(UsageLedger).filter_by(task_id=task.id).count(), 0)
            records = db.query(ReviewCallCost).filter_by(task_id=task.id).all()
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0].call_key, 'attempt:1:writer')
            self.assertEqual(records[0].outcome, 'failed')
            self.assertEqual(records[0].input_tokens, 80)

    def test_single_guest_daily_slot_is_admitted_once_under_concurrency(self):
        now = datetime(2026, 11, 1, 12, tzinfo=timezone.utc)
        key = f'guest-slot:{self.suffix}'
        network = f'network-slot:{self.suffix}'
        actor = SimpleNamespace(plan=UserPlan.guest)
        barrier = threading.Barrier(2)

        def admit():
            with self.Session() as db:
                barrier.wait(timeout=10)
                try:
                    limits = enforce_guest_review_limits(
                        db, actor, request_scope_key=key, quota_scope_key=key, network_scope_key=network,
                    )
                    db.commit()
                    return limits
                except ApiHTTPException as exc:
                    db.rollback()
                    self.assertEqual(exc.detail['code'], 'RATE_LIMIT_EXCEEDED')
                    return None

        with patch('app.services.guard.utc_now', return_value=now), patch(
            'app.services.guard.settings.guest_review_limit_per_day', 1,
        ), ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: admit(), range(2)))
        self.assertEqual(sum(result is not None for result in results), 1)
        with self.Session() as db:
            counters = {row.scope: row.hit_count for row in db.query(RateLimitCounter).filter(
                RateLimitCounter.scope_key.in_([key, network]),
            ).all()}
            self.assertEqual(counters['guest_review_daily'], 1)
            self.assertEqual(counters['guest_review_monthly'], 1)
            self.assertEqual(counters['guest_review_network_daily'], 1)
            snapshot = guest_usage_snapshot(db, key, network_scope_key=network, now=now)
            self.assertEqual(snapshot['daily_total'], 1)
            self.assertEqual(snapshot['daily_remaining'], 0)
            self.assertEqual(snapshot['monthly_remaining'], 29)
            tomorrow = guest_usage_snapshot(db, key, network_scope_key=network, now=now + timedelta(days=1))
            self.assertEqual(tomorrow['daily_remaining'], 1)
            self.assertEqual(tomorrow['monthly_remaining'], 29)
            next_month = guest_usage_snapshot(db, key, network_scope_key=network, now=datetime(2026, 12, 1, tzinfo=timezone.utc))
            self.assertEqual(next_month['daily_remaining'], 1)
            self.assertEqual(next_month['monthly_remaining'], 30)

    def test_failed_guest_task_releases_its_one_personal_slot_once_without_refunding_network(self):
        now = datetime(2026, 11, 1, 12, tzinfo=timezone.utc)
        key, network = f'guest-release:{self.suffix}', f'network-release:{self.suffix}'
        actor = SimpleNamespace(plan=UserPlan.guest)
        with self.Session() as db, patch('app.services.guard.utc_now', return_value=now), patch(
            'app.services.guard.settings.guest_review_limit_per_day', 1,
        ):
            limits = enforce_guest_review_limits(
                db, actor, request_scope_key=key, quota_scope_key=key, network_scope_key=network,
            )
            task = ReviewTask(
                public_id=f'tsk_guest_release_{self.suffix}', owner_user_id=self.user_id, photo_id=self.photo_id,
                mode=ReviewMode.flash, status=TaskStatus.FAILED, expire_at=now + timedelta(minutes=30),
                request_payload={'_guest_quota_reservations': limits['_quota_reservations']},
            )
            db.add(task)
            db.commit()
            release_task_guest_review_quota(db, task)
            release_task_guest_review_quota(db, task)
            db.commit()
            counters = {row.scope: row.hit_count for row in db.query(RateLimitCounter).filter(
                RateLimitCounter.scope_key.in_([key, network]),
            ).all()}
            self.assertEqual(counters['guest_review_daily'], 0)
            self.assertEqual(counters['guest_review_monthly'], 0)
            self.assertEqual(counters['guest_review_minute'], 1)
            self.assertEqual(counters['guest_review_network_daily'], 1)
            self.assertEqual(counters['guest_review_network_monthly'], 1)
            self.assertEqual(guest_usage_snapshot(db, key, network_scope_key=network, now=now)['daily_remaining'], 1)
            enforce_guest_review_limits(db, actor, request_scope_key=key, quota_scope_key=key, network_scope_key=network)
            db.commit()
            self.assertEqual(guest_usage_snapshot(db, key, network_scope_key=network, now=now)['daily_remaining'], 0)

    def test_pro_soft_threshold_tracks_successful_modes_and_pairing_but_never_blocks_admission(self):
        at = datetime(2026, 11, 30, 23, 59, tzinfo=timezone.utc)
        with self.Session() as db:
            user = db.get(User, self.user_id)
            user.plan = UserPlan.pro
            db.add_all([
                UsageLedger(user_id=user.id, usage_type='review_request', amount=148, unit='request', bill_date=at.date(), metadata_json={'mode': 'flash'}),
                UsageLedger(user_id=user.id, usage_type='review_request', amount=1, unit='request', bill_date=at.date(), metadata_json={'mode': 'pro'}),
                UsageLedger(user_id=user.id, usage_type='image_generation_credit', amount=800, unit='credits', bill_date=at.date()),
                UsageLedger(user_id=user.id, usage_type='review_request', amount=90, unit='request', bill_date=at.date().replace(month=10)),
            ])
            db.commit()
            with patch('app.services.guard.settings.pro_review_soft_limit_per_month', 150):
                before = user_usage_snapshot(db, user, now=at)
                self.assertEqual(before['monthly_soft_used'], 149)
                self.assertFalse(before['monthly_soft_reached'])
                self.assertEqual(before['monthly_soft_resets_at'], datetime(2026, 12, 1, tzinfo=timezone.utc))
                db.add(UsageLedger(
                    user_id=user.id, usage_type='review_request', amount=1, unit='request', bill_date=at.date(),
                    metadata_json={'mode': 'pro', 'analysis_type': 'retake_compare'},
                ))
                db.commit()
                reached = user_usage_snapshot(db, user, now=at)
                self.assertEqual(reached['monthly_soft_limit'], 150)
                self.assertEqual(reached['monthly_soft_used'], 150)
                self.assertTrue(reached['monthly_soft_reached'])
                # Reservations count no successful use and remain available
                # beyond the threshold in either trusted mode.
                for mode in (ReviewMode.flash, ReviewMode.pro):
                    reservation = reserve_review_quota(db, user, mode=mode)
                    self.assertEqual(reservation.status, 'held')
                db.commit()
                self.assertEqual(user_usage_snapshot(db, user, now=at)['monthly_soft_used'], 150)
                db.add(UsageLedger(user_id=user.id, usage_type='review_request', amount=1, unit='request', bill_date=at.date()))
                db.commit()
                after = user_usage_snapshot(db, user, now=at)
                self.assertEqual(after['monthly_soft_used'], 151)
                self.assertTrue(after['monthly_soft_reached'])
                for field in ('daily_total', 'daily_remaining', 'monthly_total', 'monthly_used', 'monthly_remaining', 'pro_monthly_total'):
                    self.assertIsNone(after[field])
                local_december = user_usage_snapshot(
                    db, user, now=datetime(2026, 12, 1, tzinfo=timezone(timedelta(hours=9))),
                )
                self.assertEqual(local_december['monthly_soft_used'], 151)
                self.assertEqual(local_december['monthly_soft_resets_at'], datetime(2026, 12, 1, tzinfo=timezone.utc))
                new_month = user_usage_snapshot(db, user, now=datetime(2026, 12, 1, tzinfo=timezone.utc))
                self.assertEqual(new_month['monthly_soft_used'], 0)
                self.assertFalse(new_month['monthly_soft_reached'])
                self.assertEqual(new_month['monthly_soft_resets_at'], datetime(2027, 1, 1, tzinfo=timezone.utc))
                user.plan = UserPlan.free
                free = user_usage_snapshot(db, user, now=at)
                for field in ('monthly_soft_limit', 'monthly_soft_used', 'monthly_soft_reached', 'monthly_soft_resets_at'):
                    self.assertIsNone(free[field])

    def _seed_pro_soft_threshold(self, now, *, used=150):
        with self.Session() as db:
            db.get(User, self.user_id).plan = UserPlan.pro
            db.add(UsageLedger(user_id=self.user_id, usage_type='review_request', amount=used, unit='count', bill_date=now.date()))
            db.commit()

    def test_pro_soft_rate_has_two_atomic_slots_then_resets_across_minute_and_month(self):
        now = datetime(2026, 11, 30, 12, 0, 10, tzinfo=timezone.utc)
        self._seed_pro_soft_threshold(now)
        barrier = threading.Barrier(3)

        def admit():
            with self.Session() as db:
                user = db.get(User, self.user_id)
                barrier.wait(timeout=10)
                try:
                    result = enforce_pro_review_soft_rate_limit(db, user)
                    db.commit()
                    return result
                except ApiHTTPException as exc:
                    db.rollback()
                    self.assertEqual(exc.detail['code'], 'PRO_REVIEW_RATE_LIMITED')
                    self.assertEqual(exc.headers['Retry-After'], '50')
                    self.assertEqual(exc.detail['extra']['retry_after_seconds'], 50)
                    return None

        with patch('app.services.guard.utc_now', return_value=now), ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda _: admit(), range(3)))
        self.assertEqual(sum(result is not None for result in results), 2)
        with self.Session() as db:
            user = db.get(User, self.user_id)
            self.assertEqual(db.query(RateLimitCounter).filter_by(scope='pro_review_soft_minute', scope_key=f'user:{user.public_id}').one().hit_count, 2)
            with patch('app.services.guard.utc_now', return_value=now.replace(second=59, microsecond=900000)):
                with self.assertRaises(ApiHTTPException) as rejected:
                    enforce_pro_review_soft_rate_limit(db, user)
                self.assertEqual(rejected.exception.headers['Retry-After'], '1')
            with patch('app.services.guard.utc_now', return_value=now + timedelta(minutes=1)):
                self.assertEqual(enforce_pro_review_soft_rate_limit(db, user)['remaining'], 1)
            db.commit()
            with patch('app.services.guard.utc_now', return_value=datetime(2026, 12, 1, tzinfo=timezone.utc)):
                for _ in range(3):
                    self.assertEqual(enforce_pro_review_soft_rate_limit(db, user), {})
            self.assertEqual(db.query(RateLimitCounter).filter_by(scope='pro_review_soft_minute', scope_key=f'user:{user.public_id}').count(), 2)

    def test_pro_below_threshold_has_no_additional_rate_counter(self):
        now = datetime.now(timezone.utc)
        self._seed_pro_soft_threshold(now, used=149)
        with self.Session() as db, patch('app.services.guard.utc_now', return_value=now):
            user = db.get(User, self.user_id)
            for _ in range(3):
                self.assertEqual(enforce_pro_review_soft_rate_limit(db, user), {})
            self.assertEqual(db.query(RateLimitCounter).filter_by(scope='pro_review_soft_minute', scope_key=f'user:{user.public_id}').count(), 0)

    def test_async_replay_does_not_take_a_second_slot_and_accepted_task_executes_when_slots_are_full(self):
        from app.api.deps import CurrentActor
        from app.api.routers.review_create import create_review
        from app.schemas import ReviewCreateRequest

        now = datetime.now(timezone.utc).replace(second=10, microsecond=0)
        self._seed_pro_soft_threshold(now)
        barrier = threading.Barrier(2)
        with self.Session() as db:
            source_photo = Photo(
                public_id=f'pho_soft_source_{self.suffix}', owner_user_id=self.user_id,
                upload_id=f'upl_soft_source_{self.suffix}', bucket='fixture', object_key=f'{self.suffix}-source.jpg',
                content_type='image/jpeg', size_bytes=10, status=PhotoStatus.READY,
            )
            db.add(source_photo)
            db.flush()
            source = Review(
                public_id=f'rev_soft_source_{self.suffix}', photo_id=source_photo.id, owner_user_id=self.user_id,
                mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, schema_version='1.0', result_json={}, final_score=6,
            )
            db.add(source)
            db.commit()
            source_public_id = source.public_id

        def create(key, mode='flash', *, concurrent=False, paired=False):
            with self.Session() as db:
                user, photo = db.get(User, self.user_id), db.get(Photo, self.photo_id)
                payload = ReviewCreateRequest.model_validate({
                    'photo_id': photo.public_id, 'mode': mode, 'async': True,
                    'idempotency_key': key, 'review_model': 'qwen',
                    **({'analysis_type': 'retake_compare', 'source_review_id': source_public_id} if paired else {}),
                })
                request = Request({'type': 'http', 'headers': [], 'scheme': 'http', 'server': ('testserver', 80)})
                if concurrent:
                    barrier.wait(timeout=10)
                try:
                    return create_review(payload, request, db, CurrentActor(user))
                except Exception:
                    db.rollback()
                    raise

        key = f'pro-idempotent-{self.suffix}'
        with patch('app.services.guard.utc_now', return_value=now), patch(
            'app.api.routers.review_create.settings.cloud_tasks_enabled', False,
        ):
            with ThreadPoolExecutor(max_workers=2) as pool:
                replayed = list(pool.map(lambda _: create(key, concurrent=True), range(2)))
            self.assertEqual(replayed[0]['task_id'], replayed[1]['task_id'])
            create(f'pro-second-{self.suffix}', mode='pro')
            self.assertEqual(create(key)['task_id'], replayed[0]['task_id'])
            with self.assertRaises(ApiHTTPException) as rejected:
                create(f'pro-third-{self.suffix}', mode='pro', paired=True)
            self.assertEqual(rejected.exception.status_code, 429)
            self.assertEqual(rejected.exception.detail['code'], 'PRO_REVIEW_RATE_LIMITED')
            with self.Session() as db:
                self.assertEqual(db.query(ReviewTask).filter_by(owner_user_id=self.user_id).count(), 2)
                user = db.get(User, self.user_id)
                self.assertEqual(db.query(RateLimitCounter).filter_by(scope='pro_review_soft_minute', scope_key=f'user:{user.public_id}').one().hit_count, 2)
            response = AIReviewResponse(
                result=SimpleNamespace(final_score=7.0, model_dump=lambda: {'scores': {}, 'final_score': 7.0}),
                model_name='fixture', model_version='fixture', prompt_version='fixture',
            )
            with patch('app.services.review_task_processor.SessionLocal', self.Session), patch(
                'app.services.review_task_processor.canonical_score_cache_lease', return_value=nullcontext(None),
            ), patch('app.services.review_task_processor.run_ai_review', return_value=response) as provider:
                process_review_task(replayed[0]['task_id'], worker_name='worker')
                process_review_task(replayed[0]['task_id'], worker_name='worker')
                self.assertEqual(provider.call_count, 1)
            with self.Session() as db:
                user = db.get(User, self.user_id)
                task = db.query(ReviewTask).filter_by(public_id=replayed[0]['task_id']).one()
                self.assertEqual(task.status, TaskStatus.SUCCEEDED)
                self.assertEqual(db.query(RateLimitCounter).filter_by(scope='pro_review_soft_minute', scope_key=f'user:{user.public_id}').one().hit_count, 2)

    def test_synchronous_admission_shares_the_rate_and_rolls_back_a_rejected_hold(self):
        now = datetime.now(timezone.utc)
        self._seed_pro_soft_threshold(now)
        with self.Session() as db, patch('app.services.guard.utc_now', return_value=now):
            user = db.get(User, self.user_id)
            for mode in (ReviewMode.flash, ReviewMode.pro):
                with synchronous_review_quota(db, user, mode=mode) as hold:
                    release_review_quota(db, hold)
                    db.commit()
            with self.assertRaises(ApiHTTPException) as rejected:
                with synchronous_review_quota(db, user, mode=ReviewMode.flash):
                    self.fail('Rejected admission must not start provider work')
            self.assertEqual(rejected.exception.detail['code'], 'PRO_REVIEW_RATE_LIMITED')
            self.assertEqual(db.query(ReviewQuotaReservation).filter_by(user_id=self.user_id).count(), 2)
            self.assertEqual(db.query(RateLimitCounter).filter_by(scope='pro_review_soft_minute', scope_key=f'user:{user.public_id}').one().hit_count, 2)

    def _create_sync_pro_request(self, key, *, mode='flash'):
        from app.api.deps import CurrentActor
        from app.api.routers.review_create import create_review
        from app.schemas import ReviewCreateRequest

        with self.Session() as db:
            user, photo = db.get(User, self.user_id), db.get(Photo, self.photo_id)
            request = Request({'type': 'http', 'headers': [], 'scheme': 'http', 'server': ('testserver', 80)})
            payload = ReviewCreateRequest.model_validate({
                'photo_id': photo.public_id, 'mode': mode, 'async': False,
                'idempotency_key': key, 'review_model': 'qwen',
            })
            try:
                return create_review(payload, request, db, CurrentActor(user))
            except Exception:
                db.rollback()
                raise

    def test_sync_inflight_replay_does_not_consume_another_slot_or_call_provider_again(self):
        from app.schemas import ReviewCreateSyncResponse, ReviewResult

        now = datetime.now(timezone.utc).replace(second=10, microsecond=0)
        self._seed_pro_soft_threshold(now)
        entered, complete = threading.Event(), threading.Event()
        key = f'pro-sync-replay:{self.suffix}'
        response = AIReviewResponse(result=ReviewResult(final_score=6), model_name='qwen-fixture',
                                    model_version='fixture', prompt_version='fixture')

        def provider(*_args, **_kwargs):
            entered.set()
            self.assertTrue(complete.wait(timeout=15))
            return response

        with patch('app.services.guard.utc_now', return_value=now), patch(
            'app.api.routers.review_create.run_ai_review', side_effect=provider,
        ) as ai, patch('app.api.routers.review_create.get_object_read_url', return_value='https://fixture.invalid/photo.jpg'), patch(
            'app.api.routers.review_create.canonical_score_cache_lease', return_value=nullcontext(None),
        ), ThreadPoolExecutor(max_workers=1) as pool:
            first = pool.submit(self._create_sync_pro_request, key)
            try:
                self.assertTrue(entered.wait(timeout=10))
                with self.assertRaises(ApiHTTPException) as inflight:
                    self._create_sync_pro_request(key)
                self.assertEqual(inflight.exception.status_code, 409)
                self.assertEqual(inflight.exception.detail['code'], 'IDEMPOTENCY_IN_PROGRESS')
                self.assertEqual(inflight.exception.headers['Retry-After'], '1')
                with self.Session() as db:
                    user = db.get(User, self.user_id)
                    self.assertEqual(db.query(RateLimitCounter).filter_by(scope='pro_review_soft_minute', scope_key=f'user:{user.public_id}').one().hit_count, 1)
                self.assertEqual(ai.call_count, 1)
            finally:
                complete.set()
            original = first.result(timeout=15)
            replay = self._create_sync_pro_request(key)
            self.assertEqual(replay['review_id'], original['review_id'])
            self.assertEqual(
                ReviewCreateSyncResponse.model_validate(replay).model_dump(),
                ReviewCreateSyncResponse.model_validate(original).model_dump(),
            )
            with self.assertRaises(ApiHTTPException) as conflicting:
                self._create_sync_pro_request(key, mode='pro')
            self.assertEqual(conflicting.exception.detail['code'], 'IDEMPOTENCY_CONFLICT')
            self.assertEqual(ai.call_count, 1)
        with self.Session() as db:
            user = db.get(User, self.user_id)
            self.assertEqual(db.query(RateLimitCounter).filter_by(scope='pro_review_soft_minute', scope_key=f'user:{user.public_id}').one().hit_count, 1)
            self.assertEqual(db.query(Review).filter_by(owner_user_id=self.user_id).count(), 1)

    def test_sync_pro_key_can_retry_after_provider_failure_without_a_stuck_lease(self):
        from app.schemas import ReviewResult

        now = datetime.now(timezone.utc)
        self._seed_pro_soft_threshold(now)
        key = f'pro-sync-failure:{self.suffix}'
        response = AIReviewResponse(result=ReviewResult(final_score=6), model_name='qwen-fixture',
                                    model_version='fixture', prompt_version='fixture')
        with patch('app.services.guard.utc_now', return_value=now), patch(
            'app.api.routers.review_create.run_ai_review', side_effect=[AIReviewError('fixture failure'), response],
        ) as ai, patch('app.api.routers.review_create.get_object_read_url', return_value='https://fixture.invalid/photo.jpg'), patch(
            'app.api.routers.review_create.canonical_score_cache_lease', side_effect=lambda *_a, **_kw: nullcontext(None),
        ):
            with self.assertRaises(ApiHTTPException) as failure:
                self._create_sync_pro_request(key)
            self.assertEqual(failure.exception.detail['code'], 'AI_REVIEW_FAILED')
            completed = self._create_sync_pro_request(key)
            self.assertEqual(completed['status'], 'SUCCEEDED')
            self.assertEqual(ai.call_count, 2)
        with self.Session() as db:
            user = db.get(User, self.user_id)
            self.assertEqual(db.query(RateLimitCounter).filter_by(scope='pro_review_soft_minute', scope_key=f'user:{user.public_id}').one().hit_count, 2)
            self.assertEqual(db.query(ReviewQuotaReservation).filter_by(user_id=self.user_id, status='held').count(), 0)

    def test_sync_idempotency_lease_is_owner_scoped_and_released_on_every_exit(self):
        from app.services.review_quota_reservations import synchronous_review_idempotency_lease

        key = f'owner-scoped:{self.suffix}'
        with self.Session() as first, self.Session() as second:
            with synchronous_review_idempotency_lease(first, user_id=self.user_id, key=key):
                with synchronous_review_idempotency_lease(second, user_id=self.user_id + 1, key=key):
                    pass
                with self.assertRaises(ApiHTTPException):
                    with synchronous_review_idempotency_lease(second, user_id=self.user_id, key=key):
                        self.fail('Same owner/key cannot acquire a concurrent lease')
            with synchronous_review_idempotency_lease(second, user_id=self.user_id, key=key):
                pass
            with self.assertRaises(RuntimeError):
                with synchronous_review_idempotency_lease(first, user_id=self.user_id, key=key):
                    raise RuntimeError('fixture failure')
            with synchronous_review_idempotency_lease(second, user_id=self.user_id, key=key):
                pass
