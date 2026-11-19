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

from app.api.routers.blog import (
    BLOG_POST_SLUG_RE,
    PUBLISHED_BLOG_POST_SLUGS,
    increment_blog_post_view,
    list_blog_post_views,
)


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

    def _increment(self, slug: str, db: MagicMock, *, network_key: str | None = 'net-key', first_today: bool = True):
        with (
            patch('app.api.routers.blog.guest_network_scope_key', return_value=network_key),
            patch('app.api.routers.blog.enforce_minute_rate_limit') as rate_limit,
            patch('app.api.routers.blog.claim_daily_marker', return_value=first_today) as marker,
        ):
            payload = increment_blog_post_view(slug, request=MagicMock(), db=db)
        return payload, rate_limit, marker

    def test_increment_blog_post_view_updates_existing_record(self) -> None:
        db = MagicMock()
        db.execute.return_value.one.return_value = SimpleNamespace(slug='five-photo-composition-checks', view_count=13)

        payload, rate_limit, marker = self._increment('five-photo-composition-checks', db)

        self.assertEqual(payload.slug, 'five-photo-composition-checks')
        self.assertEqual(payload.view_count, 13)
        rate_limit.assert_called_once()
        self.assertEqual(rate_limit.call_args.kwargs['scope_key'], 'net-key')
        marker.assert_called_once_with(
            db, scope='blog_view_day', scope_key='net-key', endpoint='five-photo-composition-checks',
        )
        db.execute.assert_called_once()
        db.add.assert_not_called()
        db.commit.assert_called_once()
        db.refresh.assert_not_called()

    def test_increment_blog_post_view_normalizes_slug_before_upsert(self) -> None:
        db = MagicMock()
        db.execute.return_value.one.return_value = SimpleNamespace(slug='five-photo-composition-checks', view_count=1)

        payload, _, marker = self._increment(' Five-Photo-Composition-Checks ', db)

        self.assertEqual(payload.slug, 'five-photo-composition-checks')
        self.assertEqual(marker.call_args.kwargs['endpoint'], 'five-photo-composition-checks')
        db.execute.assert_called_once()
        db.commit.assert_called_once()

    def test_increment_blog_post_view_rejects_unpublished_slug_without_writing(self) -> None:
        db = MagicMock()

        with self.assertRaises(HTTPException) as raised:
            self._increment('not-a-published-post', db)

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail['code'], 'BLOG_POST_NOT_FOUND')
        db.execute.assert_not_called()
        db.commit.assert_not_called()

    def test_repeat_view_from_same_network_returns_current_total_without_increment(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.scalar.return_value = 21

        payload, _, _ = self._increment('five-photo-composition-checks', db, first_today=False)

        self.assertEqual(payload.view_count, 21)
        db.execute.assert_not_called()
        db.commit.assert_called_once()

    def test_caller_without_a_network_reads_the_total_without_incrementing(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.scalar.return_value = 8

        payload, rate_limit, marker = self._increment('five-photo-composition-checks', db, network_key=None)

        self.assertEqual(payload.view_count, 8)
        rate_limit.assert_not_called()
        marker.assert_not_called()
        db.execute.assert_not_called()

    def test_whitespace_slug_is_rejected_as_invalid(self) -> None:
        db = MagicMock()

        with self.assertRaises(HTTPException) as raised:
            self._increment('   ', db)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail['code'], 'BLOG_POST_SLUG_INVALID')
        db.execute.assert_not_called()

    def test_published_slugs_cover_frontend_posts(self) -> None:
        self.assertIn('five-photo-composition-checks', PUBLISHED_BLOG_POST_SLUGS)
        self.assertTrue(all(BLOG_POST_SLUG_RE.fullmatch(slug) for slug in PUBLISHED_BLOG_POST_SLUGS))


if __name__ == '__main__':
    unittest.main()
