from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.backfill_gallery_thumbnails import backfill_gallery_thumbnails


class BackfillGalleryThumbnailsScriptTests(unittest.TestCase):
    def test_dry_run_deduplicates_and_skips_existing_thumbnails(self) -> None:
        db = MagicMock()
        query = MagicMock()
        query.join.return_value = query
        query.filter.return_value = query
        query.order_by.return_value = query

        missing_photo = SimpleNamespace(id=1, client_meta={})
        duplicate_photo = SimpleNamespace(id=1, client_meta={})
        existing_photo = SimpleNamespace(id=2, client_meta={'gallery_thumbnail_key': 'gallery-thumbnails/pho_2/512.webp'})
        query.all.return_value = [
            (SimpleNamespace(id=11), missing_photo),
            (SimpleNamespace(id=12), duplicate_photo),
            (SimpleNamespace(id=13), existing_photo),
        ]
        db.query.return_value = query

        stats = backfill_gallery_thumbnails(db, dry_run=True)

        self.assertEqual(
            stats,
            {
                'scanned_reviews': 3,
                'unique_photos': 2,
                'backfilled': 0,
                'skipped_existing': 1,
                'pending': 1,
            },
        )
        db.add.assert_not_called()
        db.commit.assert_not_called()

    def test_backfill_processes_missing_photos_up_to_limit(self) -> None:
        db = MagicMock()
        query = MagicMock()
        query.join.return_value = query
        query.filter.return_value = query
        query.order_by.return_value = query

        photo_one = SimpleNamespace(id=1, client_meta={})
        photo_two = SimpleNamespace(id=2, client_meta={})
        query.all.return_value = [
            (SimpleNamespace(id=21), photo_one),
            (SimpleNamespace(id=22), photo_two),
        ]
        db.query.return_value = query

        with patch('scripts.backfill_gallery_thumbnails._ensure_gallery_thumbnail') as ensure_thumbnail:
            stats = backfill_gallery_thumbnails(db, limit=1, dry_run=False)

        self.assertEqual(
            stats,
            {
                'scanned_reviews': 2,
                'unique_photos': 1,
                'backfilled': 1,
                'skipped_existing': 0,
                'pending': 0,
            },
        )
        ensure_thumbnail.assert_called_once_with(photo_one)
        self.assertEqual(db.add.call_args_list, [call(photo_one)])
        db.commit.assert_called_once()


if __name__ == '__main__':
    unittest.main()
