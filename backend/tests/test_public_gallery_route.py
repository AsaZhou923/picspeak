from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from fastapi import HTTPException
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import Review
from app.api.routers.photos import _build_photo_proxy_url
from app.api.routers.gallery import (
    _decode_public_gallery_cursor,
    _encode_public_gallery_cursor,
    _gallery_rank_score_value,
    _gallery_recommendation_map,
    list_public_gallery,
)


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
        cursor = _encode_public_gallery_cursor(8.765432198765, published_at, 321)

        rank_score, cursor_dt, review_id = _decode_public_gallery_cursor(cursor)

        self.assertAlmostEqual(rank_score, 8.765432198765)
        self.assertEqual(cursor_dt, published_at)
        self.assertEqual(review_id, 321)

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
        db.commit.assert_called_once()

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


if __name__ == '__main__':
    unittest.main()
