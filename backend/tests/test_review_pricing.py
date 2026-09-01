from __future__ import annotations

import json
import sys
import unittest
from decimal import Decimal
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.review_pricing import (  # noqa: E402
    ReviewModelUsage,
    estimate_review_usage_cost,
    parse_review_pricing_overrides,
)


class ReviewPricingTests(unittest.TestCase):
    def test_openai_luna_standard_and_long_context_tiers(self) -> None:
        short = estimate_review_usage_cost(
            [ReviewModelUsage(model_name='gpt-5.6-luna', input_tokens=200_000, output_tokens=10_000)]
        )
        long = estimate_review_usage_cost(
            [ReviewModelUsage(model_name='gpt-5.6-luna', input_tokens=300_000, output_tokens=10_000)]
        )

        self.assertEqual(short.cost_usd, Decimal('0.052000'))
        self.assertEqual(long.cost_usd, Decimal('0.138000'))
        self.assertIn('openai:gpt-5.6-luna:standard', short.rate_version or '')

    def test_qwen_plus_and_flash_china_beijing_tiers_are_per_call(self) -> None:
        estimate = estimate_review_usage_cost(
            [
                ReviewModelUsage(model_name='qwen3.5-flash', input_tokens=100_000, output_tokens=1_000),
                ReviewModelUsage(model_name='qwen3.5-plus', input_tokens=200_000, output_tokens=2_000),
            ]
        )

        self.assertEqual(estimate.cost_usd, Decimal('0.064027'))
        self.assertIn('alibaba-cn-beijing:qwen3.5-flash', estimate.rate_version or '')
        self.assertIn('alibaba-cn-beijing:qwen3.5-plus', estimate.rate_version or '')

    def test_unknown_model_or_missing_usage_remains_unknown(self) -> None:
        unknown = estimate_review_usage_cost(
            [ReviewModelUsage(model_name='future-model', input_tokens=100, output_tokens=20)]
        )
        missing = estimate_review_usage_cost(
            [ReviewModelUsage(model_name='gpt-5.6-luna', input_tokens=None, output_tokens=20)]
        )

        self.assertIsNone(unknown.cost_usd)
        self.assertIsNone(unknown.rate_version)
        self.assertIsNone(missing.cost_usd)

    def test_json_overrides_define_explicit_rate_version(self) -> None:
        overrides = parse_review_pricing_overrides(
            '{"custom-model":{"rate_version":"custom-v1","tiers":[{"max_input_tokens":null,"input_usd_per_m":1,"output_usd_per_m":2}]}}'
        )
        estimate = estimate_review_usage_cost(
            [ReviewModelUsage(model_name='custom-model', input_tokens=1_000, output_tokens=2_000)],
            overrides=overrides,
        )

        self.assertEqual(estimate.cost_usd, Decimal('0.005000'))
        self.assertEqual(estimate.rate_version, 'custom-v1')

    def test_malformed_pricing_override_json_is_rejected(self) -> None:
        with self.assertRaises(json.JSONDecodeError):
            parse_review_pricing_overrides('{not-json')


if __name__ == '__main__':
    unittest.main()
