from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.practice_reconciliation import reconcile_practice_costs  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Offline PicSpeak practice cost reconciliation.')
    parser.add_argument('--input', required=True, help='JSON file with estimated_costs/estimates and billing_rows/bills arrays.')
    parser.add_argument('--output', default=None, help='Optional JSON output path.')
    parser.add_argument('--stdout', action='store_true', help='Print reconciliation JSON.')
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    payload = json.loads(Path(args.input).read_text(encoding='utf-8'))
    if not isinstance(payload, dict):
        raise SystemExit('--input must contain a JSON object')
    report = reconcile_practice_costs(payload)
    text = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    if args.stdout or not args.output:
        print(text, end='')
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text, encoding='utf-8')
        if not args.stdout:
            print(f'Wrote practice cost reconciliation report to {output_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
