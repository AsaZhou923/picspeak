"""Export minimal business evidence without app startup, writes or network AI calls."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.monetization_baseline import (
    build_monetization_baseline, load_monetization_baseline, summarize_local_configuration, utc,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--fixtures', help='Explicit offline JSON datasets; never treated as production evidence.')
    source.add_argument('--database-url', help='Explicit PostgreSQL URL; never read DATABASE_URL implicitly.')
    parser.add_argument('--start', required=True, help='Inclusive timestamp with timezone.')
    parser.add_argument('--end', required=True, help='Exclusive timestamp with timezone.')
    parser.add_argument('--as-of', help='Timestamp for evaluating current entitlement rows; defaults to current UTC, not the report window end.')
    parser.add_argument('--output', help='Raw JSON path in a task-specific directory under D:\\Temp; summarize as Markdown in the docs vault, then delete the raw export. Stdout if omitted.')
    parser.add_argument('--include-local-config', action='store_true', help='Add whitelisted local Settings defaults/loaded values, NOT production settings.')
    args = parser.parse_args(argv)
    try:
        start, end = utc(args.start), utc(args.end)
        as_of = utc(args.as_of) if args.as_of else None
        if start >= end:
            raise ValueError('Invalid window')
        if args.database_url:
            from sqlalchemy import create_engine, text

            engine = create_engine(args.database_url, connect_args={'connect_timeout': 10}, hide_parameters=True)
            try:
                with engine.connect().execution_options(isolation_level='REPEATABLE READ') as connection:
                    with connection.begin() as transaction:
                        connection.execute(text('SET TRANSACTION READ ONLY'))
                        connection.execute(text("SET LOCAL statement_timeout = '30s'"))
                        snapshot = load_monetization_baseline(connection, start=start, end=end, as_of=as_of)
                        transaction.rollback()
            finally:
                engine.dispose()
        else:
            data = json.loads(Path(args.fixtures).read_text(encoding='utf-8-sig'))
            snapshot = build_monetization_baseline(data, start=start, end=end, as_of=as_of)
            snapshot['source'] = 'offline fixture; NOT production evidence'
        if args.include_local_config:
            from app.core.config import settings

            snapshot['configuration'] = summarize_local_configuration(settings)
        rendered = json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n'
        if args.output:
            output = Path(args.output)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(rendered, encoding='utf-8')
        else:
            print(rendered, end='')
        return 0
    except Exception as exc:
        # Driver/validation exceptions may contain DSNs or row contents.
        print(f'Baseline export failed ({type(exc).__name__}); no baseline was generated.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
