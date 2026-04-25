from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.image_generation_pricing import (  # noqa: E402
    estimate_image_generation_credits,
    estimate_image_generation_cost_usd,
    normalize_generation_size,
)


class ImageGenerationPricingTests(unittest.TestCase):
    def test_credit_table_matches_current_business_baseline(self) -> None:
        self.assertEqual(estimate_image_generation_credits(quality='low', size='1024x1024'), 1)
        self.assertEqual(estimate_image_generation_credits(quality='medium', size='1024x1536'), 8)
        self.assertEqual(estimate_image_generation_credits(quality='medium', size='1536x1024'), 8)
        self.assertEqual(estimate_image_generation_credits(quality='medium', size='1024x1024'), 10)
        self.assertEqual(estimate_image_generation_credits(quality='high', size='1024x1536'), 30)
        self.assertEqual(estimate_image_generation_credits(quality='high', size='1024x1024'), 40)

    def test_reference_image_surcharge_is_added_per_input_image(self) -> None:
        self.assertEqual(
            estimate_image_generation_credits(quality='low', size='1024x1024', reference_image_count=1),
            3,
        )

    def test_size_ratios_normalize_to_supported_openai_sizes(self) -> None:
        self.assertEqual(normalize_generation_size('1:1'), '1024x1024')
        self.assertEqual(normalize_generation_size('2:3'), '1024x1536')
        self.assertEqual(normalize_generation_size('3:2'), '1536x1024')
        self.assertEqual(normalize_generation_size('16:9'), '1536x1024')
        self.assertEqual(normalize_generation_size('9:16'), '1024x1536')
        self.assertEqual(normalize_generation_size('auto'), '1024x1024')

    def test_cost_estimate_uses_official_output_price_baseline(self) -> None:
        self.assertEqual(str(estimate_image_generation_cost_usd(quality='low', size='1024x1024')), '0.006')
        self.assertEqual(str(estimate_image_generation_cost_usd(quality='medium', size='1024x1536')), '0.041')
        self.assertEqual(str(estimate_image_generation_cost_usd(quality='high', size='1024x1024')), '0.211')


if __name__ == '__main__':
    unittest.main()
