import unittest
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import Settings


class SettingsDefaultsTestCase(unittest.TestCase):
    def _settings(self, **overrides):
        return Settings(_env_file=None, database_url='sqlite://localhost/picspeak-test', **overrides)

    def test_openai_fallback_is_optional_and_attempts_are_bounded(self):
        settings = self._settings()
        self.assertEqual(settings.openai_fallback_api_key, '')
        self.assertEqual(settings.openai_fallback_primary_attempts, 3)
        for invalid in (0, 6):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self._settings(openai_fallback_primary_attempts=invalid)

    def test_openai_fallback_key_is_trimmed_and_hidden_from_repr(self):
        settings = self._settings(openai_fallback_api_key='  official-test-key  ')
        self.assertEqual(settings.openai_fallback_api_key, 'official-test-key')
        self.assertNotIn('official-test-key', repr(settings))

    def test_image_audit_enabled_defaults_to_true(self):
        settings = self._settings()
        self.assertTrue(settings.image_audit_enabled)

    def test_guest_daily_critique_default_is_one_without_reducing_other_allowances(self):
        settings = self._settings()
        self.assertEqual(settings.guest_review_limit_per_day, 1)
        self.assertEqual(settings.guest_review_limit_per_month, 30)
        self.assertEqual(settings.guest_review_network_limit_per_day, 12)
        self.assertEqual(settings.guest_review_network_limit_per_month, 120)
        self.assertEqual(settings.free_review_limit_per_day, 5)
        self.assertEqual(settings.free_review_limit_per_month, 60)

    def test_pro_monthly_soft_limit_defaults_to_150_and_requires_a_positive_threshold(self):
        self.assertEqual(self._settings().pro_review_soft_limit_per_month, 150)
        self.assertEqual(self._settings(pro_review_soft_limit_per_month=200).pro_review_soft_limit_per_month, 200)
        for invalid in (0, -1):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self._settings(pro_review_soft_limit_per_month=invalid)

    def test_pro_soft_limit_rate_defaults_to_two_and_requires_a_positive_rate(self):
        self.assertEqual(self._settings().pro_review_soft_limit_rate_per_minute, 2)
        for invalid in (0, -1):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self._settings(pro_review_soft_limit_rate_per_minute=invalid)

    def test_pro_image_generation_monthly_credits_default_to_199(self):
        settings = self._settings()
        self.assertEqual(settings.image_generation_pro_monthly_credits, 199)

    def test_image_generation_api_key_defaults_to_blank(self):
        settings = self._settings()
        self.assertEqual(settings.image_generation_api_key, '')

    def test_image_generation_api_key_strips_whitespace(self):
        settings = self._settings(image_generation_api_key='  img-key  ')
        self.assertEqual(settings.image_generation_api_key, 'img-key')

    def test_image_credit_pack_checkout_url_defaults_to_blank(self):
        settings = self._settings()
        self.assertEqual(settings.lemonsqueezy_image_credit_pack_checkout_url, '')

    def test_image_credit_pack_variant_id_defaults_to_blank(self):
        settings = self._settings()
        self.assertEqual(settings.lemonsqueezy_image_credit_pack_variant_id, '')

    def test_zh_pro_checkout_url_defaults_to_blank(self):
        settings = self._settings()
        self.assertEqual(settings.lemonsqueezy_zh_pro_checkout_url, '')

    def test_zh_pro_variant_id_defaults_to_blank(self):
        settings = self._settings()
        self.assertEqual(settings.lemonsqueezy_zh_pro_variant_id, '')

    def test_retake_analysis_defaults_to_pro_sol_high(self):
        settings = self._settings()
        self.assertEqual(settings.retake_analysis_model, 'gpt-6.1-sol')
        self.assertEqual(settings.retake_analysis_reasoning_effort, 'high')

    def test_single_photo_openai_review_defaults_to_sol_low(self):
        settings = self._settings()
        self.assertEqual(settings.openai_review_model, 'gpt-6-sol')
        self.assertEqual(settings.openai_review_reasoning_effort, 'low')

    def test_single_photo_openai_score_defaults_to_gpt6_sol_low(self):
        settings = self._settings()
        self.assertEqual(settings.openai_score_model, 'gpt-6-sol')
        self.assertEqual(settings.openai_score_reasoning_effort, 'low')

    def test_openai_pro_profile_defaults_to_gpt61_sol_high(self):
        settings = self._settings()
        self.assertEqual(settings.openai_pro_model, 'gpt-6.1-sol')
        self.assertEqual(settings.openai_pro_reasoning_effort, 'high')

    def test_openai_score_reasoning_effort_is_normalized_and_validated(self):
        settings = self._settings(openai_score_reasoning_effort=' HIGH ')
        self.assertEqual(settings.openai_score_reasoning_effort, 'high')

        with self.assertRaises(ValueError):
            self._settings(openai_score_reasoning_effort='turbo')


if __name__ == '__main__':
    unittest.main()
