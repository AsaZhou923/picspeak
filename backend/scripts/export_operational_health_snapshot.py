from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import SessionLocal
from app.services.operational_health import (
    build_operational_health_snapshot,
    load_operational_health_snapshot_from_db,
    render_operational_health_markdown,
)


def parse_args() -> argparse.Namespace:
    today = date.today()
    repo_root = Path(__file__).resolve().parents[2]

    parser = argparse.ArgumentParser(description='Export the PicSpeak daily operational health snapshot.')
    parser.add_argument('--start-date', default=today.isoformat(), help='Inclusive YYYY-MM-DD start date.')
    parser.add_argument('--end-date', default=today.isoformat(), help='Inclusive YYYY-MM-DD end date.')
    parser.add_argument(
        '--output',
        default=str(repo_root / 'docs' / 'analytics' / 'operational-health-snapshot.md'),
        help='Output markdown path.',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    start_date = date.fromisoformat(args.start_date)
    end_date = date.fromisoformat(args.end_date)
    output_path = Path(args.output)

    db = SessionLocal()
    try:
        try:
            snapshot = load_operational_health_snapshot_from_db(
                db,
                start_date=start_date,
                end_date=end_date,
            )
        except Exception as exc:
            snapshot = build_operational_health_snapshot(
                tasks=[],
                costs=[],
                ledger_entries=[],
                payment_events=[],
                gallery_audit_samples=[],
                start_date=start_date,
                end_date=end_date,
            )
            snapshot['generation_note'] = (
                '数据库不可用，当前文件为运营健康回退快照，不代表真实健康状态。'
                f' 原始错误：{exc.__class__.__name__}'
            )
    finally:
        db.close()

    markdown = render_operational_health_markdown(snapshot)
    if snapshot.get('generation_note'):
        markdown = f"> 注：{snapshot['generation_note']}\n\n" + markdown
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown, encoding='utf-8')
    print(f'Wrote operational health snapshot to {output_path}')


if __name__ == '__main__':
    main()
