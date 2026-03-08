from __future__ import annotations

import argparse

from app.db.session import SessionLocal
from app.services.guest_cleanup import cleanup_stale_guest_users


def main() -> None:
    parser = argparse.ArgumentParser(description='Delete stale guest users without review history.')
    parser.add_argument('--dry-run', action='store_true', help='Only print how many guest users would be deleted.')
    args = parser.parse_args()

    db = SessionLocal()
    try:
        deleted_count = cleanup_stale_guest_users(db, dry_run=args.dry_run)
    finally:
        db.close()

    if args.dry_run:
        print(f'Dry run: {deleted_count} stale guest users would be deleted.')
    else:
        print(f'Deleted {deleted_count} stale guest users.')


if __name__ == '__main__':
    main()
