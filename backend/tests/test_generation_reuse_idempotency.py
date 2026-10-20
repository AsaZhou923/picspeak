from __future__ import annotations

import os
import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import test_generation_create_idempotency as create_tests
from app.api.deps import CurrentActor, get_current_actor, get_db
from app.api.routers import generations
from app.db.models import (
    GeneratedImage, GenerationCreditReservation, IdempotencyKey, ImageGenerationTask,
    User, UserPlan, UserStatus,
)


class GenerationReuseIdempotencyTests(unittest.TestCase):
    setUp = create_tests.GenerationCreateIdempotencyTests.setUp
    assert_state = create_tests.GenerationCreateIdempotencyTests.assert_state
    assert_conflict = create_tests.GenerationCreateIdempotencyTests.assert_conflict

    def seed_image(self, public_id='gen_reusable', owner_id=1):
        with self.Session() as db:
            db.add(GeneratedImage(
                public_id=public_id, owner_user_id=owner_id, object_bucket='test', object_key=public_id,
                intent='photo_inspiration', generation_mode='general', prompt='private reusable source prompt',
                model_name='gpt-image-2', model_snapshot='original-model', quality='low', size='1024x1024',
                output_format='webp', credits_charged=1, metadata_json={'locale': 'en', 'style': 'realistic'},
            ))
            db.commit()

    def post(self, source='gen_reusable', key='reuse-key', query=''):
        return self.client.post(f'/api/v1/generations/{source}/reuse{query}', headers={'Idempotency-Key': key} if key else {})

    def test_lost_response_replay_returns_same_task_and_single_credit_hold(self):
        self.seed_image()
        first = self.post()
        retry = self.post()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(first.json(), retry.json())
        self.assert_state(1)

    def test_new_key_or_legacy_missing_key_is_an_intentional_repeat(self):
        self.seed_image()
        responses = [self.post(key=key) for key in ('one', 'two', None, None)]
        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertEqual(len({response.json()['task_id'] for response in responses}), 4)
        self.assert_state(4, record_count=2)

    def test_same_key_rejects_different_source_and_source_or_model_mutations(self):
        self.seed_image()
        self.seed_image('gen_other')
        self.assertEqual(self.post().status_code, 200)
        self.assert_conflict(self.post(source='gen_other'))
        self.assert_conflict(self.post(query='?analytics_source=history'))
        with patch.object(generations.settings, 'image_generation_model_snapshot', 'changed-model'):
            self.assert_conflict(self.post())
        for column, value in (('prompt', 'changed source'), ('quality', 'medium'), ('size', '1024x1536')):
            with self.Session() as db:
                image = db.query(GeneratedImage).filter_by(public_id='gen_reusable').one()
                original = getattr(image, column)
                setattr(image, column, value)
                db.commit()
            self.assert_conflict(self.post())
            with self.Session() as db:
                setattr(db.query(GeneratedImage).filter_by(public_id='gen_reusable').one(), column, original)
                db.commit()
        self.assertEqual(self.post().status_code, 200)
        self.assert_state(1)

    def test_owner_scope_and_authorization_precede_replay(self):
        self.seed_image()
        self.seed_image('gen_other_owner', owner_id=2)
        first = self.post()
        self.user_id = 2
        self.assertEqual(self.post().status_code, 404)
        second = self.post(source='gen_other_owner')
        self.assertEqual(second.status_code, 200)
        self.assertNotEqual(first.json()['task_id'], second.json()['task_id'])
        self.assert_state(2)

    def test_downgraded_owner_can_recover_accepted_task_but_not_create_new_premium_reuse(self):
        self.seed_image()
        with self.Session() as db:
            db.query(GeneratedImage).filter_by(public_id='gen_reusable').one().quality = 'medium'
            db.commit()
        first = self.post()
        self.assertEqual(first.status_code, 200, first.text)
        with self.Session() as db:
            db.get(User, 1).plan = UserPlan.free
            db.commit()
        self.assertEqual(self.post().json(), first.json())
        for key in ('new-premium-key', None):
            denied = self.post(key=key)
            self.assertEqual(denied.status_code, 403, denied.text)
            self.assertEqual(denied.json()['detail']['code'], 'GENERATION_QUALITY_FORBIDDEN')
        with self.Session() as db:
            self.assertEqual(db.query(ImageGenerationTask).count(), 1)
            self.assertEqual(db.query(GenerationCreditReservation).count(), 1)
        self.assertEqual(self.enqueue.call_count, 1)

    def test_expired_replay_cache_still_recovers_retained_paid_task(self):
        self.seed_image()
        first = self.post()
        with self.Session() as db:
            db.query(IdempotencyKey).one().expire_at = datetime.now(timezone.utc) - timedelta(days=1)
            db.commit()
        self.assertEqual(self.post().json(), first.json())
        self.assert_state(1)

    def test_missing_replay_record_retained_task_returns_conflict_not_database_error(self):
        self.seed_image()
        self.assertEqual(self.post().status_code, 200)
        with self.Session() as db:
            db.query(IdempotencyKey).delete()
            db.commit()
        self.assert_conflict(self.post())
        self.assert_state(1, record_count=0)

    def test_cross_create_and_reuse_key_collision_is_explicit_without_second_hold(self):
        self.seed_image()
        created = create_tests.GenerationCreateIdempotencyTests.post(self, key='shared-create')
        self.assertEqual(created.status_code, 200, created.text)
        self.assert_conflict(self.post(key='shared-create'))
        self.assertEqual(self.post(key='shared-reuse').status_code, 200)
        self.assert_conflict(create_tests.GenerationCreateIdempotencyTests.post(self, key='shared-reuse'))
        self.assert_state(2)

    def test_dispatch_failure_retry_recovers_failed_task_without_another_hold(self):
        self.seed_image()
        self.enqueue.side_effect = generations.TaskDispatchError('synthetic queue failure')
        with patch.object(generations, 'record_generation_terminal'), patch.object(generations, 'deliver_generation_terminal_event'):
            first = self.post()
        self.assertEqual(first.status_code, 503, first.text)
        retry = self.post()
        self.assertEqual(retry.status_code, 200, retry.text)
        task = self.client.get(f"/api/v1/generation-tasks/{retry.json()['task_id']}")
        self.assertEqual(task.status_code, 200, task.text)
        self.assertEqual(task.json()['status'], 'FAILED')
        with self.Session() as db:
            self.assertEqual(db.query(ImageGenerationTask).count(), 1)
            self.assertEqual(db.query(GenerationCreditReservation).one().status, 'released')
        self.assertEqual(self.enqueue.call_count, 1)


# These tests deliberately require a separately provisioned, disposable PostgreSQL
# database. SQLite does not implement the row lock that makes admission atomic.
@unittest.skipUnless(os.getenv('PICSPEAK_TEST_DATABASE_URL'), 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class GenerationReuseConcurrentPostgresTests(unittest.TestCase):
    def run_concurrent(self, same_source: bool):
        engine = create_engine(os.environ['PICSPEAK_TEST_DATABASE_URL'])
        self.addCleanup(engine.dispose)
        session_factory = sessionmaker(bind=engine, expire_on_commit=False)
        suffix = uuid4().hex
        with session_factory() as db:
            user = User(public_id=f'usr_reuse_{suffix}', email=f'reuse-{suffix}@example.test', username=f'reuse_{suffix}',
                        plan=UserPlan.pro, status=UserStatus.active)
            db.add(user)
            db.flush()
            owner_id = user.id
            for source in ('a', 'b'):
                db.add(GeneratedImage(public_id=f'gen_{source}_{suffix}', owner_user_id=owner_id, object_bucket='test', object_key=source,
                                      intent='photo_inspiration', generation_mode='general', prompt=f'private source {source}',
                                      model_name='gpt-image-2', quality='low', size='1024x1024', output_format='webp',
                                      credits_charged=1, metadata_json={'locale': 'en'}))
            db.commit()

        def database():
            with session_factory() as db:
                try:
                    yield db
                except Exception:
                    db.rollback()
                    raise

        def actor(db: Session = Depends(get_db)):
            return CurrentActor(db.get(User, owner_id))

        app = FastAPI()
        app.include_router(generations.router, prefix='/api/v1')
        app.dependency_overrides[get_db] = database
        app.dependency_overrides[get_current_actor] = actor
        barrier = threading.Barrier(2)
        with ExitStack() as stack:
            stack.enter_context(patch.object(generations.settings, 'image_generation_pro_monthly_credits', 1000))
            stack.enter_context(patch.object(generations.settings, 'cloud_tasks_enabled', True))
            enqueue = stack.enter_context(patch.object(generations, 'enqueue_image_generation_task'))
            analytics = stack.enter_context(patch.object(generations, 'deliver_generation_request_event'))
            def request(source):
                with TestClient(app) as client:
                    barrier.wait(timeout=10)
                    return client.post(f'/api/v1/generations/gen_{source}_{suffix}/reuse', headers={'Idempotency-Key': 'concurrent-key'})
            with ThreadPoolExecutor(max_workers=2) as pool:
                responses = list(pool.map(request, ('a', 'a' if same_source else 'b')))
            statuses = sorted(response.status_code for response in responses)
            self.assertEqual(statuses, [200, 200] if same_source else [200, 409], [response.text for response in responses])
            if same_source:
                self.assertEqual(responses[0].json(), responses[1].json())
            self.assertEqual(enqueue.call_count, 1)
            self.assertEqual(analytics.call_count, 1)
        with session_factory() as db:
            self.assertEqual(db.query(ImageGenerationTask).filter_by(owner_user_id=owner_id).count(), 1)
            self.assertEqual(db.query(IdempotencyKey).filter_by(user_id=owner_id, endpoint='/generations/reuse').count(), 1)
            holds = db.query(GenerationCreditReservation).filter_by(user_id=owner_id).all()
            self.assertEqual(len(holds), 1)
            self.assertEqual(sum(hold.credits for hold in holds), 1)

    def test_concurrent_same_key_replays_one_task_and_credit_hold(self):
        self.run_concurrent(same_source=True)

    def test_concurrent_same_key_different_source_conflicts_without_second_credit_hold(self):
        self.run_concurrent(same_source=False)
