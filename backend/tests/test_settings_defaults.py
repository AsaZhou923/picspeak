import unittest

from app.core.config import Settings


class SettingsDefaultsTestCase(unittest.TestCase):
    def test_image_audit_enabled_defaults_to_true(self):
        settings = Settings(_env_file=None)
        self.assertTrue(settings.image_audit_enabled)


if __name__ == '__main__':
    unittest.main()
