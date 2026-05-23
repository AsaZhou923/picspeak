from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from starlette.requests import Request

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.uploads import UPLOAD_CONFIRM_TOKEN_PURPOSE, confirm_photo_upload
from app.core.security import sign_payload
from app.db.models import PhotoStatus
from app.schemas import PhotoCreateRequest


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


def _upload_token(*, uid: str = 'usr_upload_owner', sha256: str | None = 'sha256-test') -> str:
    return sign_payload(
        {
            'upload_id': 'upl_confirm',
            'uid': uid,
            'bucket': 'photos',
            'object_key': 'user_usr_upload_owner/2026/05/obj_test.jpg',
            'content_type': 'image/jpeg',
            'size_bytes': 2048,
            'sha256': sha256,
        },
        ttl_seconds=600,
        purpose=UPLOAD_CONFIRM_TOKEN_PURPOSE,
    )


class UploadRoutesTests(unittest.TestCase):
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
        self.assertEqual(photo.size_bytes, 2048)
        self.assertEqual(photo.checksum_sha256, 'sha256-test')
        self.assertEqual(photo.width, 1024)
        self.assertEqual(photo.height, 768)
        self.assertEqual(photo.status, PhotoStatus.READY)
        db.commit.assert_called_once()
        db.refresh.assert_called_once_with(photo)

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


if __name__ == '__main__':
    unittest.main()
