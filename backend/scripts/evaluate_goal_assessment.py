from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.goal_evaluation import GoalEvaluationThresholds, INSUFFICIENT_INVALID, evaluate_goal_records


def _load_records(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding='utf-8')
    stripped = text.strip()
    if not stripped:
        raise ValueError('input is empty')
    if path.suffix.lower() == '.jsonl':
        records: list[dict[str, Any]] = []
        for line_number, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                continue
            record = json.loads(line)
            if not isinstance(record, dict):
                raise ValueError(f'line {line_number}: record must be an object')
            records.append(record)
        return {'records': records}
    payload = json.loads(text)
    if not isinstance(payload, dict):
        raise ValueError('JSON input must be an object with provenance and records')
    if not isinstance(payload.get('records'), list):
        raise ValueError('JSON input must include records')
    if not all(isinstance(record, dict) for record in payload['records']):
        raise ValueError('each record must be an object')
    return payload


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Evaluate PicSpeak goal assessment evidence offline.')
    parser.add_argument('input', help='JSON or JSONL file containing holdout goal assessment records.')
    parser.add_argument('--version', default=None, help='Evaluate only one model/prompt version.')
    parser.add_argument('--output', default=None, help='Optional JSON output file. Defaults to stdout.')
    parser.add_argument('--diagnostic', action='store_true', help='Mark this as diagnostic evidence; diagnostic runs cannot pass the formal gate.')
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    thresholds = GoalEvaluationThresholds(diagnostic=args.diagnostic)
    try:
        records = _load_records(Path(args.input))
        report = evaluate_goal_records(records, thresholds=thresholds, version_filter=args.version)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        report = {
            'schema_version': 1,
            'status': INSUFFICIENT_INVALID,
            'exit_code': 2,
            'formal_pass_eligible': False,
            'errors': [str(exc)],
            'insufficient_evidence': [],
            'versions': {},
            'coverage': {},
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
