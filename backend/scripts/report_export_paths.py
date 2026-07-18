from __future__ import annotations

from datetime import date
from pathlib import Path


def dated_analytics_report_path(repo_root: Path, end_date: date, filename_stem: str) -> Path:
    return repo_root / 'docs' / 'analytics' / f'{end_date.isoformat()}-{filename_stem}.md'


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
