from __future__ import annotations

from io import BytesIO
from typing import Any, Callable

from PIL import Image, ImageDraw

from app.core.config import settings
from app.schemas import ReviewResult
from app.services.ai import (
    AIReviewResponse,
    CanonicalScore,
    DIMENSION_KEYS,
    model_version_for_name,
    openai_review_profile_for_mode,
)
from app.services.ai_prompts import (
    PROMPT_VERSION,
    SCORE_PROMPT_VERSION,
    SCORE_VERSION,
    SCORER_PREPROCESS_VERSION,
)
from app.services.image_generation import ImageGenerationResult


_FORBIDDEN_ENVIRONMENTS = frozenset({'production', 'prod'})

E2E_FAKE_SCORES: dict[str, int] = {
    'composition': 8,
    'lighting': 8,
    'color': 8,
    'impact': 7,
    'technical': 8,
}
E2E_FAKE_FINAL_SCORE: float = 7.8


def assert_e2e_fake_ai_allowed() -> None:
    """Refuse to run E2E fakes in production or when explicitly disabled."""
    normalized_env = str(getattr(settings, 'app_env', '') or '').strip().lower()
    if normalized_env in _FORBIDDEN_ENVIRONMENTS:
        raise RuntimeError('E2E fake AI clients cannot be used when APP_ENV=production')
    if not bool(getattr(settings, 'e2e_fake_ai_enabled', False)):
        raise RuntimeError('E2E fake AI clients require E2E_FAKE_AI_ENABLED=true')


def fake_score_evidence() -> dict[str, Any]:
    return {
        'dimensions': {
            key: {
                'strength': f'Clear, balanced {key} visible across the main subject and background.',
                'limitation': f'Minor refinement in {key} could add extra depth on a retake.',
                'high_score_justification': (
                    f'Strong deliberate control of {key} without distracting flaws.'
                    if E2E_FAKE_SCORES[key] >= 8
                    else ''
                ),
            }
            for key in DIMENSION_KEYS
        },
        'overall_justification': (
            'Well-controlled exposure, balanced framing, and clean color separation support a 7.8 score.'
        ),
    }


def fake_canonical_score(*, mode: str, image_type: str = 'default') -> CanonicalScore:
    assert_e2e_fake_ai_allowed()
    profile = openai_review_profile_for_mode(mode)
    return CanonicalScore(
        scores=dict(E2E_FAKE_SCORES),
        score_evidence=fake_score_evidence(),
        final_score=E2E_FAKE_FINAL_SCORE,
        model_name=profile.scorer_model_name,
        model_version=model_version_for_name(profile.scorer_model_name),
        score_prompt_version=SCORE_PROMPT_VERSION,
        score_version=SCORE_VERSION,
        preprocess_version=SCORER_PREPROCESS_VERSION,
        scorer_reasoning_effort=profile.scorer_reasoning_effort,
        cache_hit=False,
        input_tokens=120,
        output_tokens=80,
        latency_ms=15,
    )


def fake_run_ai_review(
    mode: str,
    image_url: str,
    locale: str = 'en',
    exif_data: dict | None = None,
    image_type: str = 'default',
    enforce_suggestion_structure: bool = True,
    review_model: str = 'gpt-6-sol',
    canonical_score: CanonicalScore | None = None,
    on_canonical_score: Callable[[CanonicalScore], None] | None = None,
) -> AIReviewResponse:
    assert_e2e_fake_ai_allowed()
    del image_url, exif_data, enforce_suggestion_structure, review_model

    profile = openai_review_profile_for_mode(mode)
    resolved_score = canonical_score
    if resolved_score is None:
        resolved_score = fake_canonical_score(mode=mode, image_type=image_type)
        if on_canonical_score is not None:
            on_canonical_score(resolved_score)

    if locale == 'zh':
        advantage = '主体位置清晰，光线方向自然，画面色彩过渡干净且曝光控制稳健。'
        critique = '前景层次还可以再拉开一点，边缘轻微分散注意力的元素值得在下一次拍摄时避开。'
        suggestions = (
            '1. 构图：向左移动半步，给主体视线方向留出更多呼吸空间。\n'
            '2. 光线：在日落前二十分钟利用侧逆光拉出更清晰的主体轮廓。\n'
            '3. 后期：轻微压低高光并微调色温，强化冷暖层次对比。'
        )
    elif locale == 'ja':
        advantage = '主題の配置が明確で、光の方向と露出バランスが安定しており、色のまとまりも良好です。'
        critique = '前景の奥行きがやや浅く、画面端の要素が少し視線を散らしています。'
        suggestions = (
            '1. 構図：半歩左へ移動し、主題の視線方向に余白を確保してください。\n'
            '2. 光：夕方の斜光を使い、輪郭の立体感を強めてみてください。\n'
            '3. 仕上げ：ハイライトを少し抑え、色温度の対比を整えると引き締まります。'
        )
    else:
        advantage = (
            'Clean subject placement and steady directional light give the frame strong clarity, '
            'balanced exposure, and cohesive color separation.'
        )
        critique = (
            'Foreground depth is slightly flat, and a small edge element pulls attention away from '
            'the primary subject.'
        )
        suggestions = (
            '1. Framing: Step half a pace left to give the subject cleaner breathing room.\n'
            '2. Light: Re-shoot during lower side light to deepen shadow separation and texture.\n'
            '3. Finishing: Pull highlights slightly and keep midtone contrast crisp without oversaturating.'
        )

    writer_model_name = profile.writer_model_name
    writer_model_version = model_version_for_name(writer_model_name)
    result = ReviewResult.model_validate(
        {
            'schema_version': '1.0',
            'prompt_version': PROMPT_VERSION,
            'score_version': SCORE_VERSION,
            'score_prompt_version': SCORE_PROMPT_VERSION,
            'model_name': writer_model_name,
            'model_version': writer_model_version,
            'scorer_model_name': resolved_score.model_name,
            'scorer_model_version': resolved_score.model_version,
            'scorer_reasoning_effort': resolved_score.scorer_reasoning_effort,
            'writer_model_name': writer_model_name,
            'writer_model_version': writer_model_version,
            'writer_reasoning_effort': profile.writer_reasoning_effort,
            'scorer_preprocess_version': resolved_score.preprocess_version,
            'score_cache_hit': resolved_score.cache_hit,
            'scores': dict(resolved_score.scores),
            'score_evidence': resolved_score.score_evidence,
            'final_score': resolved_score.final_score,
            'advantage': advantage,
            'critique': critique,
            'suggestions': suggestions,
            'image_type': image_type or 'default',
        }
    )

    return AIReviewResponse(
        result=result,
        model_name=writer_model_name,
        model_version=writer_model_version,
        prompt_version=PROMPT_VERSION,
        scorer_model_name=resolved_score.model_name,
        scorer_model_version=resolved_score.model_version,
        writer_model_name=writer_model_name,
        writer_model_version=writer_model_version,
        score_prompt_version=resolved_score.score_prompt_version,
        scorer_preprocess_version=resolved_score.preprocess_version,
        score_cache_hit=resolved_score.cache_hit,
        input_tokens=(resolved_score.input_tokens or 0) + 150,
        output_tokens=(resolved_score.output_tokens or 0) + 110,
        cost_usd=0.0,
        cost_rate_version='e2e-fake',
        writer_input_tokens=150,
        writer_output_tokens=110,
        writer_cost_usd=0.0,
        writer_cost_rate_version='e2e-fake',
        latency_ms=resolved_score.latency_ms + 15,
    )


def build_synthetic_image_bytes(
    *,
    width: int = 256,
    height: int = 256,
    output_format: str = 'webp',
    accent_rgb: tuple[int, int, int] = (212, 166, 92),
) -> tuple[bytes, str]:
    normalized_format = (output_format or 'webp').strip().lower()
    pil_format_map = {
        'webp': ('WEBP', 'image/webp'),
        'png': ('PNG', 'image/png'),
        'jpeg': ('JPEG', 'image/jpeg'),
        'jpg': ('JPEG', 'image/jpeg'),
    }
    pil_format, content_type = pil_format_map.get(normalized_format, ('WEBP', 'image/webp'))

    image = Image.new('RGB', (width, height), (28, 36, 48))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        ratio = y / max(height - 1, 1)
        r = int(28 + ratio * (accent_rgb[0] - 28))
        g = int(36 + ratio * (accent_rgb[1] - 36))
        b = int(48 + ratio * (accent_rgb[2] - 48))
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    draw.ellipse(
        [width // 4, height // 4, (width * 3) // 4, (height * 3) // 4],
        outline=(245, 240, 230),
        width=4,
    )

    buffer = BytesIO()
    save_kwargs: dict[str, Any] = {'format': pil_format}
    if pil_format in {'JPEG', 'WEBP'}:
        save_kwargs['quality'] = 88
    image.save(buffer, **save_kwargs)
    return buffer.getvalue(), content_type


class FakeImageGenerationClient:
    """Deterministic test-only image generation client for E2E smoke runs."""

    def __init__(self, *, model_name: str | None = None) -> None:
        assert_e2e_fake_ai_allowed()
        self.model_name = (model_name or settings.image_generation_model).strip() or 'gpt-image-2'

    def generate(
        self,
        *,
        prompt: str,
        quality: str,
        size: str,
        output_format: str = 'webp',
    ) -> ImageGenerationResult:
        assert_e2e_fake_ai_allowed()
        del quality
        width, height = _preview_dimensions_for_size(size)
        image_bytes, content_type = build_synthetic_image_bytes(
            width=width,
            height=height,
            output_format=output_format,
        )
        return ImageGenerationResult(
            image_bytes=image_bytes,
            content_type=content_type,
            revised_prompt=f'[E2E Fake] {prompt.strip()[:240]}',
            input_text_tokens=24,
            input_image_tokens=0,
            output_image_tokens=64,
            cost_usd=0.0,
            model_name=self.model_name,
        )

    def edit(
        self,
        *,
        prompt: str,
        quality: str,
        size: str,
        image_bytes: bytes | None = None,
        image_content_type: str = 'image/png',
        image_filename: str = 'reference.png',
        output_format: str = 'webp',
        reference_image_url: str | None = None,
    ) -> ImageGenerationResult:
        assert_e2e_fake_ai_allowed()
        del image_bytes, image_content_type, image_filename, reference_image_url
        return self.generate(
            prompt=prompt,
            quality=quality,
            size=size,
            output_format=output_format,
        )


def _preview_dimensions_for_size(size: str) -> tuple[int, int]:
    normalized = (size or '').strip().lower()
    if normalized == '1024x1536':
        return 256, 384
    if normalized == '1536x1024':
        return 384, 256
    return 256, 256
