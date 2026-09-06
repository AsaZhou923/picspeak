from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Callable

from pydantic import ValidationError

from app.core.config import settings
from app.core.http_client import PooledHTTPRequestError, PooledHTTPStatusError, pooled_request
from app.schemas import ReviewResult
from app.services.ai_prompts import (
    ALLOWED_IMAGE_TYPES,
    PROMPT_VERSION,
    SCORE_PROMPT_VERSION,
    SCORE_VERSION,
    SCORER_PREPROCESS_VERSION,
    _prompt_for_mode_v3,
    _score_prompt,
    _writing_prompt,
)
from app.services.review_pricing import ReviewModelUsage, estimate_review_usage_cost


class AIReviewError(RuntimeError):
    def __init__(self, message: str, *, stage: str | None = None) -> None:
        super().__init__(message)
        self.stage = stage


@dataclass
class AIReviewResponse:
    result: ReviewResult
    model_name: str
    model_version: str
    prompt_version: str
    scorer_model_name: str | None = None
    scorer_model_version: str | None = None
    writer_model_name: str | None = None
    writer_model_version: str | None = None
    score_prompt_version: str | None = None
    scorer_preprocess_version: str | None = None
    score_cache_hit: bool = False
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    cost_rate_version: str | None = None
    latency_ms: int | None = None


@dataclass
class AIJSONResponse:
    parsed: dict
    model_name: str
    usage: dict
    latency_ms: int


@dataclass(frozen=True)
class CanonicalScore:
    scores: dict[str, int]
    final_score: float
    model_name: str
    model_version: str
    score_prompt_version: str
    score_version: str
    preprocess_version: str
    cache_hit: bool = False
    input_tokens: int | None = None
    output_tokens: int | None = None
    latency_ms: int = 0


_OPENAI_SCORE_SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {
        'scores': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                key: {'type': 'integer', 'minimum': 0, 'maximum': 10}
                for key in ('composition', 'lighting', 'color', 'impact', 'technical')
            },
            'required': ['composition', 'lighting', 'color', 'impact', 'technical'],
        }
    },
    'required': ['scores'],
}

_OPENAI_WRITING_SCHEMA = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {
        'advantage': {'type': 'string'},
        'critique': {'type': 'string'},
        'suggestions': {'type': 'string'},
    },
    'required': ['advantage', 'critique', 'suggestions'],
}


def model_name_for_mode(mode: str) -> str:
    normalized = (mode or '').strip().lower()
    candidates: list[str] = []

    if normalized == 'pro' and settings.pro_model_name.strip():
        candidates.append(settings.pro_model_name.strip())
    elif normalized == 'flash' and settings.flash_model_name.strip():
        candidates.append(settings.flash_model_name.strip())

    if settings.ai_model_name.strip():
        candidates.append(settings.ai_model_name.strip())
    if settings.flash_model_name.strip():
        candidates.append(settings.flash_model_name.strip())
    if settings.pro_model_name.strip():
        candidates.append(settings.pro_model_name.strip())

    if candidates:
        return candidates[0]

    raise AIReviewError(
        'No AI model is configured. Set AI_MODEL_NAME, FLASH_MODEL_NAME, '
        'or PRO_MODEL_NAME.'
    )


def model_version_for_name(model_name: str) -> str:
    return (model_name or '').strip()


def _compute_final_score(scores: dict[str, int]) -> float:
    if not scores:
        raise AIReviewError('scores cannot be empty')
    values: list[int] = []
    if 'impact' not in scores and 'story' in scores:
        scores = dict(scores)
        scores['impact'] = scores['story']
    for key in ('composition', 'lighting', 'color', 'impact', 'technical'):
        if key not in scores:
            raise AIReviewError(f'Missing score field: {key}')
        value = scores[key]
        if not isinstance(value, int):
            raise AIReviewError(f'Score for {key} must be int')
        if value < 0 or value > 10:
            raise AIReviewError(f'Score for {key} out of range')
        values.append(value)
    return round(sum(values) / len(values), 1)


def _normalize_locked_scores(raw_scores: dict) -> dict[str, int]:
    scores = dict(raw_scores)
    if 'impact' not in scores and 'story' in scores:
        scores['impact'] = scores['story']
    locked_scores: dict[str, int] = {}
    for key in ('composition', 'lighting', 'color', 'impact', 'technical'):
        value = scores[key]
        if type(value) is not int:
            raise AIReviewError(f'Score for {key} must be an exact int')
        locked_scores[key] = value
    return locked_scores


def build_cached_canonical_score(
    raw_scores: dict,
    *,
    scorer_model_name: str,
    scorer_model_version: str,
    final_score: float | None = None,
) -> CanonicalScore:
    locked_scores = _normalize_locked_scores(raw_scores)
    computed_final_score = _compute_final_score(locked_scores)
    if final_score is not None and float(final_score) != computed_final_score:
        raise AIReviewError('Cached score final_score does not match its dimensions')
    canonical_score = CanonicalScore(
        scores=locked_scores,
        final_score=computed_final_score,
        model_name=scorer_model_name,
        model_version=scorer_model_version,
        score_prompt_version=SCORE_PROMPT_VERSION,
        score_version=SCORE_VERSION,
        preprocess_version=SCORER_PREPROCESS_VERSION,
        cache_hit=True,
    )
    _validate_canonical_score_contract(canonical_score)
    return canonical_score


def _validate_canonical_score_contract(canonical_score: CanonicalScore) -> None:
    if canonical_score.model_name != settings.openai_score_model:
        raise AIReviewError('Canonical score uses a different scorer model')
    if canonical_score.score_prompt_version != SCORE_PROMPT_VERSION:
        raise AIReviewError('Canonical score uses a different scoring prompt version')
    if canonical_score.score_version != SCORE_VERSION:
        raise AIReviewError('Canonical score uses a different score version')
    if canonical_score.preprocess_version != SCORER_PREPROCESS_VERSION:
        raise AIReviewError('Canonical score uses a different scorer preprocessing version')
    expected_final_score = _compute_final_score(canonical_score.scores)
    if canonical_score.final_score != expected_final_score:
        raise AIReviewError('Canonical score final_score does not match its dimensions')


def _extract_json_object(content: str) -> dict:
    content = content.strip()
    if not content:
        raise AIReviewError('Empty model response')

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    match = re.search(r'\{.*\}', content, flags=re.DOTALL)
    if not match:
        raise AIReviewError('Model response is not valid JSON')

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise AIReviewError('Model response JSON parse failed') from exc


def _extract_content(message_content: object) -> str:
    if isinstance(message_content, str):
        return message_content
    if isinstance(message_content, list):
        texts: list[str] = []
        for item in message_content:
            if isinstance(item, dict) and item.get('type') == 'text':
                text = item.get('text')
                if isinstance(text, str):
                    texts.append(text)
        return '\n'.join(texts)
    raise AIReviewError('Unsupported message content format')


def _normalize_numbered_text_field(value: object) -> object:
    if isinstance(value, str):
        return value.strip()
    if not isinstance(value, list):
        return value

    points: list[str] = []
    for item in value:
        if item is None:
            continue
        text = str(item).strip()
        if not text:
            continue
        if re.match(r'^\d+\.\s+', text):
            points.append(text)
            continue
        points.append(f'{len(points) + 1}. {text}')
    return '\n'.join(points)


def _split_numbered_text_field(value: str) -> list[str]:
    text = value.strip()
    if not text:
        return []
    matches = re.findall(r'^\s*\d+\.\s.*?(?=^\s*\d+\.\s|\Z)', text, flags=re.MULTILINE | re.DOTALL)
    if matches:
        return [match.strip() for match in matches if match.strip()]
    return [text]


def _has_structured_label(text: str, labels: tuple[str, ...]) -> bool:
    return any(
        re.search(
            rf'(?:^|\d+\.\s*|[\uFF1B;\uFF0C,\u3002.\n]\s*){re.escape(label)}[\uFF1A:]',
            text,
            flags=re.IGNORECASE,
        )
        for label in labels
    )


def _validate_suggestions_structure(value: object) -> None:
    if not isinstance(value, str):
        raise ValueError('suggestions must be a string')

    points = _split_numbered_text_field(value)
    if not points:
        return

    observation_labels = ('\u89c2\u5bdf', '\u89c0\u5bdf', 'Observation', '\u89b3\u5bdf')
    reason_labels = ('\u539f\u56e0', 'Reason', '\u7406\u7531')
    action_labels = (
        '\u53ef\u6267\u884c\u52a8\u4f5c',
        '\u53ef\u57f7\u884c\u52d5\u4f5c',
        '\u5904\u7406\u65b9\u6cd5',
        '\u884c\u52d5',
        '\u884c\u52a8',
        '\u52a8\u4f5c',
        '\u5efa\u8bae',
        'Action',
        '\u5b9f\u884c\u30a2\u30af\u30b7\u30e7\u30f3',
        '\u63d0\u6848',
    )

    for index, point in enumerate(points, start=1):
        if not _has_structured_label(point, observation_labels):
            raise ValueError(f'suggestions point {index} must include Observation label')
        if not _has_structured_label(point, reason_labels):
            raise ValueError(f'suggestions point {index} must include Reason label')
        if not _has_structured_label(point, action_labels):
            raise ValueError(f'suggestions point {index} must include Action label')


def _normalize_review_result_fields(parsed: dict, *, image_type: str, enforce_suggestion_structure: bool = True) -> dict:
    normalized = dict(parsed)
    for field_name in ('advantage', 'critique', 'suggestions'):
        normalized[field_name] = _normalize_numbered_text_field(normalized.get(field_name, ''))
        if not isinstance(normalized[field_name], str) or not normalized[field_name].strip():
            raise ValueError(f'{field_name} must be a non-empty string')
    if enforce_suggestion_structure:
        _validate_suggestions_structure(normalized.get('suggestions', ''))
    normalized['image_type'] = image_type if image_type in ALLOWED_IMAGE_TYPES else 'default'
    return normalized


def _format_validation_error(exc: ValidationError) -> str:
    first_error = exc.errors()[0] if exc.errors() else None
    if not first_error:
        return str(exc)
    location = '.'.join(str(part) for part in first_error.get('loc', ())) or 'unknown'
    message = str(first_error.get('msg') or 'validation error')
    return f'{location}: {message}'


def _request_multimodal_json(*, model_name: str, prompt: str, image_url: str, temperature: float) -> AIJSONResponse:
    endpoint = settings.ai_api_base_url.rstrip('/') + '/chat/completions'
    payload = {
        'model': model_name,
        'temperature': temperature,
        'response_format': {'type': 'json_object'},
        'messages': [
            {
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': prompt},
                    {'type': 'image_url', 'image_url': {'url': image_url}},
                ],
            },
        ],
    }

    start = time.perf_counter()
    try:
        response = pooled_request(
            'POST',
            endpoint,
            body=json.dumps(payload).encode('utf-8'),
            headers={
                'Authorization': f'Bearer {settings.ai_api_key}',
                'Content-Type': 'application/json',
            },
            timeout_seconds=settings.ai_timeout_seconds,
        )
        body = json.loads(response.data.decode('utf-8'))
    except PooledHTTPStatusError as exc:
        err_body = exc.response.data.decode('utf-8', errors='ignore')
        raise AIReviewError(f'AI provider HTTP {exc.response.status}: {err_body[:300]}') from exc
    except PooledHTTPRequestError as exc:
        raise AIReviewError(f'AI provider request failed: {exc}') from exc
    except json.JSONDecodeError as exc:
        raise AIReviewError('AI provider returned invalid JSON') from exc

    latency_ms = int((time.perf_counter() - start) * 1000)
    try:
        choice = body['choices'][0]
        message = choice['message']
        content = _extract_content(message.get('content'))
        parsed = _extract_json_object(content)
    except (KeyError, IndexError, TypeError) as exc:
        raise AIReviewError('Invalid AI provider response envelope') from exc

    return AIJSONResponse(
        parsed=parsed,
        model_name=str(body.get('model') or model_name),
        usage=body.get('usage') or {},
        latency_ms=latency_ms,
    )


def _openai_responses_endpoint() -> str:
    base_url = settings.openai_api_base_url.rstrip('/')
    return base_url if base_url.endswith('/responses') else f'{base_url}/responses'


def _extract_openai_output_text(body: dict) -> str:
    if body.get('status') == 'incomplete':
        details = body.get('incomplete_details')
        reason = details.get('reason') if isinstance(details, dict) else None
        suffix = f': {reason}' if isinstance(reason, str) and reason.strip() else ''
        raise AIReviewError(f'OpenAI review response was incomplete{suffix}')

    for output in body.get('output') or []:
        if not isinstance(output, dict) or output.get('type') != 'message':
            continue
        for content in output.get('content') or []:
            if not isinstance(content, dict):
                continue
            refusal = content.get('refusal')
            if isinstance(refusal, str) and refusal.strip():
                raise AIReviewError(f'OpenAI review was refused: {refusal[:300]}')
            if content.get('type') == 'output_text' and isinstance(content.get('text'), str):
                return content['text']
    raise AIReviewError('OpenAI review response did not contain structured output text')


def _request_openai_multimodal_json(
    *,
    prompt: str,
    image_url: str,
    schema_name: str,
    schema: dict,
    model_name: str | None = None,
    reasoning_effort: str | None = None,
    timeout_seconds: int | None = None,
) -> AIJSONResponse:
    resolved_model_name = model_name or settings.openai_review_model
    payload = {
        'model': resolved_model_name,
        'store': False,
        'reasoning': {'effort': reasoning_effort or settings.openai_review_reasoning_effort},
        'input': [
            {
                'role': 'user',
                'content': [
                    {'type': 'input_text', 'text': prompt},
                    {'type': 'input_image', 'image_url': image_url, 'detail': 'high'},
                ],
            }
        ],
        'text': {
            'format': {
                'type': 'json_schema',
                'name': schema_name,
                'strict': True,
                'schema': schema,
            }
        },
    }

    started = time.perf_counter()
    try:
        response = pooled_request(
            'POST',
            _openai_responses_endpoint(),
            body=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
            headers={
                'Authorization': f'Bearer {settings.openai_api_key}',
                'Content-Type': 'application/json',
            },
            timeout_seconds=timeout_seconds or settings.openai_review_timeout_seconds,
        )
        body = json.loads(response.data.decode('utf-8'))
    except PooledHTTPStatusError as exc:
        error_body = exc.response.data.decode('utf-8', errors='ignore')
        raise AIReviewError(f'OpenAI review API HTTP {exc.response.status}: {error_body[:300]}') from exc
    except PooledHTTPRequestError as exc:
        raise AIReviewError(f'OpenAI review API request failed: {exc}') from exc
    except json.JSONDecodeError as exc:
        raise AIReviewError('OpenAI review API returned invalid JSON') from exc

    try:
        parsed = json.loads(_extract_openai_output_text(body))
    except json.JSONDecodeError as exc:
        raise AIReviewError('OpenAI review structured output was not valid JSON') from exc

    return AIJSONResponse(
        parsed=parsed,
        model_name=str(body.get('model') or resolved_model_name),
        usage=body.get('usage') if isinstance(body.get('usage'), dict) else {},
        latency_ms=int((time.perf_counter() - started) * 1000),
    )


def _run_canonical_scoring(
    *,
    image_url: str,
    exif_data: dict | None,
    image_type: str,
) -> CanonicalScore:
    if not settings.openai_api_key:
        raise AIReviewError('OPENAI_API_KEY is not configured for the canonical GPT scorer')
    if not settings.openai_score_model:
        raise AIReviewError('OPENAI_SCORE_MODEL is not configured')

    try:
        scoring_response = _request_openai_multimodal_json(
            prompt=_score_prompt(exif_data, image_type=image_type),
            image_url=image_url,
            schema_name='picspeak_photo_scores',
            schema=_OPENAI_SCORE_SCHEMA,
            model_name=settings.openai_score_model,
            reasoning_effort=settings.openai_score_reasoning_effort,
            timeout_seconds=settings.openai_score_timeout_seconds,
        )
    except AIReviewError as exc:
        raise AIReviewError(str(exc), stage='scoring') from exc
    try:
        raw_scores = scoring_response.parsed.get('scores')
        if not isinstance(raw_scores, dict):
            raise AIReviewError('Canonical scorer response missing scores object', stage='scoring')
        locked_scores = _normalize_locked_scores(raw_scores)
    except AIReviewError as exc:
        if exc.stage:
            raise
        raise AIReviewError(str(exc), stage='scoring') from exc
    except (KeyError, TypeError, ValueError) as exc:
        raise AIReviewError(f'Invalid canonical scorer response structure: {exc}', stage='scoring') from exc

    canonical_score = CanonicalScore(
        scores=locked_scores,
        final_score=_compute_final_score(locked_scores),
        model_name=settings.openai_score_model,
        model_version=scoring_response.model_name,
        score_prompt_version=SCORE_PROMPT_VERSION,
        score_version=SCORE_VERSION,
        preprocess_version=SCORER_PREPROCESS_VERSION,
        input_tokens=scoring_response.usage.get('input_tokens'),
        output_tokens=scoring_response.usage.get('output_tokens'),
        latency_ms=scoring_response.latency_ms,
    )
    _validate_canonical_score_contract(canonical_score)
    return canonical_score


def _score_usage(canonical_score: CanonicalScore) -> list[ReviewModelUsage]:
    if canonical_score.cache_hit:
        return []
    return [
        ReviewModelUsage(
            model_name=canonical_score.model_name,
            input_tokens=canonical_score.input_tokens,
            output_tokens=canonical_score.output_tokens,
        )
    ]


def _run_openai_review(
    *,
    mode: str,
    image_url: str,
    locale: str,
    exif_data: dict | None,
    image_type: str,
    enforce_suggestion_structure: bool,
    canonical_score: CanonicalScore | None,
    on_canonical_score: Callable[[CanonicalScore], None] | None,
) -> AIReviewResponse:
    if not settings.openai_api_key:
        raise AIReviewError('OPENAI_API_KEY is not configured for GPT-5.6 photo review')
    if not settings.openai_review_model:
        raise AIReviewError('OPENAI_REVIEW_MODEL is not configured')

    resolved_score = canonical_score
    if resolved_score is None:
        resolved_score = _run_canonical_scoring(
            image_url=image_url,
            exif_data=exif_data,
            image_type=image_type,
        )
        if on_canonical_score is not None:
            on_canonical_score(resolved_score)
    _validate_canonical_score_contract(resolved_score)
    locked_scores = resolved_score.scores
    final_score = resolved_score.final_score
    try:
        writing_response = _request_openai_multimodal_json(
            prompt=_writing_prompt(mode, locale, locked_scores, exif_data, image_type=image_type),
            image_url=image_url,
            schema_name='picspeak_photo_review',
            schema=_OPENAI_WRITING_SCHEMA,
            model_name=settings.openai_review_model,
            reasoning_effort=settings.openai_review_reasoning_effort,
            timeout_seconds=settings.openai_review_timeout_seconds,
        )
    except AIReviewError as exc:
        raise AIReviewError(str(exc), stage='writing') from exc
    try:
        parsed = _normalize_review_result_fields(
            writing_response.parsed,
            image_type=image_type,
            enforce_suggestion_structure=enforce_suggestion_structure,
        )
        parsed['score_version'] = SCORE_VERSION
        parsed['score_prompt_version'] = SCORE_PROMPT_VERSION
        parsed['scorer_model_name'] = resolved_score.model_name
        parsed['scorer_model_version'] = resolved_score.model_version
        parsed['writer_model_name'] = settings.openai_review_model
        parsed['writer_model_version'] = model_version_for_name(writing_response.model_name)
        parsed['scorer_preprocess_version'] = resolved_score.preprocess_version
        parsed['score_cache_hit'] = resolved_score.cache_hit
        parsed['scores'] = locked_scores
        parsed['final_score'] = final_score
        result = ReviewResult.model_validate(parsed)
    except ValidationError as exc:
        raise AIReviewError(
            f'Invalid OpenAI review structure: {_format_validation_error(exc)}',
            stage='writing',
        ) from exc
    except ValueError as exc:
        raise AIReviewError(f'Invalid OpenAI review structure: {exc}', stage='writing') from exc

    input_tokens = (resolved_score.input_tokens or 0) + (writing_response.usage.get('input_tokens') or 0)
    output_tokens = (resolved_score.output_tokens or 0) + (writing_response.usage.get('output_tokens') or 0)
    cost = estimate_review_usage_cost(
        _score_usage(resolved_score)
        + [
            ReviewModelUsage(
                model_name=settings.openai_review_model,
                input_tokens=writing_response.usage.get('input_tokens'),
                output_tokens=writing_response.usage.get('output_tokens'),
            ),
        ],
        overrides=settings.review_pricing_overrides,
    )

    return AIReviewResponse(
        result=result,
        model_name=writing_response.model_name,
        model_version=model_version_for_name(writing_response.model_name),
        prompt_version=PROMPT_VERSION,
        scorer_model_name=resolved_score.model_name,
        scorer_model_version=resolved_score.model_version,
        writer_model_name=settings.openai_review_model,
        writer_model_version=model_version_for_name(writing_response.model_name),
        score_prompt_version=resolved_score.score_prompt_version,
        scorer_preprocess_version=resolved_score.preprocess_version,
        score_cache_hit=resolved_score.cache_hit,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=float(cost.cost_usd) if cost.cost_usd is not None else None,
        cost_rate_version=cost.rate_version,
        latency_ms=resolved_score.latency_ms + writing_response.latency_ms,
    )


def run_ai_review(
    mode: str,
    image_url: str,
    locale: str = 'zh',
    exif_data: dict | None = None,
    image_type: str = 'default',
    enforce_suggestion_structure: bool = True,
    review_model: str = 'qwen',
    canonical_score: CanonicalScore | None = None,
    on_canonical_score: Callable[[CanonicalScore], None] | None = None,
) -> AIReviewResponse:
    if review_model in {'gpt-5.5', 'gpt-5.6-luna'}:
        return _run_openai_review(
            mode=mode,
            image_url=image_url,
            locale=locale,
            exif_data=exif_data,
            image_type=image_type,
            enforce_suggestion_structure=enforce_suggestion_structure,
            canonical_score=canonical_score,
            on_canonical_score=on_canonical_score,
        )
    if review_model != 'qwen':
        raise AIReviewError(f'Unsupported review model option: {review_model}')
    if not settings.ai_api_key:
        raise AIReviewError('AI_API_KEY is not configured')

    writing_model_name = model_name_for_mode(mode)
    resolved_score = canonical_score
    if resolved_score is None:
        resolved_score = _run_canonical_scoring(
            image_url=image_url,
            exif_data=exif_data,
            image_type=image_type,
        )
        if on_canonical_score is not None:
            on_canonical_score(resolved_score)
    _validate_canonical_score_contract(resolved_score)
    locked_scores = resolved_score.scores
    final_score = resolved_score.final_score
    try:
        writing_response = _request_multimodal_json(
            model_name=writing_model_name,
            prompt=_writing_prompt(mode, locale, locked_scores, exif_data, image_type=image_type),
            image_url=image_url,
            temperature=0.2,
        )
    except AIReviewError as exc:
        raise AIReviewError(str(exc), stage='writing') from exc

    try:
        parsed = _normalize_review_result_fields(
            writing_response.parsed,
            image_type=image_type,
            enforce_suggestion_structure=enforce_suggestion_structure,
        )
        parsed['score_version'] = SCORE_VERSION
        parsed['score_prompt_version'] = SCORE_PROMPT_VERSION
        parsed['scorer_model_name'] = resolved_score.model_name
        parsed['scorer_model_version'] = resolved_score.model_version
        parsed['writer_model_name'] = writing_model_name
        parsed['writer_model_version'] = model_version_for_name(writing_response.model_name)
        parsed['scorer_preprocess_version'] = resolved_score.preprocess_version
        parsed['score_cache_hit'] = resolved_score.cache_hit
        parsed['scores'] = locked_scores
        parsed['final_score'] = final_score
        result = ReviewResult.model_validate(parsed)
    except ValidationError as exc:
        raise AIReviewError(
            f'Invalid AI provider response structure: {_format_validation_error(exc)}',
            stage='writing',
        ) from exc
    except ValueError as exc:
        raise AIReviewError(f'Invalid AI provider response structure: {exc}', stage='writing') from exc

    writing_usage = writing_response.usage
    input_tokens = (resolved_score.input_tokens or 0) + (writing_usage.get('prompt_tokens') or 0)
    output_tokens = (resolved_score.output_tokens or 0) + (writing_usage.get('completion_tokens') or 0)
    cost = estimate_review_usage_cost(
        _score_usage(resolved_score)
        + [
            ReviewModelUsage(
                model_name=writing_model_name,
                input_tokens=writing_usage.get('prompt_tokens'),
                output_tokens=writing_usage.get('completion_tokens'),
            ),
        ],
        overrides=settings.review_pricing_overrides,
    )

    return AIReviewResponse(
        result=result,
        model_name=writing_response.model_name,
        model_version=model_version_for_name(writing_response.model_name),
        prompt_version=PROMPT_VERSION,
        scorer_model_name=resolved_score.model_name,
        scorer_model_version=resolved_score.model_version,
        writer_model_name=writing_model_name,
        writer_model_version=model_version_for_name(writing_response.model_name),
        score_prompt_version=resolved_score.score_prompt_version,
        scorer_preprocess_version=resolved_score.preprocess_version,
        score_cache_hit=resolved_score.cache_hit,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=float(cost.cost_usd) if cost.cost_usd is not None else None,
        cost_rate_version=cost.rate_version,
        latency_ms=resolved_score.latency_ms + writing_response.latency_ms,
    )
