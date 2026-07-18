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

from app.api.deps import create_guest_user
from app.api.routers.auth_support import _build_unique_username, _login_from_google_claims
from app.db.models import UserPlan


class AuthTransactionHelperTests(unittest.TestCase):
    def test_create_guest_user_flushes_without_committing(self) -> None:
        db = MagicMock()

        with patch('app.api.deps.new_public_id', return_value='gst_test_123'):
            user = create_guest_user(db)

        self.assertEqual(user.public_id, 'gst_test_123')
        self.assertEqual(user.plan, UserPlan.guest)
        db.add.assert_called_once_with(user)
        db.flush.assert_called_once()
        db.commit.assert_not_called()
        db.refresh.assert_not_called()

    def test_login_from_google_claims_flushes_without_committing(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        claims = {'email': 'tester@example.com', 'email_verified': True}

        with patch('app.api.routers.auth_support.new_public_id', return_value='usr_test_123'), patch(
            'app.api.routers.auth_support.create_access_token',
            return_value='jwt-token',
        ):
            response = _login_from_google_claims(claims, db)

        self.assertEqual(response.access_token, 'jwt-token')
        self.assertEqual(response.user_id, 'usr_test_123')
        self.assertEqual(response.plan, 'free')
        db.flush.assert_called_once()
        db.commit.assert_not_called()
        db.refresh.assert_not_called()

    def test_build_unique_username_has_attempt_limit(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [
            SimpleNamespace(id=index + 1) for index in range(100)
        ]
        identity = SimpleNamespace(
            username='taken',
            first_name=None,
            last_name=None,
            email='taken@example.com',
            user_id='clerk_user_taken',
        )

        with self.assertRaises(HTTPException) as raised:
            _build_unique_username(db, identity)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail['code'], 'USERNAME_UNAVAILABLE')


if __name__ == '__main__':
    unittest.main()
