"""Restricted operator CLI for retrying existing failed notification events.

Writes require --execute, an explicit --database-url, and
PICSPEAK_NOTIFICATION_EVENT_RETRY=1. This replays existing events only; it does
not require event-capture authorization and does not create new outbox events.
Pause notification consumers before executing a retry so the operator-owned lock
and audit update are easy to reason about.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.services.notification_maintenance import notification_event_status, retry_failed_notification_event

EXECUTE_ENV_FLAG = 'PICSPEAK_NOTIFICATION_EVENT_RETRY'

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')


def _json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _require_database(args) -> None:
    if not args.database_url:
        raise ValueError(f'{args.action} requires an explicit --database-url')


def _require_execute(args) -> None:
    _require_database(args)
    if not args.execute:
        raise ValueError(f'{args.action} requires --execute')
    if os.getenv(EXECUTE_ENV_FLAG) != '1':
        raise ValueError(f'{args.action} requires {EXECUTE_ENV_FLAG}=1')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status', 'retry'])
    parser.add_argument('--event-id', help='NotificationEvent public ID')
    parser.add_argument('--audit-reason', help='Required human-readable retry reason')
    parser.add_argument('--database-url', help='Explicit database URL; no implicit production connection')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()

    try:
        _require_database(args)
        if args.action == 'retry':
            if not args.event_id:
                parser.error('--event-id is required for retry')
            if not args.audit_reason:
                parser.error('--audit-reason is required for retry')
        engine = create_engine(args.database_url, pool_pre_ping=True)
        try:
            with Session(engine) as db:
                if args.action == 'status':
                    result = notification_event_status(db, args.event_id)
                else:
                    if args.execute:
                        _require_execute(args)
                        with db.begin():
                            result = retry_failed_notification_event(
                                db,
                                args.event_id,
                                audit_reason=args.audit_reason,
                                execute=True,
                            )
                    else:
                        result = retry_failed_notification_event(
                            db,
                            args.event_id,
                            audit_reason=args.audit_reason,
                            execute=False,
                        )
            print(json.dumps(result, ensure_ascii=False, default=_json_default))
        finally:
            engine.dispose()
    except ValueError as exc:
        parser.error(str(exc))


if __name__ == '__main__':
    main()
