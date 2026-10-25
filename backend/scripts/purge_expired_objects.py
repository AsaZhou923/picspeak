"""Report or remove stored objects that the retention policy no longer protects.

Dry-run by default: prints an aggregate JSON report and changes nothing. Every run
needs an explicit --database-url; there is no implicit connection. Deletion also
requires --execute, at least one --category and PICSPEAK_RETENTION_EXECUTE=1. A full candidate manifest (object keys) can be
written with --manifest to a path outside the repository.

Categories:
  photo_original      originals past their plan's retention (photo row becomes PURGED)
  deleted_generation  generated images the owner deleted more than 24 hours ago
  orphan_upload       user_* objects that no photo references (older than 24 hours)
  orphan_thumbnail    gallery thumbnails whose photo is missing or purged
  reference_input     generation reference inputs whose task finished over 24 hours ago
  orphan_generated    generated/user_* objects that no generated image references
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.object_retention import (  # noqa: E402
    ALL_CATEGORIES,
    INVENTORY_CATEGORIES,
    deleted_generation_candidates,
    iter_photo_decisions,
    purge_deleted_generation,
    purge_inventory_item,
    purge_photo_original,
    scan_inventory,
    stuck_purging_photo_ids,
)
from app.services.object_storage import get_object_storage_client  # noqa: E402

EXECUTE_ENV_FLAG = 'PICSPEAK_RETENTION_EXECUTE'


def _parse_date(value: str) -> datetime:
    return datetime.strptime(value, '%Y-%m-%d').replace(tzinfo=timezone.utc)


def _validate(args: argparse.Namespace) -> None:
    if args.manifest is not None:
        manifest = args.manifest.resolve()
        if manifest == REPO_ROOT or REPO_ROOT in manifest.parents:
            raise ValueError('--manifest must be outside the application repository')
    if not args.execute:
        return
    if not args.category:
        raise ValueError('--execute requires at least one --category')
    if os.getenv(EXECUTE_ENV_FLAG) != '1':
        raise ValueError(f'--execute requires {EXECUTE_ENV_FLAG}=1')


def run(args: argparse.Namespace, *, session_factory, storage, bucket: str, now: datetime) -> dict:
    categories = set(args.category or ALL_CATEGORIES)
    grace_until = args.grace_until
    report: dict = {
        'mode': 'execute' if args.execute else 'dry-run',
        'generated_at': now.isoformat(),
        'bucket': bucket,
        'grace_until': grace_until.date().isoformat() if grace_until else None,
        'categories': sorted(categories),
    }
    manifest: list[dict] = []
    executed: dict[str, Counter] = defaultdict(Counter)
    budget = args.max_delete

    def spend(outcome, category: str) -> None:
        nonlocal budget
        executed[category][outcome.status] += 1
        executed[category]['bytes_removed'] += outcome.bytes_removed
        if outcome.status in {'purged', 'already_missing'}:
            budget -= 1

    with session_factory() as db:
        if 'photo_original' in categories:
            purge_ids: list[int] = []
            by_reason: Counter = Counter()
            kept: Counter = Counter()
            purge_bytes = 0
            for photo, decision in iter_photo_decisions(db, now=now, grace_until=grace_until):
                if decision.purge:
                    purge_ids.append(photo.id)
                    by_reason[decision.reason] += 1
                    purge_bytes += int(photo.size_bytes or 0)
                    manifest.append({
                        'category': 'photo_original', 'reason': decision.reason, 'photo_id': photo.public_id,
                        'bucket': photo.bucket, 'key': photo.object_key, 'size': photo.size_bytes,
                        'expires_at': decision.expires_at.isoformat() if decision.expires_at else None,
                    })
                else:
                    kept[decision.reason] += 1
            stuck = stuck_purging_photo_ids(db, now=now)
            db.rollback()
            report['photo_original'] = {
                'purge_count': len(purge_ids), 'purge_bytes_estimate': purge_bytes,
                'purge_by_reason': dict(by_reason), 'kept_by_reason': dict(kept), 'stuck_purging': len(stuck),
            }
            if args.execute:
                for photo_id in stuck + purge_ids:
                    if budget <= 0:
                        break
                    spend(purge_photo_original(db, storage, photo_id, now=now, grace_until=grace_until), 'photo_original')

        if 'deleted_generation' in categories:
            images = deleted_generation_candidates(db, now=now)
            image_ids = [image.id for image in images]
            for image in images:
                manifest.append({
                    'category': 'deleted_generation', 'generated_image_id': image.public_id,
                    'bucket': image.object_bucket, 'key': image.object_key,
                })
            db.rollback()
            report['deleted_generation'] = {'purge_count': len(image_ids)}
            if args.execute:
                for image_id in image_ids:
                    if budget <= 0:
                        break
                    spend(purge_deleted_generation(db, storage, image_id, now=now), 'deleted_generation')

        wanted_inventory = categories & set(INVENTORY_CATEGORIES)
        if wanted_inventory:
            inventory = scan_inventory(db, storage, bucket, now=now)
            items = [item for item in inventory.candidates if item.category in wanted_inventory]
            counts: Counter = Counter()
            sizes: Counter = Counter()
            for item in items:
                counts[item.category] += 1
                sizes[item.category] += item.size
                manifest.append({
                    'category': item.category, 'bucket': bucket, 'key': item.key, 'size': item.size,
                    'etag': item.etag, 'last_modified': item.last_modified.isoformat(),
                })
            report['inventory'] = {
                'candidates': {category: {'count': counts[category], 'bytes': sizes[category]} for category in sorted(wanted_inventory)},
                'kept': dict(inventory.kept),
                'unknown_prefixes': dict(inventory.unknown_prefix),
            }
            if args.execute:
                for item in items:
                    if budget <= 0:
                        break
                    spend(purge_inventory_item(db, storage, bucket, item, now=now), item.category)

    if args.execute:
        report['executed'] = {category: dict(counter) for category, counter in executed.items()}
        report['max_delete_reached'] = budget <= 0
    if args.manifest is not None:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        with args.manifest.open('w', encoding='utf-8') as handle:
            for entry in manifest:
                handle.write(json.dumps(entry, ensure_ascii=False) + '\n')
        report['manifest_entries'] = len(manifest)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--database-url', required=True, help='Explicit database URL; no implicit connection')
    parser.add_argument('--category', action='append', choices=ALL_CATEGORIES, help='Limit to a category; repeatable')
    parser.add_argument('--grace-until', type=_parse_date, help='YYYY-MM-DD; policy-based photo removal never happens before this date')
    parser.add_argument('--max-delete', type=int, default=200, help='Stop after this many objects (default 200)')
    parser.add_argument('--manifest', type=Path, help='Write every candidate as JSON lines to this path (outside the repo)')
    parser.add_argument('--execute', action='store_true', help='Delete objects instead of reporting')
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        _validate(args)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    engine = create_engine(args.database_url, pool_pre_ping=True)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    report = run(
        args, session_factory=session_factory, storage=get_object_storage_client(),
        bucket=settings.object_bucket, now=datetime.now(timezone.utc),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
