from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.ai import (
    AIJSONResponse,
    AIReviewError,
    _normalize_review_result_fields,
    _validate_suggestions_structure,
    build_cached_canonical_score,
    run_ai_review,
)
from app.db.models import Review, ReviewTask
from app.services.ai_prompts import SCORE_PROMPT_VERSION, SCORE_VERSION, SCORER_PREPROCESS_VERSION
from app.services.ai_prompts import _writing_prompt
from app.services.review_score_cache import (
    checkpoint_task_canonical_score,
    load_task_canonical_score_checkpoint,
    review_uses_current_score_contract,
)


VALID_TEXT = {
    'advantage': '1. The silhouette separates clearly from the bright water.',
    'critique': '1. No material defect is evident at this viewing size.',
    'suggestions': '1. Observation: The gesture is readable; Reason: Separation carries the image; Action: Keep the silhouette exposure.',
}
SCORES = {'composition': 9, 'lighting': 8, 'color': 8, 'impact': 9, 'technical': 6}


@pytest.mark.parametrize('suggestion', [
    '1. 観察：手すりと腕が重なる。理由：輪郭が読み取りにくい。行動：腕が離れる瞬間を待つ。',
    '1. 观察：扶手与手臂重叠。原因：轮廓难以辨认。可执行动作：等待手臂错开的瞬间。',
    '1. Observation: The arm overlaps a railing. Reason: The contours merge. Action: Wait for the gesture to separate.',
])
def test_suggestion_labels_accept_natural_sentence_boundaries(suggestion):
    _validate_suggestions_structure(suggestion)


def test_writer_must_resolve_conflicting_advice_and_explain_visual_effects():
    prompt = _writing_prompt('flash', 'zh', SCORES)
    assert 'shared visible observations' in prompt
    assert 'same issue as critique' in prompt
    assert 'preserve the defining strength' in prompt
    assert 'EXIF is metadata for fact checking only' in prompt
    assert 'instead of inventing a defect to match the score' in prompt
    assert 'visual stopping point' in prompt


@pytest.mark.parametrize('field', VALID_TEXT)
@pytest.mark.parametrize('value', ['', ' \n\t', [], None])
@pytest.mark.parametrize('enforce', [True, False])
def test_empty_prose_cannot_be_accepted_as_a_successful_review(field, value, enforce):
    with pytest.raises(ValueError, match=field):
        _normalize_review_result_fields(
            {**VALID_TEXT, field: value}, image_type='default', enforce_suggestion_structure=enforce,
        )


@pytest.mark.parametrize('provider', ['qwen', 'gpt-5.6-luna'])
def test_empty_writer_result_is_a_writing_failure_and_does_not_rescore(provider):
    with patch('app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'), patch(
        'app.services.ai.settings.openai_review_model', 'gpt-5.6-luna'
    ), patch('app.services.ai.settings.openai_api_key', 'test'), patch(
        'app.services.ai.settings.ai_api_key', 'test'
    ), patch('app.services.ai.model_name_for_mode', return_value='qwen-test'):
        score = build_cached_canonical_score(SCORES, scorer_model_name='gpt-5.6-luna', scorer_model_version='test-snapshot')
        response = AIJSONResponse(parsed={key: '' for key in VALID_TEXT}, usage={}, model_name='test', latency_ms=1)
        with patch('app.services.ai._run_canonical_scoring') as scorer, patch(
            'app.services.ai._request_openai_multimodal_json', return_value=response
        ), patch('app.services.ai._request_multimodal_json', return_value=response):
            with pytest.raises(AIReviewError) as error:
                run_ai_review(image_url='https://example.com/photo.jpg', mode='flash', locale='en', review_model=provider, canonical_score=score)
            assert error.value.stage == 'writing'
            scorer.assert_not_called()
            assert score.scores == SCORES
            assert score.final_score == 8.0


def test_old_rubric_cannot_reuse_scores_or_retry_checkpoint():
    with patch('app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'):
        score = build_cached_canonical_score(SCORES, scorer_model_name='gpt-5.6-luna', scorer_model_version='test-snapshot')
        task = ReviewTask(request_payload={})
        checkpoint_task_canonical_score(task, score)
        assert load_task_canonical_score_checkpoint(task) is not None
        review = Review(scorer_model_name='gpt-5.6-luna', result_json={
            'score_version': SCORE_VERSION, 'score_prompt_version': SCORE_PROMPT_VERSION,
            'scorer_model_version': 'test-snapshot', 'scorer_preprocess_version': SCORER_PREPROCESS_VERSION,
        })
        assert review_uses_current_score_contract(review)
        for key, old in [('score_version', 'score-v3-canonical-gpt'), ('score_prompt_version', 'photo-score-v3-canonical-gpt')]:
            current = review.result_json[key]
            review.result_json[key] = old
            assert not review_uses_current_score_contract(review)
            review.result_json[key] = current
            checkpoint_task_canonical_score(task, score)
            task.request_payload['_canonical_score_checkpoint'][key] = old
            assert load_task_canonical_score_checkpoint(task) is None
