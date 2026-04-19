from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.auth import _clerk_identity_from_webhook_user


class ClerkIdentityHelpersTests(unittest.TestCase):
    def test_clerk_identity_from_webhook_user_extracts_avatar_url(self) -> None:
        payload = {
            'id': 'user_123',
            'primary_email_address_id': 'email_123',
            'email_addresses': [
                {
                    'id': 'email_123',
                    'email_address': 'tester@example.com',
                    'verification': {'status': 'verified'},
                }
            ],
            'first_name': 'Test',
            'last_name': 'User',
            'username': 'tester',
            'image_url': 'https://img.clerk.com/avatar.png',
        }

        identity = _clerk_identity_from_webhook_user(payload)

        self.assertIsNotNone(identity)
        assert identity is not None
        self.assertEqual(identity.user_id, 'user_123')
        self.assertEqual(identity.avatar_url, 'https://img.clerk.com/avatar.png')


if __name__ == '__main__':
    unittest.main()
