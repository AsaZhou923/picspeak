from __future__ import annotations

import subprocess
from datetime import date
from pathlib import Path


def main_checkout_root(repo_root: Path) -> Path:
    """Resolve linked worktrees to the main checkout for external report paths."""
    result = subprocess.run(
        ['git', '-C', str(repo_root), 'rev-parse', '--path-format=absolute', '--git-common-dir'],
        capture_output=True, text=True, check=True,
    )
    common_dir = Path(result.stdout.strip())
    if common_dir.name != '.git':
        raise ValueError('Cannot resolve the main checkout; pass an explicit --output path')
    return common_dir.parent


def dated_analytics_report_path(repo_root: Path, end_date: date, filename_stem: str) -> Path:
    project_docs = repo_root.parent / 'docs' / '01 - Projects' / 'PicSpeak' / '07 - Analytics'
    return project_docs / f'{end_date.isoformat()}-{filename_stem}.md'


def resolve_report_output_path(
    output: str | None,
    *,
    repo_root: Path,
    end_date: date,
    filename_stem: str,
) -> Path:
    if output:
        return Path(output)
    return dated_analytics_report_path(repo_root, end_date, filename_stem)
