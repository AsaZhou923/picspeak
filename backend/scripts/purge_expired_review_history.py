"""Preview, notify or clear expired private review history through explicit operator gates."""
from __future__ import annotations

import argparse
from collections import Counter
import json
import os
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.notification_events import database_now
from app.services.object_storage import get_object_storage_client
from app.services.review_history_retention import (
    POLICY_VERSION, iter_history_candidates, notice_candidates, purge_review_history,
    queue_retention_notice,
)

NOTICE_EXECUTE_ENV = 'PICSPEAK_HISTORY_NOTICE_EXECUTE'
PURGE_EXECUTE_ENV = 'PICSPEAK_HISTORY_PURGE_EXECUTE'


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database-url', required=True, help='Explicit PostgreSQL URL, never printed')
    parser.add_argument('--action', choices=('preview', 'notify', 'purge'), default='preview')
    parser.add_argument('--max-items', type=int, default=200, help='Maximum records examined per purge page, or notices queued')
    parser.add_argument('--after-review-id', type=int, default=0, help='Continue an aggregate preview or purge after this internal cursor')
    parser.add_argument('--execute', action='store_true', help='Perform the selected notify or purge action')
    return parser


def validate(args) -> None:
    if make_url(args.database_url).get_backend_name() != 'postgresql':
        raise ValueError('PostgreSQL is required')
    if not 1 <= args.max_items <= 1000 or args.after_review_id < 0:
        raise ValueError('max-items must be 1..1000 and the cursor must be nonnegative')
    if args.execute:
        if args.action == 'preview':
            raise ValueError('preview cannot execute writes')
        flag = NOTICE_EXECUTE_ENV if args.action == 'notify' else PURGE_EXECUTE_ENV
        if os.getenv(flag) != '1':
            raise ValueError(f'Execution requires {flag}=1')


def run(args, *, engine, storage=None) -> dict:
    report = {'policy_version': POLICY_VERSION, 'action': args.action,
              'mode': 'execute' if args.execute else 'dry-run'}
    # Every initial candidate scan uses an enforced read-only snapshot. Mutating
    # paths subsequently recheck each item in their own transaction and locks.
    with Session(engine, expire_on_commit=False) as db:
        db.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'))
        try:
            now = database_now(db)
            report['as_of'] = now.isoformat()
            report['transaction_read_only'] = db.execute(text('SHOW transaction_read_only')).scalar_one()
            if args.action == 'notify':
                users = notice_candidates(db, max_items=args.max_items)
                ids = [user.id for user in users]
                report['eligible_accounts'] = len(ids)
            else:
                candidates = list(iter_history_candidates(db, now=now, max_items=args.max_items,
                                                         after_id=args.after_review_id))
                ids = [review.id for review, _photo, decision in candidates if decision.purge]
                report['examined_reviews'] = len(candidates)
                report['eligible_reviews'] = len(ids)
                report['reasons'] = dict(Counter(decision.reason for _review, _photo, decision in candidates))
                report['next_review_cursor'] = max((review.id for review, _photo, _decision in candidates), default=args.after_review_id)
        finally:
            db.rollback()
    if not args.execute:
        return report
    outcomes = Counter()
    with Session(engine, expire_on_commit=False) as db:
        if args.action == 'notify':
            from app.db.models import User

            for user_id in ids:
                user = db.query(User).filter(User.id == user_id).with_for_update().populate_existing().first()
                if user is None:
                    db.rollback()
                    outcomes['skipped'] += 1
                    continue
                outcomes['queued' if queue_retention_notice(db, user) else 'already_queued_or_ineligible'] += 1
                db.commit()
        else:
            if storage is None:
                raise ValueError('Purge execution requires object storage')
            for review_id in ids:
                result = purge_review_history(db, storage, review_id, now=now)
                outcomes[result['status']] += 1
    report['outcomes'] = dict(outcomes)
    return report


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        validate(args)
    except Exception:
        print('Invalid history cleanup arguments or execution gate.', file=sys.stderr)
        return 2
    engine = create_engine(args.database_url, connect_args={'connect_timeout': 10}, hide_parameters=True)
    try:
        storage = get_object_storage_client() if args.execute and args.action == 'purge' else None
        report = run(args, engine=engine, storage=storage)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception:
        print('History operation failed. Verify access, schema and rollout gates.', file=sys.stderr)
        return 1
    finally:
        engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
