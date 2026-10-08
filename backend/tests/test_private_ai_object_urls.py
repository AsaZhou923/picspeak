from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.object_storage import get_object_read_url  # noqa: E402


class PrivateAIObjectUrlTests(unittest.TestCase):
    def test_get_object_read_url_presigns_get_for_default_bucket(self) -> None:
        client = MagicMock()
        client.generate_presigned_url.return_value = 'https://storage.example.com/signed-get'

        with (
            patch('app.services.object_storage.get_object_storage_client', return_value=client),
            patch('app.services.object_storage.settings.object_bucket', 'private-bucket'),
        ):
            url = get_object_read_url('uploads/user/photo.jpg')

        self.assertEqual(url, 'https://storage.example.com/signed-get')
        client.generate_presigned_url.assert_called_once_with(
            ClientMethod='get_object',
            Params={
                'Bucket': 'private-bucket',
                'Key': 'uploads/user/photo.jpg',
            },
            ExpiresIn=3600,
        )

    def test_get_object_read_url_uses_explicit_bucket_and_expiry(self) -> None:
        client = MagicMock()
        client.generate_presigned_url.return_value = 'https://storage.example.com/source-signed-get'

        with patch('app.services.object_storage.get_object_storage_client', return_value=client):
            url = get_object_read_url('uploads/source.jpg', bucket='source-bucket', expires_in=120)

        self.assertEqual(url, 'https://storage.example.com/source-signed-get')
        client.generate_presigned_url.assert_called_once_with(
            ClientMethod='get_object',
            Params={
                'Bucket': 'source-bucket',
                'Key': 'uploads/source.jpg',
            },
            ExpiresIn=120,
        )

    def test_ai_private_image_callers_do_not_compose_public_object_urls(self) -> None:
        target_paths = [
            BACKEND_ROOT / 'app' / 'services' / 'review_task_processor.py',
            BACKEND_ROOT / 'app' / 'api' / 'routers' / 'review_create.py',
            BACKEND_ROOT / 'app' / 'api' / 'routers' / 'review_actions.py',
            BACKEND_ROOT / 'app' / 'services' / 'image_generation_task_processor.py',
        ]

        for path in target_paths:
            source = path.read_text(encoding='utf-8')
            with self.subTest(path=path.name):
                self.assertNotIn('settings.object_base_url', source)
                self.assertNotIn('_build_storage_photo_url(', source)
                self.assertIn('get_object_read_url', source)


if __name__ == '__main__':
    unittest.main()
