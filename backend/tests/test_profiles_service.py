from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import ReviewMode, UserPlan
from app.services.profiles import (
    _ensure_public_profile_id,
    _profile_settings_response,
    _profile_item_from_gallery_item,
    get_public_profile,
    update_my_profile_settings,
)


class ProfileServiceTests(unittest.TestCase):
    def test_guest_cannot_publish_public_profile(self) -> None:
        db = MagicMock()
        user = SimpleNamespace(plan=UserPlan.guest, public_profile_enabled=False)

        with self.assertRaises(HTTPException) as ctx:
            update_my_profile_settings(db, user, public_profile_enabled=True)

        self.assertEqual(ctx.exception.status_code, 403)
        db.commit.assert_not_called()

    def test_enable_allocates_random_public_id_without_exposing_internal_user_id(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        user = SimpleNamespace(
            id=123,
            public_id='usr_internal',
            public_profile_id=None,
            public_profile_enabled=False,
        )

        with patch('app.services.profiles._new_public_profile_id', return_value='upp_random_public'):
            public_profile_id = _ensure_public_profile_id(db, user)

        self.assertEqual(public_profile_id, 'upp_random_public')
        self.assertEqual(user.public_profile_id, 'upp_random_public')
        self.assertNotEqual(user.public_profile_id, user.public_id)

    def test_disabled_profile_settings_do_not_return_public_id(self) -> None:
        db = MagicMock()
        db.query.return_value.join.return_value.filter.return_value.scalar.return_value = 5
        user = SimpleNamespace(
            id=123,
            public_profile_id='upp_existing',
            public_profile_enabled=False,
            username='owner',
            avatar_url=None,
        )

        payload = _profile_settings_response(db, user)

        self.assertFalse(payload.public_profile_enabled)
        self.assertIsNone(payload.public_profile_id)
        self.assertEqual(payload.gallery_review_count, 5)

    def test_public_profile_404s_when_profile_not_enabled(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        with self.assertRaises(HTTPException) as ctx:
            get_public_profile(db, SimpleNamespace(), 'upp_hidden')

        self.assertEqual(ctx.exception.status_code, 404)

    def test_profile_gallery_item_drops_owner_viewer_and_private_fields(self) -> None:
        published_at = datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc)
        gallery_item = SimpleNamespace(
            model_dump=lambda: {
                'review_id': 'rev_public',
                'photo_id': 'pho_public',
                'photo_url': 'https://api.test/photo',
                'photo_thumbnail_url': 'https://api.test/thumb',
                'mode': ReviewMode.pro.value,
                'image_type': 'portrait',
                'final_score': float(Decimal('8.40')),
                'score_version': 'score-v5',
                'summary': 'Public gallery summary',
                'owner_username': 'visible-owner',
                'owner_avatar_url': 'https://img.test/avatar.jpg',
                'liked_by_viewer': True,
                'like_count': 3,
                'recommended': True,
                'score_percentile': 91.0,
                'gallery_added_at': published_at,
                'created_at': published_at,
            }
        )

        item = _profile_item_from_gallery_item(gallery_item)
        payload = item.model_dump()

        self.assertEqual(payload['review_id'], 'rev_public')
        self.assertEqual(payload['like_count'], 3)
        self.assertNotIn('owner_username', payload)
        self.assertNotIn('owner_avatar_url', payload)
        self.assertNotIn('liked_by_viewer', payload)


if __name__ == '__main__':
    unittest.main()
