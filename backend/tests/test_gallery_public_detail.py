from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import and_, create_engine
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers import gallery
from app.api.routers.gallery_support import _indexable_gallery_filters, _public_gallery_detail
from app.db.models import Photo, PhotoStatus, Review, ReviewMode, ReviewStatus, User, UserPlan, UserStatus
from app.db.session import get_db
from app.main import app as main_app

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()
PUBLISHED_AT = datetime(2026, 11, 1, 9, 30, tzinfo=timezone.utc)
UPDATED_AT = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)

PRIVATE_RESULT_KEYS = {
    'exif_info': {'Make': 'Private Camera', 'GPSLatitude': 35.0},
    'comparison': {'source_review_id': 'rev_private_source'},
    'goal_assessment': {'status': 'met'},
    'share_info': {'share_token': 'secret-share-token'},
    'billing_info': {'cost_usd': 0.01},
    'score_evidence': {'composition': 'internal evidence'},
}


def _review(**overrides):
    values = {
        'id': 41,
        'public_id': 'rev_public_1',
        'mode': ReviewMode.flash,
        'image_type': 'street',
        'final_score': Decimal('7.40'),
        'gallery_added_at': PUBLISHED_AT,
        'created_at': PUBLISHED_AT,
        'updated_at': UPDATED_AT,
        'result_json': {
            'score_version': 'score-v8-style-relative',
            'review_locale': 'EN',
            'scores': {'composition': 8, 'lighting': 7, 'color': 7, 'story': 8, 'technical': 7},
            'advantage': '  Strong diagonal leads to the subject.  ',
            'critique': 'The right edge is busy.',
            'suggestions': 'Step left and crop tighter.',
            **PRIVATE_RESULT_KEYS,
        },
        'note': 'private owner note',
        'share_token': 'secret-share-token',
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _photo(status=PhotoStatus.READY):
    return SimpleNamespace(public_id='pho_public_1', status=status, exif_data={'Make': 'Private Camera'})


def _owner():
    return SimpleNamespace(
        public_id='usr_public_1',
        username='lens_owner',
        email='someone@example.test',
        avatar_url=None,
        public_profile_enabled=True,
        public_profile_id='lens-owner',
    )


class IndexableGalleryFilterTests(unittest.TestCase):
    def test_filter_requires_approved_visible_ready_active_and_ignores_share_links(self) -> None:
        sql = str(and_(*_indexable_gallery_filters()).compile(dialect=postgresql.dialect()))

        self.assertIn('reviews.deleted_at IS NULL', sql)
        self.assertIn('reviews.status', sql)
        self.assertIn('reviews.gallery_visible', sql)
        self.assertIn('reviews.gallery_audit_status', sql)
        self.assertIn('photos.status', sql)
        self.assertIn('users.status', sql)
        self.assertNotIn('share_token', sql)


class PublicGalleryDetailPayloadTests(unittest.TestCase):
    def _build(self, photo=None, review=None):
        request = SimpleNamespace()
        with patch(
            'app.api.routers.gallery_support._build_photo_proxy_url',
            return_value='https://api.example.test/photo',
        ), patch(
            'app.api.routers.gallery_support._build_public_gallery_thumbnail_url',
            return_value='https://api.example.test/thumb',
        ):
            return _public_gallery_detail(
                request,
                review or _review(),
                photo or _photo(),
                _owner(),
                like_count=-3,
                owner_profile_url='/u/lens-owner',
            )

    def test_payload_exposes_only_public_critique_fields(self) -> None:
        payload = self._build().model_dump()

        self.assertEqual(
            set(payload),
            {
                'review_id', 'photo_id', 'photo_url', 'photo_thumbnail_url', 'mode', 'image_type',
                'final_score', 'score_version', 'scores', 'advantage', 'critique', 'suggestions',
                'summary', 'review_locale', 'owner_username', 'owner_avatar_url', 'owner_profile_url',
                'like_count', 'gallery_added_at', 'created_at', 'updated_at',
            },
        )
        serialized = repr(payload)
        for secret in ('Private Camera', 'rev_private_source', 'secret-share-token', 'private owner note', 'internal evidence'):
            self.assertNotIn(secret, serialized)

    def test_payload_normalizes_scores_text_locale_and_counts(self) -> None:
        payload = self._build()

        self.assertEqual(payload.scores['impact'], 8)
        self.assertEqual(payload.advantage, 'Strong diagonal leads to the subject.')
        self.assertEqual(payload.review_locale, 'en')
        self.assertEqual(payload.like_count, 0)
        self.assertEqual(payload.final_score, 7.4)
        self.assertEqual(payload.updated_at, UPDATED_AT)
        self.assertEqual(payload.photo_url, 'https://api.example.test/photo')

    def test_unknown_locale_and_unavailable_photo_have_no_links(self) -> None:
        review = _review(result_json={'review_locale': 'fr', 'critique': 'ok'})
        payload = self._build(photo=_photo(status=PhotoStatus.PURGED), review=review)

        self.assertIsNone(payload.review_locale)
        self.assertIsNone(payload.photo_url)
        self.assertIsNone(payload.photo_thumbnail_url)


class PublicGalleryDetailRouteTests(unittest.TestCase):
    def _client(self, db):
        app = FastAPI()
        app.include_router(gallery.router)
        app.dependency_overrides[gallery.get_db] = lambda: db
        return TestClient(app)

    def _db_returning(self, row):
        db = MagicMock()
        query = MagicMock()
        query.join.return_value = query
        query.filter.return_value = query
        query.first.return_value = row
        db.query.return_value = query
        return db

    def test_missing_or_non_gallery_review_is_404_without_guest_cookie(self) -> None:
        with patch('app.api.deps.create_guest_user') as create_guest_user:
            response = self._client(self._db_returning(None)).get('/gallery/rev_share_only')

        self.assertEqual(response.status_code, 404)
        self.assertIn('REVIEW_NOT_FOUND', response.text)
        self.assertNotIn('set-cookie', {key.lower() for key in response.headers})
        create_guest_user.assert_not_called()

    def test_approved_review_is_public_and_cacheable(self) -> None:
        db = self._db_returning((_review(), _photo(), _owner()))
        with patch(
            'app.api.routers.gallery_support._build_photo_proxy_url',
            return_value='https://api.example.test/photo',
        ), patch(
            'app.api.routers.gallery_support._build_public_gallery_thumbnail_url',
            return_value='https://api.example.test/thumb',
        ), patch('app.api.routers.gallery._gallery_like_count', return_value=3):
            response = self._client(db).get('/gallery/rev_public_1')

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['review_id'], 'rev_public_1')
        self.assertEqual(body['owner_profile_url'], '/u/lens-owner')
        self.assertEqual(body['owner_username'], 'lens_owner')
        self.assertEqual(body['like_count'], 3)
        self.assertEqual(response.headers['cache-control'], 'public, max-age=60')
        self.assertNotIn('set-cookie', {key.lower() for key in response.headers})

    def test_sitemap_entries_paginate_by_internal_id(self) -> None:
        rows = [
            SimpleNamespace(id=30, public_id='rev_c', image_type='street', updated_at=UPDATED_AT, gallery_added_at=PUBLISHED_AT, created_at=PUBLISHED_AT),
            SimpleNamespace(id=20, public_id='rev_b', image_type=None, updated_at=None, gallery_added_at=PUBLISHED_AT, created_at=PUBLISHED_AT),
            SimpleNamespace(id=10, public_id='rev_a', image_type='portrait', updated_at=UPDATED_AT, gallery_added_at=PUBLISHED_AT, created_at=PUBLISHED_AT),
        ]
        db = MagicMock()
        query = MagicMock()
        query.join.return_value = query
        query.filter.return_value = query
        query.order_by.return_value = query
        query.limit.return_value = query
        query.all.return_value = rows
        db.query.return_value = query

        response = self._client(db).get('/gallery/sitemap-entries', params={'limit': 2, 'cursor': '99'})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual([item['review_id'] for item in body['items']], ['rev_c', 'rev_b'])
        self.assertEqual(body['items'][1]['image_type'], 'default')
        self.assertEqual(body['next_cursor'], '20')
        query.limit.assert_called_once_with(3)

    def test_sitemap_entries_reject_invalid_cursor(self) -> None:
        for cursor in ('abc', '0', '-4'):
            response = self._client(MagicMock()).get('/gallery/sitemap-entries', params={'cursor': cursor})
            self.assertEqual(response.status_code, 400, cursor)


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class PublicGalleryDetailPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.connection = self.engine.connect()
        self.transaction = self.connection.begin()
        self.Session = sessionmaker(
            bind=self.connection, autoflush=False, autocommit=False,
            join_transaction_mode='create_savepoint',
        )

    def tearDown(self) -> None:
        main_app.dependency_overrides.clear()
        self.transaction.rollback()
        self.connection.close()
        self.engine.dispose()

    def _client(self):
        def override_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        main_app.dependency_overrides[get_db] = override_db
        return TestClient(main_app)

    def _insert(self, label: str, *, user_status=UserStatus.active, photo_status=PhotoStatus.READY, **review_values) -> str:
        suffix = f'{label}_{uuid4().hex[:8]}'
        db = self.Session()
        try:
            user = User(
                public_id=f'usr_gd_{suffix}', email=f'gd_{suffix}@example.test', username=f'gd_{suffix}',
                plan=UserPlan.free, daily_quota_total=5, daily_quota_used=0, status=user_status,
            )
            db.add(user)
            db.flush()
            photo = Photo(
                public_id=f'pho_gd_{suffix}', owner_user_id=user.id, upload_id=f'upl_gd_{suffix}', bucket='test',
                object_key=f'test/{suffix}.jpg', content_type='image/jpeg', size_bytes=1234, status=photo_status,
                exif_data={'Make': 'Private Camera'}, client_meta={},
            )
            db.add(photo)
            db.flush()
            values = {
                'gallery_visible': True,
                'gallery_audit_status': 'approved',
                'gallery_added_at': PUBLISHED_AT,
                'share_token': None,
                'deleted_at': None,
                'status': ReviewStatus.SUCCEEDED,
            }
            values.update(review_values)
            review = Review(
                public_id=f'rev_gd_{suffix}', photo_id=photo.id, owner_user_id=user.id, mode=ReviewMode.flash,
                image_type='street', schema_version='1.0', final_score=Decimal('7.40'), is_public=True, tags_json=[],
                result_json={'critique': 'Visible critique', 'review_locale': 'en'},
                **values,
            )
            db.add(review)
            db.commit()
            return review.public_id
        finally:
            db.close()

    def test_only_approved_gallery_reviews_are_publicly_readable_and_listed(self) -> None:
        approved = self._insert('approved')
        hidden = [
            self._insert('share_only', gallery_visible=False, gallery_audit_status='none', share_token='tok_share'),
            self._insert('pending', gallery_audit_status='none'),
            self._insert('withdrawn', gallery_visible=False),
            self._insert('deleted', deleted_at=UPDATED_AT),
            self._insert('suspended_owner', user_status=UserStatus.suspended),
            self._insert('purged_photo', photo_status=PhotoStatus.PURGED),
        ]

        with patch('app.main.worker.start'), patch('app.main.worker.stop'):
            with self._client() as client:
                self.assertEqual(client.get(f'/api/v1/gallery/{approved}').status_code, 200)
                for review_id in hidden:
                    self.assertEqual(client.get(f'/api/v1/gallery/{review_id}').status_code, 404, review_id)
                listed = {
                    item['review_id']
                    for item in client.get('/api/v1/gallery/sitemap-entries', params={'limit': 1000}).json()['items']
                }

        self.assertIn(approved, listed)
        self.assertTrue(listed.isdisjoint(hidden))


if __name__ == '__main__':
    unittest.main()
