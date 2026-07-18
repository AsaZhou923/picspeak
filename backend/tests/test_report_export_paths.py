from __future__ import annotations

import unittest
from datetime import date
from pathlib import Path

from scripts.report_export_paths import dated_analytics_report_path, resolve_report_output_path


class ReportExportPathTests(unittest.TestCase):
    def test_dated_analytics_report_path_uses_end_date_prefix(self) -> None:
        repo_root = Path('repo')

        output_path = dated_analytics_report_path(
            repo_root,
            date(2026, 5, 23),
            'stage-a-baseline-snapshot',
        )

        self.assertEqual(
            output_path,
            Path('repo') / 'docs' / 'analytics' / '2026-05-23-stage-a-baseline-snapshot.md',
        )

    def test_resolve_report_output_path_preserves_explicit_output(self) -> None:
        output_path = resolve_report_output_path(
            'custom/report.md',
            repo_root=Path('repo'),
            end_date=date(2026, 5, 23),
            filename_stem='stage-a-baseline-snapshot',
        )

        self.assertEqual(output_path, Path('custom/report.md'))


if __name__ == '__main__':
    unittest.main()
