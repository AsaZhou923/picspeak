from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import SessionLocal
from app.services.product_analytics import (
    load_stage_a_snapshot_from_db,
    render_content_conversion_weekly_markdown,
)
from scripts.report_export_paths import main_checkout_root, resolve_report_output_path


def parse_args() -> argparse.Namespace:
    today = date.today()
    default_start = today - timedelta(days=6)

    parser = argparse.ArgumentParser(description='Export the PicSpeak content-source conversion weekly report.')
    parser.add_argument('--start-date', default=default_start.isoformat(), help='Inclusive YYYY-MM-DD start date.')
    parser.add_argument('--end-date', default=today.isoformat(), help='Inclusive YYYY-MM-DD end date.')
    parser.add_argument(
        '--output',
        default=None,
        help=(
            'Output markdown path. '
            'Default: the main checkout\'s sibling docs vault, under PicSpeak/07 - Analytics, '
            'named YYYY-MM-DD-content-conversion-weekly-report.md.'
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    start_date = date.fromisoformat(args.start_date)
    end_date = date.fromisoformat(args.end_date)
    if start_date > end_date:
        raise SystemExit('start-date must be on or before end-date')
    repo_root = Path(__file__).resolve().parents[2]
    output_path = resolve_report_output_path(
        args.output,
        repo_root=repo_root if args.output else main_checkout_root(repo_root),
        end_date=end_date,
        filename_stem='content-conversion-weekly-report',
    )

    db = SessionLocal()
    try:
        if db.get_bind().dialect.name != 'postgresql':
            raise SystemExit('A PostgreSQL database is required for enforced read-only export')
        db.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'))
        db.execute(text("SET LOCAL statement_timeout = '30s'"))
        db.execute(text("SET LOCAL TIME ZONE 'UTC'"))
        snapshot = load_stage_a_snapshot_from_db(
            db,
            start_date=start_date,
            end_date=end_date,
        )
    except SQLAlchemyError as exc:
        raise SystemExit(
            f'Content conversion export unavailable ({type(exc).__name__}); no report was written.'
        ) from None
    finally:
        try:
            db.rollback()
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
