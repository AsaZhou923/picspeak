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

    def test_image_audit_enabled_defaults_to_true(self):
        settings = self._settings()
        self.assertTrue(settings.image_audit_enabled)

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

    def test_retake_analysis_defaults_to_sol_xhigh(self):
        settings = self._settings()
        self.assertEqual(settings.retake_analysis_model, 'gpt-6-sol')
        self.assertEqual(settings.retake_analysis_reasoning_effort, 'xhigh')

    def test_single_photo_openai_review_defaults_to_sol_xhigh(self):
        settings = self._settings()
        self.assertEqual(settings.openai_review_model, 'gpt-6-sol')
        self.assertEqual(settings.openai_review_reasoning_effort, 'xhigh')

    def test_single_photo_openai_score_defaults_to_gpt6_sol_xhigh(self):
        settings = self._settings()
        self.assertEqual(settings.openai_score_model, 'gpt-6-sol')
        self.assertEqual(settings.openai_score_reasoning_effort, 'xhigh')

    def test_openai_score_reasoning_effort_is_normalized_and_validated(self):
        settings = self._settings(openai_score_reasoning_effort=' HIGH ')
        self.assertEqual(settings.openai_score_reasoning_effort, 'high')

        with self.assertRaises(ValueError):
            self._settings(openai_score_reasoning_effort='turbo')


if __name__ == '__main__':
    unittest.main()
