from __future__ import annotations

import os
import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import CurrentActor, get_db
from app.api.routers.score_feedback import router
from app.api.routers.review_queries import get_review
from app.api.routers.review_support import _build_review_export_payload
from app.core.errors import ApiHTTPException
from app.core.security import create_access_token
from app.db.models import (
    BillingSubscription, Photo, PhotoStatus, PracticeAttempt, PracticeSession, RateLimitCounter, Review, ReviewMode,
    ReviewScoreFeedback, ReviewScoreSnapshot, ReviewStatus, ReviewTask, User, UserPlan, UserStatus,
)
from app.schemas import ScoreFeedbackPutRequest
from app.services import review_score_feedback as service
from scripts.export_review_score_feedback_report import build_report

TEST_DATABASE_URL = os.getenv(
    'PICSPEAK_TEST_DATABASE_URL',
    'postgresql+psycopg2://postgres:local-picspeak-test@localhost:55432/picspeak_goal',
).strip()


def review_fixture(**kwargs) -> Review:
    values = dict(
        id=1, public_id='rev_feedback_test', owner_user_id=1, photo_id=1,
        mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, image_type='landscape',
        final_score=Decimal('7.6'), created_at=datetime.now(timezone.utc),
        is_public=False, gallery_visible=False, gallery_audit_status='none',
        result_json={'scores': dict(composition=8, lighting=8, color=7, impact=8, technical=7),
                     'score_version': 'v8', 'score_prompt_version': 'prompt-v8',
                     'scorer_model_name': 'score-model', 'scorer_reasoning_effort': 'low'},
    )
    values.update(kwargs)
    return Review(**values)


class ScoreRevisionTests(unittest.TestCase):
    def test_stable_under_non_score_changes_and_float_noise(self):
        review = review_fixture()
        revision = service.score_revision(review)
        review.final_score = 7.600000000000001
        review.favorite = True
        review.note = 'private note'
        review.updated_at = datetime.now(timezone.utc)
        review.is_public = True
        review.result_json = {**review.result_json, 'critique': 'new prose', 'writer_model_name': 'another-writer',
                              'billing_info': {'charged': True}, 'share_info': {'enabled': True}}
        self.assertEqual(service.score_revision(review), revision)
        payload = service.score_snapshot_payload(review)
        self.assertIsNone(payload['scorer_model_version'])
        self.assertIsNone(payload['scorer_preprocess_version'])
        self.assertNotIn('note', payload)
        self.assertNotIn('critique', payload)

    def test_score_and_provenance_changes_form_a_new_revision(self):
        base = review_fixture()
        original = service.score_revision(base)
        for key, value in [('score_version', 'v9'), ('score_prompt_version', 'new-prompt'),
                           ('scorer_model_name', 'new-model'), ('scorer_model_version', 'snapshot-2'),
                           ('scorer_reasoning_effort', 'high'), ('scorer_preprocess_version', 'new-preprocess')]:
            with self.subTest(key=key):
                row = review_fixture(result_json={**base.result_json, key: value})
                self.assertNotEqual(service.score_revision(row), original)
        base.final_score = Decimal('7.8')
        self.assertNotEqual(service.score_revision(base), original)
        base = review_fixture(mode=ReviewMode.pro)
        self.assertNotEqual(service.score_revision(base), original)
        base = review_fixture(image_type='portrait')
        self.assertNotEqual(service.score_revision(base), original)
        base = review_fixture()
        base.result_json['scores']['lighting'] = 9
        self.assertNotEqual(service.score_revision(base), original)

    def test_unsupported_and_missing_scores_do_not_receive_revision(self):
        for update in [{'analysis_type': 'retake_compare'}, {'comparison': {}}, {'practice': {}},
                       {'goal_assessment': {}}, {'scores': {}}, {'scores': {'composition': float('nan')}}]:
            with self.subTest(update=update):
                base = review_fixture()
                base.result_json.update(update)
                self.assertIsNone(service.score_revision(base))
        for value in (None, True, float('nan'), float('inf'), -1, 11):
            self.assertIsNone(service.score_revision(review_fixture(final_score=value)))
        for demo_id in service.DEMO_REVIEW_IDS:
            self.assertIsNone(service.score_revision(review_fixture(public_id=demo_id)))


class ScoreFeedbackApiTests(unittest.TestCase):
    """Exercise real ORM/API behavior locally; PostgreSQL locks are tested separately.

    SQLite uses copied metadata types. The production PostgreSQL rate-limit UPSERT
    is patched here rather than claiming SQLite validates PostgreSQL transactions.
    """
    def setUp(self):
        self.engine = sa.create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        metadata = sa.MetaData()
        tables = [User, BillingSubscription, Photo, ReviewTask, Review, PracticeSession, PracticeAttempt,
                  RateLimitCounter, ReviewScoreSnapshot, ReviewScoreFeedback]
        for model in tables:
            table = model.__table__.to_metadata(metadata)
            for column in table.columns:
                if isinstance(column.type, JSONB):
                    column.type = sa.JSON()
                elif isinstance(column.type, sa.BigInteger):
                    column.type = sa.Integer()
        with self.engine.connect() as connection:
            connection.exec_driver_sql('PRAGMA foreign_keys=ON')
        metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        with self.Session() as db:
            users = [User(id=i, public_id=f'usr_feedback_{i}', email=f'{i}@example.test', username=f'feedback_{i}',
                          status=UserStatus.active, plan=UserPlan.guest if i == 3 else UserPlan.free)
                     for i in range(1, 4)]
            db.add_all(users)
            db.flush()
            db.add(Photo(id=1, public_id='pho_feedback', owner_user_id=1, upload_id='upload', bucket='test',
                         object_key='photo.jpg', content_type='image/jpeg', size_bytes=10, status=PhotoStatus.READY))
            db.flush()
            db.add(review_fixture())
            db.commit()
        self.tokens = {i: create_access_token({'sub': f'usr_feedback_{i}', 'role': 'guest' if i == 3 else 'user'}) for i in range(1, 4)}
        self.rate = patch.object(service, '_enforce_scope_rate_limit', return_value={})
        self.rate_mock = self.rate.start()
        app = FastAPI()
        app.include_router(router, prefix='/api/v1')
        @app.middleware('http')
        async def no_store_feedback(request, call_next):
            response = await call_next(request)
            if '/score-feedback' in request.url.path:
                response.headers['Cache-Control'] = 'private, no-store'
            return response

        def db_dependency():
            with self.Session() as db:
                try:
                    yield db
                except Exception:
                    db.rollback()
                    raise
        app.dependency_overrides[get_db] = db_dependency
        self.client = TestClient(app)
        self.client.__enter__()
        self.revision = service.score_revision(review_fixture())
        self.path = '/api/v1/reviews/rev_feedback_test/score-feedback'

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.rate.stop()
        self.engine.dispose()

    def headers(self, user=1):
        return {'Authorization': 'Bearer ' + self.tokens[user]}

    def put(self, verdict='accurate', version=None, user=1, revision=None, surface='result'):
        return self.client.put(self.path, headers=self.headers(user), json={
            'expected_score_revision': revision or self.revision, 'expected_feedback_version': version,
            'verdict': verdict, 'source_surface': surface,
        })

    def mutate(self, **values):
        with self.Session() as db:
            review = db.get(Review, 1)
            for key, value in values.items():
                setattr(review, key, value)
            db.commit()

    def add_subscription(self, *, user_id: int = 1, status: str = 'active', ends_at: datetime | None = None):
        with self.Session() as db:
            subscription = BillingSubscription(
                user_id=user_id,
                provider='activation_code',
                provider_subscription_id=f'sub_feedback_{user_id}_{db.query(BillingSubscription).count() + 1}',
                status=status,
                ends_at=ends_at,
            )
            db.add(subscription)
            db.commit()

    def test_anonymous_cookie_only_and_guest_rejected_without_creating_users(self):
        for headers in ({}, self.headers(3)):
            response = self.client.get(self.path, params={'score_revision': self.revision}, headers=headers)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.headers['cache-control'], 'private, no-store')
            self.assertNotIn('set-cookie', response.headers)
        self.client.cookies.set('ps_guest_token', self.tokens[3])
        self.assertEqual(self.client.put(self.path, json={'expected_score_revision': self.revision,
                                                        'verdict': 'accurate'}).status_code, 401)
        with self.Session() as db:
            self.assertEqual(db.query(User).count(), 3)
            self.assertEqual(db.query(ReviewScoreFeedback).count(), 0)
            self.assertEqual(db.query(ReviewScoreSnapshot).count(), 0)

    def test_inactive_account_rejected(self):
        with self.Session() as db:
            db.get(User, 1).status = UserStatus.suspended
            db.commit()
        self.assertEqual(self.put().status_code, 403)

    def test_feedback_retention_uses_effective_plan_without_persisting_downgrade(self):
        old_created_at = datetime.now(timezone.utc) - timedelta(days=40)
        with self.Session() as db:
            user = db.get(User, 1)
            user.plan = UserPlan.pro
            review = db.get(Review, 1)
            review.created_at = old_created_at
            review.is_public = False
            review.gallery_visible = False
            review.gallery_audit_status = 'none'
            db.commit()
        self.add_subscription(ends_at=datetime.now(timezone.utc) - timedelta(days=1))

        expired = self.put('accurate', None)
        self.assertEqual(expired.status_code, 404)
        with self.Session() as db:
            self.assertEqual(db.get(User, 1).plan, UserPlan.pro)
            self.assertEqual(db.get(User, 1).daily_quota_used, 0)
            db.query(BillingSubscription).delete(synchronize_session=False)
            db.commit()

        self.add_subscription(ends_at=datetime.now(timezone.utc) + timedelta(days=30))
        active = self.put('accurate', None)
        self.assertEqual(active.status_code, 200)
        with self.Session() as db:
            self.assertEqual(db.get(User, 1).plan, UserPlan.pro)
            self.assertEqual(db.get(User, 1).daily_quota_used, 0)

    def test_author_submit_update_withdraw_and_resubmit_one_record(self):
        empty = self.client.get(self.path, params={'score_revision': self.revision}, headers=self.headers())
        self.assertEqual(empty.json()['role'], 'author')
        self.assertIsNone(empty.json()['my_feedback'])
        saved = self.put('too_low').json()
        self.assertEqual(saved['feedback_version'], 1)
        duplicate = self.put('too_low', 1, surface='gallery')
        self.assertEqual(duplicate.json()['feedback_version'], 1)
        updated = self.put('too_high', 1).json()
        self.assertEqual(updated['feedback_version'], 2)
        self.assertEqual(self.put('accurate', 1).status_code, 409)
        endpoint = '/api/v1/score-feedback/' + saved['feedback_id']
        withdrawn = self.client.request('DELETE', endpoint, headers=self.headers(), json={'expected_feedback_version': 2})
        self.assertEqual(withdrawn.json()['state'], 'withdrawn')
        self.assertEqual(withdrawn.json()['feedback_version'], 3)
        duplicate = self.client.request('DELETE', endpoint, headers=self.headers(), json={'expected_feedback_version': 3})
        self.assertEqual(duplicate.json()['feedback_version'], 3)
        restored = self.put('accurate', 3).json()
        self.assertEqual(restored['feedback_id'], saved['feedback_id'])
        self.assertEqual(restored['feedback_version'], 4)
        with self.Session() as db:
            self.assertEqual(db.query(ReviewScoreFeedback).count(), 1)
            self.assertEqual(db.query(ReviewScoreSnapshot).count(), 1)
            self.assertEqual(db.get(Review, 1).final_score, Decimal('7.60'))
            self.assertNotIn('feedback', db.get(Review, 1).result_json)
            self.assertEqual(db.get(User, 1).daily_quota_used, 0)

    def test_same_request_retry_after_lost_response_is_idempotent(self):
        first = self.put('too_low', None).json()
        retry = self.put('too_low', None).json()
        self.assertEqual(retry['feedback_id'], first['feedback_id'])
        self.assertEqual(retry['feedback_version'], 1)
        self.assertEqual(retry['created_at'].rstrip('Z'), first['created_at'].rstrip('Z'))
        self.assertEqual(retry['updated_at'].rstrip('Z'), first['updated_at'].rstrip('Z'))

        updated = self.put('too_high', 1).json()
        repeat_update = self.put('too_high', 1).json()
        self.assertEqual(repeat_update['feedback_id'], first['feedback_id'])
        self.assertEqual(repeat_update['feedback_version'], 2)
        self.assertEqual(repeat_update['updated_at'].rstrip('Z'), updated['updated_at'].rstrip('Z'))
        with self.Session() as db:
            self.assertEqual(db.query(ReviewScoreFeedback).count(), 1)
            self.assertEqual(db.query(ReviewScoreSnapshot).count(), 1)

    def test_old_different_retry_and_withdrawn_retry_do_not_overwrite(self):
        self.put('too_low', None)
        updated = self.put('too_high', 1).json()
        self.assertEqual(updated['feedback_version'], 2)
        self.assertEqual(self.put('accurate', 1).status_code, 409)

        endpoint = '/api/v1/score-feedback/' + updated['feedback_id']
        withdrawn = self.client.request('DELETE', endpoint, headers=self.headers(), json={'expected_feedback_version': 2}).json()
        self.assertEqual(withdrawn['state'], 'withdrawn')
        self.assertEqual(withdrawn['feedback_version'], 3)
        self.assertEqual(self.put('too_high', 1).status_code, 409)
        with self.Session() as db:
            feedback = db.query(ReviewScoreFeedback).one()
            self.assertEqual(feedback.state, 'withdrawn')
            self.assertEqual(feedback.feedback_version, 3)

    def test_first_submit_omits_version_and_rejects_stale_version(self):
        self.assertEqual(self.put(version=1).status_code, 409)
        self.assertEqual(self.put(version=None).status_code, 200)

    def test_community_uses_approved_gallery_and_keeps_own_state_only(self):
        self.assertEqual(self.put(user=2).status_code, 404)
        self.mutate(is_public=True, share_token='shared')
        denied = self.client.get(self.path, params={'score_revision': self.revision}, headers=self.headers(2))
        self.assertEqual(denied.status_code, 200)
        self.assertFalse(denied.json()['eligible'])
        self.assertIsNone(denied.json()['score_revision'])
        self.assertEqual(self.put(user=2).status_code, 404)
        self.mutate(gallery_visible=True, gallery_audit_status='approved', is_public=False)
        self.assertEqual(self.put(user=2).status_code, 404)
        self.mutate(is_public=True)
        author = self.put('too_low').json()
        community = self.put('too_high', user=2).json()
        current = self.client.get(self.path, params={'score_revision': self.revision}, headers=self.headers(2)).json()
        self.assertEqual(current['role'], 'community')
        self.assertEqual(current['my_feedback']['feedback_id'], community['feedback_id'])
        self.assertNotIn(author['feedback_id'], str(current))
        with self.Session() as db:
            roles = {feedback.user_id: feedback.role_at_submission for feedback in db.query(ReviewScoreFeedback)}
            self.assertEqual(roles, {1: 'author', 2: 'community'})
            self.assertEqual(db.query(ReviewScoreSnapshot).count(), 1)
        self.mutate(gallery_visible=False)
        self.assertEqual(self.put('accurate', 1, user=2).status_code, 404)

    def test_score_changed_conflicts_and_new_snapshot_keeps_old_feedback(self):
        old = self.put('too_low').json()
        self.mutate(final_score=Decimal('7.8'))
        self.assertEqual(self.put('accurate', 1).status_code, 409)
        self.assertEqual(self.client.get(self.path, params={'score_revision': self.revision}, headers=self.headers()).status_code, 409)
        with self.Session() as db:
            new_revision = service.score_revision(db.get(Review, 1))
        new = self.put(revision=new_revision).json()
        self.assertNotEqual(new['feedback_id'], old['feedback_id'])
        with self.Session() as db:
            self.assertEqual(db.query(ReviewScoreSnapshot).count(), 2)
            self.assertEqual(db.query(ReviewScoreFeedback).count(), 2)

    def test_feedback_id_recovery_after_visibility_and_score_change(self):
        self.mutate(is_public=True, gallery_visible=True, gallery_audit_status='approved')
        saved = self.put(user=2).json()
        self.put('too_low', 1, user=2)
        self.mutate(is_public=False, gallery_visible=False, deleted_at=datetime.now(timezone.utc), final_score=9)
        endpoint = '/api/v1/score-feedback/' + saved['feedback_id']
        conflict = self.client.request('DELETE', endpoint, headers=self.headers(2), json={'expected_feedback_version': 1})
        self.assertEqual(conflict.status_code, 409)
        recovery = self.client.get(endpoint, headers=self.headers(2))
        self.assertEqual(recovery.json()['feedback_version'], 2)
        self.assertEqual(set(recovery.json()), {'feedback_id', 'verdict', 'state', 'feedback_version', 'created_at', 'updated_at', 'withdrawn_at'})
        self.assertEqual(self.client.request('DELETE', endpoint, headers=self.headers(2),
                                            json={'expected_feedback_version': 2}).json()['state'], 'withdrawn')

    def test_other_user_feedback_id_is_always_404(self):
        feedback_id = self.put().json()['feedback_id']
        endpoint = '/api/v1/score-feedback/' + feedback_id
        self.assertEqual(self.client.get(endpoint, headers=self.headers(2)).status_code, 404)
        self.assertEqual(self.client.request('DELETE', endpoint, headers=self.headers(2), json={'expected_feedback_version': 1}).status_code, 404)

    def test_unsupported_objects_and_expired_private_history(self):
        for raw in ({'analysis_type': 'retake_compare'}, {'practice': {}}, {'goal_assessment': {}}, {'scores': {}}):
            self.mutate(result_json={**review_fixture().result_json, **raw})
            self.assertEqual(self.put().status_code, 422)
        self.mutate(result_json=review_fixture().result_json, created_at=datetime.now(timezone.utc) - timedelta(days=90))
        self.assertEqual(self.put().status_code, 404)

    def test_review_export_and_public_result_never_contain_feedback(self):
        saved = self.put('too_low').json()
        with self.Session() as db:
            review = db.get(Review, 1)
            exported = _build_review_export_payload(review=review, photo_id='photo', photo_url=None,
                                                    photo_thumbnail_url=None, source_review_id=None).model_dump(mode='json')
            self.assertNotIn(saved['feedback_id'], str(exported))
            self.assertNotIn('score_feedback', str(exported))
            self.assertNotIn('feedback', review.result_json)

    def test_client_cannot_supply_score_or_role_and_validation_is_no_store(self):
        response = self.client.put(self.path, headers=self.headers(), json={
            'expected_score_revision': self.revision, 'verdict': 'accurate', 'role': 'community', 'final_score': 10,
        })
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.headers['cache-control'], 'private, no-store')

    def test_rate_limit_is_transactional_and_not_review_quota(self):
        def blocked(*args, **kwargs):
            if kwargs['scope'] == 'score_feedback_write':
                raise ApiHTTPException(status_code=429, code='RATE_LIMIT_EXCEEDED', message='Rate limit')
        self.rate_mock.side_effect = blocked
        self.assertEqual(self.put().status_code, 429)
        with self.Session() as db:
            self.assertEqual(db.query(ReviewScoreFeedback).count(), 0)
            self.assertEqual(db.query(ReviewScoreSnapshot).count(), 0)
            self.assertEqual(db.get(User, 1).daily_quota_used, 0)

    def test_internal_report_filters_current_historical_deleted_withdrawn_and_unknowns(self):
        current = self.put('accurate').json()
        with self.Session() as db:
            review = db.get(Review, 1)
            snapshot = db.query(ReviewScoreSnapshot).one()
            feedback = db.query(ReviewScoreFeedback).filter(ReviewScoreFeedback.public_id == current['feedback_id']).one()
            old_snapshot = ReviewScoreSnapshot(
                public_id='rss_historical',
                review_id=review.id,
                revision_hash='0' * 64,
                snapshot_schema_version=service.SNAPSHOT_SCHEMA_VERSION,
                analysis_type='single',
                mode='flash',
                image_type='landscape',
                final_score=Decimal('6.000000'),
                scores_json={'composition': 6, 'lighting': 6, 'color': 6, 'impact': 6, 'technical': 6},
            )
            db.add(old_snapshot)
            db.flush()
            db.add(ReviewScoreFeedback(
                public_id='sfb_historical', snapshot_id=old_snapshot.id, user_id=1,
                role_at_submission='author', source_surface='result', verdict='too_high',
                state='active', feedback_version=1,
            ))
            db.add(ReviewScoreFeedback(
                public_id='sfb_withdrawn', snapshot_id=old_snapshot.id, user_id=2,
                role_at_submission='author', source_surface='result', verdict='too_low',
                state='withdrawn', feedback_version=2, withdrawn_at=datetime.now(timezone.utc),
            ))
            deleted_review = review_fixture(id=2, public_id='rev_deleted', owner_user_id=1, photo_id=1,
                                            deleted_at=datetime.now(timezone.utc))
            db.add(deleted_review)
            db.flush()
            deleted_snapshot = ReviewScoreSnapshot(
                public_id='rss_deleted', review_id=deleted_review.id, revision_hash=service.score_revision(deleted_review),
                snapshot_schema_version=service.SNAPSHOT_SCHEMA_VERSION, analysis_type='single', mode='flash',
                image_type='landscape', final_score=Decimal('7.600000'),
                scores_json={'composition': 8, 'lighting': 8, 'color': 7, 'impact': 8, 'technical': 7},
            )
            db.add(deleted_snapshot)
            db.flush()
            db.add(ReviewScoreFeedback(
                public_id='sfb_deleted', snapshot_id=deleted_snapshot.id, user_id=1,
                role_at_submission='author', source_surface='result', verdict='accurate',
                state='active', feedback_version=1,
            ))
            db.get(User, 3).status = UserStatus.suspended
            db.add(ReviewScoreFeedback(
                public_id='sfb_inactive', snapshot_id=snapshot.id, user_id=3,
                role_at_submission='community', source_surface='gallery', verdict='accurate',
                state='active', feedback_version=1,
            ))
            inactive_owner = User(id=4, public_id='usr_feedback_4', email='4@example.test',
                                  username='feedback_4', status=UserStatus.deleted, plan=UserPlan.free)
            db.add(inactive_owner)
            db.flush()
            db.add(Photo(id=2, public_id='pho_inactive_owner', owner_user_id=4, upload_id='upload-2',
                         bucket='test', object_key='inactive-owner.jpg', content_type='image/jpeg',
                         size_bytes=10, status=PhotoStatus.READY))
            db.flush()
            inactive_owner_review = review_fixture(
                id=3, public_id='rev_inactive_owner', owner_user_id=4, photo_id=2,
                is_public=True, gallery_visible=True, gallery_audit_status='approved',
            )
            db.add(inactive_owner_review)
            db.flush()
            inactive_owner_snapshot = ReviewScoreSnapshot(
                public_id='rss_inactive_owner', review_id=inactive_owner_review.id,
                revision_hash=service.score_revision(inactive_owner_review),
                snapshot_schema_version=service.SNAPSHOT_SCHEMA_VERSION, analysis_type='single', mode='flash',
                image_type='landscape', final_score=Decimal('7.600000'),
                scores_json={'composition': 8, 'lighting': 8, 'color': 7, 'impact': 8, 'technical': 7},
            )
            db.add(inactive_owner_snapshot)
            db.flush()
            db.add(ReviewScoreFeedback(
                public_id='sfb_inactive_owner', snapshot_id=inactive_owner_snapshot.id, user_id=2,
                role_at_submission='community', source_surface='gallery', verdict='too_low',
                state='active', feedback_version=1,
            ))
            db.commit()
            report = build_report(db)
        self.assertEqual(report['coverage']['active_current_feedback'], 1)
        self.assertEqual(report['coverage']['active_historical_feedback'], 1)
        self.assertEqual(report['coverage']['withdrawn_feedback'], 1)
        self.assertEqual(report['coverage']['excluded_deleted_reviews'], 1)
        self.assertEqual(report['coverage']['excluded_inactive_users'], 1)
        self.assertEqual(report['coverage']['excluded_inactive_review_owners'], 1)
        self.assertEqual(report['coverage']['eligible_current_gallery_reviews'], 0)
        self.assertGreaterEqual(report['unknown_provenance']['scorer_model_version'], 1)

    def test_revision_and_displayed_scores_are_built_before_commit(self):
        with self.Session() as db:
            row = db.get(Review, 1)
            row.created_at = row.created_at.replace(tzinfo=timezone.utc)
            actor = CurrentActor(db.get(User, 1))

            def changed_after_read():
                row.final_score = Decimal('9.0')
                row.result_json = {**row.result_json, 'scores': dict.fromkeys(service.SCORE_KEYS, 9)}

            with patch('app.api.routers.review_queries._build_photo_proxy_url', return_value='https://example.test/image'), \
                    patch.object(db, 'commit', side_effect=changed_after_read):
                response = get_review('rev_feedback_test', None, db, actor)
            self.assertEqual(response.result.final_score, 7.6)
            self.assertEqual(response.result.scores['color'], 7)
            self.assertEqual(response.score_revision, self.revision)
            self.assertNotEqual(response.score_revision, service.score_revision(row))

    def test_snapshot_user_uniqueness_and_review_cleanup(self):
        self.put()
        with self.Session() as db:
            existing = db.query(ReviewScoreFeedback).one()
            duplicate = ReviewScoreFeedback(public_id='sfb_duplicate', snapshot_id=existing.snapshot_id,
                                            user_id=existing.user_id, role_at_submission='author',
                                            source_surface='gallery', verdict='too_low', state='active')
            db.add(duplicate)
            with self.assertRaises(sa.exc.IntegrityError):
                db.flush()
            db.rollback()
            db.execute(sa.delete(Review).where(Review.id == 1))
            db.commit()
            self.assertEqual(db.query(ReviewScoreFeedback).count(), 0)
            self.assertEqual(db.query(ReviewScoreSnapshot).count(), 0)


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class ScoreFeedbackPostgresTests(unittest.TestCase):
    def setUp(self):
        from sqlalchemy import create_engine

        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        ReviewScoreSnapshot.__table__.create(self.engine, checkfirst=True)
        ReviewScoreFeedback.__table__.create(self.engine, checkfirst=True)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.suffix = f'pg_{datetime.now(timezone.utc).strftime("%H%M%S%f")}'
        with self.Session() as db:
            self.owner = self._user(db, 1)
            self.viewer = self._user(db, 2)
            self.photo = Photo(
                public_id=f'pho_{self.suffix}',
                owner_user_id=self.owner.id,
                upload_id=f'upl_{self.suffix}',
                bucket='test',
                object_key=f'{self.suffix}.jpg',
                content_type='image/jpeg',
                size_bytes=10,
                status=PhotoStatus.READY,
            )
            db.add(self.photo)
            db.flush()
            self.review_a = self._review(db, 'a')
            self.review_b = self._review(db, 'b')
            db.commit()
            self.review_a_id = self.review_a.public_id
            self.review_b_id = self.review_b.public_id
            self.owner_id = self.owner.id
            self.viewer_id = self.viewer.id
        self.original_limit = service.NEW_REVIEW_LIMIT_PER_DAY

    def tearDown(self):
        service.NEW_REVIEW_LIMIT_PER_DAY = self.original_limit
        with self.Session() as db:
            review_ids = [row[0] for row in db.query(Review.id).filter(Review.public_id.like(f'rev_{self.suffix}_%')).all()]
            if review_ids:
                snapshot_ids = [row[0] for row in db.query(ReviewScoreSnapshot.id).filter(ReviewScoreSnapshot.review_id.in_(review_ids)).all()]
                if snapshot_ids:
                    db.query(ReviewScoreFeedback).filter(ReviewScoreFeedback.snapshot_id.in_(snapshot_ids)).delete(synchronize_session=False)
                    db.query(ReviewScoreSnapshot).filter(ReviewScoreSnapshot.id.in_(snapshot_ids)).delete(synchronize_session=False)
                db.query(Review).filter(Review.id.in_(review_ids)).delete(synchronize_session=False)
            db.query(Photo).filter(Photo.public_id == f'pho_{self.suffix}').delete(synchronize_session=False)
            db.query(RateLimitCounter).filter(RateLimitCounter.scope_key.like(f'user:usr_{self.suffix}_%')).delete(synchronize_session=False)
            db.query(User).filter(User.public_id.like(f'usr_{self.suffix}_%')).delete(synchronize_session=False)
            db.commit()
        self.engine.dispose()

    def _user(self, db, index: int) -> User:
        user = User(
            public_id=f'usr_{self.suffix}_{index}',
            email=f'{self.suffix}-{index}@example.test',
            username=f'{self.suffix}_{index}',
            status=UserStatus.active,
            plan=UserPlan.free,
            daily_quota_total=100,
            daily_quota_used=0,
        )
        db.add(user)
        db.flush()
        return user

    def _review(self, db, label: str) -> Review:
        review = review_fixture(
            id=None,
            public_id=f'rev_{self.suffix}_{label}',
            owner_user_id=self.owner.id,
            photo_id=self.photo.id,
            is_public=True,
            gallery_visible=True,
            gallery_audit_status='approved',
        )
        db.add(review)
        db.flush()
        return review

    def _actor(self, db, user_id: int) -> CurrentActor:
        return CurrentActor(db.get(User, user_id))

    def _put(self, review_id: str, user_id: int | None = None):
        with self.Session() as db:
            review = db.query(Review).filter(Review.public_id == review_id).one()
            revision = service.score_revision(review)
            try:
                response = service.put_review_feedback(
                    db,
                    self._actor(db, user_id or self.owner_id),
                    review_id,
                    ScoreFeedbackPutRequest(expected_score_revision=revision, verdict='accurate'),
                )
                db.commit()
                return ('ok', response.feedback_id)
            except ApiHTTPException as exc:
                db.rollback()
                return ('error', exc.status_code, exc.detail['code'])

    def test_concurrent_same_snapshot_first_create_has_one_feedback(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _i: self._put(self.review_a_id), range(2)))
        self.assertEqual(sum(1 for result in results if result[0] == 'ok'), 2)
        with self.Session() as db:
            review = db.query(Review).filter(Review.public_id == self.review_a_id).one()
            snapshots = db.query(ReviewScoreSnapshot).filter(ReviewScoreSnapshot.review_id == review.id).all()
            self.assertEqual(len(snapshots), 1)
            self.assertEqual(
                db.query(ReviewScoreFeedback).filter(ReviewScoreFeedback.snapshot_id == snapshots[0].id).count(),
                1,
            )

    def test_daily_new_review_limit_serializes_different_reviews(self):
        service.NEW_REVIEW_LIMIT_PER_DAY = 1
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda review_id: self._put(review_id), [self.review_a_id, self.review_b_id]))
        self.assertEqual(sum(1 for result in results if result[0] == 'ok'), 1)
        self.assertEqual(sum(1 for result in results if result[-1] == 'RATE_LIMIT_EXCEEDED'), 1)

    def test_old_revision_conflicts_after_locked_maintenance_update(self):
        with self.Session() as db:
            review = db.query(Review).filter(Review.public_id == self.review_a_id).with_for_update(of=Review).one()
            old_revision = service.score_revision(review)
            review.final_score = Decimal('8.1')
            db.commit()
        with self.Session() as db:
            result = None
            try:
                service.put_review_feedback(
                    db,
                    self._actor(db, self.owner_id),
                    self.review_a_id,
                    ScoreFeedbackPutRequest(expected_score_revision=old_revision, verdict='too_high'),
                )
            except ApiHTTPException as exc:
                result = (exc.status_code, exc.detail['code'])
            self.assertEqual(result, (409, 'SCORE_FEEDBACK_SCORE_CHANGED'))

    def test_foreign_feedback_id_withdrawal_is_404(self):
        status, feedback_id = self._put(self.review_a_id)
        self.assertEqual(status, 'ok')
        with self.Session() as db:
            with self.assertRaises(ApiHTTPException) as ctx:
                service.withdraw_feedback(db, self._actor(db, self.viewer_id), feedback_id, 1)
            self.assertEqual(ctx.exception.status_code, 404)


if __name__ == '__main__':
    unittest.main()
