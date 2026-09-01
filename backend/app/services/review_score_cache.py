from __future__ import annotations

import hashlib
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Photo, Review, ReviewStatus
from app.services.ai import (
    AIReviewError,
    CanonicalScore,
    build_cached_canonical_score,
    model_name_for_mode,
)
from app.services.ai_prompts import (
    PROMPT_VERSION,
    SCORE_PROMPT_VERSION,
    SCORE_VERSION,
    SCORER_PREPROCESS_VERSION,
)

_SCORE_CACHE_LOCK_NAMESPACE = 'picspeak-score-cache-v1'


def review_uses_current_score_contract(review: Review) -> bool:
    payload = dict(review.result_json or {})
    scorer_model_name = str(review.scorer_model_name or payload.get('scorer_model_name') or '')
    scorer_model_version = str(payload.get('scorer_model_version') or '')
    return (
        scorer_model_name == settings.openai_score_model
        and bool(scorer_model_version)
        and str(payload.get('score_prompt_version') or '') == SCORE_PROMPT_VERSION
        and str(payload.get('score_version') or '') == SCORE_VERSION
        and str(payload.get('scorer_preprocess_version') or '') == SCORER_PREPROCESS_VERSION
    )


def writer_contract_for_review_request(*, mode: str, review_model: str) -> str:
    if review_model in {'gpt-5.5', 'gpt-5.6-luna'}:
        writer_model_name = settings.openai_review_model
    else:
        writer_model_name = model_name_for_mode(mode)
    return writer_model_name


def review_uses_current_writer_contract(
    review: Review,
    *,
    writer_model_name: str,
) -> bool:
    payload = dict(review.result_json or {})
    review_writer_name = str(review.writer_model_name or payload.get('writer_model_name') or review.model_name or '')
    return (
        review_writer_name == writer_model_name
        and str(payload.get('prompt_version') or '') == PROMPT_VERSION
    )


def review_uses_current_full_review_contract(
    review: Review,
    *,
    writer_model_name: str,
) -> bool:
    return review_uses_current_score_contract(review) and review_uses_current_writer_contract(
        review,
        writer_model_name=writer_model_name,
    )


def _lookup_cached_score(db: Session, *, photo_id: int, image_type: str) -> CanonicalScore | None:
    candidates = (
        db.query(Review)
        .filter(
            Review.photo_id == photo_id,
            Review.image_type == image_type,
            Review.status == ReviewStatus.SUCCEEDED,
        )
        .order_by(Review.created_at.desc(), Review.id.desc())
        .limit(20)
        .all()
    )
    for review in candidates:
        if not review_uses_current_score_contract(review):
            continue
        payload = dict(review.result_json or {})
        raw_scores = payload.get('scores')
        scorer_model_version = str(payload.get('scorer_model_version') or review.scorer_model_name or '')
        if not isinstance(raw_scores, dict) or not scorer_model_version:
            continue
        try:
            return build_cached_canonical_score(
                raw_scores,
                scorer_model_name=settings.openai_score_model,
                scorer_model_version=scorer_model_version,
                final_score=review.final_score,
            )
        except (AIReviewError, KeyError, TypeError, ValueError):
            continue
    return None


def find_cached_canonical_score(
    db: Session,
    *,
    photo: Photo,
    image_type: str,
) -> CanonicalScore | None:
    normalized_image_type = image_type or 'default'
    return _lookup_cached_score(db, photo_id=photo.id, image_type=normalized_image_type)


def _database_dialect_name(db: Session) -> str | None:
    bind = getattr(db, 'bind', None) or getattr(db, 'get_bind', lambda: None)()
    dialect = getattr(bind, 'dialect', None)
    name = getattr(dialect, 'name', None)
    return str(name) if name else None


def _score_cache_lock_key(*, photo_id: int, image_type: str) -> int:
    digest = hashlib.blake2b(
        f'{_SCORE_CACHE_LOCK_NAMESPACE}:{photo_id}:{image_type}'.encode('utf-8'),
        digest_size=8,
    ).digest()
    return int.from_bytes(digest, 'big', signed=False) & ((1 << 63) - 1)


def _try_acquire_score_cache_lock(db: Session, *, photo_id: int, image_type: str) -> bool | None:
    if _database_dialect_name(db) != 'postgresql':
        return None
    lock_key = _score_cache_lock_key(photo_id=photo_id, image_type=image_type)
    acquired = db.execute(
        text('SELECT pg_try_advisory_xact_lock(:lock_key)'),
        {'lock_key': lock_key},
    ).scalar()
    return acquired is True


@contextmanager
def canonical_score_cache_lease(
    db: Session,
    *,
    photo: Photo,
    image_type: str,
) -> Iterator[CanonicalScore | None]:
    normalized_image_type = image_type or 'default'
    cached = find_cached_canonical_score(db, photo=photo, image_type=normalized_image_type)
    if cached is not None:
        yield cached
        return

    lock_acquired = _try_acquire_score_cache_lock(db, photo_id=photo.id, image_type=normalized_image_type)
    if lock_acquired is False:
        cached = find_cached_canonical_score(db, photo=photo, image_type=normalized_image_type)
        if cached is not None:
            yield cached
            return
        raise AIReviewError('Canonical scoring is already running for this photo')

    # PostgreSQL transaction-level advisory locks remain held until the caller
    # commits the completed Review (or rolls back on failure). That closes the
    # post-AI/pre-commit race without holding a Photo row lock across provider
    # calls. Non-PostgreSQL test/dev sessions keep the existing best-effort path.
    yield find_cached_canonical_score(db, photo=photo, image_type=normalized_image_type)
