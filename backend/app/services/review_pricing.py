from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


USD_QUANT = Decimal('0.000001')
TOKENS_PER_MILLION = Decimal('1000000')
REVIEW_PRICING_VERSION = 'review-pricing-2026-08-28'


@dataclass(frozen=True, slots=True)
class ReviewPricingTier:
    max_input_tokens: int | None
    input_usd_per_m: Decimal
    output_usd_per_m: Decimal


@dataclass(frozen=True, slots=True)
class ReviewPricingRate:
    model: str
    rate_version: str
    tiers: tuple[ReviewPricingTier, ...]


@dataclass(frozen=True, slots=True)
class ReviewModelUsage:
    model_name: str
    input_tokens: int | None
    output_tokens: int | None


@dataclass(frozen=True, slots=True)
class ReviewPricingEstimate:
    cost_usd: Decimal | None
    rate_version: str | None


def _tier(max_input_tokens: int | None, input_usd_per_m: str, output_usd_per_m: str) -> ReviewPricingTier:
    return ReviewPricingTier(
        max_input_tokens=max_input_tokens,
        input_usd_per_m=Decimal(input_usd_per_m),
        output_usd_per_m=Decimal(output_usd_per_m),
    )


_BUILT_IN_RATES: dict[str, ReviewPricingRate] = {
    'gpt-5.6-luna': ReviewPricingRate(
        model='gpt-5.6-luna',
        rate_version=f'{REVIEW_PRICING_VERSION}:openai:gpt-5.6-luna:standard',
        tiers=(
            _tier(272_000, '0.20', '1.20'),
            _tier(None, '0.40', '1.80'),
        ),
    ),
    'qwen3.5-plus': ReviewPricingRate(
        model='qwen3.5-plus',
        rate_version=f'{REVIEW_PRICING_VERSION}:alibaba-cn-beijing:qwen3.5-plus',
        tiers=(
            _tier(128_000, '0.115', '0.688'),
            _tier(256_000, '0.287', '1.72'),
            _tier(1_000_000, '0.573', '3.44'),
        ),
    ),
    'qwen3.5-plus-2026-02-15': ReviewPricingRate(
        model='qwen3.5-plus-2026-02-15',
        rate_version=f'{REVIEW_PRICING_VERSION}:alibaba-cn-beijing:qwen3.5-plus-2026-02-15',
        tiers=(
            _tier(128_000, '0.115', '0.688'),
            _tier(256_000, '0.287', '1.72'),
            _tier(1_000_000, '0.573', '3.44'),
        ),
    ),
    'qwen3.5-flash': ReviewPricingRate(
        model='qwen3.5-flash',
        rate_version=f'{REVIEW_PRICING_VERSION}:alibaba-cn-beijing:qwen3.5-flash',
        tiers=(
            _tier(128_000, '0.029', '0.287'),
            _tier(256_000, '0.115', '1.147'),
            _tier(1_000_000, '0.172', '1.72'),
        ),
    ),
    'qwen3.5-flash-2026-02-23': ReviewPricingRate(
        model='qwen3.5-flash-2026-02-23',
        rate_version=f'{REVIEW_PRICING_VERSION}:alibaba-cn-beijing:qwen3.5-flash-2026-02-23',
        tiers=(
            _tier(128_000, '0.029', '0.287'),
            _tier(256_000, '0.115', '1.147'),
            _tier(1_000_000, '0.172', '1.72'),
        ),
    ),
}


def parse_review_pricing_overrides(value: Any) -> dict[str, Any]:
    if value is None or value == '':
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        parsed = json.loads(value)
        if not isinstance(parsed, dict):
            raise ValueError('REVIEW_PRICING_OVERRIDES must be a JSON object')
        return parsed
    raise ValueError('REVIEW_PRICING_OVERRIDES must be a JSON object')


def _normalize_model_name(model_name: str) -> str:
    normalized = str(model_name or '').strip().lower()
    if '/' in normalized:
        normalized = normalized.rsplit('/', 1)[-1]
    return normalized


def _coerce_rate(model: str, raw_rate: Any) -> ReviewPricingRate | None:
    if not isinstance(raw_rate, dict):
        return None
    raw_tiers = raw_rate.get('tiers')
    if not isinstance(raw_tiers, list) or not raw_tiers:
        return None

    tiers: list[ReviewPricingTier] = []
    for raw_tier in raw_tiers:
        if not isinstance(raw_tier, dict):
            return None
        try:
            max_input_tokens = raw_tier.get('max_input_tokens')
            tiers.append(
                ReviewPricingTier(
                    max_input_tokens=None if max_input_tokens is None else int(max_input_tokens),
                    input_usd_per_m=Decimal(str(raw_tier['input_usd_per_m'])),
                    output_usd_per_m=Decimal(str(raw_tier['output_usd_per_m'])),
                )
            )
        except (KeyError, TypeError, ValueError):
            return None

    version = str(raw_rate.get('rate_version') or f'{REVIEW_PRICING_VERSION}:override:{model}').strip()
    if not version:
        return None
    return ReviewPricingRate(model=model, rate_version=version, tiers=tuple(tiers))


def _rate_for_model(model_name: str, overrides: dict[str, Any] | None) -> ReviewPricingRate | None:
    normalized = _normalize_model_name(model_name)
    for raw_name, raw_rate in (overrides or {}).items():
        if _normalize_model_name(str(raw_name)) == normalized:
            return _coerce_rate(normalized, raw_rate)
    return _BUILT_IN_RATES.get(normalized)


def _estimate_call_cost(
    *,
    input_tokens: int | None,
    output_tokens: int | None,
    rate: ReviewPricingRate,
) -> Decimal | None:
    if input_tokens is None or output_tokens is None:
        return None
    if input_tokens < 0 or output_tokens < 0:
        return None
    for tier in rate.tiers:
        if tier.max_input_tokens is None or input_tokens <= tier.max_input_tokens:
            cost = (
                (Decimal(input_tokens) / TOKENS_PER_MILLION * tier.input_usd_per_m)
                + (Decimal(output_tokens) / TOKENS_PER_MILLION * tier.output_usd_per_m)
            )
            return cost.quantize(USD_QUANT, rounding=ROUND_HALF_UP)
    return None


def estimate_review_usage_cost(
    calls: list[ReviewModelUsage],
    *,
    overrides: dict[str, Any] | None = None,
) -> ReviewPricingEstimate:
    if not calls:
        return ReviewPricingEstimate(cost_usd=None, rate_version=None)

    total = Decimal('0')
    versions: list[str] = []
    for call in calls:
        rate = _rate_for_model(call.model_name, overrides)
        if rate is None:
            return ReviewPricingEstimate(cost_usd=None, rate_version=None)
        cost = _estimate_call_cost(
            input_tokens=call.input_tokens,
            output_tokens=call.output_tokens,
            rate=rate,
        )
        if cost is None:
            return ReviewPricingEstimate(cost_usd=None, rate_version=None)
        total += cost
        versions.append(rate.rate_version)

    return ReviewPricingEstimate(
        cost_usd=total.quantize(USD_QUANT, rounding=ROUND_HALF_UP),
        rate_version='+'.join(versions),
    )
