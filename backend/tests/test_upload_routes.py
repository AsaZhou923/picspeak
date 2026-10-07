from __future__ import annotations

import sys
import hashlib
import unittest
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from starlette.requests import Request
from PIL import Image
from botocore.exceptions import ClientError, ReadTimeoutError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.uploads import UPLOAD_CONFIRM_TOKEN_PURPOSE, confirm_photo_upload
from app.core.security import sign_payload
from app.db.models import PhotoStatus
from app.schemas import PhotoCreateRequest

_image = BytesIO()
Image.new('RGB', (1024, 768)).save(_image, format='JPEG')
IMAGE_BYTES = _image.getvalue()
IMAGE_SHA256 = hashlib.sha256(IMAGE_BYTES).hexdigest()


def _request() -> Request:
    return Request(
        {
            'type': 'http',
            'method': 'POST',
            'path': '/api/v1/photos',
            'headers': [(b'host', b'api.example.com'), (b'x-forwarded-proto', b'https')],
            'client': ('203.0.113.10', 12345),
            'scheme': 'http',
            'server': ('api.example.com', 80),
        }
    )


def _upload_token(*, uid: str = 'usr_upload_owner', sha256: str | None = IMAGE_SHA256, size_bytes: int = len(IMAGE_BYTES)) -> str:
    return sign_payload(
        {
            'upload_id': 'upl_confirm',
            'uid': uid,
            'bucket': 'photos',
            'object_key': 'user_usr_upload_owner/2026/05/obj_test.jpg',
            'content_type': 'image/jpeg',
            'size_bytes': size_bytes,
            'sha256': sha256,
        },
        ttl_seconds=600,
        purpose=UPLOAD_CONFIRM_TOKEN_PURPOSE,
    )


class UploadRoutesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.storage = MagicMock()
        self.storage.head_object.return_value = {'ContentLength': len(IMAGE_BYTES), 'ContentType': 'image/jpeg', 'ETag': 'fixture-etag'}
        self.body = BytesIO(IMAGE_BYTES)
        self.storage.get_object.return_value = {'Body': self.body}
        self.enterContext(patch('app.api.routers.uploads.get_object_storage_client', return_value=self.storage))

    def test_confirm_photo_upload_persists_ready_photo_from_signed_upload_token(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
        actor = SimpleNamespace(user=SimpleNamespace(id=7, public_id='usr_upload_owner'))
        payload = PhotoCreateRequest(
            upload_id=_upload_token(),
            client_meta={
                'width': 1024,
                'height': 768,
                'upload_metrics': {
                    'frontend_preprocess_ms': 11,
                    'presign_request_ms': 22,
                    'object_upload_ms': 33,
                    'compressed': True,
                    'invalid_negative_ms': -1,
                },
            },
        )

        with patch('app.api.routers.uploads.new_public_id', return_value='pho_confirmed'), patch(
            'app.api.routers.uploads._build_photo_proxy_url',
            return_value='https://api.example.com/photos/pho_confirmed/image?photo_token=test',
        ):
            response = confirm_photo_upload(payload, request=_request(), db=db, actor=actor)

        self.assertEqual(response.photo_id, 'pho_confirmed')
        self.assertEqual(response.status, PhotoStatus.READY.value)
        db.add.assert_called_once()
        photo = db.add.call_args.args[0]
        self.assertEqual(photo.public_id, 'pho_confirmed')
        self.assertEqual(photo.owner_user_id, 7)
        self.assertEqual(photo.upload_id, 'upl_confirm')
        self.assertEqual(photo.bucket, 'photos')
        self.assertEqual(photo.object_key, 'user_usr_upload_owner/2026/05/obj_test.jpg')
        self.assertEqual(photo.content_type, 'image/jpeg')
        self.assertEqual(photo.size_bytes, len(IMAGE_BYTES))
        self.assertEqual(photo.checksum_sha256, IMAGE_SHA256)
        self.assertEqual(photo.width, 1024)
        self.assertEqual(photo.height, 768)
        self.assertEqual(photo.status, PhotoStatus.READY)
        db.commit.assert_called_once()
        db.refresh.assert_called_once_with(photo)
        self.assertTrue(self.body.closed)
        self.assertEqual(self.storage.get_object.call_args.kwargs['IfMatch'], 'fixture-etag')

    def test_confirm_photo_upload_reuses_existing_ready_photo_for_same_checksum(self) -> None:
        existing_photo = SimpleNamespace(
            public_id='pho_existing',
            status=PhotoStatus.READY,
            object_key='user_usr_upload_owner/2026/05/obj_existing.jpg',
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = existing_photo
        actor = SimpleNamespace(user=SimpleNamespace(id=7, public_id='usr_upload_owner'))
        payload = PhotoCreateRequest(upload_id=_upload_token(), client_meta={'width': 1024, 'height': 768})

        with patch(
            'app.api.routers.uploads._build_photo_proxy_url',
            return_value='https://api.example.com/photos/pho_existing/image?photo_token=test',
        ):
            response = confirm_photo_upload(payload, request=_request(), db=db, actor=actor)

        self.assertEqual(response.photo_id, 'pho_existing')
        self.assertEqual(response.status, PhotoStatus.READY.value)
        db.add.assert_not_called()
        db.refresh.assert_not_called()
        db.commit.assert_called_once()

    def test_confirm_photo_upload_rejects_owner_mismatch_before_writes(self) -> None:
        db = MagicMock()
        actor = SimpleNamespace(user=SimpleNamespace(id=8, public_id='usr_other'))
        payload = PhotoCreateRequest(upload_id=_upload_token(uid='usr_upload_owner'), client_meta={})

        with self.assertRaises(HTTPException) as raised:
            confirm_photo_upload(payload, request=_request(), db=db, actor=actor)

        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(raised.exception.detail['code'], 'UPLOAD_OWNER_MISMATCH')
        db.query.assert_not_called()
        db.add.assert_not_called()
        db.commit.assert_not_called()

    def _confirm(self, token: str | None = None, *, client_meta=None):
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
        actor = SimpleNamespace(user=SimpleNamespace(id=7, public_id='usr_upload_owner'))
        with patch('app.api.routers.uploads._build_photo_proxy_url', return_value='local-fixture'):
            response = confirm_photo_upload(
                PhotoCreateRequest(upload_id=token or _upload_token(), client_meta=client_meta or {}),
                request=_request(), db=db, actor=actor,
            )
        return response, db

    def test_missing_object_cannot_be_confirmed(self) -> None:
        self.storage.head_object.side_effect = ClientError({'Error': {'Code': 'NoSuchKey'}}, 'HeadObject')
        with self.assertRaises(HTTPException) as raised:
            self._confirm()
        self.assertEqual(raised.exception.detail['code'], 'UPLOAD_NOT_FOUND')
        self.storage.get_object.assert_not_called()

    def test_oversized_object_is_rejected_before_reading(self) -> None:
        self.storage.head_object.return_value['ContentLength'] = 10**9
        with self.assertRaises(HTTPException) as raised:
            self._confirm()
        self.assertEqual(raised.exception.detail['code'], 'FILE_TOO_LARGE')
        self.storage.get_object.assert_not_called()

    def test_size_and_type_must_match_the_signed_request(self) -> None:
        for field, value in [('ContentLength', 10), ('ContentType', 'text/plain')]:
            with self.subTest(field=field):
                self.storage.head_object.return_value = {'ContentLength': len(IMAGE_BYTES), 'ContentType': 'image/jpeg', 'ETag': 'fixture-etag', field: value}
                with self.assertRaises(HTTPException) as raised:
                    self._confirm()
                self.assertEqual(raised.exception.detail['code'], 'UPLOAD_CONTENT_MISMATCH')
        self.storage.get_object.assert_not_called()

    def test_checksum_is_verified_against_actual_bytes(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            self._confirm(_upload_token(sha256='0' * 64))
        self.assertEqual(raised.exception.detail['code'], 'UPLOAD_CHECKSUM_MISMATCH')
        self.assertTrue(self.body.closed)

    def test_dimensions_and_missing_checksum_are_derived_from_image(self) -> None:
        _response, db = self._confirm(_upload_token(sha256=None), client_meta={'width': 'invalid', 'height': 999})
        photo = db.add.call_args.args[0]
        self.assertEqual((photo.width, photo.height), (1024, 768))
        self.assertEqual(photo.checksum_sha256, IMAGE_SHA256)

    def test_non_image_and_truncated_streams_are_rejected(self) -> None:
        for raw in (b'not a jpeg', IMAGE_BYTES[:-5]):
            with self.subTest(length=len(raw)):
                self.storage.get_object.return_value = {'Body': BytesIO(raw)}
                self.storage.head_object.return_value['ContentLength'] = len(raw)
                with self.assertRaises(HTTPException):
                    self._confirm(_upload_token(sha256=None, size_bytes=len(raw)))

    def test_replaced_object_requires_a_new_confirmation(self) -> None:
        self.storage.get_object.side_effect = ClientError({'Error': {'Code': 'PreconditionFailed'}}, 'GetObject')
        with self.assertRaises(HTTPException) as raised:
            self._confirm()
        self.assertEqual(raised.exception.status_code, 409)

    def test_storage_outage_is_retryable(self) -> None:
        self.storage.head_object.side_effect = ClientError({'Error': {'Code': 'InternalError'}}, 'HeadObject')
        with self.assertRaises(HTTPException) as raised:
            self._confirm()
        self.assertEqual(raised.exception.status_code, 503)

    def test_storage_timeout_is_retryable(self) -> None:
        self.storage.get_object.side_effect = ReadTimeoutError(endpoint_url='https://storage.example.test')
        with self.assertRaises(HTTPException) as raised:
            self._confirm()
        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(raised.exception.detail['code'], 'UPLOAD_VERIFICATION_FAILED')


if __name__ == '__main__':
    unittest.main()
