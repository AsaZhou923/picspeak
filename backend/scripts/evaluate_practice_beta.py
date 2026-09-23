from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.goal_evaluation import INSUFFICIENT_INVALID, evaluate_beta_readiness


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Validate PicSpeak restricted Beta readiness evidence offline.')
    parser.add_argument('input', help='JSON file containing usability and readiness evidence.')
    parser.add_argument('--output', default=None, help='Optional JSON output file. Defaults to stdout.')
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        payload = json.loads(Path(args.input).read_text(encoding='utf-8'))
        if not isinstance(payload, dict):
            raise ValueError('JSON input must be an object')
        report = evaluate_beta_readiness(payload)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        report = {
            'schema_version': 1,
            'status': INSUFFICIENT_INVALID,
            'exit_code': 2,
            'beta_ready': False,
            'errors': [str(exc)],
            'evidence_gaps': [],
        }

    output = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output + '\n', encoding='utf-8')
    else:
        print(output)
    return int(report['exit_code'])


if __name__ == '__main__':
    sys.exit(main())
