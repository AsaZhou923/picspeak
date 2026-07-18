from __future__ import annotations

from decimal import Decimal


SUPPORTED_GENERATION_QUALITIES = {'low', 'medium', 'high'}
SUPPORTED_GENERATION_SIZES = {'1024x1024', '1024x1536', '1536x1024'}

_SIZE_ALIASES = {
    '1:1': '1024x1024',
    '2:3': '1024x1536',
    '3:2': '1536x1024',
    '16:9': '1536x1024',
    '9:16': '1024x1536',
    'auto': '1024x1024',
}

_CREDITS_BY_QUALITY_SIZE = {
    ('low', '1024x1024'): 1,
    ('low', '1024x1536'): 1,
    ('low', '1536x1024'): 1,
    ('medium', '1024x1024'): 10,
    ('medium', '1024x1536'): 8,
    ('medium', '1536x1024'): 8,
    ('high', '1024x1024'): 40,
    ('high', '1024x1536'): 30,
    ('high', '1536x1024'): 30,
}

_COST_BY_QUALITY_SIZE = {
    ('low', '1024x1024'): Decimal('0.006'),
    ('low', '1024x1536'): Decimal('0.005'),
    ('low', '1536x1024'): Decimal('0.005'),
    ('medium', '1024x1024'): Decimal('0.053'),
    ('medium', '1024x1536'): Decimal('0.041'),
    ('medium', '1536x1024'): Decimal('0.041'),
    ('high', '1024x1024'): Decimal('0.211'),
    ('high', '1024x1536'): Decimal('0.165'),
    ('high', '1536x1024'): Decimal('0.165'),
}

REFERENCE_IMAGE_CREDIT_SURCHARGE = 2


def normalize_generation_quality(value: str | None) -> str:
    normalized = str(value or 'low').strip().lower()
    if normalized not in SUPPORTED_GENERATION_QUALITIES:
        raise ValueError(f'Unsupported image generation quality: {value}')
    return normalized


def normalize_generation_size(value: str | None) -> str:
    normalized = str(value or 'auto').strip().lower()
    normalized = _SIZE_ALIASES.get(normalized, normalized)
    if normalized not in SUPPORTED_GENERATION_SIZES:
        raise ValueError(f'Unsupported image generation size: {value}')
    return normalized


def estimate_image_generation_credits(
    *,
    quality: str,
    size: str,
    reference_image_count: int = 0,
) -> int:
    normalized_quality = normalize_generation_quality(quality)
    normalized_size = normalize_generation_size(size)
    reference_count = max(int(reference_image_count or 0), 0)
    return _CREDITS_BY_QUALITY_SIZE[(normalized_quality, normalized_size)] + (
        reference_count * REFERENCE_IMAGE_CREDIT_SURCHARGE
    )


def estimate_image_generation_cost_usd(
    *,
    quality: str,
    size: str,
    reference_image_count: int = 0,
) -> Decimal:
    normalized_quality = normalize_generation_quality(quality)
    normalized_size = normalize_generation_size(size)
    output_cost = _COST_BY_QUALITY_SIZE[(normalized_quality, normalized_size)]
    if reference_image_count <= 0:
        return output_cost
    # Reference-image input cost is token-metered by the provider; this placeholder
    # keeps estimates conservative until actual input-image usage is returned.
    return output_cost + (Decimal('0.012') * Decimal(reference_image_count))


def get_credits_table() -> dict[str, dict[str, int]]:
    """Return the credits pricing matrix as a nested dict {quality -> {size -> credits}}.

    This is intended for API responses so that the frontend does not need to
    maintain a local copy of the same data (avoiding drift).
    """
    table: dict[str, dict[str, int]] = {}
    for (quality, size), credits in _CREDITS_BY_QUALITY_SIZE.items():
        table.setdefault(quality, {})[size] = credits
    return table

