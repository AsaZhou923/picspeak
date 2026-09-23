from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime

from fastapi import status
from pydantic import ValidationError
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor
from app.core.errors import api_error
from app.db.models import Photo, PhotoStatus, PracticeAttempt, Review
from app.schemas import RetakeComparisonResult
from app.services.guard import review_history_cutoff
from app.services.retake_comparison import DIMENSION_KEYS


@dataclass(frozen=True)
class LegacyComparisonPage:
    rows: list[tuple[Review, Photo]]
    next_cursor: str | None
    limit: int


def _encode_cursor(created_at: datetime, review_id: int) -> str:
    payload = {'created_at': created_at.isoformat(), 'id': review_id}
    raw = json.dumps(payload, separators=(',', ':'), sort_keys=True).encode('utf-8')
    return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


def _decode_cursor(cursor: str) -> tuple[datetime, int]:
    try:
        padded = cursor + ('=' * (-len(cursor) % 4))
        payload = json.loads(base64.urlsafe_b64decode(padded.encode('ascii')).decode('utf-8'))
        created_at = datetime.fromisoformat(str(payload['created_at']))
        review_id = int(payload['id'])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PRACTICE_LEGACY_CURSOR_INVALID', 'Invalid legacy comparison cursor') from exc
    if created_at.tzinfo is None or review_id <= 0:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PRACTICE_LEGACY_CURSOR_INVALID', 'Invalid legacy comparison cursor')
    return created_at, review_id


def _has_valid_legacy_comparison(review: Review) -> bool:
    result_json = review.result_json if isinstance(review.result_json, dict) else {}
    comparison = result_json.get('comparison')
    if not isinstance(comparison, dict):
        return False
    for key in ('overall_before', 'overall_after', 'overall_delta'):
        value = comparison.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return False
    dimensions = comparison.get('dimensions')
    if not isinstance(dimensions, dict) or any(key not in dimensions for key in DIMENSION_KEYS):
        return False
    try:
        RetakeComparisonResult.model_validate(comparison)
    except ValidationError:
        return False
    return True


def list_legacy_retake_comparisons(
    db: Session,
    actor: CurrentActor,
    *,
    limit: int = 20,
    cursor: str | None = None,
) -> LegacyComparisonPage:
    """List pre-practice retake comparisons without loading the full review history."""

    limit = max(1, min(limit, 100))
    comparison = Review.result_json['comparison']
    top_goal_assessment = Review.result_json['goal_assessment']
    nested_goal_assessment = comparison['goal_assessment']
    query = (
        db.query(Review, Photo)
        .join(Photo, Photo.id == Review.photo_id)
        .outerjoin(PracticeAttempt, PracticeAttempt.review_id == Review.id)
        .filter(
            Review.owner_user_id == actor.user.id,
            Review.deleted_at.is_(None),
            Review.source_review_id.isnot(None),
            func.jsonb_typeof(comparison) == 'object',
            or_(
                ~Review.result_json.op('?')('goal_assessment'),
                func.jsonb_typeof(top_goal_assessment) == 'null',
            ),
            or_(
                ~comparison.op('?')('goal_assessment'),
                func.jsonb_typeof(nested_goal_assessment) == 'null',
            ),
            PracticeAttempt.id.is_(None),
            Photo.owner_user_id == actor.user.id,
            Photo.status == PhotoStatus.READY,
        )
    )
    cutoff = review_history_cutoff(actor.plan)
    if cutoff is not None:
        query = query.filter(Review.created_at >= cutoff)
    scan_cursor: tuple[datetime, int] | None = None
    if cursor:
        scan_cursor = _decode_cursor(cursor)

    valid_rows: list[tuple[Review, Photo]] = []
    fetch_size = min(max(limit * 2, 20), 100)
    while len(valid_rows) <= limit:
        page_query = query
        if scan_cursor is not None:
            cursor_created_at, cursor_id = scan_cursor
            page_query = page_query.filter(
                or_(
                    Review.created_at < cursor_created_at,
                    and_(Review.created_at == cursor_created_at, Review.id < cursor_id),
                )
            )
        rows = page_query.order_by(Review.created_at.desc(), Review.id.desc()).limit(fetch_size).all()
        if not rows:
            break
        for review, photo in rows:
            if _has_valid_legacy_comparison(review):
                valid_rows.append((review, photo))
                if len(valid_rows) > limit:
                    break
        if len(valid_rows) > limit:
            break
        last_review = rows[-1][0]
        scan_cursor = (last_review.created_at, last_review.id)

    page = valid_rows[:limit]
    next_cursor = _encode_cursor(page[-1][0].created_at, page[-1][0].id) if len(valid_rows) > limit and page else None
    return LegacyComparisonPage(rows=page, next_cursor=next_cursor, limit=limit)
