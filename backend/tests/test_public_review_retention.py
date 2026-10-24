from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import CurrentActor, get_current_actor, get_db
from app.api.routers import photos, review_actions, review_queries
from app.db.models import Base, Photo, PhotoStatus, Review, ReviewMode, ReviewStatus, User, UserPlan, UserStatus
from app.services.practice_access import ACCESS_AVAILABLE, ACCESS_EXPIRED, review_access_status
from app.services.review_visibility import review_is_public

DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@pytest.mark.parametrize('fields,public', [
    ({'is_public': True}, False),
    ({'share_token': 'share-active', 'is_public': False}, True),
    ({'share_token': '   '}, False),
    ({'gallery_visible': True, 'gallery_audit_status': 'pending', 'is_public': True}, False),
    ({'gallery_visible': True, 'gallery_audit_status': 'rejected', 'is_public': True}, False),
    ({'gallery_visible': True, 'gallery_audit_status': 'approved', 'is_public': False}, True),
    ({'gallery_visible': False, 'gallery_audit_status': 'approved', 'is_public': True}, False),
    ({'share_token': 'share-active', 'deleted_at': datetime.now(timezone.utc)}, False),
])
def test_effective_public_channels_control_old_review_access(fields, public):
    now = datetime.now(timezone.utc)
    review = SimpleNamespace(
        **{'deleted_at': None, 'created_at': now - timedelta(days=90), **fields},
    )
    assert review_is_public(review) is public
    assert review_access_status(review, now - timedelta(days=15)) == (
        'deleted' if review.deleted_at else ACCESS_AVAILABLE if public else ACCESS_EXPIRED
    )


class RetentionHarness:
    def __init__(self, sessions):
        self.Session = sessions
        self.now = datetime.now(timezone.utc)
        self.suffix = uuid4().hex
        with sessions() as db:
            owner = User(
                public_id='usr_retained_' + self.suffix, email=self.suffix + '@retained.test',
                username='retained_' + self.suffix, plan=UserPlan.free, status=UserStatus.active,
            )
            other = User(
                public_id='usr_retained_other_' + self.suffix, email='other-' + self.suffix + '@retained.test',
                username='retained_other_' + self.suffix, plan=UserPlan.free, status=UserStatus.active,
            )
            db.add_all([owner, other])
            db.flush()
            self.owner_id, self.other_id = owner.id, other.id
            self.actor_id = owner.id
            db.commit()

    def seed(self, *, days=90, share=False, gallery='none', flag=None, photo_id=None, source_id=None):
        suffix = uuid4().hex
        with self.Session() as db:
            if photo_id is None:
                photo = Photo(
                    public_id='pho_retained_' + suffix, owner_user_id=self.owner_id,
                    upload_id='upl_' + suffix, bucket='retention-fixture', object_key=suffix + '.png',
                    content_type='image/png', size_bytes=100, status=PhotoStatus.READY,
                    exif_data={'Make': 'private camera', 'GPSLatitude': 35.0},
                    created_at=self.now - timedelta(days=days),
                )
                db.add(photo)
                db.flush()
            else:
                photo = db.get(Photo, photo_id)
            review = Review(
                public_id='rev_retained_' + suffix, owner_user_id=self.owner_id, photo_id=photo.id,
                source_review_id=source_id, mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED,
                image_type='landscape', schema_version='2.0', final_score=6.0,
                model_name='fixture-model', result_json={
                    'scores': {key: 6 for key in ('composition', 'lighting', 'color', 'impact', 'technical')},
                    'advantage': '1. Clear structure', 'critique': '1. Competing edge',
                    'suggestions': '1. Reframe the edge', 'score_version': 'historical-fixture',
                    'exif_info': {'Make': 'private camera'},
                },
                created_at=self.now - timedelta(days=days),
                share_token='share_' + suffix if share else None,
                gallery_visible=gallery != 'none', gallery_audit_status=gallery,
                is_public=(share or gallery == 'approved') if flag is None else flag,
            )
            db.add(review)
            db.commit()
            return review

    def get_image(self, url):
        parsed = urlsplit(url)
        return self.client.get(parsed.path + '?' + parsed.query)

    def gallery_image(self, review):
        with self.Session() as db:
            photo = db.get(Photo, review.photo_id)
            owner = db.get(User, self.owner_id)
            request = SimpleNamespace(
                base_url='http://testserver/', headers={},
                url_for=lambda _route_name, photo_id: f'http://testserver/api/v1/photos/{photo_id}/image',
            )
            return photos._build_photo_proxy_url(
                request, photo.public_id, owner.public_id,
                public_review=review, public_channel='gallery',
            )


@pytest.fixture
def retained():
    if not DATABASE_URL:
        pytest.skip('requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
    engine = create_engine(DATABASE_URL)
    connection = engine.connect()
    transaction = connection.begin()
    schema = 'retention_' + uuid4().hex
    connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
    Base.metadata.create_all(connection)
    sessions = sessionmaker(bind=connection, expire_on_commit=False, join_transaction_mode='create_savepoint')
    harness = RetentionHarness(sessions)

    def db_dependency():
        with sessions() as db:
            yield db

    def actor_dependency(db: Session = Depends(get_db)):
        return CurrentActor(db.get(User, harness.actor_id))

    app = FastAPI()
    app.include_router(review_queries.router, prefix='/api/v1')
    app.include_router(review_actions.router, prefix='/api/v1')
    app.include_router(photos.router, prefix='/api/v1')
    app.dependency_overrides[get_db] = db_dependency
    app.dependency_overrides[get_current_actor] = actor_dependency
    image_buffer = BytesIO()
    Image.new('RGB', (16, 16), 'green').save(image_buffer, format='PNG')
    try:
        with patch.object(photos, '_get_photo_object', return_value=(None, image_buffer.getvalue())), TestClient(app) as client:
            harness.client = client
            yield harness
    finally:
        transaction.rollback()
        connection.close()
        engine.dispose()


@pytest.mark.parametrize('share,gallery', [(True, 'none'), (False, 'approved')])
def test_old_public_review_remains_in_owner_history_details_and_images(retained, share, gallery):
    public = retained.seed(share=share, gallery=gallery, flag=False)
    private = retained.seed()
    history = retained.client.get('/api/v1/me/reviews').json()['items']
    assert [item['review_id'] for item in history] == [public.public_id]
    assert history[0]['score_version'] == 'historical-fixture'
    assert retained.get_image(history[0]['photo_url']).status_code == 200
    assert retained.get_image(history[0]['photo_thumbnail_url']).status_code == 200
    detail = retained.client.get('/api/v1/reviews/' + public.public_id)
    assert detail.status_code == 200
    assert detail.json()['exif_data']['Make'] == 'private camera'
    assert retained.client.get('/api/v1/reviews/' + private.public_id).status_code == 404
    with retained.Session() as db:
        photo_id = db.get(Photo, public.photo_id).public_id
    assert retained.client.get('/api/v1/photos/' + photo_id + '/reviews').json()['items'][0]['review_id'] == public.public_id


@pytest.mark.parametrize('gallery', ['none', 'pending', 'rejected'])
def test_stale_public_flag_and_unapproved_gallery_do_not_bypass_expiry_or_privacy(retained, gallery):
    expired = retained.seed(gallery=gallery, flag=True)
    assert retained.client.get('/api/v1/me/reviews').json()['items'] == []
    assert retained.client.get('/api/v1/reviews/' + expired.public_id).status_code == 404
    retained.actor_id = retained.other_id
    assert retained.client.get('/api/v1/reviews/' + expired.public_id).status_code == 404


def test_public_history_pagination_keeps_old_public_and_hides_expired_private(retained):
    expected = {retained.seed(days=days, share=True).public_id for days in (17, 35, 90)}
    retained.seed(days=20)
    retained.seed(days=80, gallery='rejected', flag=True)
    first = retained.client.get('/api/v1/me/reviews?limit=2').json()
    second = retained.client.get('/api/v1/me/reviews', params={'limit': 2, 'cursor': first['next_cursor']}).json()
    actual = [item['review_id'] for page in (first, second) for item in page['items']]
    assert len(actual) == 3 and set(actual) == expected
    assert second['next_cursor'] is None


def test_retained_source_review_is_available_to_owner_comparison_only(retained):
    source = retained.seed(share=True)
    retake = retained.seed(days=1, source_id=source.id)
    detail = retained.client.get('/api/v1/reviews/' + retake.public_id).json()
    assert detail['source_review_id'] == source.public_id
    history = retained.client.get('/api/v1/me/reviews').json()['items']
    assert next(item for item in history if item['review_id'] == retake.public_id)['source_review_id'] == source.public_id
    retained.client.delete('/api/v1/reviews/' + source.public_id + '/share')
    assert retained.client.get('/api/v1/reviews/' + retake.public_id).json()['source_review_id'] is None


def test_share_and_gallery_tokens_revoke_independently_then_private_cutoff_returns(retained):
    review = retained.seed(share=True, gallery='approved')
    share_image = retained.client.get('/api/v1/public/reviews/' + review.share_token).json()['photo_url']
    gallery_image = retained.gallery_image(review)
    assert retained.get_image(share_image).status_code == retained.get_image(gallery_image).status_code == 200
    revoked = retained.client.delete('/api/v1/reviews/' + review.public_id + '/share')
    assert revoked.json()['is_public'] is True
    assert retained.get_image(share_image).status_code == 404
    assert retained.get_image(gallery_image).status_code == 200
    assert retained.client.get('/api/v1/reviews/' + review.public_id).status_code == 200
    removed = retained.client.patch('/api/v1/reviews/' + review.public_id + '/meta', json={'gallery_visible': False})
    assert removed.status_code == 200
    assert retained.get_image(gallery_image).status_code == 404
    assert retained.client.get('/api/v1/reviews/' + review.public_id).status_code == 404
    assert retained.client.get('/api/v1/me/reviews').json()['items'] == []
    with retained.Session() as db:
        assert db.get(Review, review.id).deleted_at is None
        assert db.get(Photo, review.photo_id).status == PhotoStatus.READY


def test_removing_gallery_keeps_share_and_public_result_redacts_private_fields(retained):
    review = retained.seed(share=True, gallery='approved')
    gallery_image = retained.gallery_image(review)
    retained.client.patch('/api/v1/reviews/' + review.public_id + '/meta', json={'gallery_visible': False})
    shared = retained.client.get('/api/v1/public/reviews/' + review.share_token)
    assert shared.status_code == 200
    assert shared.json()['exif_data'] is None and shared.json()['result']['exif_info'] == {}
    assert shared.json()['source_review_id'] is None and shared.json()['task_id'] is None
    assert retained.get_image(shared.json()['photo_url']).status_code == 200
    assert retained.get_image(gallery_image).status_code == 404
    retained.actor_id = retained.other_id
    detail = retained.client.get('/api/v1/reviews/' + review.public_id)
    assert detail.status_code == 200 and detail.json()['exif_data'] is None
    assert retained.client.get('/api/v1/me/reviews').json()['items'] == []


def test_deleting_one_public_review_revokes_its_photo_grants_even_with_other_public_review(retained):
    first = retained.seed(share=True)
    other = retained.seed(share=True, photo_id=first.photo_id)
    first_url = retained.client.get('/api/v1/public/reviews/' + first.share_token).json()['photo_url']
    other_url = retained.client.get('/api/v1/public/reviews/' + other.share_token).json()['photo_url']
    assert retained.client.delete('/api/v1/reviews/' + first.public_id).status_code == 204
    assert retained.get_image(first_url).status_code == 404
    assert retained.get_image(other_url).status_code == 200
    assert retained.client.get('/api/v1/public/reviews/' + first.share_token).status_code == 404
    assert retained.client.get('/api/v1/reviews/' + first.public_id).status_code == 404


def test_rotated_share_token_does_not_reactivate_old_photo_grant(retained):
    review = retained.seed(days=1, share=True)
    old_url = retained.client.get('/api/v1/public/reviews/' + review.share_token).json()['photo_url']
    retained.client.delete('/api/v1/reviews/' + review.public_id + '/share')
    new_share = retained.client.post('/api/v1/reviews/' + review.public_id + '/share').json()['share_token']
    assert new_share != review.share_token
    assert retained.get_image(old_url).status_code == 404
    assert retained.get_image(retained.client.get('/api/v1/public/reviews/' + new_share).json()['photo_url']).status_code == 200


def test_pro_private_history_still_has_no_age_limit(retained):
    review = retained.seed()
    with retained.Session() as db:
        db.get(User, retained.owner_id).plan = UserPlan.pro
        db.commit()
    assert retained.client.get('/api/v1/reviews/' + review.public_id).status_code == 200
    assert retained.client.get('/api/v1/me/reviews').json()['items'][0]['review_id'] == review.public_id


@pytest.mark.parametrize('resource', ['owner', 'photo', 'review'])
def test_unavailable_public_resources_revoke_details_and_image_reads(retained, resource):
    review = retained.seed(share=True, gallery='approved')
    shared_image = retained.client.get('/api/v1/public/reviews/' + review.share_token).json()['photo_url']
    gallery_image = retained.gallery_image(review)
    with retained.Session() as db:
        if resource == 'owner':
            db.get(User, retained.owner_id).status = UserStatus.suspended
        elif resource == 'photo':
            db.get(Photo, review.photo_id).status = PhotoStatus.REJECTED
        else:
            db.get(Review, review.id).status = ReviewStatus.FAILED
        db.commit()
    assert retained.client.get('/api/v1/public/reviews/' + review.share_token).status_code == 404
    assert retained.get_image(shared_image).status_code == 404
    assert retained.get_image(gallery_image).status_code == 404
    assert retained.client.get('/api/v1/photos/gallery/' + review.public_id + '/thumbnail').status_code == 404
    retained.actor_id = retained.other_id
    assert retained.client.get('/api/v1/reviews/' + review.public_id).status_code == 404
