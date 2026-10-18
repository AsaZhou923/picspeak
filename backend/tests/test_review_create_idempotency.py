from __future__ import annotations

import sys
import unittest
from contextlib import nullcontext
from datetime import datetime, timezone
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
from app.api.routers import review_create
from app.db.models import (
    IdempotencyKey, Photo, PhotoStatus, Review, ReviewQuotaReservation,
    ReviewTask, UsageLedger, User, UserPlan, UserStatus,
)
from app.schemas import ReviewResult
from app.services.ai import AIReviewResponse


class SynchronousReviewIdempotencyTests(unittest.TestCase):
    """Real HTTP/ORM transactions; SQLite does not prove PostgreSQL locking."""

    def setUp(self):
        self.engine = sa.create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        metadata = sa.MetaData()
        for model in [User, Photo, ReviewTask, Review, UsageLedger, ReviewQuotaReservation, IdempotencyKey]:
            table = model.__table__.to_metadata(metadata)
            for column in table.columns:
                if isinstance(column.type, JSONB):
                    column.type = sa.JSON()
                elif isinstance(column.type, sa.BigInteger):
                    column.type = sa.Integer()
        metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        with self.Session() as db:
            db.add(User(id=1, public_id='usr_sync', email='sync@example.test', username='sync',
                        plan=UserPlan.free, status=UserStatus.active, daily_quota_used=0,
                        daily_quota_total=10, daily_quota_date=datetime.now(timezone.utc).date()))
            db.flush()
            db.add(Photo(id=1, public_id='pho_sync', owner_user_id=1, upload_id='upl_sync',
                         bucket='test', object_key='photo.jpg', content_type='image/jpeg',
                         size_bytes=10, status=PhotoStatus.READY))
            db.commit()

        def db_dependency():
            with self.Session() as db:
                try:
                    yield db
                except Exception:
                    db.rollback()
                    raise

        def actor_dependency(db: Session = Depends(get_db)):
            return CurrentActor(db.get(User, 1))

        app = FastAPI()
        app.include_router(review_create.router, prefix='/api/v1')
        app.dependency_overrides[get_db] = db_dependency
        app.dependency_overrides[get_current_actor] = actor_dependency
        self.client = TestClient(app, raise_server_exceptions=False)
        self.client.__enter__()
        self.ai_result = AIReviewResponse(result=ReviewResult(final_score=6), model_name='qwen-test',
                                          model_version='test', prompt_version='test')
        self.patches = [
            patch.object(review_create, 'run_ai_review', return_value=self.ai_result),
            patch.object(review_create, 'canonical_score_cache_lease', side_effect=lambda *a, **k: nullcontext(None)),
            patch.object(review_create, 'get_object_read_url', return_value='https://example.test/photo.jpg'),
            # Quota admission and billing snapshots use PostgreSQL-specific queries;
            # keep actual reserve/consume, increment and ledger persistence here.
            patch.object(review_create, 'enforce_user_quota'),
            patch('app.services.review_quota_reservations.enforce_user_quota'),
            patch.object(review_create, '_attach_billing_info'),
        ]
        self.ai = self.patches[0].start()
        for patcher in self.patches[1:]:
            patcher.start()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        for patcher in reversed(self.patches):
            patcher.stop()
        self.engine.dispose()

    def post(self, **changes):
        return self.client.post('/api/v1/reviews', headers={'Idempotency-Key': 'sync-key'}, json={
            'photo_id': 'pho_sync', 'mode': 'flash', 'async': False, **changes,
        })

    def assert_state(self, count):
        with self.Session() as db:
            self.assertEqual(db.query(Review).count(), count)
            self.assertEqual(db.query(UsageLedger).count(), count)
            self.assertEqual(db.query(IdempotencyKey).count(), count)
            self.assertEqual(db.get(User, 1).daily_quota_used, count)
            self.assertEqual(db.query(ReviewQuotaReservation).filter_by(status='consumed').count(), count)
            self.assertEqual(db.query(ReviewQuotaReservation).filter_by(status='held').count(), 0)

    def test_failed_replay_record_write_rolls_back_result_and_charge(self):
        with patch.object(review_create, 'save_idempotency_record', side_effect=RuntimeError('write failed')):
            self.assertEqual(self.post().status_code, 500)
        self.assert_state(0)
        self.assertEqual(self.post().status_code, 200)
        self.assert_state(1)

    def test_failed_final_commit_rolls_back_result_and_charge(self):
        def fail_result_commit(db):
            if any(isinstance(row, IdempotencyKey) for row in db.new):
                raise RuntimeError('commit failed')

        sa.event.listen(self.Session.class_, 'before_commit', fail_result_commit)
        try:
            self.assertEqual(self.post().status_code, 500)
        finally:
            sa.event.remove(self.Session.class_, 'before_commit', fail_result_commit)
        self.assert_state(0)
        self.assertEqual(self.post().status_code, 200)
        self.assert_state(1)

    def test_lost_commit_acknowledgment_replays_without_provider_or_charge(self):
        original_commit = self.Session.class_.commit
        failed = False

        def lose_acknowledgment(db):
            nonlocal failed
            has_result = any(isinstance(row, IdempotencyKey) for row in db.new)
            original_commit(db)
            if has_result and not failed:
                failed = True
                raise RuntimeError('connection lost after commit')

        with patch.object(self.Session.class_, 'commit', lose_acknowledgment):
            self.assertEqual(self.post().status_code, 500)
        self.assert_state(1)
        retry = self.post()
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(self.ai.call_count, 1)
        self.assert_state(1)
        with self.Session() as db:
            self.assertEqual(retry.json()['review_id'], db.query(Review).one().public_id)

    def test_overlapping_same_key_settlements_replay_the_winner(self):
        winner = None

        def overlap(*args, **kwargs):
            nonlocal winner
            if self.ai.call_count == 1:
                # First request has passed admission but has not persisted its
                # result. A second HTTP request wins the same key during AI work.
                winner = self.post()
                self.assertEqual(winner.status_code, 200, winner.text)
            return self.ai_result

        self.ai.side_effect = overlap
        loser = self.post()
        self.assertEqual(loser.status_code, 200, loser.text)
        self.assertEqual(loser.json()['review_id'], winner.json()['review_id'])
        self.assert_state(1)

    def test_same_key_different_payload_conflicts_without_new_charge(self):
        self.assertEqual(self.post().status_code, 200)
        conflict = self.post(locale='zh')
        self.assertEqual(conflict.status_code, 409, conflict.text)
        self.assertEqual(conflict.json()['detail']['code'], 'IDEMPOTENCY_CONFLICT')
        self.assertEqual(self.ai.call_count, 1)
        self.assert_state(1)

    def test_overlapping_different_payload_settlements_conflict_without_new_charge(self):
        def overlap(*args, **kwargs):
            if self.ai.call_count == 1:
                winner = self.post(locale='zh')
                self.assertEqual(winner.status_code, 200, winner.text)
            return self.ai_result

        self.ai.side_effect = overlap
        loser = self.post()
        self.assertEqual(loser.status_code, 409, loser.text)
        self.assertEqual(loser.json()['detail']['code'], 'IDEMPOTENCY_CONFLICT')
        self.assert_state(1)


if __name__ == '__main__':
    unittest.main()
