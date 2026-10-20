"""Full-result reuse must preserve request identity and detail readability.

Uses a disposable PostgreSQL schema, real HTTP/ORM/quota flows and score-cache
lookup. Only provider calls and object-storage URLs are stubbed.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import CurrentActor, get_current_actor, get_db
from app.api.routers import review_create, review_queries
from app.core.config import settings
from app.db.models import (
    Photo, PhotoStatus, Review, ReviewMode, ReviewStatus, ReviewTask,
    TaskStatus, UsageLedger, User, UserPlan, UserStatus,
)
from app.schemas import ReviewResult
from app.services.ai import AIReviewResponse, model_name_for_mode, openai_review_profile_for_mode
from app.services.ai_prompts import (
    PROMPT_VERSION, SCORE_PROMPT_VERSION, SCORE_VERSION, SCORER_PREPROCESS_VERSION,
)
from app.services.guard import review_history_cutoff
from app.services.review_task_processor import _process_task
from scoring_fixtures import LOW_SCORES, score_evidence_fixture

DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason='requires disposable PostgreSQL')


class FullCacheHarness:
    def __init__(self, session_factory):
        self.Session = session_factory
        self.now = datetime.now(timezone.utc)
        suffix = uuid4().hex
        with self.Session() as db:
            user = User(
                public_id='usr_cache_' + suffix, email=suffix + '@example.test', username=suffix,
                plan=UserPlan.free, status=UserStatus.active, daily_quota_total=10,
                daily_quota_used=0, daily_quota_date=self.now.date(),
            )
            db.add(user)
            db.flush()
            photo = Photo(
                public_id='pho_cache_' + suffix, owner_user_id=user.id,
                upload_id='upl_' + suffix, bucket='test', object_key=suffix + '.jpg',
                content_type='image/jpeg', size_bytes=10, status=PhotoStatus.READY,
            )
            db.add(photo)
            db.flush()
            self.user_id, self.photo_id, self.photo_public_id = user.id, photo.id, photo.public_id
            db.commit()
        self.calls = []

    def payload(self, *, locale='en', image_type='default', mode='flash'):
        profile = openai_review_profile_for_mode(mode)
        return {
            'prompt_version': PROMPT_VERSION,
            'score_version': SCORE_VERSION,
            'score_prompt_version': SCORE_PROMPT_VERSION,
            'scorer_preprocess_version': SCORER_PREPROCESS_VERSION,
            'scorer_model_name': profile.scorer_model_name,
            'scorer_model_version': profile.scorer_model_name + '-fixture',
            'scorer_reasoning_effort': profile.scorer_reasoning_effort,
            'writer_model_name': profile.writer_model_name,
            'writer_model_version': profile.writer_model_name + '-fixture',
            'writer_reasoning_effort': profile.writer_reasoning_effort,
            'model_name': profile.writer_model_name,
            'model_version': profile.writer_model_name + '-fixture',
            'review_locale': locale,
            'image_type': image_type,
            'scores': dict(LOW_SCORES),
            'score_evidence': score_evidence_fixture(LOW_SCORES),
            'final_score': 6.0,
            'advantage': 'A clear subject.',
            'critique': 'The edges compete.',
            'suggestions': 'Move closer.',
        }

    def provider(self, mode, **kwargs):
        self.calls.append(kwargs)
        raw = self.payload(locale=kwargs['locale'], image_type='portrait', mode=mode)
        # Deliberately echo the wrong category: provenance must come from the
        # effective request, not the provider's output or schema defaults.
        return AIReviewResponse(
            result=ReviewResult(**raw), model_name=raw['model_name'],
            model_version=raw['model_version'], prompt_version=PROMPT_VERSION,
            scorer_model_name=raw['scorer_model_name'], scorer_model_version=raw['scorer_model_version'],
            writer_model_name=raw['writer_model_name'], writer_model_version=raw['writer_model_version'],
            score_prompt_version=SCORE_PROMPT_VERSION, scorer_preprocess_version=SCORER_PREPROCESS_VERSION,
            score_cache_hit=kwargs.get('canonical_score') is not None,
        )

    def seed(self, *, locale='en', image_type='default', created_at=None, public=False,
             deleted=False, mode='flash', unknown_locale=False):
        raw = self.payload(locale=locale, image_type=image_type, mode=mode)
        if unknown_locale:
            raw.pop('review_locale')
        with self.Session() as db:
            review = Review(
                public_id='rev_cache_' + uuid4().hex, photo_id=self.photo_id, owner_user_id=self.user_id,
                mode=ReviewMode(mode), status=ReviewStatus.SUCCEEDED, image_type=image_type,
                schema_version='2.0', result_json=raw, final_score=6.0,
                model_name=raw['model_name'], scorer_model_name=raw['scorer_model_name'],
                writer_model_name=raw['writer_model_name'], is_public=public,
                # Public detail access is independent of gallery approval/history.
                gallery_visible=False, gallery_audit_status='none',
                created_at=created_at or self.now,
                deleted_at=self.now if deleted else None,
            )
            db.add(review)
            db.commit()
            return review.public_id

    def post(self, **changes):
        response = self.client.post('/api/v1/reviews', json={
            'photo_id': self.photo_public_id, 'mode': 'flash', 'review_model': 'gpt-6-sol',
            'locale': 'en', 'image_type': 'default', 'async': False, **changes,
        })
        assert response.status_code == 200, response.text
        return response.json()

    def complete(self, response):
        if 'review_id' in response:
            review_id = response['review_id']
        else:
            with self.Session() as db:
                task = db.query(ReviewTask).filter_by(public_id=response['task_id']).one()
                task.status, task.attempt_count = TaskStatus.RUNNING, 1
                db.commit()
                _process_task(db, task)
                assert task.status == TaskStatus.SUCCEEDED, task.error_message
                review_id = db.query(Review.public_id).filter_by(task_id=task.id).scalar()
        detail = self.client.get('/api/v1/reviews/' + review_id)
        assert detail.status_code == 200, detail.text
        assert detail.json()['review_id'] == review_id
        return review_id

    def assert_usage(self, count):
        with self.Session() as db:
            assert db.query(UsageLedger).filter_by(user_id=self.user_id).count() == count
            assert db.get(User, self.user_id).daily_quota_used == count


@pytest.fixture
def cache():
    engine = create_engine(DATABASE_URL)
    connection = engine.connect()
    transaction = connection.begin()
    sessions = sessionmaker(bind=connection, expire_on_commit=False, join_transaction_mode='create_savepoint')
    harness = FullCacheHarness(sessions)

    def db_dependency():
        with sessions() as db:
            yield db

    def actor_dependency(db: Session = Depends(get_db)):
        return CurrentActor(db.get(User, harness.user_id))

    app = FastAPI()
    app.include_router(review_create.router, prefix='/api/v1')
    app.include_router(review_queries.router, prefix='/api/v1')
    app.dependency_overrides[get_db] = db_dependency
    app.dependency_overrides[get_current_actor] = actor_dependency
    try:
        with patch.object(settings, 'cloud_tasks_enabled', False), patch.object(
            settings, 'notifications_event_capture_enabled', False,
        ), patch.object(review_create, 'run_ai_review', side_effect=harness.provider), patch(
            'app.services.review_task_processor.run_ai_review', side_effect=harness.provider,
        ), patch.object(review_create, 'get_object_read_url', return_value='https://example.test/photo.jpg'), patch(
            'app.services.review_task_processor.get_object_read_url', return_value='https://example.test/photo.jpg',
        ), patch.object(review_queries, '_build_photo_proxy_url', return_value='https://example.test/photo.jpg'), TestClient(app) as client:
            harness.client = client
            yield harness
    finally:
        transaction.rollback()
        connection.close()
        engine.dispose()


@pytest.mark.parametrize('async_mode', [False, True])
@pytest.mark.parametrize('locale', ['en', 'zh', 'ja'])
def test_matching_locale_category_reuses_full_review_without_provider_or_charge(cache, async_mode, locale):
    existing = cache.seed(locale=locale, image_type='landscape')
    response = cache.post(locale=locale, image_type='landscape', **{'async': async_mode})
    assert cache.complete(response) == existing
    assert not cache.calls
    cache.assert_usage(0)


@pytest.mark.parametrize('async_mode', [False, True])
@pytest.mark.parametrize('locale', ['zh', 'ja'])
def test_new_locale_rewrites_text_but_preserves_independent_score_reuse(cache, async_mode, locale):
    existing = cache.seed(locale='en', image_type='landscape')
    response = cache.post(locale=locale, image_type='landscape', **{'async': async_mode})
    assert ('task_id' in response) == async_mode
    new_id = cache.complete(response)
    assert new_id != existing
    assert len(cache.calls) == 1
    assert cache.calls[0]['locale'] == locale
    assert cache.calls[0]['canonical_score'] is not None
    assert cache.calls[0]['canonical_score'].scores == LOW_SCORES
    with cache.Session() as db:
        review = db.query(Review).filter_by(public_id=new_id).one()
        assert review.result_json['review_locale'] == locale
        assert review.image_type == review.result_json['image_type'] == 'landscape'
    # A newly created sync/worker result can immediately serve an exact repeat.
    assert cache.complete(cache.post(locale=locale, image_type='landscape')) == new_id
    assert len(cache.calls) == 1
    cache.assert_usage(1)


@pytest.mark.parametrize('async_mode', [False, True])
def test_new_category_cannot_reuse_old_text_or_category_specific_scores(cache, async_mode):
    existing = cache.seed(image_type='landscape')
    response = cache.post(image_type='street', **{'async': async_mode})
    assert cache.complete(response) != existing
    assert len(cache.calls) == 1
    assert cache.calls[0]['image_type'] == 'street'
    assert cache.calls[0]['canonical_score'] is None
    cache.assert_usage(1)


@pytest.mark.parametrize('async_mode', [False, True])
def test_unknown_historical_locale_is_not_guessed_from_english_prose(cache, async_mode):
    existing = cache.seed(unknown_locale=True)
    response = cache.post(**{'async': async_mode})
    assert cache.complete(response) != existing
    assert len(cache.calls) == 1
    assert cache.calls[0]['canonical_score'] is not None
    cache.assert_usage(1)


@pytest.mark.parametrize('async_mode', [False, True])
@pytest.mark.parametrize('plan,public,age_days,reuse', [
    (UserPlan.free, False, 1, True),
    (UserPlan.free, False, 16, False),
    (UserPlan.free, True, 1, True),
    (UserPlan.free, True, 16, True),
    (UserPlan.pro, False, 60, True),
    (UserPlan.pro, True, 60, True),
])
def test_full_cache_only_returns_owner_readable_results(cache, async_mode, plan, public, age_days, reuse):
    with cache.Session() as db:
        db.get(User, cache.user_id).plan = plan
        db.commit()
    existing = cache.seed(public=public, created_at=cache.now - timedelta(days=age_days))
    before = cache.client.get('/api/v1/reviews/' + existing)
    assert before.status_code == (200 if reuse else 404)
    response = cache.post(**{'async': async_mode})
    actual = cache.complete(response)
    assert (actual == existing) == reuse
    assert len(cache.calls) == (0 if reuse else 1)
    if not reuse:
        # Expired prose is not returned, but valid numerical evidence is reusable.
        assert cache.calls[0]['canonical_score'] is not None
    cache.assert_usage(0 if reuse else 1)


def test_private_review_at_exact_cutoff_remains_readable_and_reusable(cache):
    cutoff = review_history_cutoff(UserPlan.free, now=cache.now)
    existing = cache.seed(created_at=cutoff)
    with patch.object(review_create, 'review_history_cutoff', return_value=cutoff), patch.object(
        review_queries, 'review_history_cutoff', return_value=cutoff,
    ):
        assert cache.complete(cache.post()) == existing
    assert not cache.calls


def test_locale_and_category_filters_precede_candidate_limit(cache):
    existing = cache.seed(locale='ja', image_type='street', created_at=cache.now - timedelta(days=1))
    for _ in range(21):
        cache.seed(locale='en', image_type='street')
        cache.seed(locale='ja', image_type='portrait')
    assert cache.complete(cache.post(locale='ja', image_type='street')) == existing
    assert not cache.calls


def test_deleted_public_review_is_not_a_full_cache_hit(cache):
    existing = cache.seed(public=True, deleted=True)
    assert cache.client.get('/api/v1/reviews/' + existing).status_code == 404
    assert cache.complete(cache.post()) != existing
    assert len(cache.calls) == 1


def test_matching_qwen_result_still_uses_full_cache(cache):
    existing = cache.seed(locale='ja', image_type='street')
    writer_model = model_name_for_mode('flash')
    with cache.Session() as db:
        review = db.query(Review).filter_by(public_id=existing).one()
        review.model_name = review.writer_model_name = writer_model
        review.result_json = {
            **review.result_json, 'writer_model_name': writer_model,
            'writer_reasoning_effort': '',
        }
        db.commit()
    assert cache.complete(cache.post(locale='ja', image_type='street', review_model='qwen')) == existing
    assert not cache.calls
    cache.assert_usage(0)
