from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.practice_metrics import (  # noqa: E402
    build_practice_snapshot,
    load_practice_snapshot_from_db,
    render_practice_analytics_markdown,
)
from scripts.report_export_paths import resolve_report_output_path  # noqa: E402


DEFAULT_FIXTURE_PATH = BACKEND_ROOT / 'tests' / 'fixtures' / 'practice_metric_examples.json'


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Export the PicSpeak practice analytics report.')
    parser.add_argument('--fixtures', default=str(DEFAULT_FIXTURE_PATH), help='Offline fixture JSON path. Used unless --db-url is provided.')
    parser.add_argument('--as-of', default=None, help='UTC ISO timestamp for mature-window calculations.')
    parser.add_argument('--visibility-evaluated-at', default=None,
                        help='UTC ISO timestamp for DB-mode current access evaluation. Defaults to one runtime UTC timestamp.')
    parser.add_argument('--output', default=None, help='Markdown output path. Defaults to the shared analytics report path helper.')
    parser.add_argument('--stdout', action='store_true', help='Print markdown instead of writing a file.')
    parser.add_argument('--json-output', default=None, help='Optional JSON snapshot output path.')
    parser.add_argument('--json-stdout', action='store_true', help='Print the JSON snapshot after markdown generation.')
    parser.add_argument('--db-url', default=None, help='Explicit database URL for DB mode. Omit for offline/no-DB mode.')
    parser.add_argument('--eligibility-manifest', default=None,
                        help='Optional JSON map of review IDs or user-<internal ID> to qualified/unqualified/unknown. Omitted eligibility remains unknown.')
    parser.add_argument('--start-date', default=None, help='DB mode inclusive UTC ISO start datetime.')
    parser.add_argument('--end-date', default=None, help='DB mode exclusive UTC ISO end datetime.')
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    as_of = _parse_datetime(args.as_of)
    visibility_evaluated_at = _parse_datetime(args.visibility_evaluated_at)
    eligibility_manifest = None
    if args.eligibility_manifest:
        if not args.db_url:
            parser.error('--eligibility-manifest requires explicit --db-url')
        eligibility_manifest = json.loads(Path(args.eligibility_manifest).read_text(encoding='utf-8'))
        if not isinstance(eligibility_manifest, dict):
            parser.error('--eligibility-manifest must contain a JSON object')

    if args.db_url:
        if not args.start_date or not args.end_date:
            parser.error('--db-url requires --start-date and --end-date')
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session

        engine = create_engine(args.db_url)
        with Session(engine) as db:
            snapshot = load_practice_snapshot_from_db(
                db,
                _parse_datetime(args.start_date) or datetime.now(timezone.utc),
                _parse_datetime(args.end_date) or datetime.now(timezone.utc),
                as_of=as_of,
                visibility_evaluated_at=visibility_evaluated_at,
                eligibility_manifest=eligibility_manifest,
            )
    else:
        fixture_path = Path(args.fixtures)
        payload = json.loads(fixture_path.read_text(encoding='utf-8'))
        snapshot = build_practice_snapshot(payload, as_of=as_of)

    snapshot_data = snapshot.to_dict()
    markdown = render_practice_analytics_markdown(snapshot_data)
    if args.json_output:
        json_output_path = Path(args.json_output)
        json_output_path.parent.mkdir(parents=True, exist_ok=True)
        json_output_path.write_text(json.dumps(snapshot_data, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    if args.json_stdout:
        print(json.dumps(snapshot_data, ensure_ascii=False, indent=2, sort_keys=True))
    if args.stdout:
        print(markdown, end='')
        return 0

    repo_root = Path(__file__).resolve().parents[2]
    output_path = resolve_report_output_path(
        args.output,
        repo_root=repo_root,
        end_date=snapshot.as_of.date(),
        filename_stem='practice-analytics-report',
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown, encoding='utf-8')
    print(f'Wrote practice analytics report to {output_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
