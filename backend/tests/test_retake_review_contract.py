from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api.routers.review_support import _public_comparison_payload, _resolve_source_review, _review_result_payload
from app.db.models import ReviewStatus
from app.schemas import ReviewCreateRequest
from app.services.review_task_processor import _normalize_review_result_payload


def _request(*, source_review_id: str | None, analysis_type: str = 'retake_compare') -> ReviewCreateRequest:
    return ReviewCreateRequest(
        photo_id='pho_retake',
        mode='pro',
        source_review_id=source_review_id,
        analysis_type=analysis_type,
        async_mode=True,
        locale='en',
    )


class RetakeReviewContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.actor = SimpleNamespace(user=SimpleNamespace(id=7))
        self.retake_photo = SimpleNamespace(id=22)

    def test_analysis_type_defaults_to_single_for_existing_clients(self) -> None:
        payload = ReviewCreateRequest(photo_id='pho_1', mode='flash')

        self.assertEqual(payload.analysis_type, 'single')
        self.assertEqual(payload.review_model, 'qwen')

    def test_retake_analysis_is_always_pinned_to_luna(self) -> None:
        payload = _request(source_review_id='rev_source')

        self.assertEqual(payload.review_model, 'gpt-5.6-luna')

    def test_luna_can_be_selected_for_normal_review(self) -> None:
        payload = ReviewCreateRequest(
            photo_id='pho_1',
            mode='flash',
            analysis_type='single',
            review_model='gpt-5.6-luna',
        )

        self.assertEqual(payload.review_model, 'gpt-5.6-luna')

    def test_legacy_gpt55_single_request_is_normalized_to_luna(self) -> None:
        payload = ReviewCreateRequest(
            photo_id='pho_1',
            mode='flash',
            analysis_type='single',
            review_model='gpt-5.5',
        )

        self.assertEqual(payload.review_model, 'gpt-5.6-luna')

    def test_legacy_terra_retake_request_is_normalized_to_luna(self) -> None:
        payload = ReviewCreateRequest(
            photo_id='pho_retake',
            mode='pro',
            source_review_id='rev_source',
            analysis_type='retake_compare',
            review_model='gpt-5.6-terra',
            locale='en',
        )

        self.assertEqual(payload.review_model, 'gpt-5.6-luna')

    def test_retake_requires_source_review(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            _resolve_source_review(self.db, self.actor, _request(source_review_id=None), self.retake_photo)

        self.assertEqual(raised.exception.detail['code'], 'RETAKE_SOURCE_REQUIRED')

    def test_retake_rejects_source_review_that_is_not_succeeded(self) -> None:
        source = SimpleNamespace(id=11, photo_id=21, status=ReviewStatus.FAILED)
        with patch('app.api.routers.review_support._find_review_owned', return_value=source) as find_owned:
            with self.assertRaises(HTTPException) as raised:
                _resolve_source_review(self.db, self.actor, _request(source_review_id='rev_source'), self.retake_photo)

        find_owned.assert_called_once_with(self.db, 'rev_source', 7)
        self.assertEqual(raised.exception.detail['code'], 'RETAKE_SOURCE_NOT_READY')

    def test_retake_rejects_the_same_photo(self) -> None:
        source = SimpleNamespace(id=11, photo_id=22, status=ReviewStatus.SUCCEEDED)
        with patch('app.api.routers.review_support._find_review_owned', return_value=source):
            with self.assertRaises(HTTPException) as raised:
                _resolve_source_review(self.db, self.actor, _request(source_review_id='rev_source'), self.retake_photo)

        self.assertEqual(raised.exception.detail['code'], 'RETAKE_PHOTO_DUPLICATE')

    def test_retake_accepts_an_owned_succeeded_source_with_a_different_photo(self) -> None:
        source = SimpleNamespace(id=11, photo_id=21, status=ReviewStatus.SUCCEEDED)
        with patch('app.api.routers.review_support._find_review_owned', return_value=source) as find_owned:
            resolved = _resolve_source_review(
                self.db,
                self.actor,
                _request(source_review_id='rev_source'),
                self.retake_photo,
            )

        self.assertIs(resolved, source)
        find_owned.assert_called_once_with(self.db, 'rev_source', 7)

    def test_single_photo_reanalysis_keeps_legacy_same_photo_rule(self) -> None:
        source = SimpleNamespace(id=11, photo_id=21, status=ReviewStatus.SUCCEEDED)
        with patch('app.api.routers.review_support._find_review_owned', return_value=source):
            with self.assertRaises(HTTPException) as raised:
                _resolve_source_review(
                    self.db,
                    self.actor,
                    _request(source_review_id='rev_source', analysis_type='single'),
                    self.retake_photo,
                )

        self.assertEqual(raised.exception.detail['code'], 'REANALYZE_PHOTO_MISMATCH')

    def test_public_comparison_payload_redacts_openai_response_id_without_mutating_storage(self) -> None:
        stored = {'summary': 'Improved framing', 'openai_response_id': 'resp_secret_audit_id'}

        public = _public_comparison_payload(stored)

        self.assertEqual(public, {'summary': 'Improved framing', 'openai_response_id': ''})
        self.assertEqual(stored['openai_response_id'], 'resp_secret_audit_id')

    def test_async_normalization_persists_comparison_then_api_readback_redacts_internal_id(self) -> None:
        raw = {
            'scores': {'composition': 8, 'lighting': 7, 'color': 7, 'impact': 8, 'technical': 6},
            'comparison': {
                'summary': 'The retake improves subject separation.',
                'openai_response_id': 'resp_internal_audit_id',
            },
        }

        stored = _normalize_review_result_payload(
            raw,
            final_score=7.2,
            prompt_version='retake-coach-v1',
            model_name='gpt-5.6-luna',
            model_version='gpt-5.6-luna',
            exif_info=None,
        )
        public = _review_result_payload(stored, 7.2)

        self.assertEqual(stored['comparison']['openai_response_id'], 'resp_internal_audit_id')
        self.assertEqual(public['comparison']['summary'], 'The retake improves subject separation.')
        self.assertEqual(public['comparison']['openai_response_id'], '')


if __name__ == '__main__':
    unittest.main()
