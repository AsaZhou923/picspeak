from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.object_storage import get_object_read_url, get_object_storage_client


class ObjectStorageTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_object_storage_client.cache_clear()

    def test_get_object_storage_client_requires_endpoint(self) -> None:
        get_object_storage_client.cache_clear()

        with patch('app.services.object_storage.settings.object_s3_endpoint', ''):
            with self.assertRaisesRegex(ValueError, 'OBJECT_S3_ENDPOINT'):
                get_object_storage_client()

    def test_get_object_storage_client_requires_credentials(self) -> None:
        get_object_storage_client.cache_clear()

        with patch('app.services.object_storage.settings.object_s3_endpoint', 'https://r2.example.com'), patch(
            'app.services.object_storage.settings.object_access_key_id',
            '',
        ), patch('app.services.object_storage.settings.object_secret_access_key', 'secret'):
            with self.assertRaisesRegex(ValueError, 'OBJECT_ACCESS_KEY_ID'):
                get_object_storage_client()

    def test_get_object_storage_client_builds_s3_client_with_configured_values(self) -> None:
        get_object_storage_client.cache_clear()

        with patch('app.services.object_storage.settings.object_s3_endpoint', 'https://r2.example.com'), patch(
            'app.services.object_storage.settings.object_access_key_id',
            'access-key',
        ), patch('app.services.object_storage.settings.object_secret_access_key', 'secret-key'), patch(
            'app.services.object_storage.settings.object_region',
            'wnam',
        ), patch('app.services.object_storage.boto3.client', return_value='client') as boto_client:
            client = get_object_storage_client()

        self.assertEqual(client, 'client')
        boto_client.assert_called_once_with(
            's3',
            endpoint_url='https://r2.example.com',
            aws_access_key_id='access-key',
            aws_secret_access_key='secret-key',
            region_name='wnam',
        )

    def test_read_url_does_not_fall_back_to_public_access_when_signing_fails(self) -> None:
        client = MagicMock()
        client.generate_presigned_url.side_effect = RuntimeError('signing unavailable')
        with patch('app.services.object_storage.get_object_storage_client', return_value=client):
            with self.assertRaisesRegex(RuntimeError, 'signing unavailable'):
                get_object_read_url('user_private/photo.jpg', bucket='private-bucket')

    def test_read_url_requires_a_configured_bucket(self) -> None:
        with patch('app.services.object_storage.settings.object_bucket', ' '), patch(
            'app.services.object_storage.get_object_storage_client',
        ) as storage_client:
            with self.assertRaisesRegex(ValueError, 'OBJECT_BUCKET'):
                get_object_read_url('user_private/photo.jpg')
        storage_client.assert_not_called()


if __name__ == '__main__':
    unittest.main()
