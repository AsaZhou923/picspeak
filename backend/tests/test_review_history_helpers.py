from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routes import _build_review_export_payload, _normalize_review_note, _normalize_review_tags, _review_share_info
from app.db.models import Review, ReviewMode, ReviewStatus


class _RequestStub:
    def url_for(self, name: str, **path_params: str) -> str:
        if name != 'get_public_review':
            raise AssertionError(f'unexpected route name: {name}')
        return f"https://api.example.com/api/v1/public/reviews/{path_params['share_token']}"


def _review() -> Review:
    now = datetime.now(timezone.utc)
    return Review(
        public_id='rev_123',
        mode=ReviewMode.pro,
        status=ReviewStatus.SUCCEEDED,
        image_type='street',
        model_name='gpt-test',
        final_score=8.6,
        favorite=True,
        tags_json=['Night', 'Street'],
        note='Keep the lower contrast.',
        created_at=now,
        result_json={
            'model_version': '2026-03',
            'scores': {'composition': 8, 'lighting': 9, 'color': 8, 'impact': 9, 'technical': 9},
            'advantage': '1. Strong timing',
            'critique': '1. Slight highlight clipping',
            'suggestions': '1. Pull highlights down a bit',
        },
    )


class ReviewHistoryHelperTests(unittest.TestCase):
    def test_normalize_review_tags_deduplicates_and_limits(self) -> None:
        tags = _normalize_review_tags(['  Night  ', 'night', '', 'Street', 'Portrait', 'Travel', 'Film', 'BW', 'City', 'Extra'])

        self.assertEqual(tags, ['Night', 'Street', 'Portrait', 'Travel', 'Film', 'BW', 'City', 'Extra'])

    def test_normalize_review_note_collapses_whitespace(self) -> None:
        self.assertEqual(_normalize_review_note('  Keep\n\nmore   shadow detail  '), 'Keep more shadow detail')
        self.assertIsNone(_normalize_review_note('   '))

    def test_build_review_export_payload_includes_review_meta(self) -> None:
        review = _review()

        payload = _build_review_export_payload(
            review=review,
            photo_id='pho_123',
            photo_url='https://cdn.example.com/photo.jpg',
            photo_thumbnail_url='https://cdn.example.com/thumb.webp',
            source_review_id='rev_prev',
        )

        self.assertEqual(payload.photo.photo_id, 'pho_123')
        self.assertEqual(payload.review.source_review_id, 'rev_prev')
        self.assertEqual(payload.review.image_type, 'street')
        self.assertEqual(payload.review.model_version, '2026-03')
        self.assertEqual(payload.review.tags, ['Night', 'Street'])

    def test_review_share_info_hides_token_for_public_view(self) -> None:
        review = _review()
        review.is_public = True
        review.share_token = 'share_123'

        owner_payload = _review_share_info(_RequestStub(), review, include_token=True)
        public_payload = _review_share_info(_RequestStub(), review, include_token=False)

        self.assertEqual(owner_payload['share_token'], 'share_123')
        self.assertNotIn('share_token', public_payload)
        self.assertTrue(public_payload['share_url'].endswith('/api/v1/public/reviews/share_123'))


if __name__ == '__main__':
    unittest.main()
