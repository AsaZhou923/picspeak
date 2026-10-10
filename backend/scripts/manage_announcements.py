"""Restricted operator CLI for announcement previews, publication, cancellation and status.

Preview is offline by default. Database mutations require --execute, --database-url
and PICSPEAK_ANNOUNCEMENT_EXECUTE=1. The persisted audit actor comes from the
database current_user, not from a caller-supplied flag.
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

from app.services.announcements import (
    announcement_status,
    cancel_announcement,
    draft_from_update_bundle,
    preview_announcement,
    publish_announcement,
)

EXECUTE_ENV_FLAG = 'PICSPEAK_ANNOUNCEMENT_EXECUTE'

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')


def _json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _load_spec(path: Path) -> dict:
    values = json.loads(path.read_text(encoding='utf-8'))
    allowed = {
        'idempotency_key',
        'publish_key',
        'content',
        'recipient_public_ids',
        'target_type',
        'target_public_id',
        'expires_at',
        'update_id',
        'correction_of',
        'audit_reason',
        'deployment_verified',
    }
    if not isinstance(values, dict) or set(values) - allowed:
        raise ValueError('Invalid publication fields')
    if values.get('expires_at'):
        expires_at = datetime.fromisoformat(values['expires_at'])
        if expires_at.tzinfo is None:
            raise ValueError('expires_at must include a timezone')
        values['expires_at'] = expires_at
    return values


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
    parser.add_argument('action', choices=['preview', 'publish', 'cancel', 'status', 'import-update'])
    parser.add_argument('--input', type=Path, help='JSON publication specification')
    parser.add_argument('--announcement-id', help='Announcement public ID for cancel/status')
    parser.add_argument('--update-id', help='Existing update bundle ID for import-update')
    parser.add_argument('--audit-reason', help='Required human-readable audit reason for cancel/import-update')
    parser.add_argument('--database-url', help='Explicit database URL; no implicit production connection')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()

    try:
        if args.action == 'import-update':
            if not args.update_id:
                parser.error('--update-id is required for import-update')
            if not args.audit_reason:
                parser.error('--audit-reason is required for import-update')
            print(json.dumps(draft_from_update_bundle(args.update_id, audit_reason=args.audit_reason), ensure_ascii=False, indent=2))
            return

        if args.action in {'preview', 'publish'}:
            if args.input is None:
                parser.error('--input is required')
            values = _load_spec(args.input)
            if args.action == 'preview':
                print(json.dumps(preview_announcement(**values), ensure_ascii=False, default=_json_default))
                return
            _require_execute(args)
            engine = create_engine(args.database_url, pool_pre_ping=True)
            try:
                with Session(engine) as db, db.begin():
                    announcement = publish_announcement(db, **values)
                    result = {
                        'announcement_id': announcement.public_id,
                        'status': announcement.status,
                        'content_fingerprint': announcement.content_fingerprint,
                        'created_by': announcement.created_by,
                    }
                print(json.dumps(result, ensure_ascii=False, default=_json_default))
            finally:
                engine.dispose()
            return

        if not args.announcement_id:
            parser.error('--announcement-id is required')
        _require_database(args)
        if args.action == 'cancel':
            if not args.audit_reason:
                parser.error('--audit-reason is required for cancel')
            _require_execute(args)
        engine = create_engine(args.database_url, pool_pre_ping=True)
        try:
            with Session(engine) as db:
                if args.action == 'cancel':
                    with db.begin():
                        announcement = cancel_announcement(db, args.announcement_id, audit_reason=args.audit_reason)
                        result = {'announcement_id': announcement.public_id, 'status': announcement.status}
                else:
                    result = announcement_status(db, args.announcement_id)
            print(json.dumps(result, ensure_ascii=False, default=_json_default))
        finally:
            engine.dispose()
    except ValueError as exc:
        parser.error(str(exc))


if __name__ == '__main__':
    main()
