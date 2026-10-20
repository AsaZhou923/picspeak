from __future__ import annotations

import hashlib
import json
import sys
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import CurrentActor, get_current_actor, get_db
from app.api.routers import generations
from app.db.models import (
    GeneratedImage, GenerationCreditReservation, IdempotencyKey, ImageGenerationTask,
    Photo, Review, ReviewTask, UsageLedger, User, UserPlan, UserStatus,
)
from app.schemas import GenerationCreateRequest


class GenerationCreateIdempotencyTests(unittest.TestCase):
    """Exercise HTTP, persisted replay records and real credit reservations.

    SQLite covers sequential replay/conflict behavior, not PostgreSQL locking.
    """

    def setUp(self) -> None:
        self.engine = sa.create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        metadata = sa.MetaData()
        for model in (
            User, Photo, ReviewTask, Review, UsageLedger, ImageGenerationTask,
            GenerationCreditReservation, IdempotencyKey, GeneratedImage,
        ):
            table = model.__table__.to_metadata(metadata)
            for column in table.columns:
                if isinstance(column.type, JSONB):
                    column.type = sa.JSON()
                elif isinstance(column.type, sa.BigInteger):
                    column.type = sa.Integer()
        metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        with self.Session() as db:
            for user_id in (1, 2):
                db.add(User(
                    id=user_id, public_id=f'usr_generation_{user_id}',
                    email=f'generation{user_id}@example.test', username=f'generation{user_id}',
                    plan=UserPlan.pro, status=UserStatus.active,
                ))
            db.commit()
        self.user_id = 1

        def db_dependency():
            with self.Session() as db:
                try:
                    yield db
                except Exception:
                    db.rollback()
                    raise

        def actor_dependency(db: Session = Depends(get_db)):
            return CurrentActor(db.get(User, self.user_id))

        app = FastAPI()
        app.include_router(generations.router, prefix='/api/v1')
        app.dependency_overrides[get_db] = db_dependency
        app.dependency_overrides[get_current_actor] = actor_dependency
        stack = self.enterContext(ExitStack())
        stack.enter_context(patch.object(generations.settings, 'image_generation_pro_monthly_credits', 1000))
        stack.enter_context(patch.object(generations.settings, 'cloud_tasks_enabled', True))
        self.enqueue = stack.enter_context(patch.object(generations, 'enqueue_image_generation_task'))
        self.analytics = stack.enter_context(patch.object(generations, 'deliver_generation_request_event'))
        self.client = stack.enter_context(TestClient(app))

    def post(self, key: str | None = 'generation-key', *, key_location: str = 'body', **changes):
        payload = {'prompt': 'cinematic rainy street portrait', 'quality': 'low', 'size': '1024x1024', **changes}
        headers = {}
        if key is not None:
            if key_location == 'body':
                payload['idempotency_key'] = key
            else:
                headers['Idempotency-Key'] = key
        return self.client.post('/api/v1/generations', json=payload, headers=headers)

    def assert_state(self, task_count: int, *, record_count: int | None = None) -> None:
        with self.Session() as db:
            self.assertEqual(db.query(ImageGenerationTask).count(), task_count)
            self.assertEqual(db.query(IdempotencyKey).count(), task_count if record_count is None else record_count)
            reservations = db.query(GenerationCreditReservation).all()
            self.assertEqual(len(reservations), task_count)
            self.assertTrue(all(reservation.status == 'held' for reservation in reservations))
            self.assertEqual(sum(reservation.credits for reservation in reservations), task_count)
            self.assertEqual(db.query(UsageLedger).count(), 0)
        self.assertEqual(self.enqueue.call_count, task_count)
        self.assertEqual(self.analytics.call_count, task_count)

    def assert_conflict(self, response) -> None:
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()['detail']['code'], 'IDEMPOTENCY_CONFLICT')

    def test_identical_body_key_request_replays_original_task_without_new_credit_hold(self) -> None:
        first = self.post()
        self.assertEqual(first.status_code, 200, first.text)
        retry = self.post()
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json(), first.json())
        self.assert_state(1)

    def test_identical_header_key_request_replays_original_task_without_new_credit_hold(self) -> None:
        first = self.post(key_location='header')
        self.assertEqual(first.status_code, 200, first.text)
        retry = self.post(key_location='header')
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json(), first.json())
        self.assert_state(1)

    def test_changed_prompt_size_or_quality_conflicts_without_new_task_or_credit_hold(self) -> None:
        first = self.post()
        self.assertEqual(first.status_code, 200, first.text)
        for changes in (
            {'prompt': 'sunny beach landscape'},
            {'size': '1024x1536'},
            {'quality': 'medium'},
            {'quality': 'high'},
        ):
            with self.subTest(changes=changes):
                self.assert_conflict(self.post(**changes))
                self.assert_state(1)
        self.assertEqual(self.post().json(), first.json())
        self.assert_state(1)

    def test_other_generation_content_changes_also_conflict(self) -> None:
        self.assertEqual(self.post().status_code, 200)
        for changes in (
            {'style': 'watercolor'}, {'negative_prompt': 'no text'}, {'output_format': 'png'},
            {'intent': 'social_visual'}, {'template_key': 'social_visual'}, {'locale': 'ja'},
        ):
            with self.subTest(changes=changes):
                self.assert_conflict(self.post(**changes))
                self.assert_state(1)

    def test_body_and_header_key_transports_are_equivalent(self) -> None:
        for count, (first_location, retry_location) in enumerate((('body', 'header'), ('header', 'body')), start=1):
            with self.subTest(first_location=first_location):
                key = f'transport-{count}'
                first = self.post(key, key_location=first_location)
                self.assertEqual(first.status_code, 200, first.text)
                retry = self.post(key, key_location=retry_location)
                self.assertEqual(retry.status_code, 200, retry.text)
                self.assertEqual(retry.json(), first.json())
                self.assert_conflict(self.post(key, key_location=retry_location, prompt='sunny beach landscape'))
                self.assert_state(count)

    def test_new_record_hash_excludes_key_and_includes_validated_defaults(self) -> None:
        first = self.post()
        self.assertEqual(first.status_code, 200, first.text)
        payload = GenerationCreateRequest(prompt='cinematic rainy street portrait').model_dump(
            by_alias=True, exclude={'idempotency_key'},
        )
        expected_hash = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
        with self.Session() as db:
            self.assertEqual(db.query(IdempotencyKey).one().request_hash, expected_hash)
        # Explicit defaults and JSON key order do not change the validated request.
        retry = self.client.post('/api/v1/generations', json=dict(reversed(list(payload.items()))),
                                 headers={'Idempotency-Key': 'generation-key'})
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json(), first.json())
        self.assert_state(1)

    def test_legacy_hashes_replay_across_key_transports_and_still_reject_changed_content(self) -> None:
        for count, legacy_location in enumerate(('body', 'header', 'empty_body'), start=1):
            with self.subTest(legacy_location=legacy_location):
                key = f'legacy-{count}'
                first = self.post(key)
                self.assertEqual(first.status_code, 200, first.text)
                legacy_payload = GenerationCreateRequest(
                    prompt='cinematic rainy street portrait',
                    idempotency_key=key if legacy_location == 'body' else ('' if legacy_location == 'empty_body' else None),
                ).model_dump(by_alias=True)
                legacy_hash = hashlib.sha256(json.dumps(legacy_payload, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
                with self.Session() as db:
                    record = db.query(IdempotencyKey).filter_by(idempotency_key=key).one()
                    record.request_hash = legacy_hash
                    db.commit()
                for retry_location in ('body', 'header'):
                    retry = self.post(key, key_location=retry_location)
                    self.assertEqual(retry.status_code, 200, retry.text)
                    self.assertEqual(retry.json(), first.json())
                    self.assert_conflict(self.post(key, key_location=retry_location, prompt='sunny beach landscape'))
                    self.assert_state(count)

    def test_mismatched_hash_conflicts_even_without_cached_response(self) -> None:
        self.assertEqual(self.post().status_code, 200)
        with self.Session() as db:
            db.query(IdempotencyKey).one().response_json = None
            db.commit()
        self.assert_conflict(self.post(prompt='sunny beach landscape'))
        self.assert_state(1)

    def test_different_keys_create_independent_tasks(self) -> None:
        first = self.post('first-key')
        second = self.post('second-key')
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertNotEqual(first.json()['task_id'], second.json()['task_id'])
        self.assert_state(2)

    def test_missing_key_creates_independent_tasks(self) -> None:
        first = self.post(None)
        second = self.post(None)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertNotEqual(first.json()['task_id'], second.json()['task_id'])
        self.assert_state(2, record_count=0)

    def test_same_key_is_scoped_to_user(self) -> None:
        first = self.post()
        self.user_id = 2
        second = self.post(prompt='sunny beach landscape')
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertNotEqual(first.json()['task_id'], second.json()['task_id'])
        self.assertEqual(self.post(prompt='sunny beach landscape').json(), second.json())
        self.assert_state(2)

    def test_expired_generation_replay_cache_does_not_create_or_charge_another_task(self):
        from datetime import datetime, timedelta, timezone
        first = self.post()
        with self.Session() as db:
            db.query(IdempotencyKey).one().expire_at = datetime.now(timezone.utc) - timedelta(days=1)
            db.commit()
        self.assertEqual(self.post().json(), first.json())
        self.assert_state(1)

    def test_downgrade_allows_recovery_of_accepted_task_without_new_premium_work(self):
        first = self.post(quality='medium')
        self.assertEqual(first.status_code, 200, first.text)
        with self.Session() as db:
            db.get(User, 1).plan = UserPlan.free
            db.commit()
        self.assertEqual(self.post(quality='medium').json(), first.json())
        self.assertEqual(self.post('new-key', quality='medium').status_code, 403)
        with self.Session() as db:
            self.assertEqual(db.query(ImageGenerationTask).count(), 1)
            self.assertEqual(db.query(GenerationCreditReservation).count(), 1)


if __name__ == '__main__':
    unittest.main()
