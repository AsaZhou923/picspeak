import unittest

from app.core.config import Settings


class SettingsDefaultsTestCase(unittest.TestCase):
    def test_image_audit_enabled_defaults_to_true(self):
        settings = Settings(_env_file=None)
        self.assertTrue(settings.image_audit_enabled)

    def test_pro_image_generation_monthly_credits_default_to_199(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.image_generation_pro_monthly_credits, 199)

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


if __name__ == '__main__':
    unittest.main()
