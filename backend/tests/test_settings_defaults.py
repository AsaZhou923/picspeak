import unittest

from app.core.config import Settings


class SettingsDefaultsTestCase(unittest.TestCase):
    def test_image_audit_enabled_defaults_to_true(self):
        settings = Settings(_env_file=None)
        self.assertTrue(settings.image_audit_enabled)

    def test_pro_image_generation_monthly_credits_default_to_199(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.image_generation_pro_monthly_credits, 199)

    def test_image_generation_api_key_defaults_to_blank(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.image_generation_api_key, '')

    def test_image_generation_api_key_strips_whitespace(self):
        settings = Settings(_env_file=None, image_generation_api_key='  img-key  ')
        self.assertEqual(settings.image_generation_api_key, 'img-key')

    def test_image_credit_pack_checkout_url_defaults_to_blank(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.lemonsqueezy_image_credit_pack_checkout_url, '')

    def test_image_credit_pack_variant_id_defaults_to_blank(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.lemonsqueezy_image_credit_pack_variant_id, '')

    def test_zh_pro_checkout_url_defaults_to_blank(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.lemonsqueezy_zh_pro_checkout_url, '')

    def test_zh_pro_variant_id_defaults_to_blank(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.lemonsqueezy_zh_pro_variant_id, '')

    def test_retake_analysis_defaults_to_luna_xhigh(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.retake_analysis_model, 'gpt-5.6-luna')
        self.assertEqual(settings.retake_analysis_reasoning_effort, 'xhigh')

    def test_single_photo_openai_review_defaults_to_luna_xhigh(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.openai_review_model, 'gpt-5.6-luna')
        self.assertEqual(settings.openai_review_reasoning_effort, 'xhigh')


if __name__ == '__main__':
    unittest.main()
