from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from threading import Lock
from typing import Any, Callable, Iterator
from contextlib import contextmanager

from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.gallery_support import GALLERY_AUDIT_APPROVED  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.db.models import Photo, PhotoStatus, Review, ReviewStatus, ReviewTask, TaskStatus  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.services.ai import AIReviewError, openai_review_profile_for_mode, run_ai_review  # noqa: E402
from app.services.ai_prompts import SCORE_VERSION  # noqa: E402
from app.services.object_storage import get_object_read_url  # noqa: E402
from app.services.review_score_cache import canonical_score_cache_lease  # noqa: E402
from app.services.review_task_processor import _normalize_review_result_payload  # noqa: E402


SOURCE_SCORE_VERSION_V5 = 'score-v5-evidence-calibrated'
SOURCE_SCORE_VERSION_V7 = 'score-v7-canonical-quality'
SUPPORTED_SOURCE_SCORE_VERSIONS = {SOURCE_SCORE_VERSION_V5, SOURCE_SCORE_VERSION_V7}
TARGET_REVIEW_MODEL = 'gpt-6-sol'
REASSESSMENT_METADATA_KEY = 'version_reassessment'
REASSESSMENT_METADATA_VERSION = 1
_LOCK_NAMESPACE = 'picspeak-gallery-free-reassessment-v1'
_REVIEW_PUBLIC_ID_RE = re.compile(r'^rev_[A-Za-z0-9_-]+$')
_SUPPORTED_LOCALES = {'zh', 'en', 'ja'}
_MAX_WORKERS_MIN = 1
_MAX_WORKERS_MAX = 8

_BACKUP_FIELDS = (
    'schema_version',
    'result_json',
    'final_score',
    'model_name',
    'scorer_model_name',
    'writer_model_name',
    'input_tokens',
    'output_tokens',
    'cost_usd',
    'cost_rate_version',
    'latency_ms',
    'is_public',
    'favorite',
    'gallery_visible',
    'gallery_audit_status',
    'gallery_added_at',
    'gallery_rejected_reason',
    'tags_json',
    'note',
    'deleted_at',
    'task_id',
    'photo_id',
    'owner_user_id',
    'source_review_id',
    'mode',
    'status',
    'image_type',
)


@dataclass(frozen=True)
class ReassessmentCandidate:
    review_id: int
    review_public_id: str
    photo_id: int
    photo_public_id: str
    task_id: int
    task_public_id: str
    photo_bucket: str
    photo_object_key: str
    locale: str
    mode: str
    image_type: str
    original_digest: str
    original_score: float


def _lock_key() -> int:
    digest = hashlib.blake2b(_LOCK_NAMESPACE.encode('utf-8'), digest_size=8).digest()
    return int.from_bytes(digest, 'big', signed=False) & ((1 << 63) - 1)


@contextmanager
def _global_reassessment_lock(connection: Any) -> Iterator[None]:
    dialect = getattr(getattr(connection, 'dialect', None), 'name', None)
    if dialect != 'postgresql':
        yield
        return

    acquired = connection.execute(text('SELECT pg_try_advisory_lock(:lock_key)'), {'lock_key': _lock_key()}).scalar()
    if acquired is not True:
        raise RuntimeError('Another score-version reassessment run is already active.')
    commit = getattr(connection, 'commit', None)
    if callable(commit):
        commit()
    try:
        yield
    finally:
        connection.execute(text('SELECT pg_advisory_unlock(:lock_key)'), {'lock_key': _lock_key()})
        if callable(commit):
            commit()


def _stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)


def _digest_payload(payload: dict[str, Any]) -> str:
    return hashlib.sha256(_stable_json(payload).encode('utf-8')).hexdigest()


def _review_field_snapshot(review: Review) -> dict[str, Any]:
    return {field: getattr(review, field) for field in _BACKUP_FIELDS}


def _payload_score_version(review: Review) -> str:
    payload = review.result_json if isinstance(review.result_json, dict) else {}
    return str(payload.get('score_version') or '')


def _mode_value(value: Any) -> str:
    return str(value.value if hasattr(value, 'value') else value)


def _status_value(value: Any) -> str:
    return str(value.value if hasattr(value, 'value') else value)


def _locale_from_task(task: ReviewTask) -> str:
    payload = task.request_payload if isinstance(task.request_payload, dict) else {}
    locale = str(payload.get('locale') or '').strip()
    return locale if locale in _SUPPORTED_LOCALES else 'en'


def _analysis_type_from_task(task: ReviewTask) -> str:
    payload = task.request_payload if isinstance(task.request_payload, dict) else {}
    return str(payload.get('analysis_type') or 'single').strip() or 'single'


def _validate_source_score_version(source_score_version: str) -> str:
    source = str(source_score_version or '').strip()
    if source not in SUPPORTED_SOURCE_SCORE_VERSIONS:
        allowed = ', '.join(sorted(SUPPORTED_SOURCE_SCORE_VERSIONS))
        raise ValueError(f'Unsupported source score version {source_score_version!r}; allowed: {allowed}')
    if source == SCORE_VERSION:
        raise ValueError('Source score version already matches the current target score version.')
    return source


def _validate_target_runtime(review_model: str) -> None:
    if review_model != TARGET_REVIEW_MODEL:
        raise ValueError(f'Unsupported target review model {review_model!r}; expected {TARGET_REVIEW_MODEL!r}')
    if (
        settings.openai_score_model != 'gpt-6-sol'
        or settings.openai_review_model != 'gpt-6-sol'
        or settings.openai_score_reasoning_effort != 'low'
        or settings.openai_review_reasoning_effort != 'low'
        or settings.openai_pro_model != 'gpt-6.1-sol'
        or settings.openai_pro_reasoning_effort != 'high'
    ):
        raise RuntimeError(
            'Score-version reassessment requires Flash gpt-6-sol/low and Pro gpt-6.1-sol/high profile settings.'
        )


def _validate_result_payload_contract(result_payload: dict[str, Any], *, mode: str) -> None:
    profile = openai_review_profile_for_mode(mode)
    if (
        str(result_payload.get('score_version') or '') != SCORE_VERSION
        or str(result_payload.get('scorer_model_name') or '') != profile.scorer_model_name
        or str(result_payload.get('scorer_reasoning_effort') or '') != profile.scorer_reasoning_effort
        or str(result_payload.get('writer_model_name') or '') != profile.writer_model_name
        or str(result_payload.get('writer_reasoning_effort') or '') != profile.writer_reasoning_effort
    ):
        raise RuntimeError('AI response did not match the current GPT-6 mode profile contract.')


def _normalize_review_public_ids(review_ids: list[str] | tuple[str, ...] | None) -> list[str] | None:
    if review_ids is None:
        return None
    if not review_ids:
        raise ValueError('At least one review_id is required when review_ids is provided.')

    normalized: list[str] = []
    seen: set[str] = set()
    malformed: list[str] = []
    for raw_id in review_ids:
        if not isinstance(raw_id, str):
            malformed.append(str(raw_id))
            continue
        review_id = raw_id.strip()
        if not review_id or not _REVIEW_PUBLIC_ID_RE.fullmatch(review_id):
            malformed.append(raw_id)
            continue
        if review_id not in seen:
            normalized.append(review_id)
            seen.add(review_id)

    if malformed:
        raise ValueError(f'Malformed review_id values: {", ".join(repr(value) for value in malformed)}')
    return normalized


def _is_source_review(
    review: Review,
    photo: Photo,
    task: ReviewTask | None,
    *,
    source_score_version: str,
) -> bool:
    return (
        task is not None
        and review.deleted_at is None
        and _status_value(review.status) == ReviewStatus.SUCCEEDED.value
        and _status_value(task.status) == TaskStatus.SUCCEEDED.value
        and _status_value(photo.status) == PhotoStatus.READY.value
        and review.gallery_visible is True
        and str(review.gallery_audit_status or '') == GALLERY_AUDIT_APPROVED
        and _analysis_type_from_task(task) == 'single'
        and _payload_score_version(review) == source_score_version
    )


def _source_rows(
    db: Session,
    *,
    source_score_version: str,
    review_public_ids: list[str] | None = None,
) -> list[tuple[Review, Photo, ReviewTask]]:
    if review_public_ids == []:
        return []

    query = (
        db.query(Review, Photo, ReviewTask)
        .join(Photo, Photo.id == Review.photo_id)
        .join(ReviewTask, ReviewTask.id == Review.task_id)
        .filter(
            Review.deleted_at.is_(None),
            Review.status == ReviewStatus.SUCCEEDED,
            ReviewTask.status == TaskStatus.SUCCEEDED,
            Photo.status == PhotoStatus.READY,
            Review.gallery_visible == True,  # noqa: E712
            Review.gallery_audit_status == GALLERY_AUDIT_APPROVED,
            Review.result_json['score_version'].astext == source_score_version,
        )
    )
    if review_public_ids:
        query = query.filter(Review.public_id.in_(review_public_ids))

    rows = [
        row for row in query.order_by(Photo.id.asc(), Review.id.asc()).all()
        if _is_source_review(row[0], row[1], row[2], source_score_version=source_score_version)
    ]
    if not review_public_ids:
        return rows

    selected = set(review_public_ids)
    return [(review, photo, task) for review, photo, task in rows if review.public_id in selected]


def _candidate_from_row(review: Review, photo: Photo, task: ReviewTask) -> ReassessmentCandidate:
    snapshot = _review_field_snapshot(review)
    return ReassessmentCandidate(
        review_id=review.id,
        review_public_id=review.public_id,
        photo_id=photo.id,
        photo_public_id=photo.public_id,
        task_id=task.id,
        task_public_id=task.public_id,
        photo_bucket=photo.bucket,
        photo_object_key=photo.object_key,
        locale=_locale_from_task(task),
        mode=_mode_value(review.mode),
        image_type=review.image_type or 'default',
        original_digest=_digest_payload(snapshot),
        original_score=float(review.final_score),
    )


def discover_candidates(
    db: Session,
    *,
    source_score_version: str,
    review_ids: list[str] | tuple[str, ...] | None = None,
    limit: int | None = None,
) -> tuple[list[ReassessmentCandidate], list[str]]:
    source = _validate_source_score_version(source_score_version)
    selected_review_ids = _normalize_review_public_ids(review_ids)
    if source == SOURCE_SCORE_VERSION_V7 and selected_review_ids is None:
        raise ValueError('Reassessing v7 gallery reviews requires explicit review_ids.')
    rows = _source_rows(db, source_score_version=source, review_public_ids=selected_review_ids)
    if selected_review_ids is not None:
        matched = {review.public_id for review, _photo, _task in rows}
        unmatched = [review_id for review_id in selected_review_ids if review_id not in matched]
        if unmatched:
            raise ValueError(
                'Requested review_id values were not found in the eligible source-version review set: '
                + ', '.join(unmatched)
            )

    candidates = [_candidate_from_row(review, photo, task) for review, photo, task in rows]
    if limit is not None:
        candidates = candidates[:limit]
    return candidates, selected_review_ids or []


class RunJournal:
    def __init__(self, path: Path, *, run_id: str):
        self.path = path
        self.run_id = run_id
        self._lock = Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def append(self, record: dict[str, Any]) -> str:
        payload = {'run_id': self.run_id, **record}
        digest = _digest_payload(payload)
        payload['record_digest'] = digest
        with self._lock:
            with self.path.open('a', encoding='utf-8', newline='\n') as handle:
                handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str))
                handle.write('\n')
                handle.flush()
                os.fsync(handle.fileno())
        return digest


def _default_journal_path(run_id: str) -> Path:
    return BACKEND_ROOT.parent / '.local-backups' / 'score-version-reassessment' / f'{run_id}.jsonl'


def _default_report_path(run_id: str) -> Path:
    return BACKEND_ROOT.parent / '.local-backups' / 'score-version-reassessment' / f'{run_id}.report.json'


def _set_free_billing_info(result_payload: dict[str, Any], ai_response: Any) -> None:
    result_payload['billing_info'] = {
        'quota_charged': False,
        'reason': 'score_version_reassessment',
        'cost_rate_version': ai_response.cost_rate_version,
    }


def _attach_reassessment_metadata(
    result_payload: dict[str, Any],
    *,
    candidate: ReassessmentCandidate,
    source_score_version: str,
    target_score_version: str,
    run_id: str,
    original_digest: str,
    created_at: datetime,
) -> None:
    result_payload[REASSESSMENT_METADATA_KEY] = {
        'version': REASSESSMENT_METADATA_VERSION,
        'source_score_version': source_score_version,
        'target_score_version': target_score_version,
        'run_id': run_id,
        'review_id': candidate.review_id,
        'review_public_id': candidate.review_public_id,
        'photo_id': candidate.photo_id,
        'photo_public_id': candidate.photo_public_id,
        'task_id': candidate.task_id,
        'task_public_id': candidate.task_public_id,
        'original_digest': original_digest,
        'created_at': created_at.isoformat(),
    }


def _usage_payload(ai_response: Any) -> dict[str, Any]:
    return {
        'input_tokens': ai_response.input_tokens,
        'output_tokens': ai_response.output_tokens,
        'cost_usd': ai_response.cost_usd,
        'cost_rate_version': ai_response.cost_rate_version,
        'writer_input_tokens': getattr(ai_response, 'writer_input_tokens', None),
        'writer_output_tokens': getattr(ai_response, 'writer_output_tokens', None),
        'writer_cost_usd': getattr(ai_response, 'writer_cost_usd', None),
        'writer_cost_rate_version': getattr(ai_response, 'writer_cost_rate_version', None),
        'latency_ms': ai_response.latency_ms,
    }


def _recheck_row(db: Session, candidate: ReassessmentCandidate, *, source_score_version: str) -> tuple[Review, Photo, ReviewTask] | None:
    row = (
        db.query(Review, Photo, ReviewTask)
        .join(Photo, Photo.id == Review.photo_id)
        .join(ReviewTask, ReviewTask.id == Review.task_id)
        .filter(Review.id == candidate.review_id)
        .with_for_update(of=Review)
        .populate_existing()
        .one_or_none()
    )
    if row is None:
        return None
    review, photo, task = row
    if not _is_source_review(review, photo, task, source_score_version=source_score_version):
        return None
    if _digest_payload(_review_field_snapshot(review)) != candidate.original_digest:
        return None
    return review, photo, task


def _reassess_candidate(
    candidate: ReassessmentCandidate,
    *,
    session_factory: Callable[[], Session],
    source_score_version: str,
    review_model: str,
    journal: RunJournal,
    photo_lock: Lock,
) -> dict[str, Any]:
    db = session_factory()
    try:
        with photo_lock:
            row = (
                db.query(Review, Photo, ReviewTask)
                .join(Photo, Photo.id == Review.photo_id)
                .join(ReviewTask, ReviewTask.id == Review.task_id)
                .filter(Review.id == candidate.review_id)
                .one_or_none()
            )
            if row is None:
                return {'status': 'skipped', 'reason': 'source_missing', 'review_id': candidate.review_public_id}
            review, photo, task = row
            if not _is_source_review(review, photo, task, source_score_version=source_score_version):
                return {'status': 'skipped', 'reason': 'source_changed', 'review_id': candidate.review_public_id}
            if _digest_payload(_review_field_snapshot(review)) != candidate.original_digest:
                return {'status': 'skipped', 'reason': 'source_changed', 'review_id': candidate.review_public_id}

            profile = openai_review_profile_for_mode(candidate.mode)
            image_url = get_object_read_url(photo.object_key, bucket=photo.bucket)
            with canonical_score_cache_lease(
                db,
                photo=photo,
                image_type=candidate.image_type,
                scorer_model_name=profile.scorer_model_name,
                scorer_reasoning_effort=profile.scorer_reasoning_effort,
            ) as canonical_score:
                ai_response = run_ai_review(
                    candidate.mode,
                    image_url=image_url,
                    locale=candidate.locale,
                    exif_data=photo.exif_data or None,
                    image_type=candidate.image_type,
                    review_model=review_model,
                    canonical_score=canonical_score,
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
                scorer_reasoning_effort=getattr(ai_response.result, 'scorer_reasoning_effort', ''),
                writer_model_name=ai_response.writer_model_name,
                writer_model_version=ai_response.writer_model_version,
                writer_reasoning_effort=getattr(ai_response.result, 'writer_reasoning_effort', ''),
                score_prompt_version=ai_response.score_prompt_version,
                scorer_preprocess_version=ai_response.scorer_preprocess_version,
                score_cache_hit=ai_response.score_cache_hit,
            )
            _validate_result_payload_contract(result_payload, mode=candidate.mode)
            locked = _recheck_row(db, candidate, source_score_version=source_score_version)
            if locked is None:
                db.rollback()
                return {'status': 'skipped', 'reason': 'source_changed', 'review_id': candidate.review_public_id}
            review, photo, _task = locked
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
                    'task_id': candidate.task_id,
                    'task_public_id': candidate.task_public_id,
                    'timestamp': now.isoformat(),
                    'source_score_version': source_score_version,
                    'target_score_version': SCORE_VERSION,
                    'locale': candidate.locale,
                    'original_digest': original_digest,
                    'original_fields': original_fields,
                    'new_ai_usage': _usage_payload(ai_response),
                }
            )
            _set_free_billing_info(result_payload, ai_response)
            _attach_reassessment_metadata(
                result_payload,
                candidate=candidate,
                source_score_version=source_score_version,
                target_score_version=SCORE_VERSION,
                run_id=journal.run_id,
                original_digest=original_digest,
                created_at=now,
            )

            review.schema_version = result_payload['schema_version']
            review.result_json = result_payload
            review.final_score = Decimal(str(result_payload['final_score']))
            review.model_name = ai_response.model_name
            review.scorer_model_name = ai_response.scorer_model_name
            review.writer_model_name = ai_response.writer_model_name
            db.add(review)
            reassessed_item = {
                'status': 'reassessed',
                'review_id': candidate.review_public_id,
                'photo_id': candidate.photo_public_id,
                'old_score': candidate.original_score,
                'new_score': float(Decimal(str(result_payload['final_score']))),
                'locale': candidate.locale,
                'quota_charged': False,
            }
            db.commit()
            audit_warning: dict[str, Any] | None = None
            try:
                journal.append(
                    {
                        'event': 'after_update',
                        'review_id': candidate.review_id,
                        'review_public_id': candidate.review_public_id,
                        'photo_id': candidate.photo_id,
                        'photo_public_id': candidate.photo_public_id,
                        'timestamp': datetime.now(timezone.utc).isoformat(),
                        'source_score_version': source_score_version,
                        'target_score_version': SCORE_VERSION,
                        'new_score': reassessed_item['new_score'],
                        'quota_charged': False,
                    }
                )
            except Exception as exc:
                audit_warning = {'event': 'after_update', 'error_type': exc.__class__.__name__}
            item = dict(reassessed_item)
            if audit_warning is not None:
                item['audit_warning'] = audit_warning
            return item
    except AIReviewError as exc:
        db.rollback()
        return {
            'status': 'failed',
            'review_id': candidate.review_public_id,
            'stage': exc.stage or 'unknown',
            'error_type': exc.__class__.__name__,
        }
    except Exception as exc:
        db.rollback()
        return {
            'status': 'failed',
            'review_id': candidate.review_public_id,
            'stage': 'unexpected',
            'error_type': exc.__class__.__name__,
        }
    finally:
        db.close()


def _write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8', newline='\n') as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2, default=str)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())


def _same_resolved_path(left: Path, right: Path) -> bool:
    left_resolved = left.expanduser().resolve(strict=False)
    right_resolved = right.expanduser().resolve(strict=False)
    if os.path.normcase(str(left_resolved)) == os.path.normcase(str(right_resolved)):
        return True
    try:
        return left.exists() and right.exists() and left.samefile(right)
    except OSError:
        return False


def _progress_record(stats: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
    return {
        'total': stats['eligible_reviews'],
        'completed': stats['processed'] + stats['failed'] + stats['skipped'],
        'processed': stats['processed'],
        'failed': stats['failed'],
        'skipped': stats['skipped'],
        'current_models': stats['current_models'],
        'last_item': item,
    }


def reassess_score_version(
    *,
    source_score_version: str = SOURCE_SCORE_VERSION_V5,
    review_ids: list[str] | tuple[str, ...] | None = None,
    limit: int | None = None,
    dry_run: bool = True,
    max_workers: int = 4,
    journal_path: Path | None = None,
    report_path: Path | None = None,
    review_model: str = TARGET_REVIEW_MODEL,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
    session_factory: Callable[[], Session] | None = None,
    lock_connection: Any | None = None,
) -> dict[str, Any]:
    source = _validate_source_score_version(source_score_version)
    worker_count = max(_MAX_WORKERS_MIN, min(int(max_workers), _MAX_WORKERS_MAX))
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    resolved_journal_path = journal_path or _default_journal_path(run_id)
    resolved_report_path = report_path or _default_report_path(run_id)
    if _same_resolved_path(resolved_journal_path, resolved_report_path):
        raise ValueError('journal_path and report_path must be different files.')

    factory = session_factory or SessionLocal
    discovery_db = factory()
    try:
        candidates, selected_review_ids = discover_candidates(
            discovery_db,
            source_score_version=source,
            review_ids=review_ids,
            limit=limit,
        )
    finally:
        discovery_db.close()

    stats: dict[str, Any] = {
        'dry_run': dry_run,
        'run_id': run_id,
        'scope': 'approved_visible_gallery',
        'source_score_version': source,
        'target_score_version': SCORE_VERSION,
        'target_review_model': review_model,
        'eligible_reviews': len(candidates),
        'selected_review_ids': selected_review_ids,
        'selected_review_count': len(selected_review_ids),
        'max_workers': worker_count,
        'journal_path': str(resolved_journal_path),
        'report_path': str(resolved_report_path),
        'current_models': {
            'review_model': review_model,
            'score_version': SCORE_VERSION,
            'openai_score_model': settings.openai_score_model,
            'openai_score_reasoning_effort': settings.openai_score_reasoning_effort,
            'openai_review_model': settings.openai_review_model,
            'openai_review_reasoning_effort': settings.openai_review_reasoning_effort,
            'openai_pro_model': settings.openai_pro_model,
            'openai_pro_reasoning_effort': settings.openai_pro_reasoning_effort,
        },
        'items': [],
    }
    if dry_run:
        stats['pending'] = len(candidates)
        return stats

    _validate_target_runtime(review_model)
    stats['processed'] = 0
    stats['failed'] = 0
    stats['skipped'] = 0
    journal = RunJournal(resolved_journal_path, run_id=run_id)
    photo_locks = {candidate.photo_id: Lock() for candidate in candidates}

    lock_owner = None
    if lock_connection is None:
        lock_owner = engine.connect()
        lock_connection = lock_owner
    try:
        with _global_reassessment_lock(lock_connection):
            with ThreadPoolExecutor(max_workers=worker_count) as executor:
                futures = [
                    executor.submit(
                        _reassess_candidate,
                        candidate,
                        session_factory=factory,
                        source_score_version=source,
                        review_model=review_model,
                        journal=journal,
                        photo_lock=photo_locks[candidate.photo_id],
                    )
                    for candidate in candidates
                ]
                for future in as_completed(futures):
                    item = future.result()
                    stats['items'].append(item)
                    if item['status'] == 'reassessed':
                        stats['processed'] += 1
                    elif item['status'] == 'failed':
                        stats['failed'] += 1
                    else:
                        stats['skipped'] += 1
                    stats['pending'] = max(
                        0,
                        len(candidates) - stats['processed'] - stats['failed'] - stats['skipped'],
                    )
                    _write_report(resolved_report_path, stats)
                    if progress_callback is not None:
                        progress_callback(_progress_record(stats, item))
    finally:
        if lock_owner is not None:
            lock_owner.close()

    stats['pending'] = max(0, len(candidates) - stats['processed'] - stats['failed'] - stats['skipped'])
    _write_report(resolved_report_path, stats)
    return stats


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError('must be a positive integer')
    return parsed


def _worker_count(value: str) -> int:
    parsed = _positive_int(value)
    if parsed < _MAX_WORKERS_MIN or parsed > _MAX_WORKERS_MAX:
        raise argparse.ArgumentTypeError(f'must be between {_MAX_WORKERS_MIN} and {_MAX_WORKERS_MAX}')
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description='Reassess succeeded reviews from one historical score version.')
    parser.add_argument('--execute', action='store_true', help='Update matching reviews in place. Omit for a dry run.')
    parser.add_argument('--from-score-version', default=SOURCE_SCORE_VERSION_V5, choices=sorted(SUPPORTED_SOURCE_SCORE_VERSIONS))
    parser.add_argument('--limit', type=_positive_int, default=None, help='Maximum eligible reviews to process.')
    parser.add_argument('--review-id', action='append', default=None, help='Review public id to reassess. Repeat for multiple ids.')
    parser.add_argument('--max-workers', type=_worker_count, default=4, help='Concurrent workers, 1-8. Default: 4.')
    parser.add_argument('--journal-path', type=Path, default=None, help='Path for the fsynced JSONL backup journal.')
    parser.add_argument('--report-path', type=Path, default=None, help='Path for the final machine-readable report.')
    parser.add_argument('--json', action='store_true', help='Print the full machine-readable report.')
    args = parser.parse_args()

    def print_progress(record: dict[str, Any]) -> None:
        if args.json:
            return
        print(json.dumps({'progress': record}, ensure_ascii=False, sort_keys=True, default=str), flush=True)

    try:
        stats = reassess_score_version(
            source_score_version=args.from_score_version,
            review_ids=args.review_id,
            limit=args.limit,
            dry_run=not args.execute,
            max_workers=args.max_workers,
            journal_path=args.journal_path,
            report_path=args.report_path,
            progress_callback=print_progress if args.execute else None,
        )
    except ValueError as exc:
        parser.error(str(exc))

    if args.json:
        print(json.dumps(stats, ensure_ascii=False, indent=2, default=str))
    elif stats['dry_run']:
        print(
            'Dry run: '
            f"source_score_version={stats['source_score_version']} "
            f"target_score_version={stats['target_score_version']} "
            f"eligible_reviews={stats['eligible_reviews']} "
            f"pending={stats['pending']} "
            f"selected_review_count={stats['selected_review_count']} "
            f"selected_review_ids={','.join(stats['selected_review_ids']) or '-'} "
            f"journal_path={stats['journal_path']} "
            f"report_path={stats['report_path']}"
        )
    else:
        print(
            'Score-version reassessment complete: '
            f"processed={stats['processed']} "
            f"failed={stats['failed']} "
            f"skipped={stats['skipped']} "
            f"pending={stats['pending']} "
            f"quota_charged=false "
            f"journal_path={stats['journal_path']} "
            f"report_path={stats['report_path']}"
        )
    return 1 if stats.get('failed') else 0


if __name__ == '__main__':
    raise SystemExit(main())
