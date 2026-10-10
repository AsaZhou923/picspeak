"""Optional real PostgreSQL migration, locking and rate-limit regression tests."""
from __future__ import annotations

import os
import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import CurrentActor
from app.core.errors import ApiHTTPException
from app.db.models import Photo, PhotoStatus, Review, ReviewMode, ReviewScoreFeedback, ReviewScoreSnapshot, ReviewStatus, User, UserPlan, UserStatus
from app.schemas import ScoreFeedbackPutRequest
from app.services import review_score_feedback as service
from test_review_score_feedback import TEST_DATABASE_URL


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class ScoreFeedbackPostgresTests(unittest.TestCase):
    def setUp(self):
        base_url = make_url(TEST_DATABASE_URL)
        self.database = 'picspeak_feedback_' + uuid4().hex[:24]
        self.test_url = base_url.set(database=self.database)
        self.admin = sa.create_engine(base_url.set(database='postgres'), isolation_level='AUTOCOMMIT')
        with self.admin.connect() as conn:
            conn.execute(sa.text(f'CREATE DATABASE "{self.database}"'))
        self.engine = sa.create_engine(self.test_url)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.migrate(command.upgrade, 'head')
        with self.Session() as db:
            user = User(public_id='usr_feedback_pg', email='feedback@example.test', username='feedback_pg',
                        plan=UserPlan.free, status=UserStatus.active)
            db.add(user)
            db.flush()
            self.user_id = user.id
            photo = Photo(public_id='pho_feedback_pg', owner_user_id=user.id, upload_id='upload', bucket='test',
                          object_key='feedback.jpg', content_type='image/jpeg', size_bytes=10, status=PhotoStatus.READY)
            db.add(photo)
            db.flush()
            review = Review(public_id='rev_feedback_pg', owner_user_id=user.id, photo_id=photo.id,
                            mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, final_score=7.6,
                            result_json={'scores': dict(composition=8, lighting=8, color=7, impact=8, technical=7)})
            db.add(review)
            db.commit()
            self.review_id = review.id
            self.revision = service.score_revision(review)

    def tearDown(self):
        if hasattr(self, 'engine'):
            self.engine.dispose()
        if hasattr(self, 'admin'):
            with self.admin.connect() as conn:
                conn.execute(sa.text(f'DROP DATABASE IF EXISTS "{self.database}" WITH (FORCE)'))
            self.admin.dispose()

    def migrate(self, operation, revision):
        config = Config(str(BACKEND_ROOT / 'alembic.ini'))
        config.set_main_option('script_location', str(BACKEND_ROOT / 'alembic'))
        with self.engine.begin() as connection:
            config.attributes['connection'] = connection
            operation(config, revision)

    def submit(self, db, verdict='accurate', version=None):
        actor = CurrentActor(db.get(User, self.user_id))
        return service.put_review_feedback(db, actor, 'rev_feedback_pg', ScoreFeedbackPutRequest(
            expected_score_revision=self.revision, expected_feedback_version=version, verdict=verdict,
        ))

    def test_upgrade_downgrade_reupgrade_and_database_immutability(self):
        self.migrate(command.downgrade, '20261010_0012')
        self.assertFalse(sa.inspect(self.engine).has_table('review_score_feedback'))
        self.migrate(command.upgrade, 'head')
        with self.Session() as db:
            self.submit(db)
            db.commit()
            snapshot = db.query(ReviewScoreSnapshot).one()
            with self.assertRaises(sa.exc.DBAPIError):
                db.execute(sa.update(ReviewScoreSnapshot).where(ReviewScoreSnapshot.id == snapshot.id).values(final_score=9))
            db.rollback()
            self.assertEqual(float(db.query(ReviewScoreSnapshot).one().final_score), 7.6)

    def test_concurrent_first_submit_and_cross_device_update(self):
        barrier = threading.Barrier(2)

        def write(version):
            with self.Session() as db:
                barrier.wait(timeout=10)
                try:
                    response = self.submit(db, verdict='too_high', version=version)
                    db.commit()
                    return response.feedback_version
                except ApiHTTPException as exc:
                    db.rollback()
                    self.assertEqual(exc.status_code, 409)
                    return None

        with ThreadPoolExecutor(max_workers=2) as pool:
            initial = list(pool.map(write, [None, None]))
        self.assertEqual(sorted(value for value in initial if value is not None), [1, 1])
        with self.Session() as db:
            self.assertEqual(db.query(ReviewScoreFeedback).count(), 1)
            self.assertEqual(db.query(ReviewScoreSnapshot).count(), 1)
            self.submit(db, verdict='accurate', version=1)
            db.commit()
        with ThreadPoolExecutor(max_workers=2) as pool:
            updates = list(pool.map(write, [2, 2]))
        self.assertEqual(sorted(value for value in updates if value is not None), [3, 3])

    def test_daily_slot_survives_withdraw_and_score_revision_changes(self):
        with patch.object(service, 'NEW_REVIEW_LIMIT_PER_DAY', 1):
            with self.Session() as db:
                saved = self.submit(db)
                db.commit()
                service.withdraw_feedback(db, CurrentActor(db.get(User, self.user_id)), saved.feedback_id, 1)
                db.commit()
                self.submit(db, version=2)
                db.commit()
                review = db.get(Review, self.review_id)
                review.final_score = 7.8
                db.commit()
                self.revision = service.score_revision(review)
                self.submit(db)
                db.commit()
                another = Review(public_id='rev_feedback_pg_second', owner_user_id=self.user_id,
                                 photo_id=review.photo_id, mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED,
                                 final_score=7.6, result_json=review.result_json)
                db.add(another)
                db.commit()
                with self.assertRaises(ApiHTTPException) as caught:
                    service.put_review_feedback(db, CurrentActor(db.get(User, self.user_id)), another.public_id,
                                                ScoreFeedbackPutRequest(expected_score_revision=service.score_revision(another), verdict='accurate'))
                self.assertEqual(caught.exception.status_code, 429)
                db.rollback()
