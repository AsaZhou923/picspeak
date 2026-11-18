from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import Settings

BASE_ENV = {
    'APP_ENV': 'dev',
    'APP_SECRET': 'x' * 40,
    'OAUTH_JWT_SECRET': 'y' * 40,
    'DATABASE_URL': 'postgresql+psycopg2://u:p@localhost:5432/db',
}


class BackendCorsOriginsConfigTests(unittest.TestCase):
    """Issue #62: every documented BACKEND_CORS_ORIGINS form must load."""

    CASES = (
        ('["http://a.com","http://b.com/"]', ['http://a.com', 'http://b.com']),
        ('http://a.com,http://b.com', ['http://a.com', 'http://b.com']),
        (' http://a.com , , http://b.com/ ', ['http://a.com', 'http://b.com']),
        ('http://a.com', ['http://a.com']),
        ('', []),
    )

    def test_environment_variable_forms(self) -> None:
        for raw, expected in self.CASES:
            with self.subTest(raw=raw):
                with patch.dict(os.environ, {**BASE_ENV, 'BACKEND_CORS_ORIGINS': raw}, clear=True):
                    self.assertEqual(Settings(_env_file=None).backend_cors_origins, expected)

    def test_dotenv_file_forms(self) -> None:
        for raw, expected in self.CASES:
            with self.subTest(raw=raw), tempfile.TemporaryDirectory() as directory:
                env_file = Path(directory) / '.env'
                env_file.write_text(f"BACKEND_CORS_ORIGINS='{raw}'\n", encoding='utf-8')
                with patch.dict(os.environ, BASE_ENV, clear=True):
                    self.assertEqual(Settings(_env_file=env_file).backend_cors_origins, expected)

    def test_invalid_json_array_is_still_rejected(self) -> None:
        with patch.dict(os.environ, {**BASE_ENV, 'BACKEND_CORS_ORIGINS': '["http://a.com"'}, clear=True):
            with self.assertRaises(Exception):
                Settings(_env_file=None)

    def test_unset_keeps_localhost_defaults(self) -> None:
        with patch.dict(os.environ, BASE_ENV, clear=True):
            self.assertEqual(Settings(_env_file=None).backend_cors_origins, ['http://localhost:3000', 'http://127.0.0.1:3000'])


if __name__ == '__main__':
    unittest.main()
