from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class EnsureRuntimeSchemaScriptTests(unittest.TestCase):
    def test_main_runs_runtime_schema_bootstrap(self) -> None:
        from scripts.ensure_runtime_schema import main

        with patch('scripts.ensure_runtime_schema.ensure_runtime_schema') as ensure_runtime_schema, patch(
            'builtins.print'
        ) as print_mock:
            main()

        ensure_runtime_schema.assert_called_once_with()
        print_mock.assert_called_once_with('Runtime schema ensured.')


if __name__ == '__main__':
    unittest.main()
