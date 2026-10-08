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

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.errors import ApiHTTPException
from app.core.config import settings
from app.db.models import (
    Photo, PhotoStatus, Review, ReviewCallCost, ReviewMode, ReviewQuotaReservation, ReviewTask,
    ReviewTaskEvent, TaskStatus, UsageLedger, User, UserPlan, UserStatus,
)
from app.services.guard import increment_quota, user_usage_snapshot
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
                db.query(ReviewQuotaReservation).filter(ReviewQuotaReservation.user_id == self.user_id).delete()
                db.query(Review).filter(Review.owner_user_id == self.user_id).delete()
                db.query(ReviewTask).filter(ReviewTask.owner_user_id == self.user_id).delete()
                db.query(Photo).filter(Photo.owner_user_id == self.user_id).delete()
                db.query(User).filter(User.id == self.user_id).delete()
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
