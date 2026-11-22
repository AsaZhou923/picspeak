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


class ContentConversionExportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.script = importlib.import_module('scripts.export_content_conversion_weekly_report')
        self.db = MagicMock()
        self.db.get_bind.return_value.dialect.name = 'postgresql'

    def test_database_failure_never_creates_or_overwrites_report(self) -> None:
        for existing in (False, True):
            with self.subTest(existing=existing), tempfile.TemporaryDirectory() as tmp_dir:
                output_path = Path(tmp_dir) / 'report.md'
                if existing:
                    output_path.write_text('verified prior report', encoding='utf-8')
                args = SimpleNamespace(start_date='2026-05-05', end_date='2026-05-11', output=str(output_path))
                self.db.reset_mock()
                error = OperationalError('SELECT 1', {}, RuntimeError('connection refused'))
                with patch.object(self.script, 'parse_args', return_value=args), patch.object(
                    self.script, 'SessionLocal', return_value=self.db,
                ), patch.object(self.script, 'load_stage_a_snapshot_from_db', side_effect=error), patch.object(
                    self.script, 'render_content_conversion_weekly_markdown',
                ) as renderer:
                    with self.assertRaisesRegex(SystemExit, 'export unavailable'):
                        self.script.main()
                renderer.assert_not_called()
                self.db.rollback.assert_called_once()
                self.db.close.assert_called_once()
                if existing:
                    self.assertEqual(output_path.read_text(encoding='utf-8'), 'verified prior report')
                else:
                    self.assertFalse(output_path.exists())

    def test_success_is_read_only_and_default_path_uses_main_checkout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_path = Path(tmp_dir) / 'report.md'
            args = SimpleNamespace(start_date='2026-05-05', end_date='2026-05-11', output=None)
            main_repo = Path(tmp_dir) / 'PicSpeak'
            with patch.object(self.script, 'parse_args', return_value=args), patch.object(
                self.script, 'SessionLocal', return_value=self.db,
            ), patch.object(self.script, 'main_checkout_root', return_value=main_repo), patch.object(
                self.script, 'resolve_report_output_path', return_value=output_path,
            ) as resolve_path, patch.object(
                self.script, 'load_stage_a_snapshot_from_db', return_value={},
            ) as loader, patch.object(
                self.script, 'render_content_conversion_weekly_markdown', return_value='# measured\n',
            ):
                self.script.main()
            statements = [str(call.args[0]) for call in self.db.execute.call_args_list]
            self.assertEqual(statements[0], 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
            self.assertIn("SET LOCAL statement_timeout = '30s'", statements)
            loader.assert_called_once()
            self.db.commit.assert_not_called()
            self.db.rollback.assert_called_once()
            self.db.close.assert_called_once()
            self.assertEqual(resolve_path.call_args.kwargs['repo_root'], main_repo)
            self.assertEqual(output_path.read_text(encoding='utf-8'), '# measured\n')

    def test_explicit_output_works_without_git_path_resolution(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_path = Path(tmp_dir) / 'custom.md'
            args = SimpleNamespace(start_date='2026-05-05', end_date='2026-05-11', output=str(output_path))
            with patch.object(self.script, 'parse_args', return_value=args), patch.object(
                self.script, 'SessionLocal', return_value=self.db,
            ), patch.object(self.script, 'main_checkout_root') as checkout, patch.object(
                self.script, 'load_stage_a_snapshot_from_db', return_value={},
            ), patch.object(self.script, 'render_content_conversion_weekly_markdown', return_value='# measured\n'):
                self.script.main()
            checkout.assert_not_called()
            self.assertEqual(output_path.read_text(encoding='utf-8'), '# measured\n')

    def test_non_postgres_database_is_rejected_without_loading_or_writing(self) -> None:
        self.db.get_bind.return_value.dialect.name = 'sqlite'
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_path = Path(tmp_dir) / 'report.md'
            args = SimpleNamespace(start_date='2026-05-05', end_date='2026-05-11', output=str(output_path))
            with patch.object(self.script, 'parse_args', return_value=args), patch.object(
                self.script, 'SessionLocal', return_value=self.db,
            ), patch.object(self.script, 'load_stage_a_snapshot_from_db') as loader:
                with self.assertRaisesRegex(SystemExit, 'PostgreSQL database is required'):
                    self.script.main()
            loader.assert_not_called()
            self.db.rollback.assert_called_once()
            self.db.close.assert_called_once()
            self.assertFalse(output_path.exists())


if __name__ == '__main__':
    unittest.main()
