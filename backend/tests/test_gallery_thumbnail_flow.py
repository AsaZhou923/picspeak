from __future__ import annotations

import sys
import unittest
from io import BytesIO
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.photos import PHOTO_THUMBNAIL_MAX_SIZE
from app.api.routers.gallery import _ensure_gallery_thumbnail, _public_gallery_item
from app.api.routers.photos import get_public_gallery_thumbnail
from app.api.routers.reviews import update_review_meta
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

        with patch('app.api.routers.gallery_support.get_object_storage_client', return_value=storage), patch(
            'app.api.routers.gallery_support._get_photo_object',
            return_value=(MagicMock(), b'original-bytes'),
        ), patch(
            'app.api.routers.gallery_support._build_thumbnail_bytes',
            return_value=(b'thumb-bytes', 'image/webp'),
        ), patch(
            'app.api.routers.gallery_support._build_storage_photo_url',
            return_value='https://signed.example.com/gallery-thumbnail',
        ):
            url = _ensure_gallery_thumbnail(photo)

        expected_key = f'gallery-thumbnails/{photo.public_id}/{PHOTO_THUMBNAIL_MAX_SIZE}.webp'
        self.assertEqual(url, 'https://signed.example.com/gallery-thumbnail')
        self.assertEqual(photo.client_meta['gallery_thumbnail_key'], expected_key)
        self.assertEqual(photo.client_meta['gallery_thumbnail_size'], PHOTO_THUMBNAIL_MAX_SIZE)
        storage.put_object.assert_called_once_with(
            Bucket='gallery-bucket',
            Key=expected_key,
            Body=b'thumb-bytes',
            ContentType='image/webp',
            CacheControl='public, max-age=31536000, immutable',
        )

    def test_ensure_gallery_thumbnail_ignores_injected_thumbnail_key(self) -> None:
        photo = SimpleNamespace(
            bucket='gallery-bucket',
            object_key='user_abc/2026/03/source.jpg',
            public_id='pho_123',
            client_meta={'gallery_thumbnail_key': 'user_victim/private.jpg'},
        )
        storage = MagicMock()

        with patch('app.api.routers.gallery_support.get_object_storage_client', return_value=storage), patch(
            'app.api.routers.gallery_support._get_photo_object',
            return_value=(MagicMock(), b'original-bytes'),
        ) as get_photo, patch(
            'app.api.routers.gallery_support._build_thumbnail_bytes',
            return_value=(b'thumb-bytes', 'image/webp'),
        ), patch(
            'app.api.routers.gallery_support._build_storage_photo_url',
            return_value='https://signed.example.com/gallery-thumbnail',
        ):
            url = _ensure_gallery_thumbnail(photo)

        expected_key = f'gallery-thumbnails/{photo.public_id}/{PHOTO_THUMBNAIL_MAX_SIZE}.webp'
        self.assertEqual(url, 'https://signed.example.com/gallery-thumbnail')
        get_photo.assert_called_once_with(photo)
        storage.put_object.assert_called_once()
        self.assertEqual(storage.put_object.call_args.kwargs['Key'], expected_key)
        self.assertEqual(photo.client_meta['gallery_thumbnail_key'], expected_key)

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

        with patch('app.api.routers.gallery_support._build_photo_proxy_url', return_value='https://api.example.com/original.jpg') as build_proxy, patch(
            'app.api.routers.gallery_support._build_public_gallery_thumbnail_url',
            return_value='https://api.example.com/api/v1/photos/gallery/rev_123/thumbnail',
        ) as build_gallery_thumbnail:
            item = _public_gallery_item(request, review, photo, owner)

        self.assertEqual(item.photo_url, 'https://api.example.com/original.jpg')
        self.assertEqual(
            item.photo_thumbnail_url,
            'https://api.example.com/api/v1/photos/gallery/rev_123/thumbnail',
        )
        build_gallery_thumbnail.assert_called_once_with(request, 'rev_123')
        build_proxy.assert_called_once_with(request, 'pho_123', 'usr_123')

    def test_public_gallery_thumbnail_serves_cached_object_for_approved_review(self) -> None:
        now = datetime(2026, 3, 28, 10, 0, tzinfo=timezone.utc)
        db = MagicMock()
        query = db.query.return_value
        query.join.return_value = query
        query.filter.return_value = query
        photo = SimpleNamespace(
            public_id='pho_123',
            bucket='gallery-bucket',
            object_key='user_abc/2026/03/source.jpg',
            content_type='image/jpeg',
            client_meta={
                'gallery_thumbnail_key': 'gallery-thumbnails/pho_123/512.webp',
                'gallery_thumbnail_content_type': 'image/webp',
            },
            updated_at=now,
        )
        review = SimpleNamespace(public_id='rev_123', updated_at=now)
        query.first.return_value = (photo, review)

        storage = MagicMock()
        storage.get_object.return_value = {
            'Body': BytesIO(b'cached-thumb'),
            'ContentType': 'image/webp',
        }

        with patch('app.api.routers.photos.get_object_storage_client', return_value=storage):
            response = get_public_gallery_thumbnail('rev_123', db=db)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.body, b'cached-thumb')
        self.assertEqual(response.media_type, 'image/webp')
        self.assertEqual(response.headers['cache-control'], 'public, max-age=60, must-revalidate')
        storage.get_object.assert_called_once_with(
            Bucket='gallery-bucket',
            Key='gallery-thumbnails/pho_123/512.webp',
        )

    def test_public_gallery_thumbnail_ignores_injected_thumbnail_key(self) -> None:
        now = datetime(2026, 3, 28, 10, 0, tzinfo=timezone.utc)
        db = MagicMock()
        query = db.query.return_value
        query.join.return_value = query
        query.filter.return_value = query
        photo = SimpleNamespace(
            public_id='pho_123',
            bucket='gallery-bucket',
            object_key='user_abc/2026/03/source.jpg',
            content_type='image/jpeg',
            client_meta={
                'gallery_thumbnail_key': 'user_victim/private.jpg',
                'gallery_thumbnail_content_type': 'image/svg+xml',
            },
            updated_at=now,
        )
        review = SimpleNamespace(public_id='rev_123', updated_at=now)
        query.first.return_value = (photo, review)

        storage = MagicMock()
        storage.get_object.return_value = {
            'Body': BytesIO(b'cached-thumb'),
            'ContentType': 'image/webp',
        }

        with patch('app.api.routers.photos.get_object_storage_client', return_value=storage):
            response = get_public_gallery_thumbnail('rev_123', db=db)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.body, b'cached-thumb')
        storage.get_object.assert_called_once_with(
            Bucket='gallery-bucket',
            Key='gallery-thumbnails/pho_123/512.webp',
        )
        self.assertNotEqual(storage.get_object.call_args.kwargs['Key'], 'user_victim/private.jpg')

    def test_public_gallery_thumbnail_falls_back_to_source_thumbnail(self) -> None:
        now = datetime(2026, 3, 28, 10, 0, tzinfo=timezone.utc)
        db = MagicMock()
        query = db.query.return_value
        query.join.return_value = query
        query.filter.return_value = query
        photo = SimpleNamespace(
            public_id='pho_123',
            bucket='gallery-bucket',
            object_key='user_abc/2026/03/source.jpg',
            content_type='image/jpeg',
            client_meta={},
            updated_at=now,
        )
        review = SimpleNamespace(public_id='rev_123', updated_at=now)
        query.first.return_value = (photo, review)

        with patch('app.api.routers.photos._get_photo_object', return_value=(MagicMock(), b'source-bytes')) as get_photo, patch(
            'app.api.routers.photos._build_thumbnail_bytes',
            return_value=(b'generated-thumb', 'image/webp'),
        ) as build_thumbnail:
            response = get_public_gallery_thumbnail('rev_123', db=db)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.body, b'generated-thumb')
        self.assertEqual(response.media_type, 'image/webp')
        get_photo.assert_called_once_with(photo)
        build_thumbnail.assert_called_once_with(b'source-bytes', PHOTO_THUMBNAIL_MAX_SIZE)

    def test_public_gallery_thumbnail_hides_unapproved_review(self) -> None:
        db = MagicMock()
        query = db.query.return_value
        query.join.return_value = query
        query.filter.return_value = query
        query.first.return_value = None

        with self.assertRaises(HTTPException) as error:
            get_public_gallery_thumbnail('rev_private', db=db)

        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(error.exception.detail['code'], 'GALLERY_THUMBNAIL_NOT_FOUND')

    def test_public_gallery_thumbnail_query_requires_public_succeeded_ready_review(self) -> None:
        db = MagicMock()
        query = db.query.return_value
        query.join.return_value = query
        query.filter.return_value = query
        query.first.return_value = None

        with self.assertRaises(HTTPException):
            get_public_gallery_thumbnail('rev_private', db=db)

        where_sql = ' '.join(str(condition).lower() for condition in query.filter.call_args.args)
        self.assertIn('reviews.public_id', where_sql)
        self.assertIn('reviews.status', where_sql)
        self.assertIn('reviews.deleted_at is null', where_sql)
        self.assertIn('reviews.gallery_visible = true', where_sql)
        self.assertIn('reviews.gallery_audit_status', where_sql)
        self.assertIn('photos.status', where_sql)

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

        with patch('app.api.routers.review_actions._find_review_owned', return_value=review), patch(
            'app.api.routers.review_actions.get_object_read_url',
            return_value='https://storage.example.com/signed-source',
        ) as signed_source, patch(
            'app.api.routers.review_actions.run_content_audit',
            return_value=SimpleNamespace(safe=True, reason=None),
        ), patch(
            'app.api.routers.review_actions._ensure_gallery_thumbnail',
            return_value='https://object.example.com/gallery-thumbnails/pho_123/512.webp',
        ) as ensure_thumbnail, patch(
            'app.api.routers.review_actions._review_meta_payload',
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
        signed_source.assert_called_once_with(photo.object_key, bucket=photo.bucket)
        ensure_thumbnail.assert_called_once_with(photo)
        self.assertIn(call(photo), db.add.call_args_list)
        self.assertIn(call(review), db.add.call_args_list)
        db.commit.assert_called_once()
        db.refresh.assert_called_once_with(review)


if __name__ == '__main__':
    unittest.main()
