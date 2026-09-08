from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.routers.review_support import _review_result_payload
from app.services.ai import AIReviewError, CanonicalScore
from app.services.ai_prompts import SCORE_PROMPT_VERSION, SCORE_VERSION, SCORER_PREPROCESS_VERSION
from app.services.review_score_cache import (
    checkpoint_task_canonical_score,
    load_task_canonical_score_checkpoint,
    review_uses_current_score_contract,
)
from app.services.review_task_processor import _normalize_review_result_payload
from scoring_fixtures import score_evidence_fixture


SCORES = {'composition': 9, 'lighting': 8, 'color': 8, 'impact': 9, 'technical': 8}


def evidence() -> dict:
    # Synthetic evidence verifies persistence only, not photographic quality.
    return score_evidence_fixture(SCORES, audited=True)


def payload() -> dict:
    return {
        'scores': dict(SCORES),
        'final_score': 8.4,
        'score_version': SCORE_VERSION,
        'score_prompt_version': SCORE_PROMPT_VERSION,
        'scorer_model_name': 'gpt-5.6-luna',
        'scorer_model_version': 'test-snapshot',
        'scorer_preprocess_version': SCORER_PREPROCESS_VERSION,
        'score_evidence': evidence(),
    }


def test_score_evidence_survives_storage_and_public_result_serialization():
    original = payload()
    stored = _normalize_review_result_payload(
        original, final_score=8.4, prompt_version='writer-test', model_name='writer',
        model_version='writer-test', exif_info=None,
    )
    public = _review_result_payload(stored, 8.4)
    assert stored['score_evidence'] == original['score_evidence']
    assert public['score_evidence'] == original['score_evidence']
    stored['score_evidence']['dimensions']['composition']['strength'] = 'Changed copy'
    assert original['score_evidence']['dimensions']['composition']['strength'] != 'Changed copy'


def test_historical_result_without_evidence_remains_readable():
    public = _review_result_payload({'scores': dict(SCORES), 'score_version': 'legacy'}, 8.4)
    assert public.get('score_evidence') is None
    assert public['score_version'] == 'legacy'
    assert public['final_score'] == 8.4


@pytest.mark.parametrize('damage', ['missing', 'unaudited', 'missing_dimension', 'missing_reason'])
def test_current_contract_rejects_incomplete_high_score_evidence(damage):
    raw = payload()
    if damage == 'missing':
        raw.pop('score_evidence')
    elif damage == 'unaudited':
        raw['score_evidence']['high_score_audited'] = False
    elif damage == 'missing_dimension':
        raw['score_evidence']['dimensions'].pop('composition')
    else:
        raw['score_evidence']['dimensions']['composition']['high_score_justification'] = ' '
    review = SimpleNamespace(result_json=raw, scorer_model_name='gpt-5.6-luna', final_score=8.4)
    with patch('app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'):
        assert not review_uses_current_score_contract(review)


def test_checkpoint_round_trip_keeps_audit_and_does_not_alias_caller_evidence():
    score = CanonicalScore(
        scores=dict(SCORES), final_score=8.4, model_name='gpt-5.6-luna',
        model_version='test-snapshot', score_prompt_version=SCORE_PROMPT_VERSION,
        score_version=SCORE_VERSION, preprocess_version=SCORER_PREPROCESS_VERSION,
        score_evidence=evidence(), input_tokens=1000, output_tokens=300, latency_ms=1200,
    )
    task = SimpleNamespace(request_payload={})
    expected = deepcopy(score.score_evidence)
    with patch('app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'):
        checkpoint_task_canonical_score(task, score)
        score.score_evidence['dimensions']['composition']['strength'] = 'Changed caller'
        restored = load_task_canonical_score_checkpoint(task)
    assert restored is not None
    assert restored.score_evidence == expected
    assert restored.final_score == 8.4
    assert (restored.input_tokens, restored.output_tokens, restored.latency_ms) == (1000, 300, 1200)


def test_checkpoint_cannot_accept_an_unaudited_high_score():
    raw = evidence()
    raw['high_score_audited'] = False
    score = CanonicalScore(
        scores=dict(SCORES), final_score=8.4, model_name='gpt-5.6-luna',
        model_version='test-snapshot', score_prompt_version=SCORE_PROMPT_VERSION,
        score_version=SCORE_VERSION, preprocess_version=SCORER_PREPROCESS_VERSION,
        score_evidence=raw,
    )
    task = SimpleNamespace(request_payload={})
    with patch('app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'):
        with pytest.raises(AIReviewError):
            checkpoint_task_canonical_score(task, score)
    assert task.request_payload == {}
