from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routes import increment_blog_post_view, list_blog_post_views


class BlogPostViewRouteTests(unittest.TestCase):
    def test_list_blog_post_views_returns_zero_for_missing_slugs(self) -> None:
        db = MagicMock()
        query = MagicMock()
        query.filter.return_value = query
        query.all.return_value = [
            SimpleNamespace(slug='five-photo-composition-checks', view_count=12),
        ]
        db.query.return_value = query

        payload = list_blog_post_views(
            slug=['five-photo-composition-checks', 'missing-post'],
            db=db,
        )

        self.assertEqual(
            [(item.slug, item.view_count) for item in payload.items],
            [('five-photo-composition-checks', 12), ('missing-post', 0)],
        )
        db.commit.assert_called_once()

    def test_increment_blog_post_view_updates_existing_record(self) -> None:
        db = MagicMock()
        query = MagicMock()
        query.filter.return_value = query
        existing = SimpleNamespace(slug='five-photo-composition-checks', view_count=12)
        query.first.return_value = existing
        db.query.return_value = query

        payload = increment_blog_post_view('five-photo-composition-checks', db=db)

        self.assertEqual(payload.slug, 'five-photo-composition-checks')
        self.assertEqual(payload.view_count, 13)
        self.assertEqual(existing.view_count, 13)
        db.add.assert_not_called()
        db.commit.assert_called_once()
        db.refresh.assert_called_once_with(existing)

    def test_increment_blog_post_view_creates_record_when_missing(self) -> None:
        db = MagicMock()
        query = MagicMock()
        query.filter.return_value = query
        query.first.return_value = None
        db.query.return_value = query

        payload = increment_blog_post_view('new-blog-post', db=db)

        self.assertEqual(payload.slug, 'new-blog-post')
        self.assertEqual(payload.view_count, 1)
        db.add.assert_called_once()
        created = db.add.call_args.args[0]
        self.assertEqual(created.slug, 'new-blog-post')
        self.assertEqual(created.view_count, 1)
        db.commit.assert_called_once()
        db.refresh.assert_called_once_with(created)


if __name__ == '__main__':
    unittest.main()
