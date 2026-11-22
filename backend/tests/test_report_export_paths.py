from __future__ import annotations

import unittest
from datetime import date
from pathlib import Path
from subprocess import CompletedProcess
from unittest.mock import patch

from scripts.report_export_paths import dated_analytics_report_path, main_checkout_root, resolve_report_output_path


class ReportExportPathTests(unittest.TestCase):
    def test_linked_worktree_uses_main_checkout_sibling_vault(self) -> None:
        checkout = Path('projects') / 'PicSpeak'
        worktree = Path('projects') / 'orca' / 'workspaces' / 'PicSpeak' / 'albacore'
        with patch('scripts.report_export_paths.subprocess.run', return_value=CompletedProcess(
            args=[], returncode=0, stdout=str(checkout / '.git') + '\n', stderr='',
        )) as git:
            resolved = main_checkout_root(worktree)
        self.assertEqual(resolved, checkout)
        self.assertEqual(git.call_args.args[0][2], str(worktree))
        self.assertEqual(
            dated_analytics_report_path(resolved, date(2026, 11, 22), 'content-conversion-weekly-report'),
            Path('projects/docs/01 - Projects/PicSpeak/07 - Analytics/2026-11-22-content-conversion-weekly-report.md'),
        )

    def test_dated_analytics_report_path_uses_end_date_prefix(self) -> None:
        repo_root = Path('repo')

        output_path = dated_analytics_report_path(
            repo_root,
            date(2026, 5, 23),
            'stage-a-baseline-snapshot',
        )

        self.assertEqual(
            output_path,
            Path('docs') / '01 - Projects' / 'PicSpeak' / '07 - Analytics' / '2026-05-23-stage-a-baseline-snapshot.md',
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
