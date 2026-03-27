from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app


class AppStartupTests(unittest.TestCase):
    def test_web_startup_does_not_run_schema_bootstrap(self) -> None:
        with patch('app.main.worker.start'), patch('app.main.worker.stop'), patch(
            'app.db.bootstrap.ensure_runtime_schema'
        ) as ensure_runtime_schema:
            with TestClient(app):
                pass

        ensure_runtime_schema.assert_not_called()


if __name__ == '__main__':
    unittest.main()
