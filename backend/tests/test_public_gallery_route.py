from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import Photo, PhotoStatus, Review, ReviewMode, ReviewStatus, User, UserPlan, UserStatus
from app.db.session import get_db
from app.main import app
from app.api.routers.photos import _build_photo_proxy_url
from app.api.routers.gallery import (
    _decode_public_gallery_cursor,
    _encode_public_gallery_cursor,
    _gallery_rank_score_value,
    _gallery_recommendation_map,
    list_public_gallery,
)

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


class PublicGalleryRouteTests(unittest.TestCase):
    def test_gallery_rank_score_gives_score_slightly_more_weight_than_time(self) -> None:
        now = datetime(2026, 4, 9, 12, 0, tzinfo=timezone.utc)
        higher_score_recent = _gallery_rank_score_value(9.3, now.replace(day=6), now=now)
        lower_score_newest = _gallery_rank_score_value(8.7, now, now=now)

        self.assertGreater(higher_score_recent, lower_score_newest)

    def test_gallery_rank_score_still_rewards_recency_for_close_scores(self) -> None:
        now = datetime(2026, 4, 9, 12, 0, tzinfo=timezone.utc)
        slightly_lower_newer = _gallery_rank_score_value(8.8, now, now=now)
        slightly_higher_older = _gallery_rank_score_value(9.1, datetime(2026, 2, 1, 12, 0, tzinfo=timezone.utc), now=now)

        self.assertGreater(slightly_lower_newer, slightly_higher_older)

    def test_public_gallery_cursor_round_trip_preserves_rank_components(self) -> None:
        published_at = datetime(2026, 4, 8, 18, 30, tzinfo=timezone.utc)
        ranked_at = datetime(2026, 4, 9, 12, 0, tzinfo=timezone.utc)
        cursor = _encode_public_gallery_cursor(8.765432198765, published_at, 321, rank_reference_at=ranked_at)

        rank_score, cursor_dt, review_id, rank_reference_at = _decode_public_gallery_cursor(cursor)

        self.assertAlmostEqual(rank_score, 8.765432198765)
        self.assertEqual(cursor_dt, published_at)
        self.assertEqual(review_id, 321)
        self.assertEqual(rank_reference_at, ranked_at)

    def test_public_gallery_cursor_decodes_legacy_three_part_cursor(self) -> None:
        published_at = datetime(2026, 4, 8, 18, 30, tzinfo=timezone.utc)
        cursor = f'8.765432198765|{published_at.isoformat()}|321'

        rank_score, cursor_dt, review_id, rank_reference_at = _decode_public_gallery_cursor(cursor)

        self.assertAlmostEqual(rank_score, 8.765432198765)
        self.assertEqual(cursor_dt, published_at)
        self.assertEqual(review_id, 321)
        self.assertIsNone(rank_reference_at)

    def test_gallery_recommendation_map_marks_top_percentile_with_sufficient_type_sample(self) -> None:
        db = MagicMock()
        ranked_reviews = SimpleNamespace(
            c=SimpleNamespace(
                review_id=MagicMock(),
                global_count=object(),
                type_count=object(),
                global_percent_rank=object(),
                type_percent_rank=object(),
            )
        )
        ranked_reviews.c.review_id.in_.return_value = object()
        ranking_query = MagicMock()
        ranking_query.filter.return_value = ranking_query
        ranking_query.subquery.return_value = ranked_reviews
        result_query = MagicMock()
        result_query.filter.return_value = result_query
        result_query.all.return_value = [
            SimpleNamespace(review_id=1, global_count=8, type_count=8, global_percent_rank=0.0, type_percent_rank=0.0),
            SimpleNamespace(review_id=8, global_count=8, type_count=8, global_percent_rank=1.0, type_percent_rank=1.0),
        ]
        db.query.side_effect = [ranking_query, result_query]

        with patch('app.api.routers.gallery_support._public_gallery_filters', return_value=()):
            recommendations = _gallery_recommendation_map(db, [1, 8])

        self.assertFalse(recommendations[1]['recommended'])
        self.assertEqual(recommendations[1]['score_percentile'], 0.0)
        self.assertTrue(recommendations[8]['recommended'])
        self.assertEqual(recommendations[8]['score_percentile'], 100.0)

    def test_build_photo_proxy_url_prefers_https_for_forwarded_requests(self) -> None:
        request = SimpleNamespace(
            base_url='http://internal/',
            headers={
                'host': 'internal',
                'x-forwarded-host': 'api.picspeak.art',
                'x-forwarded-proto': 'https',
            },
            url_for=lambda _route_name, photo_id: f'http://internal/api/v1/photos/{photo_id}/image',
        )

        with patch('app.api.routers.photos.sign_payload', return_value='signed-token'):
            url = _build_photo_proxy_url(request, 'pho_123', 'usr_456')

        self.assertEqual(
            url,
            'https://api.picspeak.art/api/v1/photos/pho_123/image?photo_token=signed-token',
        )

    def test_list_public_gallery_returns_total_count(self) -> None:
        request = SimpleNamespace()
        db = MagicMock()

        count_query = MagicMock()
        count_query.filter.return_value = count_query
        count_query.scalar.return_value = 19

        row_review = SimpleNamespace(id=101, gallery_added_at=datetime(2026, 3, 21, 12, 0, tzinfo=timezone.utc))
        rows = [(row_review, object(), object(), 8.812345678901)]

        list_query = MagicMock()
        list_query.join.return_value = list_query
        list_query.filter.return_value = list_query
        list_query.order_by.return_value = list_query
        list_query.limit.return_value = list_query
        list_query.all.return_value = rows

        db.query.side_effect = [count_query, list_query]

        with patch(
            'app.api.routers.gallery._gallery_like_counts',
            return_value={row_review.id: 7},
        ), patch(
            'app.api.routers.gallery._gallery_viewer_likes',
            return_value={row_review.id},
        ), patch(
            'app.api.routers.gallery._gallery_recommendation_map',
            return_value={row_review.id: {'recommended': True, 'score_percentile': 92.5}},
        ), patch(
            'app.api.routers.gallery._public_gallery_item',
            return_value={
                'review_id': 'rev_123',
                'photo_id': 'pho_123',
                'photo_url': None,
                'photo_thumbnail_url': None,
                'mode': 'pro',
                'image_type': 'street',
                'final_score': 8.5,
                'score_version': 'score-v2-strict',
                'summary': 'Test summary',
                'owner_username': 'tester',
                'owner_avatar_url': 'https://img.clerk.com/avatar.png',
                'like_count': 7,
                'liked_by_viewer': True,
                'recommended': True,
                'score_percentile': 92.5,
                'gallery_added_at': row_review.gallery_added_at,
                'created_at': row_review.gallery_added_at,
            },
        ):
            payload = list_public_gallery(
                request=request,
                limit=12,
                cursor=None,
                created_from=None,
                created_to=None,
                min_score=None,
                max_score=None,
                image_type=None,
                authorization=None,
                db=db,
            )

        self.assertEqual(payload.total_count, 19)
        self.assertEqual(len(payload.items), 1)
        self.assertEqual(payload.items[0].like_count, 7)
        self.assertTrue(payload.items[0].liked_by_viewer)
        self.assertEqual(payload.items[0].score_version, 'score-v2-strict')
        self.assertEqual(payload.items[0].owner_avatar_url, 'https://img.clerk.com/avatar.png')
        self.assertTrue(payload.items[0].recommended)
        self.assertEqual(payload.items[0].score_percentile, 92.5)
        self.assertIsNone(payload.next_cursor)
        db.commit.assert_not_called()

    def test_list_public_gallery_applies_filters_to_count_and_list_queries(self) -> None:
        request = SimpleNamespace()
        db = MagicMock()

        count_query = MagicMock()
        count_query.filter.return_value = count_query
        count_query.scalar.return_value = 0

        list_query = MagicMock()
        list_query.join.return_value = list_query
        list_query.filter.return_value = list_query
        list_query.order_by.return_value = list_query
        list_query.limit.return_value = list_query
        list_query.all.return_value = []

        db.query.side_effect = [count_query, list_query]
        created_from = datetime(2026, 3, 1, tzinfo=timezone.utc)
        created_to = datetime(2026, 3, 20, tzinfo=timezone.utc)

        with patch('app.api.routers.gallery._apply_review_history_filters_gallery', side_effect=lambda query, **kwargs: query) as apply_filters:
            payload = list_public_gallery(
                request=request,
                limit=12,
                cursor=None,
                created_from=created_from,
                created_to=created_to,
                min_score=6.2,
                max_score=8.8,
                image_type='street',
                authorization=None,
                db=db,
            )

        self.assertEqual(payload.total_count, 0)
        self.assertEqual(apply_filters.call_count, 2)
        first_kwargs = apply_filters.call_args_list[0].kwargs
        self.assertIs(first_kwargs['date_field'], Review.gallery_added_at)
        self.assertEqual(first_kwargs['created_from'], created_from)
        self.assertEqual(first_kwargs['created_to'], created_to)
        self.assertEqual(first_kwargs['min_score'], 6.2)
        self.assertEqual(first_kwargs['max_score'], 8.8)
        self.assertEqual(first_kwargs['image_type'], 'street')

    def test_list_public_gallery_rejects_invalid_score_range(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            list_public_gallery(
                request=SimpleNamespace(),
                limit=12,
                cursor=None,
                created_from=None,
                created_to=None,
                min_score=8.5,
                max_score=7.0,
                image_type=None,
                authorization=None,
                db=MagicMock(),
            )

        self.assertEqual(ctx.exception.status_code, 400)


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class PublicGalleryRoutePostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.connection = self.engine.connect()
        self.Session = sessionmaker(bind=self.connection, autoflush=False, autocommit=False)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.connection.close()
        self.engine.dispose()

    def _client(self):
        def override_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_db
        return TestClient(app)

    def _insert_gallery_reviews(
        self,
        *,
        count: int,
        newest_at: datetime,
        spacing: timedelta,
        score: Decimal = Decimal('8.00'),
    ) -> list[str]:
        suffix = uuid4().hex[:10]
        db = self.Session()
        try:
            user = User(
                public_id=f'usr_pg_{suffix}',
                email=f'pg_{suffix}@example.test',
                username=f'pg_{suffix}',
                plan=UserPlan.free,
                daily_quota_total=5,
                daily_quota_used=0,
                status=UserStatus.active,
            )
            db.add(user)
            db.flush()
            public_ids: list[str] = []
            for index in range(count):
                published_at = newest_at - (spacing * index)
                photo = Photo(
                    public_id=f'pho_pg_{suffix}_{index}',
                    owner_user_id=user.id,
                    upload_id=f'upl_pg_{suffix}_{index}',
                    bucket='test',
                    object_key=f'test/{suffix}/{index}.jpg',
                    content_type='image/jpeg',
                    size_bytes=1234,
                    status=PhotoStatus.READY,
                    exif_data={},
                    client_meta={},
                    created_at=published_at,
                )
                db.add(photo)
                db.flush()
                review_public_id = f'rev_pg_{suffix}_{index}'
                review = Review(
                    public_id=review_public_id,
                    photo_id=photo.id,
                    owner_user_id=user.id,
                    mode=ReviewMode.pro,
                    status=ReviewStatus.SUCCEEDED,
                    image_type='default',
                    schema_version='1.0',
                    result_json={'score_version': 'test'},
                    final_score=score,
                    is_public=True,
                    gallery_visible=True,
                    gallery_audit_status='approved',
                    gallery_added_at=published_at,
                    tags_json=[],
                    created_at=published_at,
                )
                db.add(review)
                public_ids.append(review_public_id)
            db.commit()
            return public_ids
        finally:
            db.close()

    def test_latest_pagination_uses_exact_timestamp_and_id_boundary(self) -> None:
        newest_at = datetime(2035, 1, 1, 12, 0, 0, 120, tzinfo=timezone.utc) + timedelta(days=int(uuid4().hex[:6], 16) % 3000)
        inserted_ids = self._insert_gallery_reviews(count=61, newest_at=newest_at, spacing=timedelta(microseconds=2))
        created_from = (newest_at - timedelta(seconds=1)).isoformat()
        created_to = (newest_at + timedelta(seconds=1)).isoformat()

        with patch('app.main.worker.start'), patch('app.main.worker.stop'):
            with self._client() as client:
                first = client.get(
                    '/api/v1/gallery',
                    params={'limit': 60, 'sort': 'latest', 'created_from': created_from, 'created_to': created_to},
                )
                self.assertEqual(first.status_code, 200)
                first_body = first.json()
                second = client.get(
                    '/api/v1/gallery',
                    params={
                        'limit': 60,
                        'sort': 'latest',
                        'created_from': created_from,
                        'created_to': created_to,
                        'cursor': first_body['next_cursor'],
                    },
                )

        self.assertEqual(second.status_code, 200)
        first_ids = [item['review_id'] for item in first_body['items']]
        second_ids = [item['review_id'] for item in second.json()['items']]

        self.assertEqual(len(first_ids), 60)
        self.assertEqual(second_ids, [inserted_ids[60]])
        self.assertEqual(len(first_ids + second_ids), len(set(first_ids + second_ids)))

    def test_default_pagination_reuses_rank_clock_from_cursor(self) -> None:
        newest_at = datetime(2035, 1, 2, 12, 0, tzinfo=timezone.utc) + timedelta(days=int(uuid4().hex[:6], 16) % 3000)
        inserted_ids = self._insert_gallery_reviews(count=25, newest_at=newest_at, spacing=timedelta(seconds=1))
        created_from = (newest_at - timedelta(minutes=1)).isoformat()
        created_to = (newest_at + timedelta(minutes=1)).isoformat()

        with patch('app.main.worker.start'), patch('app.main.worker.stop'):
            with self._client() as client:
                first = client.get(
                    '/api/v1/gallery',
                    params={'limit': 24, 'sort': 'default', 'created_from': created_from, 'created_to': created_to},
                )
                self.assertEqual(first.status_code, 200)
                first_body = first.json()
                second = client.get(
                    '/api/v1/gallery',
                    params={
                        'limit': 24,
                        'sort': 'default',
                        'created_from': created_from,
                        'created_to': created_to,
                        'cursor': first_body['next_cursor'],
                    },
                )

        self.assertEqual(second.status_code, 200)
        first_ids = [item['review_id'] for item in first_body['items']]
        second_ids = [item['review_id'] for item in second.json()['items']]

        self.assertEqual(len(first_ids), 24)
        self.assertEqual(second_ids, [inserted_ids[24]])
        self.assertEqual(len(first_ids + second_ids), len(set(first_ids + second_ids)))
        self.assertEqual(first_body['next_cursor'].count('|'), 3)


if __name__ == '__main__':
    unittest.main()
