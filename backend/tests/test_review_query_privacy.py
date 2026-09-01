from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.review_queries import get_public_review, get_review  # noqa: E402
from app.api.routers.review_support import _review_result_payload  # noqa: E402
from app.db.models import UserPlan  # noqa: E402


class ReviewQueryPrivacyTests(unittest.TestCase):
    def test_public_share_response_never_exposes_review_task_id(self) -> None:
        review = SimpleNamespace(
            public_id='rev_public',
            task_id=99,
            mode=SimpleNamespace(value='flash'),
            status=SimpleNamespace(value='SUCCEEDED'),
            result_json={},
            final_score=7.0,
            model_name='gpt-5.6-luna',
            created_at=datetime(2026, 8, 28, tzinfo=timezone.utc),
        )
        photo = SimpleNamespace(public_id='pho_public', exif_data={})
        owner = SimpleNamespace(public_id='usr_owner')
        db = MagicMock()
        db.query.return_value.join.return_value.join.return_value.filter.return_value.first.return_value = (
            review,
            photo,
            owner,
        )

        with patch(
            'app.api.routers.review_queries._build_photo_proxy_url',
            return_value='https://images.example/public.jpg',
        ), patch(
            'app.api.routers.review_queries._review_image_type',
            return_value='default',
        ), patch(
            'app.api.routers.review_queries._review_model_version',
            return_value='gpt-5.6-luna',
        ), patch(
            'app.api.routers.review_queries._review_share_info',
            return_value={},
        ), patch(
            'app.api.routers.review_queries._review_result_payload',
            return_value={},
        ), patch(
            'app.api.routers.review_queries.ReviewGetResponse',
            side_effect=lambda **kwargs: kwargs,
        ):
            response = get_public_review('share-token', MagicMock(), db)

        self.assertIsNone(response['task_id'])
        self.assertFalse(response['viewer_is_owner'])
        db.commit.assert_called_once()

    def test_public_share_result_payload_omits_stored_exif_when_call_passes_none(self) -> None:
        review = SimpleNamespace(
            public_id='rev_public',
            task_id=None,
            mode=SimpleNamespace(value='flash'),
            status=SimpleNamespace(value='SUCCEEDED'),
            result_json={'exif_info': {'Camera': 'Private Body', 'Lens': 'Private Lens'}},
            final_score=7.0,
            model_name='gpt-5.6-luna',
            image_type='default',
            is_public=True,
            share_token='share-token',
            created_at=datetime(2026, 8, 28, tzinfo=timezone.utc),
        )
        photo = SimpleNamespace(public_id='pho_public', exif_data={'Camera': 'Private Body'})
        owner = SimpleNamespace(public_id='usr_owner')
        db = MagicMock()
        db.query.return_value.join.return_value.join.return_value.filter.return_value.first.return_value = (
            review,
            photo,
            owner,
        )
        request = MagicMock()
        request.url_for.return_value = 'https://picspeak.example/public/reviews/share-token'

        with patch(
            'app.api.routers.review_queries._build_photo_proxy_url',
            return_value='https://images.example/public.jpg',
        ):
            response = get_public_review('share-token', request, db)

        self.assertEqual(response.result.exif_info, {})
        self.assertIsNone(response.exif_data)

    def test_public_share_response_passes_empty_exif_boundary(self) -> None:
        review = SimpleNamespace(
            public_id='rev_public',
            task_id=99,
            mode=SimpleNamespace(value='flash'),
            status=SimpleNamespace(value='SUCCEEDED'),
            result_json={'exif_info': {'GPSLatitude': 35.0, 'Make': 'Leica'}},
            final_score=7.0,
            model_name='gpt-5.6-luna',
            created_at=datetime(2026, 8, 28, tzinfo=timezone.utc),
        )
        photo = SimpleNamespace(public_id='pho_public', exif_data={'GPSLatitude': 35.0})
        owner = SimpleNamespace(public_id='usr_owner')
        db = MagicMock()
        db.query.return_value.join.return_value.join.return_value.filter.return_value.first.return_value = (
            review,
            photo,
            owner,
        )

        with patch(
            'app.api.routers.review_queries._build_photo_proxy_url',
            return_value='https://images.example/public.jpg',
        ), patch(
            'app.api.routers.review_queries._review_image_type',
            return_value='default',
        ), patch(
            'app.api.routers.review_queries._review_model_version',
            return_value='gpt-5.6-luna',
        ), patch(
            'app.api.routers.review_queries._review_share_info',
            return_value={},
        ), patch(
            'app.api.routers.review_queries._review_result_payload',
            return_value={},
        ) as result_payload, patch(
            'app.api.routers.review_queries.ReviewGetResponse',
            side_effect=lambda **kwargs: kwargs,
        ):
            response = get_public_review('share-token', MagicMock(), db)

        self.assertIsNone(response['exif_data'])
        self.assertEqual(result_payload.call_args.kwargs['exif_info'], {})

    def test_review_result_payload_redacts_stored_exif_when_empty_boundary_is_explicit(self) -> None:
        payload = _review_result_payload(
            {'exif_info': {'GPSLatitude': 35.0, 'Make': 'Leica'}},
            7.0,
            exif_info={},
        )

        self.assertEqual(payload['exif_info'], {})

    def test_review_result_payload_retains_stored_exif_for_owner_default(self) -> None:
        payload = _review_result_payload(
            {'exif_info': {'Make': 'Leica'}},
            7.0,
        )

        self.assertEqual(payload['exif_info'], {'Make': 'Leica'})

    def test_authenticated_non_owner_public_review_redacts_photo_and_stored_exif(self) -> None:
        review = SimpleNamespace(
            public_id='rev_public',
            task_id=None,
            owner_user_id=10,
            mode=SimpleNamespace(value='flash'),
            status=SimpleNamespace(value='SUCCEEDED'),
            result_json={'exif_info': {'GPSLongitude': 139.0, 'Make': 'Leica'}},
            final_score=7.0,
            model_name='gpt-5.6-luna',
            is_public=True,
            share_token='share-token',
            source_review_id=None,
            favorite=True,
            gallery_visible=True,
            gallery_added_at=datetime(2026, 8, 28, tzinfo=timezone.utc),
            gallery_rejected_reason=None,
            tags_json=['private'],
            note='private note',
            created_at=datetime(2026, 8, 28, tzinfo=timezone.utc),
        )
        photo = SimpleNamespace(public_id='pho_public', exif_data={'GPSLongitude': 139.0})
        owner = SimpleNamespace(public_id='usr_owner')
        actor = SimpleNamespace(user=SimpleNamespace(id=20), plan=UserPlan.free)
        db = MagicMock()
        db.query.return_value.join.return_value.join.return_value.filter.return_value.first.return_value = (
            review,
            photo,
            owner,
        )

        with patch(
            'app.api.routers.review_queries._build_photo_proxy_url',
            return_value='https://images.example/public.jpg',
        ), patch(
            'app.api.routers.review_queries._review_image_type',
            return_value='default',
        ), patch(
            'app.api.routers.review_queries._review_model_version',
            return_value='gpt-5.6-luna',
        ), patch(
            'app.api.routers.review_queries._review_share_info',
            return_value={},
        ), patch(
            'app.api.routers.review_queries._review_result_payload',
            return_value={},
        ) as result_payload, patch(
            'app.api.routers.review_queries.ReviewGetResponse',
            side_effect=lambda **kwargs: kwargs,
        ):
            response = get_review('rev_public', MagicMock(), db, actor)

        self.assertFalse(response['viewer_is_owner'])
        self.assertIsNone(response['exif_data'])
        self.assertEqual(response['tags'], [])
        self.assertIsNone(response['note'])
        self.assertEqual(result_payload.call_args.kwargs['exif_info'], {})

    def test_owner_review_keeps_photo_exif(self) -> None:
        review = SimpleNamespace(
            public_id='rev_owner',
            task_id=None,
            owner_user_id=10,
            mode=SimpleNamespace(value='flash'),
            status=SimpleNamespace(value='SUCCEEDED'),
            result_json={},
            final_score=7.0,
            model_name='gpt-5.6-luna',
            is_public=False,
            share_token=None,
            source_review_id=None,
            favorite=True,
            gallery_visible=False,
            gallery_audit_status='none',
            gallery_added_at=None,
            gallery_rejected_reason=None,
            tags_json=['portfolio'],
            note='owner note',
            created_at=datetime(2026, 8, 28, tzinfo=timezone.utc),
        )
        photo_exif = {'Make': 'Leica'}
        photo = SimpleNamespace(public_id='pho_owner', exif_data=photo_exif)
        owner = SimpleNamespace(public_id='usr_owner')
        actor = SimpleNamespace(user=SimpleNamespace(id=10), plan=UserPlan.free)
        db = MagicMock()
        db.query.return_value.join.return_value.join.return_value.filter.return_value.first.return_value = (
            review,
            photo,
            owner,
        )

        with patch(
            'app.api.routers.review_queries._build_photo_proxy_url',
            return_value='https://images.example/owner.jpg',
        ), patch(
            'app.api.routers.review_queries._review_image_type',
            return_value='default',
        ), patch(
            'app.api.routers.review_queries._review_model_version',
            return_value='gpt-5.6-luna',
        ), patch(
            'app.api.routers.review_queries._review_share_info',
            return_value={},
        ), patch(
            'app.api.routers.review_queries._review_result_payload',
            return_value={},
        ) as result_payload, patch(
            'app.api.routers.review_queries.ReviewGetResponse',
            side_effect=lambda **kwargs: kwargs,
        ):
            response = get_review('rev_owner', MagicMock(), db, actor)

        self.assertTrue(response['viewer_is_owner'])
        self.assertEqual(response['exif_data'], photo_exif)
        self.assertEqual(response['tags'], ['portfolio'])
        self.assertEqual(response['note'], 'owner note')
        self.assertEqual(result_payload.call_args.kwargs['exif_info'], photo_exif)


if __name__ == '__main__':
    unittest.main()
