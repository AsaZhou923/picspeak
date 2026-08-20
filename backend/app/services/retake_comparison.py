from __future__ import annotations

import json
import time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.config import settings
from app.core.http_client import PooledHTTPRequestError, PooledHTTPStatusError, pooled_request
from app.schemas import ReviewResult
from app.services.ai import AIReviewError, AIReviewResponse


RETAKE_PROMPT_VERSION = 'retake-coach-v1'
RETAKE_SCORE_VERSION = 'retake-paired-v1'
DIMENSION_KEYS = ('composition', 'lighting', 'color', 'impact', 'technical')


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class _ModelDimension(_StrictModel):
    before_score: int = Field(ge=0, le=10)
    after_score: int = Field(ge=0, le=10)
    evidence: list[str] = Field(min_length=1, max_length=3)
    remaining_gap: str


class _ModelDimensions(_StrictModel):
    composition: _ModelDimension
    lighting: _ModelDimension
    color: _ModelDimension
    impact: _ModelDimension
    technical: _ModelDimension


class _ModelAction(_StrictModel):
    priority: int = Field(ge=1, le=5)
    dimension: Literal['composition', 'lighting', 'color', 'impact', 'technical']
    action: str
    success_check: str


class _ModelComparison(_StrictModel):
    is_comparable: bool
    comparison_confidence: Literal['low', 'medium', 'high']
    comparison_caveat: str
    summary: str
    dimensions: _ModelDimensions
    strongest_improvement: Literal['composition', 'lighting', 'color', 'impact', 'technical']
    next_actions: list[_ModelAction] = Field(min_length=1, max_length=5)
    visual_reference_prompt: str


def _dimension_schema() -> dict:
    return {
        'type': 'object',
        'additionalProperties': False,
        'properties': {
            'before_score': {'type': 'integer', 'minimum': 0, 'maximum': 10},
            'after_score': {'type': 'integer', 'minimum': 0, 'maximum': 10},
            'evidence': {
                'type': 'array',
                'items': {'type': 'string'},
                'minItems': 1,
                'maxItems': 3,
            },
            'remaining_gap': {'type': 'string'},
        },
        'required': ['before_score', 'after_score', 'evidence', 'remaining_gap'],
    }


RETAKE_RESPONSE_SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {
        'is_comparable': {'type': 'boolean'},
        'comparison_confidence': {'type': 'string', 'enum': ['low', 'medium', 'high']},
        'comparison_caveat': {'type': 'string'},
        'summary': {'type': 'string'},
        'dimensions': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {key: _dimension_schema() for key in DIMENSION_KEYS},
            'required': list(DIMENSION_KEYS),
        },
        'strongest_improvement': {'type': 'string', 'enum': list(DIMENSION_KEYS)},
        'next_actions': {
            'type': 'array',
            'minItems': 1,
            'maxItems': 5,
            'items': {
                'type': 'object',
                'additionalProperties': False,
                'properties': {
                    'priority': {'type': 'integer', 'minimum': 1, 'maximum': 5},
                    'dimension': {'type': 'string', 'enum': list(DIMENSION_KEYS)},
                    'action': {'type': 'string'},
                    'success_check': {'type': 'string'},
                },
                'required': ['priority', 'dimension', 'action', 'success_check'],
            },
        },
        'visual_reference_prompt': {'type': 'string'},
    },
    'required': [
        'is_comparable',
        'comparison_confidence',
        'comparison_caveat',
        'summary',
        'dimensions',
        'strongest_improvement',
        'next_actions',
        'visual_reference_prompt',
    ],
}


def _language_name(locale: str) -> str:
    return {'zh': 'Simplified Chinese', 'ja': 'Japanese', 'en': 'English'}.get(locale, 'English')


def _responses_endpoint() -> str:
    explicit_endpoint = settings.retake_analysis_api_url.strip()
    if explicit_endpoint:
        return explicit_endpoint
    base_url = settings.openai_api_base_url.rstrip('/')
    return base_url if base_url.endswith('/responses') else f'{base_url}/responses'


def _build_prompt(*, locale: str, image_type: str) -> str:
    return (
        'You are PicSpeak Retake Coach, a rigorous photography teacher. Compare Image A (the original) '
        'with Image B (the photographer\'s retake) as a single paired evaluation. '
        f'The declared photography genre is {image_type}. Write every natural-language field in {_language_name(locale)}. '
        'Evaluate composition, lighting, color, impact, and technical quality from 0 to 10. '
        'Score both images within this request so the comparison does not mix scoring systems. '
        'For every dimension, cite specific visible evidence and name the most important remaining gap. '
        'Make actions concrete enough to execute on the next shoot and give each action an observable success check. '
        'The visual_reference_prompt must describe a realistic photographic target for GPT Image without adding labels, '
        'watermarks, or a fake before/after layout. If the images do not appear to show a meaningful retake of the same '
        'subject, scene, or photographic exercise, set is_comparable to false, confidence to low, explain why in the caveat, '
        'and still assess each image honestly without claiming that differences were caused by improvement. '
        'Do not infer camera settings that are not visible or provided.'
    )


def _extract_output_text(body: dict) -> str:
    if body.get('status') == 'incomplete':
        details = body.get('incomplete_details')
        reason = details.get('reason') if isinstance(details, dict) else None
        suffix = f': {reason}' if isinstance(reason, str) and reason.strip() else ''
        raise AIReviewError(f'GPT-5.6 response was incomplete{suffix}')
    for output in body.get('output') or []:
        if not isinstance(output, dict) or output.get('type') != 'message':
            continue
        for content in output.get('content') or []:
            if not isinstance(content, dict):
                continue
            refusal = content.get('refusal')
            if isinstance(refusal, str) and refusal.strip():
                raise AIReviewError(f'GPT-5.6 refused the retake comparison: {refusal[:300]}')
            if content.get('type') == 'output_text' and isinstance(content.get('text'), str):
                return content['text']
    raise AIReviewError('GPT-5.6 response did not contain structured output text')


def _trend(delta: int) -> str:
    if delta > 0:
        return 'improved'
    if delta < 0:
        return 'declined'
    return 'flat'


def _numbered_actions(comparison: _ModelComparison) -> str:
    points: list[str] = []
    dimensions = comparison.dimensions.model_dump()
    for index, action in enumerate(sorted(comparison.next_actions, key=lambda item: item.priority), start=1):
        evidence = dimensions[action.dimension]['evidence'][0]
        reason = dimensions[action.dimension]['remaining_gap'] or action.success_check
        points.append(
            f'{index}. Observation: {evidence} Reason: {reason} '
            f'Action: {action.action} Success check: {action.success_check}'
        )
    return '\n'.join(points)


def _build_result(
    comparison: _ModelComparison,
    *,
    response_id: str,
    model_name: str,
    original_review_id: str,
    original_photo_id: str,
    retake_photo_id: str,
    image_type: str,
) -> ReviewResult:
    raw_dimensions = comparison.dimensions.model_dump()
    dimensions: dict[str, dict] = {}
    after_scores: dict[str, int] = {}
    before_scores: list[int] = []
    after_values: list[int] = []
    for key in DIMENSION_KEYS:
        raw = raw_dimensions[key]
        before_score = int(raw['before_score'])
        after_score = int(raw['after_score'])
        delta = after_score - before_score
        before_scores.append(before_score)
        after_values.append(after_score)
        after_scores[key] = after_score
        dimensions[key] = {
            **raw,
            'delta': delta,
            'trend': _trend(delta),
        }

    overall_before = round(sum(before_scores) / len(before_scores), 1)
    overall_after = round(sum(after_values) / len(after_values), 1)
    overall_delta = round(overall_after - overall_before, 1)
    strongest_improvement = max(
        DIMENSION_KEYS,
        key=lambda key: dimensions[key]['delta'],
    )
    comparison_payload = {
        'original_review_id': original_review_id,
        'original_photo_id': original_photo_id,
        'retake_photo_id': retake_photo_id,
        'is_comparable': comparison.is_comparable,
        'comparison_confidence': comparison.comparison_confidence,
        'comparison_caveat': comparison.comparison_caveat,
        'summary': comparison.summary,
        'dimensions': dimensions,
        'overall_before': overall_before,
        'overall_after': overall_after,
        'overall_delta': overall_delta,
        'strongest_improvement': strongest_improvement,
        'next_actions': [item.model_dump() for item in sorted(comparison.next_actions, key=lambda item: item.priority)],
        'visual_reference_prompt': comparison.visual_reference_prompt,
        'openai_response_id': response_id,
    }
    remaining_gaps = [
        raw_dimensions[key]['remaining_gap']
        for key in DIMENSION_KEYS
        if raw_dimensions[key]['remaining_gap'].strip()
    ]
    return ReviewResult(
        schema_version='2.0',
        prompt_version=RETAKE_PROMPT_VERSION,
        score_version=RETAKE_SCORE_VERSION,
        model_name=model_name,
        model_version=model_name,
        scores=after_scores,
        final_score=overall_after,
        advantage=comparison.summary,
        critique='\n'.join(f'{index}. {gap}' for index, gap in enumerate(remaining_gaps, start=1)),
        suggestions=_numbered_actions(comparison),
        image_type=image_type,
        comparison=comparison_payload,
    )


def run_retake_comparison(
    *,
    original_image_url: str,
    retake_image_url: str,
    original_review_id: str,
    original_photo_id: str,
    retake_photo_id: str,
    locale: str,
    image_type: str,
) -> AIReviewResponse:
    if not settings.openai_api_key:
        raise AIReviewError('OPENAI_API_KEY is not configured for GPT-5.6 retake comparison')

    payload = {
        'model': settings.retake_analysis_model,
        'store': False,
        'reasoning': {'effort': settings.retake_analysis_reasoning_effort},
        'input': [
            {
                'role': 'user',
                'content': [
                    {'type': 'input_text', 'text': _build_prompt(locale=locale, image_type=image_type)},
                    {'type': 'input_text', 'text': 'Image A — Original'},
                    {'type': 'input_image', 'image_url': original_image_url, 'detail': 'high'},
                    {'type': 'input_text', 'text': 'Image B — Retake'},
                    {'type': 'input_image', 'image_url': retake_image_url, 'detail': 'high'},
                ],
            }
        ],
        'text': {
            'format': {
                'type': 'json_schema',
                'name': 'picspeak_retake_comparison',
                'strict': True,
                'schema': RETAKE_RESPONSE_SCHEMA,
            }
        },
    }

    started = time.perf_counter()
    try:
        response = pooled_request(
            'POST',
            _responses_endpoint(),
            body=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
            headers={
                'Authorization': f'Bearer {settings.openai_api_key}',
                'Content-Type': 'application/json',
            },
            timeout_seconds=settings.retake_analysis_timeout_seconds,
        )
        body = json.loads(response.data.decode('utf-8'))
    except PooledHTTPStatusError as exc:
        error_body = exc.response.data.decode('utf-8', errors='ignore')
        raise AIReviewError(f'GPT-5.6 API HTTP {exc.response.status}: {error_body[:300]}') from exc
    except PooledHTTPRequestError as exc:
        raise AIReviewError(f'GPT-5.6 API request failed: {exc}') from exc
    except json.JSONDecodeError as exc:
        raise AIReviewError('GPT-5.6 API returned invalid JSON') from exc

    latency_ms = int((time.perf_counter() - started) * 1000)
    try:
        parsed = json.loads(_extract_output_text(body))
        comparison = _ModelComparison.model_validate(parsed)
    except json.JSONDecodeError as exc:
        raise AIReviewError('GPT-5.6 structured output was not valid JSON') from exc
    except ValidationError as exc:
        raise AIReviewError(f'GPT-5.6 structured output failed validation: {exc}') from exc

    model_name = str(body.get('model') or settings.retake_analysis_model)
    result = _build_result(
        comparison,
        response_id=str(body.get('id') or ''),
        model_name=model_name,
        original_review_id=original_review_id,
        original_photo_id=original_photo_id,
        retake_photo_id=retake_photo_id,
        image_type=image_type,
    )
    usage = body.get('usage') if isinstance(body.get('usage'), dict) else {}
    return AIReviewResponse(
        result=result,
        model_name=model_name,
        model_version=model_name,
        prompt_version=RETAKE_PROMPT_VERSION,
        input_tokens=usage.get('input_tokens'),
        output_tokens=usage.get('output_tokens'),
        cost_usd=None,
        latency_ms=latency_ms,
    )
