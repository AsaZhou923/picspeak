from __future__ import annotations

import os
import sys
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import create_engine, delete, text
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import GenerationCreditReservation, ImageGenerationTask, ProductAnalyticsEvent, TaskStatus, UsageLedger, User, UserPlan
from app.services.generation_credit_reservations import reserve_generation_credits_for_task
from app.services.image_generation_task_processor import _handle_generation_failure, expire_image_generation_tasks

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class GenerationMaintenanceRacePostgresTests(unittest.TestCase):
    def test_terminal_failure_locks_task_before_settling_credits_during_stale_sweep(self):
        engine = create_engine(TEST_DATABASE_URL, connect_args={'options': '-c statement_timeout=8000 -c lock_timeout=5000'})
        self.addCleanup(engine.dispose)
        Session = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
        suffix = uuid4().hex
        claim_token = f'worker:{suffix}'
        with Session() as db:
            user = User(public_id=f'usr_race_{suffix}', email=f'{suffix}@example.test', username=suffix, plan=UserPlan.free)
            db.add(user)
            db.flush()
            task = ImageGenerationTask(
                public_id=f'igt_race_{suffix}', owner_user_id=user.id, status=TaskStatus.RUNNING,
                generation_mode='general', intent='photo_inspiration', prompt='race fixture', prompt_hash=suffix,
                attempt_count=1, max_attempts=1, claimed_by=claim_token,
                started_at=datetime.now(timezone.utc) - timedelta(hours=1),
                last_heartbeat_at=datetime.now(timezone.utc) - timedelta(hours=1),
                request_payload={},
            )
            db.add(task)
            with patch('app.services.generation_credit_reservations.monthly_generation_credit_limit_for_plan', return_value=3):
                reservation = reserve_generation_credits_for_task(db, user=user, task=task, credits=1)
            db.commit()
            user_id, task_id, reservation_id = user.id, task.id, reservation.id

        errors = []
        failure_pid = []
        failure_started = threading.Event()
        sweep_finished = threading.Event()

        def fail_attempt():
            try:
                with Session() as db:
                    task = db.query(ImageGenerationTask).filter_by(id=task_id).one()
                    failure_pid.append(db.execute(text('SELECT pg_backend_pid()')).scalar_one())
                    failure_started.set()
                    _handle_generation_failure(
                        db, task, claim_token=claim_token,
                        error_code='IMAGE_GENERATION_FAILED', error_message='Provider failed', retryable=False,
                    )
            except Exception as exc:
                errors.append(exc)

        def sweep_tasks():
            try:
                with Session() as db:
                    expire_image_generation_tasks(db, task_public_id=f'igt_race_{suffix}')
            except Exception as exc:
                errors.append(exc)
            finally:
                sweep_finished.set()

        failure = threading.Thread(target=fail_attempt, daemon=True)
        sweep = threading.Thread(target=sweep_tasks, daemon=True)
        try:
            with (
                patch('app.services.image_generation_task_processor.settings.notifications_event_capture_enabled', False),
                Session() as blocker,
            ):
                # Hold only the credit row, so the failure pauses at real settlement.
                blocker.query(GenerationCreditReservation).filter_by(id=reservation_id).with_for_update().one()
                blocker_pid = blocker.execute(text('SELECT pg_backend_pid()')).scalar_one()
                failure.start()
                try:
                    self.assertTrue(failure_started.wait(timeout=2))
                    deadline = time.monotonic() + 3
                    waiting_on_credit = False
                    with engine.connect() as observer:
                        while time.monotonic() < deadline:
                            blockers = observer.execute(
                                text('SELECT pg_blocking_pids(:pid)'), {'pid': failure_pid[0]},
                            ).scalar_one()
                            if blocker_pid in blockers:
                                waiting_on_credit = True
                                break
                            time.sleep(0.02)
                    self.assertTrue(waiting_on_credit, f'failure did not reach credit settlement: {errors}')
                    sweep.start()
                    # A task-first failure keeps the stale sweep from entering settlement.
                    self.assertTrue(sweep_finished.wait(timeout=2), 'stale sweep waited on the credit row held by an active failure')
                finally:
                    blocker.rollback()
                    failure.join(timeout=10)
                    if sweep.ident is not None:
                        sweep.join(timeout=10)
            self.assertFalse(failure.is_alive())
            self.assertFalse(sweep.is_alive())
            self.assertEqual(errors, [])
            with Session() as db:
                task = db.query(ImageGenerationTask).filter_by(id=task_id).one()
                reservation = db.query(GenerationCreditReservation).filter_by(id=reservation_id).one()
                self.assertEqual(task.status, TaskStatus.FAILED)
                self.assertEqual(task.error_code, 'IMAGE_GENERATION_FAILED')
                self.assertEqual(reservation.status, 'released')
                self.assertEqual(reservation.release_reason, 'IMAGE_GENERATION_FAILED')
                self.assertIsNone(reservation.consumed_usage_ledger_id)
                self.assertEqual(db.query(UsageLedger).filter_by(user_id=user_id, usage_type='image_generation_credit').count(), 0)
                self.assertEqual(db.query(ProductAnalyticsEvent).filter(
                    ProductAnalyticsEvent.user_public_id == f'usr_race_{suffix}',
                    ProductAnalyticsEvent.event_name == 'generation_failed',
                    ProductAnalyticsEvent.metadata_json.contains({'task_id': task.public_id}),
                ).count(), 1)
        finally:
            if not failure.is_alive() and not sweep.is_alive():
                with Session() as db:
                    db.execute(delete(GenerationCreditReservation).where(GenerationCreditReservation.generation_task_id == task_id))
                    db.execute(delete(ProductAnalyticsEvent).where(ProductAnalyticsEvent.user_public_id == f'usr_race_{suffix}'))
                    db.execute(delete(ImageGenerationTask).where(ImageGenerationTask.id == task_id))
                    db.execute(delete(User).where(User.id == user_id))
                    db.commit()
