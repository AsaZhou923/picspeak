from __future__ import annotations

import importlib
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


REPORT_SCRIPTS = (
    (
        'scripts.export_product_analytics_weekly_report',
        'render_product_analytics_weekly_markdown',
        '数据库不可用，当前文件为回退经营周报',
    ),
    (
        'scripts.export_product_analytics_snapshot',
        'render_stage_a_snapshot_markdown',
        '数据库不可用，当前文件为零基线回退快照',
    ),
    (
        'scripts.export_content_conversion_weekly_report',
        'render_content_conversion_weekly_markdown',
        '数据库不可用，当前文件为零基线回退周报',
    ),
)


class ProductReportExportScriptTests(unittest.TestCase):
    def test_main_writes_fallback_only_for_database_connection_errors(self) -> None:
        for module_name, _renderer_name, fallback_text in REPORT_SCRIPTS:
            with self.subTest(module_name=module_name):
                script = importlib.import_module(module_name)
                db = MagicMock()
                with tempfile.TemporaryDirectory() as tmp_dir:
                    output_path = Path(tmp_dir) / 'report.md'
                    args = SimpleNamespace(
                        start_date='2026-05-05',
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
                        'load_stage_a_snapshot_from_db',
                        side_effect=connection_error,
                    ):
                        script.main()

                    db.close.assert_called_once()
                    markdown = output_path.read_text(encoding='utf-8')
                    self.assertIn(fallback_text, markdown)
                    self.assertIn('原始错误：OperationalError', markdown)
                    self.assertIn('connection refused', markdown)

    def test_main_reraises_non_database_snapshot_errors(self) -> None:
        for module_name, renderer_name, _fallback_text in REPORT_SCRIPTS:
            with self.subTest(module_name=module_name):
                script = importlib.import_module(module_name)
                db = MagicMock()
                with tempfile.TemporaryDirectory() as tmp_dir:
                    output_path = Path(tmp_dir) / 'report.md'
                    args = SimpleNamespace(
                        start_date='2026-05-05',
                        end_date='2026-05-11',
                        output=str(output_path),
                    )

                    with patch.object(script, 'parse_args', return_value=args), patch.object(
                        script,
                        'SessionLocal',
                        return_value=db,
                    ), patch.object(
                        script,
                        'load_stage_a_snapshot_from_db',
                        side_effect=ValueError('broken report query'),
                    ), patch.object(script, renderer_name) as render_markdown:
                        with self.assertRaisesRegex(ValueError, 'broken report query'):
                            script.main()

                    db.close.assert_called_once()
                    render_markdown.assert_not_called()
                    self.assertFalse(output_path.exists())

    def test_main_uses_dated_default_output_when_output_is_omitted(self) -> None:
        for module_name, renderer_name, _fallback_text in REPORT_SCRIPTS:
            with self.subTest(module_name=module_name):
                script = importlib.import_module(module_name)
                db = MagicMock()
                snapshot = {'generation_note': ''}
                with tempfile.TemporaryDirectory() as tmp_dir:
                    output_path = Path(tmp_dir) / '2026-05-11-report.md'
                    args = SimpleNamespace(
                        start_date='2026-05-05',
                        end_date='2026-05-11',
                        output=None,
                    )

                    with patch.object(script, 'parse_args', return_value=args), patch.object(
                        script,
                        'SessionLocal',
                        return_value=db,
                    ), patch.object(
                        script,
                        'resolve_report_output_path',
                        return_value=output_path,
                    ) as resolve_output_path, patch.object(
                        script,
                        'load_stage_a_snapshot_from_db',
                        return_value=snapshot,
                    ), patch.object(script, renderer_name, return_value='# report\n'):
                        script.main()

                    resolve_output_path.assert_called_once()
                    _, kwargs = resolve_output_path.call_args
                    self.assertIsNone(resolve_output_path.call_args.args[0])
                    self.assertEqual(kwargs['end_date'].isoformat(), '2026-05-11')
                    self.assertTrue(str(kwargs['filename_stem']).endswith(('weekly-report', 'baseline-snapshot')))
                    self.assertEqual(output_path.read_text(encoding='utf-8'), '# report\n')


if __name__ == '__main__':
    unittest.main()
