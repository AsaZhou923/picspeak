from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routes import list_public_gallery


class PublicGalleryRouteTests(unittest.TestCase):
    def test_list_public_gallery_returns_total_count(self) -> None:
        request = SimpleNamespace()
        db = MagicMock()

        count_query = MagicMock()
        count_query.filter.return_value = count_query
        count_query.scalar.return_value = 19

        row_review = SimpleNamespace(id=101, gallery_added_at=datetime(2026, 3, 21, 12, 0, tzinfo=timezone.utc))
        rows = [(row_review, object(), object())]

        list_query = MagicMock()
        list_query.join.return_value = list_query
        list_query.filter.return_value = list_query
        list_query.order_by.return_value = list_query
        list_query.limit.return_value = list_query
        list_query.all.return_value = rows

        db.query.side_effect = [count_query, list_query]

        with patch(
            'app.api.routes._gallery_like_counts',
            return_value={row_review.id: 7},
        ), patch(
            'app.api.routes._gallery_viewer_likes',
            return_value={row_review.id},
        ), patch(
            'app.api.routes._public_gallery_item',
            return_value={
                'review_id': 'rev_123',
                'photo_id': 'pho_123',
                'photo_url': None,
                'photo_thumbnail_url': None,
                'mode': 'pro',
                'image_type': 'street',
                'final_score': 8.5,
                'summary': 'Test summary',
                'owner_username': 'tester',
                'like_count': 7,
                'liked_by_viewer': True,
                'gallery_added_at': row_review.gallery_added_at,
                'created_at': row_review.gallery_added_at,
            },
        ):
            payload = list_public_gallery(request=request, limit=12, cursor=None, authorization=None, db=db)

        self.assertEqual(payload.total_count, 19)
        self.assertEqual(len(payload.items), 1)
        self.assertEqual(payload.items[0].like_count, 7)
        self.assertTrue(payload.items[0].liked_by_viewer)
        self.assertIsNone(payload.next_cursor)
        db.commit.assert_called_once()


if __name__ == '__main__':
    unittest.main()
