from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from botocore.exceptions import ClientError
from fastapi import HTTPException
from PIL import Image

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.photos import (  # noqa: E402
    PHOTO_PROXY_TOKEN_PURPOSE,
    PHOTO_THUMBNAIL_CACHE_CONTROL,
    PHOTO_THUMBNAIL_SIZE,
    PHOTO_THUMBNAIL_STABLE_WINDOW_SECONDS,
    PHOTO_THUMBNAIL_TTL_SECONDS,
    _build_photo_proxy_url,
    _build_thumbnail_bytes,
    _private_thumbnail_object_key,
    get_photo_image,
    get_photo_thumbnail,
)
from app.core.security import sign_payload  # noqa: E402


def _jpeg_bytes(*, size: tuple[int, int] = (400, 200), orientation: int | None = None) -> bytes:
    buf = BytesIO()
    kwargs = {}
    if orientation is not None:
        exif = Image.Exif()
        exif[0x0112] = orientation
        kwargs['exif'] = exif.tobytes()
    Image.new('RGB', size, (120, 80, 40)).save(buf, format='JPEG', **kwargs)
    return buf.getvalue()


class PrivateThumbnailTests(unittest.TestCase):
    def test_private_thumbnail_url_stays_stable_across_multi_hour_window(self) -> None:
        request = SimpleNamespace(
            base_url='https://api.picspeak.art/',
            headers={'host': 'api.picspeak.art'},
            url_for=lambda _route_name, photo_id: f'https://api.picspeak.art/api/v1/photos/{photo_id}/thumbnail',
        )
        self.assertEqual(PHOTO_THUMBNAIL_STABLE_WINDOW_SECONDS, PHOTO_THUMBNAIL_TTL_SECONDS)
        window = PHOTO_THUMBNAIL_STABLE_WINDOW_SECONDS

        with patch('app.api.routers.photos.time.time', return_value=window * 200 + 10):
            at_start = _build_photo_proxy_url(request, 'pho_1', 'usr_1', size=PHOTO_THUMBNAIL_SIZE)
        with patch('app.api.routers.photos.time.time', return_value=window * 200 + 6 * 3600):
            six_hours_later = _build_photo_proxy_url(request, 'pho_1', 'usr_1', size=PHOTO_THUMBNAIL_SIZE)
        with patch('app.api.routers.photos.time.time', return_value=window * 201 + 10):
            next_window = _build_photo_proxy_url(request, 'pho_1', 'usr_1', size=PHOTO_THUMBNAIL_SIZE)

        self.assertEqual(at_start, six_hours_later)
        self.assertNotEqual(at_start, next_window)

    def test_get_photo_thumbnail_serves_persisted_copy_without_loading_original(self) -> None:
        now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        photo = SimpleNamespace(
            public_id='pho_cached',
            bucket='photos',
            object_key='user_usr_1/2026/11/orig.jpg',
            content_type='image/jpeg',
            updated_at=now,
        )
        storage = MagicMock()
        storage.get_object.return_value = {
            'Body': BytesIO(b'persisted-webp'),
            'ContentType': 'image/webp',
        }

        with (
            patch('app.api.routers.photos._find_photo_from_token', return_value=photo),
            patch('app.api.routers.photos.get_object_storage_client', return_value=storage),
            patch('app.api.routers.photos._get_photo_object') as fetch_original,
        ):
            response = get_photo_thumbnail('pho_cached', photo_token='tok', size=128, if_none_match=None, db=MagicMock())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.body, b'persisted-webp')
        self.assertEqual(response.media_type, 'image/webp')
        self.assertEqual(response.headers['cache-control'], PHOTO_THUMBNAIL_CACHE_CONTROL)
        storage.get_object.assert_called_once_with(Bucket='photos', Key='thumbnails/pho_cached/128.webp')
        storage.put_object.assert_not_called()
        fetch_original.assert_not_called()

    def test_get_photo_thumbnail_generates_and_persists_on_cache_miss(self) -> None:
        now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        photo = SimpleNamespace(
            public_id='pho_miss',
            bucket='photos',
            object_key='user_usr_1/2026/11/orig.jpg',
            content_type='image/jpeg',
            updated_at=now,
        )
        storage = MagicMock()
        storage.get_object.side_effect = ClientError({'Error': {'Code': 'NoSuchKey'}}, 'GetObject')

        with (
            patch('app.api.routers.photos._find_photo_from_token', return_value=photo),
            patch('app.api.routers.photos.get_object_storage_client', return_value=storage),
            patch('app.api.routers.photos._get_photo_object', return_value=(None, _jpeg_bytes())) as fetch_original,
            patch('app.api.routers.photos.logger.warning') as log_warning,
        ):
            response = get_photo_thumbnail('pho_miss', photo_token='tok', size=128, if_none_match=None, db=MagicMock())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.media_type, 'image/webp')
        fetch_original.assert_called_once_with(photo)
        log_warning.assert_not_called()
        storage.put_object.assert_called_once_with(
            Bucket='photos',
            Key=_private_thumbnail_object_key(photo, size=128),
            Body=response.body,
            ContentType='image/webp',
            CacheControl=PHOTO_THUMBNAIL_CACHE_CONTROL,
        )

    def test_get_photo_thumbnail_logs_warning_and_regenerates_on_unexpected_storage_error(self) -> None:
        now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        photo = SimpleNamespace(
            public_id='pho_err',
            bucket='photos',
            object_key='user_usr_1/2026/11/orig.jpg',
            content_type='image/jpeg',
            updated_at=now,
        )
        storage = MagicMock()
        storage.get_object.side_effect = ClientError({'Error': {'Code': 'InternalError'}}, 'GetObject')

        with (
            patch('app.api.routers.photos._find_photo_from_token', return_value=photo),
            patch('app.api.routers.photos.get_object_storage_client', return_value=storage),
            patch('app.api.routers.photos._get_photo_object', return_value=(None, _jpeg_bytes())) as fetch_original,
            patch('app.api.routers.photos.logger.warning') as log_warning,
        ):
            response = get_photo_thumbnail('pho_err', photo_token='tok', size=128, if_none_match=None, db=MagicMock())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.media_type, 'image/webp')
        fetch_original.assert_called_once_with(photo)
        log_warning.assert_called_once()
        self.assertIn('Failed to read stored thumbnail', log_warning.call_args.args[0])

    def test_private_photo_lookup_requires_active_owner(self) -> None:
        db = MagicMock()
        query = db.query.return_value
        query.join.return_value = query
        query.filter.return_value = query
        query.first.return_value = None

        orig_token = sign_payload({'photo_id': 'pho_del', 'uid': 'usr_deleted'}, ttl_seconds=600, purpose=PHOTO_PROXY_TOKEN_PURPOSE)
        thumb_token = sign_payload({'photo_id': 'pho_del', 'uid': 'usr_deleted', 'size': 128}, ttl_seconds=600, purpose=PHOTO_PROXY_TOKEN_PURPOSE)

        with self.assertRaises(HTTPException) as orig_err:
            get_photo_image('pho_del', photo_token=orig_token, db=db)
        self.assertEqual(orig_err.exception.status_code, 404)
        self.assertEqual(orig_err.exception.detail['code'], 'PHOTO_NOT_FOUND')

        with self.assertRaises(HTTPException) as thumb_err:
            get_photo_thumbnail('pho_del', photo_token=thumb_token, size=128, if_none_match=None, db=db)
        self.assertEqual(thumb_err.exception.status_code, 404)
        self.assertEqual(thumb_err.exception.detail['code'], 'PHOTO_NOT_FOUND')

        where_sql = ' '.join(str(condition).lower() for condition in query.filter.call_args.args)
        self.assertIn('photos.public_id', where_sql)
        self.assertIn('users.public_id', where_sql)
        self.assertIn('users.status', where_sql)

    def test_get_photo_thumbnail_still_serves_when_persist_put_fails(self) -> None:
        now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        photo = SimpleNamespace(
            public_id='pho_put_fail',
            bucket='photos',
            object_key='user_usr_1/2026/11/orig.jpg',
            content_type='image/jpeg',
            updated_at=now,
        )
        storage = MagicMock()
        storage.get_object.side_effect = ClientError({'Error': {'Code': 'NoSuchKey'}}, 'GetObject')
        storage.put_object.side_effect = RuntimeError('r2 write failed')

        with (
            patch('app.api.routers.photos._find_photo_from_token', return_value=photo),
            patch('app.api.routers.photos.get_object_storage_client', return_value=storage),
            patch('app.api.routers.photos._get_photo_object', return_value=(None, _jpeg_bytes())),
        ):
            response = get_photo_thumbnail('pho_put_fail', photo_token='tok', size=128, if_none_match=None, db=MagicMock())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.media_type, 'image/webp')

    def test_get_photo_thumbnail_returns_304_on_matching_etag(self) -> None:
        now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        photo = SimpleNamespace(
            public_id='pho_etag',
            bucket='photos',
            object_key='user_usr_1/2026/11/orig.jpg',
            content_type='image/jpeg',
            updated_at=now,
        )
        storage = MagicMock()
        storage.get_object.return_value = {'Body': BytesIO(b'cached'), 'ContentType': 'image/webp'}

        with (
            patch('app.api.routers.photos._find_photo_from_token', return_value=photo),
            patch('app.api.routers.photos.get_object_storage_client', return_value=storage),
        ):
            first = get_photo_thumbnail('pho_etag', photo_token='tok', size=128, if_none_match=None, db=MagicMock())
            second = get_photo_thumbnail('pho_etag', photo_token='tok', size=128, if_none_match=f'"{first.headers["etag"]}"', db=MagicMock())

        self.assertEqual(second.status_code, 304)
        self.assertEqual(storage.get_object.call_count, 1)

    def test_build_thumbnail_bytes_uses_draft_and_webp_method_4_and_preserves_orientation(self) -> None:
        raw = _jpeg_bytes(size=(400, 200), orientation=6)
        draft_calls: list[tuple] = []
        save_kwargs: list[dict] = []
        real_open = Image.open

        def wrapped_open(fp):
            img = real_open(fp)
            orig_draft = img.draft

            def spy_draft(mode, size):
                draft_calls.append((mode, size))
                return orig_draft(mode, size)

            img.draft = spy_draft
            return img

        orig_save = Image.Image.save

        def spy_save(self_img, fp, *args, **kwargs):
            save_kwargs.append(dict(kwargs))
            return orig_save(self_img, fp, *args, **kwargs)

        with patch('app.api.routers.photos.Image.open', side_effect=wrapped_open), patch.object(Image.Image, 'save', spy_save):
            thumb_bytes, media_type = _build_thumbnail_bytes(raw, 128)

        self.assertEqual(media_type, 'image/webp')
        self.assertEqual(draft_calls, [('RGB', (128, 128))])
        self.assertEqual(save_kwargs[0]['format'], 'WEBP')
        self.assertEqual(save_kwargs[0]['method'], 4)
        with Image.open(BytesIO(thumb_bytes)) as result:
            # Orientation 6 rotates (400, 200) -> (200, 400), thumbnailed to (64, 128).
            self.assertEqual(result.size, (64, 128))


if __name__ == '__main__':
    unittest.main()
