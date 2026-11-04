"""Export aggregate billing reconciliation without any business writes."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.billing_reconciliation import load_billing_reconciliation


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database-url', required=True, help='Explicit PostgreSQL URL; never printed.')
    parser.add_argument('--start-date', required=True, type=date.fromisoformat)
    parser.add_argument('--end-date', required=True, type=date.fromisoformat, help='Inclusive UTC date.')
    parser.add_argument('--test-mode', action='store_true', help='Report test events separately from live events.')
    parser.add_argument('--output', help='Raw JSON path in a task-specific directory under D:\\Temp. Defaults to stdout. Summarize as Markdown in the docs vault, then delete the raw export.')
    args = parser.parse_args(argv)
    if args.end_date < args.start_date:
        parser.error('--end-date must be on or after --start-date')
    if make_url(args.database_url).get_backend_name() != 'postgresql':
        parser.error('A PostgreSQL database is required for enforced read-only transactions')
    repo_root = BACKEND_ROOT.parent
    output = Path(args.output).with_suffix('.json') if args.output else None
    if output is not None and output.resolve().is_relative_to(repo_root.resolve()):
        parser.error('Internal reports must be written outside the application repository')
    engine = create_engine(args.database_url, future=True, connect_args={'connect_timeout': 10})
    try:
        with Session(engine) as db:
            try:
                db.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'))
                report = load_billing_reconciliation(
                    db,
                    start=datetime.combine(args.start_date, time.min, timezone.utc),
                    end=datetime.combine(args.end_date + timedelta(days=1), time.min, timezone.utc),
                    test_mode=args.test_mode,
                )
            finally:
                db.rollback()
        rendered = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
        if output is None:
            print(rendered, end='')
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(rendered, encoding='utf-8')
            print(f'Wrote aggregate billing reconciliation to {output}')
    except Exception:
        # Driver errors may contain access-bearing connection strings. Keep them
        # out of the console and never substitute an empty success report.
        print('Billing reconciliation failed; no report was generated. Verify database access and schema.', file=sys.stderr)
        raise SystemExit(1) from None
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()
