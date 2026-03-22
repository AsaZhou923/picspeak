from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routes import like_public_gallery_review
from app.db.models import UserPlan


class GalleryLikeRouteTests(unittest.TestCase):
    def test_like_public_gallery_review_blocks_guest(self) -> None:
        db = MagicMock()
        actor = SimpleNamespace(plan=UserPlan.guest, user=SimpleNamespace(id=5))

        with self.assertRaises(HTTPException) as ctx:
            like_public_gallery_review(review_id='rev_123', db=db, actor=actor)

        self.assertEqual(ctx.exception.status_code, 403)
        db.query.assert_not_called()

    def test_like_public_gallery_review_returns_updated_count(self) -> None:
        db = MagicMock()
        like_query = MagicMock()
        like_query.filter.return_value = like_query
        like_query.first.return_value = None
        db.query.return_value = like_query

        actor = SimpleNamespace(plan=UserPlan.free, user=SimpleNamespace(id=9))
        review = SimpleNamespace(id=101, public_id='rev_123')

        with patch('app.api.routes._find_public_gallery_review', return_value=review), patch(
            'app.api.routes._gallery_like_count',
            return_value=4,
        ):
            payload = like_public_gallery_review(review_id='rev_123', db=db, actor=actor)

        self.assertEqual(payload.review_id, 'rev_123')
        self.assertEqual(payload.like_count, 4)
        self.assertTrue(payload.liked_by_viewer)
        db.add.assert_called_once()
        db.commit.assert_called_once()


if __name__ == '__main__':
    unittest.main()
