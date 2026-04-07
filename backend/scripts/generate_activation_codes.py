from __future__ import annotations

import argparse
import secrets
import sys
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.billing_access import activation_code_hash, activation_code_prefix

ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def build_code() -> str:
    segments = [
        'PSCN',
        ''.join(secrets.choice(ALPHABET) for _ in range(4)),
        ''.join(secrets.choice(ALPHABET) for _ in range(4)),
        ''.join(secrets.choice(ALPHABET) for _ in range(4)),
    ]
    return '-'.join(segments)


def generate_unique_codes(count: int) -> list[str]:
    codes: list[str] = []
    seen: set[str] = set()
    while len(codes) < count:
        code = build_code()
        normalized_hash = activation_code_hash(code)
        if normalized_hash in seen:
            continue
        seen.add(normalized_hash)
        codes.append(code)
    return codes


def build_insert_sql(codes: list[str], *, batch_id: str, duration_days: int, source: str) -> str:
    values = []
    for code in codes:
        values.append(
            "(\n"
            f"    '{activation_code_hash(code)}',\n"
            f"    '{activation_code_prefix(code)}',\n"
            f"    {duration_days},\n"
            f"    '{source}',\n"
            f"    '{batch_id}',\n"
            "    '{}'::jsonb\n"
            ")"
        )

    joined_values = ',\n'.join(values)
    return (
        "insert into billing_activation_codes (\n"
        "    code_hash,\n"
        "    code_prefix,\n"
        "    duration_days,\n"
        "    source,\n"
        "    batch_id,\n"
        "    metadata_json\n"
        ") values\n"
        f"{joined_values}\n"
        "on conflict (code_hash) do nothing;\n"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Generate PicSpeak activation codes and SQL seed data.')
    parser.add_argument('--count', type=int, default=100, help='Number of codes to generate')
    parser.add_argument('--duration-days', type=int, default=30, help='Number of Pro days each code grants')
    parser.add_argument('--source', default='ifdian', help='Activation code source label')
    parser.add_argument('--batch-id', default='', help='Batch identifier stored with the codes')
    parser.add_argument('--codes-file', default='', help='Optional path to write the raw activation codes')
    parser.add_argument('--sql-file', default='', help='Optional path to write SQL insert statements')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.count <= 0:
        raise SystemExit('--count must be greater than 0')
    if args.duration_days <= 0:
        raise SystemExit('--duration-days must be greater than 0')

    batch_id = args.batch_id.strip() or f'ifdian-{datetime.utcnow():%Y%m%d-%H%M%S}'
    codes = generate_unique_codes(args.count)
    sql = build_insert_sql(
        codes,
        batch_id=batch_id,
        duration_days=args.duration_days,
        source=args.source.strip() or 'ifdian',
    )

    if args.codes_file:
        codes_path = Path(args.codes_file)
        codes_path.parent.mkdir(parents=True, exist_ok=True)
        codes_path.write_text('\n'.join(codes) + '\n', encoding='utf-8')

    if args.sql_file:
        sql_path = Path(args.sql_file)
        sql_path.parent.mkdir(parents=True, exist_ok=True)
        sql_path.write_text(sql, encoding='utf-8')

    print(f'Batch: {batch_id}')
    for code in codes:
        print(code)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
