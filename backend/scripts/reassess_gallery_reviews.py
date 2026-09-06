from __future__ import annotations

import argparse
import hashlib
import json
import sys
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import quote

from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.gallery_support import GALLERY_AUDIT_APPROVED  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.db.models import Photo, PhotoStatus, Review  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.services.ai import AIReviewError, run_ai_review  # noqa: E402
from app.services.review_score_cache import (  # noqa: E402
    canonical_score_cache_lease,
    review_uses_current_full_review_contract,
    writer_contract_for_review_request,
)
from app.services.review_task_processor import _normalize_review_result_payload  # noqa: E402


REASSESSMENT_METADATA_KEY = 'gallery_free_reassessment'
REASSESSMENT_VERSION = 1
_LOCK_NAMESPACE = 'picspeak-gallery-free-reassessment-v1'
_BACKUP_FIELDS = (
    'schema_version',
    'result_json',
    'final_score',
    'model_name',
    'scorer_model_name',
    'writer_model_name',
)


def _lock_key() -> int:
    digest = hashlib.blake2b(_LOCK_NAMESPACE.encode('utf-8'), digest_size=8).digest()
    return int.from_bytes(digest, 'big', signed=False) & ((1 << 63) - 1)


@contextmanager
def _gallery_reassessment_lock(connection: Any) -> Iterator[None]:
    dialect = getattr(getattr(connection, 'dialect', None), 'name', None)
    if dialect != 'postgresql':
        yield
        return

    acquired = connection.execute(text('SELECT pg_try_advisory_lock(:lock_key)'), {'lock_key': _lock_key()}).scalar()
    if acquired is not True:
        raise RuntimeError('Another gallery reassessment run is already active.')
    try:
        yield
    finally:
        connection.execute(text('SELECT pg_advisory_unlock(:lock_key)'), {'lock_key': _lock_key()})


def _current_gallery_rows(db: Any) -> list[tuple[Review, Photo]]:
    return (
        db.query(Review, Photo)
        .join(Photo, Photo.id == Review.photo_id)
        .filter(
            Review.deleted_at.is_(None),
            Review.gallery_visible == True,  # noqa: E712
            Review.gallery_audit_status == GALLERY_AUDIT_APPROVED,
            Photo.status == PhotoStatus.READY,
        )
        .order_by(Review.gallery_added_at.asc(), Review.id.asc())
        .all()
    )


def _stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)


def _digest_payload(payload: dict[str, Any]) -> str:
    return hashlib.sha256(_stable_json(payload).encode('utf-8')).hexdigest()


def _review_field_snapshot(review: Review) -> dict[str, Any]:
    return {field: getattr(review, field) for field in _BACKUP_FIELDS}


def _set_free_billing_info(result_payload: dict[str, Any], ai_response: Any) -> None:
    result_payload['billing_info'] = {
        'quota_charged': False,
        'reason': 'gallery_free_reassessment',
        'cost_rate_version': ai_response.cost_rate_version,
    }


def _attach_reassessment_metadata(
    result_payload: dict[str, Any],
    *,
    review: Review,
    run_id: str,
    original_digest: str,
    created_at: datetime,
) -> None:
    result_payload[REASSESSMENT_METADATA_KEY] = {
        'version': REASSESSMENT_VERSION,
        'run_id': run_id,
        'review_id': review.id,
        'review_public_id': review.public_id,
        'original_digest': original_digest,
        'created_at': created_at.isoformat(),
    }


class RunJournal:
    def __init__(self, path: Path, *, run_id: str):
        self.path = path
        self.run_id = run_id
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def append(self, record: dict[str, Any]) -> str:
        payload = {'run_id': self.run_id, **record}
        digest = _digest_payload(payload)
        payload['record_digest'] = digest
        with self.path.open('a', encoding='utf-8', newline='\n') as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str))
            handle.write('\n')
            handle.flush()
            if handle.fileno() >= 0:
                import os

                os.fsync(handle.fileno())
        return digest


def _default_journal_path(run_id: str) -> Path:
    return BACKEND_ROOT.parent / '.local-backups' / 'gallery-free-reassessment' / f'{run_id}.jsonl'


def _reassess_one(
    db: Any,
    *,
    review: Review,
    photo: Photo,
    locale: str,
    review_model: str,
    journal: RunJournal,
) -> dict[str, Any]:
    image_url = f'{settings.object_base_url.rstrip("/")}/{quote(photo.object_key)}'
    with canonical_score_cache_lease(db, photo=photo, image_type=review.image_type or 'default') as canonical_score:
        ai_response = run_ai_review(
            review.mode.value if hasattr(review.mode, 'value') else str(review.mode),
            image_url=image_url,
            locale=locale,
            exif_data=photo.exif_data or None,
            image_type=review.image_type or 'default',
            review_model=review_model,
            canonical_score=canonical_score,
        )

    now = datetime.now(timezone.utc)
    original_fields = _review_field_snapshot(review)
    original_digest = _digest_payload(original_fields)
    journal.append(
        {
            'event': 'before_update',
            'review_id': review.id,
            'review_public_id': review.public_id,
            'photo_id': photo.id,
            'photo_public_id': photo.public_id,
            'timestamp': now.isoformat(),
            'original_digest': original_digest,
            'original_fields': original_fields,
            'new_ai_usage': {
                'input_tokens': ai_response.input_tokens,
                'output_tokens': ai_response.output_tokens,
                'cost_usd': ai_response.cost_usd,
                'cost_rate_version': ai_response.cost_rate_version,
                'latency_ms': ai_response.latency_ms,
            },
        }
    )

    result_payload = _normalize_review_result_payload(
        ai_response.result.model_dump(),
        final_score=ai_response.result.final_score,
        prompt_version=ai_response.prompt_version,
        model_name=ai_response.model_name,
        model_version=ai_response.model_version,
        exif_info=photo.exif_data or None,
        scorer_model_name=ai_response.scorer_model_name,
        scorer_model_version=ai_response.scorer_model_version,
        writer_model_name=ai_response.writer_model_name,
        writer_model_version=ai_response.writer_model_version,
        score_prompt_version=ai_response.score_prompt_version,
        scorer_preprocess_version=ai_response.scorer_preprocess_version,
        score_cache_hit=ai_response.score_cache_hit,
    )
    _set_free_billing_info(result_payload, ai_response)
    _attach_reassessment_metadata(result_payload, review=review, run_id=journal.run_id, original_digest=original_digest, created_at=now)

    review.schema_version = result_payload['schema_version']
    review.result_json = result_payload
    review.final_score = Decimal(str(result_payload['final_score']))
    review.model_name = ai_response.model_name
    review.scorer_model_name = ai_response.scorer_model_name
    review.writer_model_name = ai_response.writer_model_name
    db.add(review)
    db.commit()

    return {
        'status': 'reassessed',
        'review_id': review.public_id,
        'old_score': float(original_fields['final_score']),
        'new_score': float(review.final_score),
        'original_digest': original_digest,
        'quota_charged': False,
    }


def reassess_gallery_reviews(
    db: Any,
    *,
    locale: str = 'zh',
    review_model: str = 'qwen',
    limit: int | None = None,
    dry_run: bool = True,
    journal_path: Path | None = None,
    lock_connection: Any | None = None,
) -> dict[str, Any]:
    writer_model_name = writer_contract_for_review_request(mode='pro', review_model=review_model)
    rows = _current_gallery_rows(db)
    candidates: list[tuple[Review, Photo]] = []
    skipped_current = 0
    skipped_marker = 0
    for review, photo in rows:
        mode = review.mode.value if hasattr(review.mode, 'value') else str(review.mode)
        expected_writer = writer_contract_for_review_request(mode=mode, review_model=review_model)
        metadata = dict(review.result_json or {}).get(REASSESSMENT_METADATA_KEY)
        if isinstance(metadata, dict) and metadata.get('version') == REASSESSMENT_VERSION:
            skipped_marker += 1
            if review_uses_current_full_review_contract(review, writer_model_name=expected_writer):
                skipped_current += 1
                continue
            # Marker exists but the current contract moved forward; reassess again.
        elif review_uses_current_full_review_contract(review, writer_model_name=expected_writer):
            skipped_current += 1
            continue
        candidates.append((review, photo))
        if limit is not None and len(candidates) >= limit:
            break

    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    resolved_journal_path = journal_path or _default_journal_path(run_id)
    stats: dict[str, Any] = {
        'dry_run': dry_run,
        'scanned_gallery_reviews': len(rows),
        'eligible_reviews': len(candidates),
        'skipped_current_contract': skipped_current,
        'skipped_reassessment_marker': skipped_marker,
        'review_model': review_model,
        'writer_model_name': writer_model_name,
        'journal_path': str(resolved_journal_path),
        'items': [],
    }
    if dry_run:
        stats['pending'] = len(candidates)
        return stats

    processed = 0
    failed = 0
    journal = RunJournal(resolved_journal_path, run_id=run_id)
    lock_target = lock_connection or db.connection()
    with _gallery_reassessment_lock(lock_target):
        for source_review, photo in candidates:
            try:
                item = _reassess_one(
                    db,
                    review=source_review,
                    photo=photo,
                    locale=locale,
                    review_model=review_model,
                    journal=journal,
                )
                processed += 1
            except AIReviewError as exc:
                db.rollback()
                failed += 1
                item = {
                    'status': 'failed',
                    'source_review_id': source_review.public_id,
                    'error': str(exc),
                    'stage': exc.stage,
                }
            stats['items'].append(item)
    stats['processed'] = processed
    stats['failed'] = failed
    stats['pending'] = max(0, len(candidates) - processed - failed)
    return stats


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError('must be a positive integer')
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description='Free reassessment for approved public gallery reviews.')
    parser.add_argument('--execute', action='store_true', help='Update gallery critiques in place without charging user quota.')
    parser.add_argument('--limit', type=_positive_int, default=None, help='Maximum gallery reviews to process.')
    parser.add_argument('--locale', choices=['zh', 'en', 'ja'], default='zh')
    parser.add_argument('--review-model', default='qwen', choices=['qwen', 'gpt-5.5', 'gpt-5.6-luna'])
    parser.add_argument('--journal-path', type=Path, default=None, help='Path for the fsynced JSONL backup journal.')
    parser.add_argument('--json', action='store_true', help='Print the full machine-readable report.')
    args = parser.parse_args()

    if args.execute:
        connection = engine.connect()
        session_factory = sessionmaker(bind=connection, autoflush=False, autocommit=False)
        db: Session = session_factory()
        try:
            stats = reassess_gallery_reviews(
                db,
                locale=args.locale,
                review_model=args.review_model,
                limit=args.limit,
                dry_run=False,
                journal_path=args.journal_path,
                lock_connection=connection,
            )
        finally:
            db.close()
            connection.close()
    else:
        db = SessionLocal()
        try:
            stats = reassess_gallery_reviews(
                db,
                locale=args.locale,
                review_model=args.review_model,
                limit=args.limit,
                dry_run=True,
                journal_path=args.journal_path,
            )
        finally:
            db.close()

    if args.json:
        print(json.dumps(stats, ensure_ascii=False, indent=2, default=str))
    elif stats['dry_run']:
        print(
            'Dry run: '
            f"scanned_gallery_reviews={stats['scanned_gallery_reviews']} "
            f"eligible_reviews={stats['eligible_reviews']} "
            f"pending={stats['pending']} "
            f"skipped_current_contract={stats['skipped_current_contract']} "
            f"journal_path={stats['journal_path']}"
        )
    else:
        print(
            'Free gallery reassessment complete: '
            f"processed={stats['processed']} "
            f"failed={stats['failed']} "
            f"pending={stats['pending']} "
            f"quota_charged=false"
        )
    return 1 if stats.get('failed') else 0


if __name__ == '__main__':
    raise SystemExit(main())
