from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.auth_support import _login_from_google_claims, _username_seed
from app.services.public_identity import public_display_name, username_derived_from_email


def _user(username: str, email: str, public_id: str = 'usr_0123456789abcdef') -> SimpleNamespace:
    return SimpleNamespace(username=username, email=email, public_id=public_id)


class UsernameDerivedFromEmailTests(unittest.TestCase):
    def test_detects_plain_and_suffixed_email_local_parts(self) -> None:
        self.assertTrue(username_derived_from_email('zhang_san_1990', 'Zhang.San.1990@example.com'))
        self.assertTrue(username_derived_from_email('zhang_san_1990_2', 'zhang.san.1990@example.com'))
        self.assertTrue(username_derived_from_email('google_zhang_san', 'zhang.san@gmail.com'))

    def test_detects_seed_trimmed_to_fit_a_unique_suffix(self) -> None:
        local = 'a' * 45
        self.assertTrue(username_derived_from_email(f'{"a" * 37}_12', f'{local}@example.com'))

    def test_keeps_chosen_names(self) -> None:
        self.assertFalse(username_derived_from_email('night_walker', 'zhang.san@example.com'))
        self.assertFalse(username_derived_from_email('zhang_2', 'zhang.san@example.com'))
        self.assertFalse(username_derived_from_email('', 'zhang.san@example.com'))


class PublicDisplayNameTests(unittest.TestCase):
    def test_email_derived_username_gets_a_stable_pseudonym(self) -> None:
        user = _user('zhang_san_1990', 'zhang.san.1990@example.com')

        name = public_display_name(user)

        self.assertRegex(name, r'^user_[0-9a-f]{8}$')
        self.assertNotIn('zhang', name)
        self.assertEqual(name, public_display_name(user))
        self.assertNotEqual(name, public_display_name(_user('zhang_san_1990', 'zhang.san.1990@example.com', 'usr_other')))

    def test_chosen_username_is_shown(self) -> None:
        self.assertEqual(public_display_name(_user('night_walker', 'zhang.san@example.com')), 'night_walker')


class NewUsernameTests(unittest.TestCase):
    def test_clerk_username_seed_skips_the_email(self) -> None:
        identity = SimpleNamespace(
            username=None, first_name=None, last_name=None,
            email='zhang.san@example.com', user_id='user_2abcdefgh12345678',
        )

        self.assertEqual(_username_seed(identity), 'user_12345678')

    def test_new_google_account_username_does_not_contain_the_email(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        claims = {'email': 'zhang.san@gmail.com', 'email_verified': True}

        with patch('app.api.routers.auth_support.create_access_token', return_value='jwt'):
            _login_from_google_claims(claims, db)

        created = db.add.call_args.args[0]
        self.assertRegex(created.username, r'^google_[0-9a-f]{12}$')


if __name__ == '__main__':
    unittest.main()
