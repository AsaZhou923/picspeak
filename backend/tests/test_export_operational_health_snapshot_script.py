from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sqlalchemy.exc import OperationalError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class ExportOperationalHealthSnapshotScriptTests(unittest.TestCase):
    def test_main_writes_fallback_only_for_database_connection_errors(self) -> None:
        from scripts import export_operational_health_snapshot as script

        db = MagicMock()
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_path = Path(tmp_dir) / 'operational-health.md'
            args = SimpleNamespace(
                start_date='2026-05-11',
                end_date='2026-05-11',
                output=str(output_path),
            )
            connection_error = OperationalError('SELECT 1', {}, RuntimeError('connection refused'))

            with patch.object(script, 'parse_args', return_value=args), patch.object(
                script,
                'SessionLocal',
                return_value=db,
            ), patch.object(
                script,
                'load_operational_health_snapshot_from_db',
                side_effect=connection_error,
            ):
                script.main()

            db.close.assert_called_once()
            markdown = output_path.read_text(encoding='utf-8')
            self.assertIn('数据库不可用，当前文件为运营健康回退快照', markdown)
            self.assertIn('原始错误：OperationalError', markdown)
            self.assertIn('connection refused', markdown)

    def test_main_reraises_non_database_snapshot_errors(self) -> None:
        from scripts import export_operational_health_snapshot as script

        db = MagicMock()
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_path = Path(tmp_dir) / 'operational-health.md'
            args = SimpleNamespace(
                start_date='2026-05-11',
                end_date='2026-05-11',
                output=str(output_path),
            )

            with patch.object(script, 'parse_args', return_value=args), patch.object(
                script,
                'SessionLocal',
                return_value=db,
            ), patch.object(
                script,
                'load_operational_health_snapshot_from_db',
                side_effect=ValueError('broken snapshot query'),
            ), patch.object(script, 'render_operational_health_markdown') as render_markdown:
                with self.assertRaisesRegex(ValueError, 'broken snapshot query'):
                    script.main()

            db.close.assert_called_once()
            render_markdown.assert_not_called()
            self.assertFalse(output_path.exists())


if __name__ == '__main__':
    unittest.main()
