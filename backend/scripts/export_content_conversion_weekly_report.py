from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import SessionLocal
from app.services.product_analytics import (
    build_stage_a_snapshot,
    load_stage_a_snapshot_from_db,
    render_content_conversion_weekly_markdown,
)
from scripts.export_error_handling import describe_export_error, is_database_unavailable_error
from scripts.report_export_paths import dated_analytics_report_path, resolve_report_output_path


def parse_args() -> argparse.Namespace:
    today = date.today()
    default_start = today - timedelta(days=6)
    repo_root = Path(__file__).resolve().parents[2]

    parser = argparse.ArgumentParser(description='Export the PicSpeak content-source conversion weekly report.')
    parser.add_argument('--start-date', default=default_start.isoformat(), help='Inclusive YYYY-MM-DD start date.')
    parser.add_argument('--end-date', default=today.isoformat(), help='Inclusive YYYY-MM-DD end date.')
    parser.add_argument(
        '--output',
        default=None,
        help=(
            'Output markdown path. '
            f'Default: {dated_analytics_report_path(repo_root, today, "content-conversion-weekly-report")}'
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    start_date = date.fromisoformat(args.start_date)
    end_date = date.fromisoformat(args.end_date)
    repo_root = Path(__file__).resolve().parents[2]
    output_path = resolve_report_output_path(
        args.output,
        repo_root=repo_root,
        end_date=end_date,
        filename_stem='content-conversion-weekly-report',
    )

    db = SessionLocal()
    try:
        try:
            snapshot = load_stage_a_snapshot_from_db(
                db,
                start_date=start_date,
                end_date=end_date,
            )
        except Exception as exc:
            if not is_database_unavailable_error(exc):
                raise
            snapshot = build_stage_a_snapshot(
                events=[],
                reviews=[],
                start_date=start_date,
                end_date=end_date,
            )
            snapshot['generation_note'] = (
                '数据库不可用，当前文件为零基线回退周报。'
                f' 原始错误：{describe_export_error(exc)}'
            )
    finally:
        db.close()

    markdown = render_content_conversion_weekly_markdown(snapshot)
    if snapshot.get('generation_note'):
        markdown = f"> 注：{snapshot['generation_note']}\n\n" + markdown
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown, encoding='utf-8')
    print(f'Wrote content conversion weekly report to {output_path}')


if __name__ == '__main__':
    main()
