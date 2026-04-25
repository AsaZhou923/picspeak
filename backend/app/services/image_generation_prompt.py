from __future__ import annotations

from dataclasses import dataclass
from typing import Any


class PromptSafetyError(ValueError):
    pass


@dataclass(frozen=True)
class GenerationTemplate:
    key: str
    label_zh: str
    label_en: str
    description: str
    prompt_prefix: str
    default_negative: str


_TEMPLATES = [
    GenerationTemplate(
        key='custom_creation',
        label_zh='自定义创作',
        label_en='Custom creation',
        description='Free-form visual references from the user prompt.',
        prompt_prefix='Create an AI-generated visual reference based on the user direction. Preserve the user intent while adding clear composition, lighting, material, color, spatial hierarchy, and photographic or illustrative craft as appropriate.',
        default_negative='no text unless explicitly requested, no watermark, no brand logo, no unsafe or deceptive identity claim',
    ),
    GenerationTemplate(
        key='photo_inspiration',
        label_zh='摄影灵感',
        label_en='Photo inspiration',
        description='Realistic photographic references with lens language, light, and composition.',
        prompt_prefix='Create a realistic photography inspiration reference with clear camera language, a believable lens choice, intentional foreground/midground/background layering, natural texture, and a composition that could be studied and retaken by a photographer.',
        default_negative='no text, no watermark, no distorted anatomy, no plastic skin',
    ),
    GenerationTemplate(
        key='social_visual',
        label_zh='社媒配图',
        label_en='Social visual',
        description='Cover-ready lifestyle or editorial images for social posts.',
        prompt_prefix='Create an editorial social cover visual with a strong hook, clear subject hierarchy, clean negative space for optional layout outside the image, polished lifestyle photography styling, and an instantly readable mood.',
        default_negative='no text, no watermark, no brand logo, no document layout',
    ),
    GenerationTemplate(
        key='portrait_avatar',
        label_zh='人像头像',
        label_en='Portrait avatar',
        description='Professional portrait or avatar ideas without claiming real-person identity.',
        prompt_prefix='Create a professional portrait avatar reference of a fictional person with tasteful lighting, natural expression, believable skin texture, controlled background separation, and a polished but not over-retouched photographic finish.',
        default_negative='no real-person likeness claim, no celebrity, no text, no watermark',
    ),
    GenerationTemplate(
        key='product_scene',
        label_zh='产品场景',
        label_en='Product scene',
        description='Product staging ideas for small shops and creators.',
        prompt_prefix='Create a product lifestyle scene reference with clean staging, tactile materials, product-first hierarchy, purposeful props, natural shadows, commercial photography polish, and no readable brand identity.',
        default_negative='no brand logo, no readable trademark, no text, no watermark',
    ),
    GenerationTemplate(
        key='interior_atmosphere',
        label_zh='空间氛围',
        label_en='Interior atmosphere',
        description='Interior, shop, homestay, and studio atmosphere references.',
        prompt_prefix='Create an interior atmosphere photography reference with human-scale spatial composition, natural window light, layered furniture and materials, lived-in details, clean sight lines, and a coherent mood suitable for a cafe, homestay, studio, or small shop.',
        default_negative='no text, no watermark, no real estate floorplan, no distorted architecture, no brand logo',
    ),
    GenerationTemplate(
        key='color_moodboard',
        label_zh='色彩 moodboard',
        label_en='Color moodboard',
        description='Color, material, and atmosphere references.',
        prompt_prefix='Create a color and material moodboard-style visual reference with a coherent palette, tactile material samples, lighting atmosphere, photographic texture, and a clear emotional direction without text labels.',
        default_negative='no text, no watermark, no UI, no infographic labels',
    ),
]

_TEMPLATE_BY_KEY = {template.key: template for template in _TEMPLATES}
_BLOCKED_PROMPT_FRAGMENTS = (
    'transparent background',
    'transparent png',
    '透明背景',
    '透過背景',
    'id photo',
    'passport photo',
    '证件照',
    'official document',
)
_UNSPECIFIED_STYLES = {'', 'none', 'no_style', 'unspecified', 'auto', 'default', 'not_specified'}


def get_generation_templates() -> list[dict[str, str]]:
    return [
        {
            'key': template.key,
            'label_zh': template.label_zh,
            'label_en': template.label_en,
            'description': template.description,
            'default_negative': template.default_negative,
        }
        for template in _TEMPLATES
    ]


def _validate_prompt_safety(*parts: str) -> None:
    haystack = '\n'.join(parts).lower()
    for fragment in _BLOCKED_PROMPT_FRAGMENTS:
        if fragment.lower() in haystack:
            raise PromptSafetyError('This image generation request is outside the MVP safety boundary')


def build_general_generation_prompt(
    *,
    user_prompt: str,
    template_key: str,
    style: str,
    negative_prompt: str | None = None,
) -> str:
    normalized_prompt = str(user_prompt or '').strip()
    if len(normalized_prompt) < 3:
        raise PromptSafetyError('Prompt is too short')

    template = _TEMPLATE_BY_KEY.get(str(template_key or '').strip()) or _TEMPLATE_BY_KEY['photo_inspiration']
    normalized_style = _normalize_style_direction(style)
    normalized_negative = str(negative_prompt or '').strip()

    _validate_prompt_safety(normalized_prompt, normalized_negative)

    negative = template.default_negative
    if normalized_negative:
        negative = f'{negative}; {normalized_negative}'

    prompt_parts = [
        template.prompt_prefix,
        f'User direction: {normalized_prompt}',
    ]
    if normalized_style:
        prompt_parts.append(f'Style direction: {normalized_style}')
    prompt_parts.extend(
        [
            'Output must be clearly treated as an AI-generated visual reference, not a real user photograph.',
            f'Negative constraints: {negative}',
        ]
    )
    return '\n'.join(prompt_parts)


def build_review_linked_generation_prompt(
    *,
    review_result: dict[str, Any],
    user_prompt: str,
    intent: str,
    image_type: str,
    style: str,
    negative_prompt: str | None = None,
) -> str:
    normalized_prompt = str(user_prompt or '').strip()
    if len(normalized_prompt) < 3:
        raise PromptSafetyError('Prompt is too short')

    normalized_intent = str(intent or 'retake_reference').strip().lower() or 'retake_reference'
    normalized_image_type = str(image_type or review_result.get('image_type') or 'default').strip().lower() or 'default'
    normalized_style = _normalize_style_direction(style)
    normalized_negative = str(negative_prompt or '').strip()

    advantage = _safe_excerpt(review_result.get('advantage'), 600)
    critique = _safe_excerpt(review_result.get('critique'), 900)
    suggestions = _safe_excerpt(review_result.get('suggestions'), 1200)
    scores = review_result.get('scores') if isinstance(review_result.get('scores'), dict) else {}
    weakest_dimension = _weakest_score_dimension(scores)

    _validate_prompt_safety(normalized_prompt, normalized_negative, advantage, critique, suggestions)

    negative = 'no text, no watermark, no surreal elements, no plastic skin, no fake before/after claim'
    if normalized_negative:
        negative = f'{negative}; {normalized_negative}'

    camera_direction = (
        f'Camera/style direction: {normalized_style}, realistic photographic reference, educational and actionable.'
        if normalized_style
        else 'Camera direction: realistic photographic reference, educational and actionable.'
    )
    return '\n'.join(
        [
            'Create an AI-generated next-shoot reference image for a photography critique workflow.',
            'This image must be a visual direction for a future retake, not a corrected version of the original photo.',
            f'Reference intent: {normalized_intent}.',
            f'Photo genre/image type: {normalized_image_type}.',
            f'Primary improvement goal from user: {normalized_prompt}.',
            f'Weakest critique dimension: {weakest_dimension}.',
            f'Original strengths to preserve: {advantage or "preserve the strongest visual idea from the review"}.',
            f'Problems to improve: {critique or "improve composition, light, color, and subject hierarchy based on the critique"}.',
            f'Concrete next-shoot suggestions: {suggestions or normalized_prompt}.',
            camera_direction,
            'Compose one clear reference image with intentional subject placement, lighting direction, color mood, and background discipline.',
            'Labeling rule: do not render text labels in the image; communicate the direction visually.',
            f'Negative constraints: {negative}',
        ]
    )


def _normalize_style_direction(style: str | None) -> str | None:
    normalized = str(style or '').strip().lower()
    if normalized in _UNSPECIFIED_STYLES:
        return None
    return normalized


def _safe_excerpt(value: Any, limit: int) -> str:
    text = str(value or '').strip()
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(' ', 1)[0].strip() or text[:limit].strip()


def _weakest_score_dimension(scores: dict[str, Any]) -> str:
    candidates: list[tuple[str, float]] = []
    for key in ('composition', 'lighting', 'color', 'impact', 'technical'):
        try:
            candidates.append((key, float(scores.get(key))))
        except (TypeError, ValueError):
            continue
    if not candidates:
        return 'composition'
    return min(candidates, key=lambda item: item[1])[0]
