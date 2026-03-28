from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routes import (
    PHOTO_THUMBNAIL_MAX_SIZE,
    _ensure_gallery_thumbnail,
    _public_gallery_item,
    update_review_meta,
)
from app.core.config import settings
from app.db.models import ReviewMode, UserPlan


class GalleryThumbnailFlowTests(unittest.TestCase):
    def test_ensure_gallery_thumbnail_uploads_thumbnail_and_updates_meta(self) -> None:
        photo = SimpleNamespace(
            bucket='gallery-bucket',
            object_key='user_abc/2026/03/source.jpg',
            public_id='pho_123',
            client_meta={},
        )
        storage = MagicMock()

        with patch('app.api.routes.get_object_storage_client', return_value=storage), patch(
            'app.api.routes._get_photo_object',
            return_value=(MagicMock(), b'original-bytes'),
        ), patch(
            'app.api.routes._build_thumbnail_bytes',
            return_value=(b'thumb-bytes', 'image/webp'),
        ):
            url = _ensure_gallery_thumbnail(photo)

        expected_key = f'gallery-thumbnails/{photo.public_id}/{PHOTO_THUMBNAIL_MAX_SIZE}.webp'
        base_url = settings.object_base_url.rstrip('/')
        self.assertEqual(url, f'{base_url}/{expected_key}')
        self.assertEqual(photo.client_meta['gallery_thumbnail_key'], expected_key)
        self.assertEqual(photo.client_meta['gallery_thumbnail_size'], PHOTO_THUMBNAIL_MAX_SIZE)
        storage.put_object.assert_called_once_with(
            Bucket='gallery-bucket',
            Key=expected_key,
            Body=b'thumb-bytes',
            ContentType='image/webp',
            CacheControl='public, max-age=31536000, immutable',
        )

    def test_public_gallery_item_prefers_uploaded_gallery_thumbnail_url(self) -> None:
        now = datetime(2026, 3, 28, 10, 0, tzinfo=timezone.utc)
        request = SimpleNamespace()
        review = SimpleNamespace(
            public_id='rev_123',
            mode=ReviewMode.pro,
            image_type='street',
            final_score=8.6,
            result_json={},
            gallery_added_at=now,
            created_at=now,
        )
        photo = SimpleNamespace(
            public_id='pho_123',
            bucket='gallery-bucket',
            client_meta={'gallery_thumbnail_key': 'gallery-thumbnails/pho_123/512.webp'},
        )
        owner = SimpleNamespace(public_id='usr_123', username='tester', avatar_url=None)

        with patch('app.api.routes._build_photo_proxy_url', return_value='https://api.example.com/original.jpg') as build_proxy:
            item = _public_gallery_item(request, review, photo, owner)

        self.assertEqual(item.photo_url, 'https://api.example.com/original.jpg')
        self.assertEqual(
            item.photo_thumbnail_url,
            f"{settings.object_base_url.rstrip('/')}/gallery-thumbnails/pho_123/512.webp",
        )
        build_proxy.assert_called_once_with(request, 'pho_123', 'usr_123')

    def test_update_review_meta_generates_gallery_thumbnail_when_gallery_is_enabled(self) -> None:
        db = MagicMock()
        photo_query = MagicMock()
        photo_query.filter.return_value = photo_query
        photo = SimpleNamespace(
            id=5,
            bucket='gallery-bucket',
            object_key='user_abc/2026/03/source.jpg',
            public_id='pho_123',
            client_meta={},
        )
        photo_query.first.return_value = photo
        db.query.return_value = photo_query

        review = SimpleNamespace(
            photo_id=5,
            favorite=False,
            gallery_visible=False,
            gallery_added_at=None,
            gallery_audit_status='none',
            gallery_rejected_reason=None,
            share_token=None,
            is_public=False,
        )
        actor = SimpleNamespace(plan=UserPlan.free, user=SimpleNamespace(id=7))
        payload = SimpleNamespace(favorite=None, gallery_visible=True, tags=None, note=None)

        with patch('app.api.routes._find_review_owned', return_value=review), patch(
            'app.api.routes.run_content_audit',
            return_value=SimpleNamespace(safe=True, reason=None),
        ), patch(
            'app.api.routes._ensure_gallery_thumbnail',
            return_value='https://object.example.com/gallery-thumbnails/pho_123/512.webp',
        ) as ensure_thumbnail, patch(
            'app.api.routes._review_meta_payload',
            return_value={'review_id': 'rev_123'},
        ):
            payload_out = update_review_meta(
                review_id='rev_123',
                payload=payload,
                db=db,
                actor=actor,
            )

        self.assertEqual(payload_out, {'review_id': 'rev_123'})
        self.assertTrue(review.favorite)
        self.assertTrue(review.gallery_visible)
        self.assertEqual(review.gallery_audit_status, 'approved')
        self.assertTrue(review.is_public)
        ensure_thumbnail.assert_called_once_with(photo)
        self.assertIn(call(photo), db.add.call_args_list)
        self.assertIn(call(review), db.add.call_args_list)
        db.commit.assert_called_once()
        db.refresh.assert_called_once_with(review)


if __name__ == '__main__':
    unittest.main()
