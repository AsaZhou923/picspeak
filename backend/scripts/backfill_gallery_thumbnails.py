from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.gallery import GALLERY_AUDIT_APPROVED, _ensure_gallery_thumbnail  # noqa: E402
from app.db.models import Photo, Review  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402


def _photo_has_gallery_thumbnail(photo: Photo) -> bool:
    client_meta = photo.client_meta if isinstance(photo.client_meta, dict) else {}
    value = client_meta.get('gallery_thumbnail_key')
    return isinstance(value, str) and bool(value.strip())


def backfill_gallery_thumbnails(db: Any, *, limit: int | None = None, dry_run: bool = False) -> dict[str, int]:
    rows = (
        db.query(Review, Photo)
        .join(Photo, Photo.id == Review.photo_id)
        .filter(
            Review.gallery_visible == True,  # noqa: E712
            Review.gallery_audit_status == GALLERY_AUDIT_APPROVED,
            Review.deleted_at.is_(None),
        )
        .order_by(Review.gallery_added_at.desc(), Review.id.desc())
        .all()
    )

    seen_photo_ids: set[int] = set()
    candidate_photos: list[Photo] = []
    for _, photo in rows:
        photo_id = int(photo.id)
        if photo_id in seen_photo_ids:
            continue
        seen_photo_ids.add(photo_id)
        if _photo_has_gallery_thumbnail(photo):
            continue
        candidate_photos.append(photo)
        if limit is not None and len(candidate_photos) >= limit:
            break

    if dry_run:
        return {
            'scanned_reviews': len(rows),
            'unique_photos': len(seen_photo_ids),
            'backfilled': 0,
            'skipped_existing': max(0, len(seen_photo_ids) - len(candidate_photos)),
            'pending': len(candidate_photos),
        }

    processed = 0
    for photo in candidate_photos:
        _ensure_gallery_thumbnail(photo)
        db.add(photo)
        processed += 1

    if processed:
        db.commit()

    return {
        'scanned_reviews': len(rows),
        'unique_photos': len(seen_photo_ids),
        'backfilled': processed,
        'skipped_existing': max(0, len(seen_photo_ids) - len(candidate_photos)),
        'pending': max(0, len(candidate_photos) - processed),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description='Backfill R2 gallery thumbnails for approved public gallery photos.')
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help='Maximum number of unique photos to process in this run.',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Only count how many approved gallery photos still need thumbnails.',
    )
    args = parser.parse_args()

    if args.limit is not None and args.limit <= 0:
        print('--limit must be a positive integer.', file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        stats = backfill_gallery_thumbnails(db, limit=args.limit, dry_run=args.dry_run)
    finally:
        db.close()

    if args.dry_run:
        print(
            'Dry run: '
            f"scanned_reviews={stats['scanned_reviews']} "
            f"unique_photos={stats['unique_photos']} "
            f"pending={stats['pending']} "
            f"skipped_existing={stats['skipped_existing']}"
        )
    else:
        print(
            'Backfill complete: '
            f"scanned_reviews={stats['scanned_reviews']} "
            f"unique_photos={stats['unique_photos']} "
            f"backfilled={stats['backfilled']} "
            f"skipped_existing={stats['skipped_existing']}"
        )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
