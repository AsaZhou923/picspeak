from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import Request, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor
from app.api.routers.gallery import GALLERY_AUDIT_NONE, GALLERY_AUDIT_VALUES
from app.api.routers.photos import (
    PHOTO_THUMBNAIL_SIZE,
    _build_photo_proxy_url,
    _build_storage_photo_url,
)
from app.core.errors import api_error
from app.db.models import Photo, Review, ReviewMode, User, UserPlan
from app.schemas import (
    REVIEW_SCHEMA_VERSION,
    ReviewCreateRequest,
    ReviewExportResponse,
    ReviewHistoryItem,
    ReviewMetaResponse,
)
from app.services.guard import guest_usage_snapshot, review_history_cutoff, user_usage_snapshot

REVIEW_TAG_LIMIT = 8
REVIEW_TAG_MAX_LENGTH = 32
REVIEW_NOTE_MAX_LENGTH = 1000


def _default_visual_analysis_payload() -> dict[str, Any]:
    return {
        'composition_guides': {
            'subject_region': None,
            'horizon_line': None,
            'leading_lines': [],
            'suggested_crop': None,
        }
    }


def _default_tonal_analysis_payload() -> dict[str, Any]:
    return {
        'brightness': None,
        'contrast': None,
        'color_balance': None,
        'saturation': None,
    }


def _default_review_scores() -> dict[str, int]:
    return {
        'composition': 0,
        'lighting': 0,
        'color': 0,
        'impact': 0,
        'technical': 0,
    }


def _coerce_review_scores(raw_scores: Any) -> dict[str, int]:
    normalized = _default_review_scores()
    if not isinstance(raw_scores, dict):
        return normalized

    for key in normalized:
        value = raw_scores.get(key)
        if value is None and key == 'impact':
            value = raw_scores.get('story')
        try:
            score = int(value)
        except (TypeError, ValueError):
            continue
        normalized[key] = max(0, min(score, 10))
    return normalized


def _build_review_extensions(raw_payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    visual_analysis = raw_payload.get('visual_analysis')
    exif_info = raw_payload.get('exif_info')
    share_info = raw_payload.get('share_info')
    tonal_analysis = raw_payload.get('tonal_analysis')
    issue_marks = raw_payload.get('issue_marks')
    billing_info = raw_payload.get('billing_info')
    resolved_visual = visual_analysis if isinstance(visual_analysis, dict) else {}
    resolved_visual.setdefault('composition_guides', _default_visual_analysis_payload()['composition_guides'])
    return (
        resolved_visual,
        exif_info if isinstance(exif_info, dict) else {},
        share_info if isinstance(share_info, dict) else {},
        tonal_analysis if isinstance(tonal_analysis, dict) else _default_tonal_analysis_payload(),
        issue_marks if isinstance(issue_marks, list) else [],
        billing_info if isinstance(billing_info, dict) else {},
    )


def _normalize_review_tags(raw_tags: list[str] | None) -> list[str]:
    if not raw_tags:
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for raw_tag in raw_tags:
        if not isinstance(raw_tag, str):
            continue
        tag = re.sub(r'\s+', ' ', raw_tag).strip()
        if not tag:
            continue
        tag = tag[:REVIEW_TAG_MAX_LENGTH]
        dedupe_key = tag.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalized.append(tag)
        if len(normalized) >= REVIEW_TAG_LIMIT:
            break
    return normalized


def _normalize_review_note(raw_note: str | None) -> str | None:
    if raw_note is None:
        return None
    note = re.sub(r'\s+', ' ', str(raw_note)).strip()
    if not note:
        return None
    return note[:REVIEW_NOTE_MAX_LENGTH]


def _review_image_type(review: Review) -> str:
    raw_payload = dict(review.result_json or {})
    return str(review.image_type or raw_payload.get('image_type') or 'default')


def _review_model_version(review: Review) -> str:
    raw_payload = dict(review.result_json or {})
    return str(raw_payload.get('model_version') or review.model_name or '')


def _review_gallery_audit_status(review: Review) -> str:
    value = str(review.gallery_audit_status or '').strip().lower()
    return value if value in GALLERY_AUDIT_VALUES else GALLERY_AUDIT_NONE


def _review_meta_payload(review: Review) -> ReviewMetaResponse:
    return ReviewMetaResponse(
        review_id=review.public_id,
        favorite=bool(review.favorite),
        gallery_visible=bool(review.gallery_visible),
        gallery_audit_status=_review_gallery_audit_status(review),
        gallery_added_at=review.gallery_added_at,
        gallery_rejected_reason=review.gallery_rejected_reason,
        tags=_normalize_review_tags(review.tags_json if isinstance(review.tags_json, list) else []),
        note=review.note,
    )


def _review_source_public_id(db: Session, review: Review) -> str | None:
    if not review.source_review_id:
        return None
    source_review = db.query(Review).filter(Review.id == review.source_review_id).first()
    return source_review.public_id if source_review else None


def _review_share_info(request: Request, review: Review, *, include_token: bool) -> dict[str, Any]:
    if not review.is_public or not review.share_token:
        return {}

    payload: dict[str, Any] = {
        'enabled': True,
        'share_url': str(request.url_for('get_public_review', share_token=review.share_token)),
    }
    if include_token:
        payload['share_token'] = review.share_token
    return payload


def _review_result_payload(
    result_json: dict | None,
    final_score: float | None,
    *,
    prompt_version: str | None = None,
    model_name: str | None = None,
    model_version: str | None = None,
    exif_info: dict[str, Any] | None = None,
    share_info_override: dict[str, Any] | None = None,
) -> dict:
    raw_payload = dict(result_json or {})
    scores = _coerce_review_scores(raw_payload.get('scores'))
    visual_analysis, stored_exif_info, share_info, tonal_analysis, issue_marks, billing_info = _build_review_extensions(raw_payload)

    resolved_final_score = final_score
    if resolved_final_score is None:
        payload_score = raw_payload.get('final_score')
        try:
            resolved_final_score = float(payload_score)
        except (TypeError, ValueError):
            resolved_final_score = round(sum(scores.values()) / len(scores), 1)

    return {
        'schema_version': str(raw_payload.get('schema_version') or REVIEW_SCHEMA_VERSION),
        'prompt_version': str(raw_payload.get('prompt_version') or prompt_version or ''),
        'score_version': str(raw_payload.get('score_version') or 'legacy'),
        'model_name': str(raw_payload.get('model_name') or model_name or ''),
        'model_version': str(raw_payload.get('model_version') or model_version or ''),
        'scores': scores,
        'final_score': float(resolved_final_score),
        'advantage': str(raw_payload.get('advantage') or ''),
        'critique': str(raw_payload.get('critique') or ''),
        'suggestions': str(raw_payload.get('suggestions') or ''),
        'image_type': str(raw_payload.get('image_type') or 'default'),
        'visual_analysis': visual_analysis,
        'tonal_analysis': tonal_analysis,
        'issue_marks': issue_marks,
        'billing_info': billing_info,
        'exif_info': exif_info if isinstance(exif_info, dict) else stored_exif_info,
        'share_info': share_info_override if isinstance(share_info_override, dict) else share_info,
    }


def _find_review_owned(db: Session, review_public_id: str, owner_user_id: int, *, include_deleted: bool = False) -> Review:
    query = db.query(Review).filter(Review.public_id == review_public_id, Review.owner_user_id == owner_user_id)
    if not include_deleted:
        query = query.filter(Review.deleted_at.is_(None))
    review = query.first()
    if review is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    return review


def _resolve_source_review(db: Session, actor: CurrentActor, payload: ReviewCreateRequest, photo: Photo) -> Review | None:
    if not payload.source_review_id:
        return None

    source_review = _find_review_owned(db, payload.source_review_id, actor.user.id)
    if source_review.photo_id != photo.id:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'REANALYZE_PHOTO_MISMATCH', 'Source review does not belong to this photo')
    return source_review


def _apply_review_history_visibility(query, plan: UserPlan):
    cutoff = review_history_cutoff(plan)
    if cutoff is not None:
        query = query.filter(Review.created_at >= cutoff)
    return query


def _apply_review_history_filters(
    query,
    *,
    date_field=None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    min_score: float | None = None,
    max_score: float | None = None,
    image_type: str | None = None,
    favorite_only: bool = False,
):
    active_date_field = Review.created_at if date_field is None else date_field
    query = query.filter(Review.deleted_at.is_(None))
    if created_from is not None:
        query = query.filter(active_date_field >= created_from)
    if created_to is not None:
        query = query.filter(active_date_field <= created_to)
    if min_score is not None:
        query = query.filter(Review.final_score >= min_score)
    if max_score is not None:
        query = query.filter(Review.final_score <= max_score)
    if image_type:
        query = query.filter(Review.image_type == image_type)
    if favorite_only:
        query = query.filter(Review.favorite == True)  # noqa: E712
    return query


def _review_history_item(request: Request, review: Review, photo: Photo, owner_public_id: str, source_review_id: str | None) -> ReviewHistoryItem:
    result_payload = dict(review.result_json or {})
    return ReviewHistoryItem(
        review_id=review.public_id,
        photo_id=photo.public_id,
        photo_url=_build_photo_proxy_url(request, photo.public_id, owner_public_id),
        photo_thumbnail_url=_build_photo_proxy_url(request, photo.public_id, owner_public_id, size=PHOTO_THUMBNAIL_SIZE),
        mode=review.mode.value,
        status=review.status.value,
        image_type=_review_image_type(review),
        source_review_id=source_review_id,
        final_score=float(review.final_score),
        scores=_coerce_review_scores(result_payload.get('scores')),
        model_name=str(review.model_name or ''),
        model_version=_review_model_version(review),
        favorite=bool(review.favorite),
        gallery_visible=bool(review.gallery_visible),
        gallery_audit_status=_review_gallery_audit_status(review),
        gallery_added_at=review.gallery_added_at,
        tags=_normalize_review_tags(review.tags_json if isinstance(review.tags_json, list) else []),
        note=review.note,
        is_shared=bool(review.is_public and review.share_token),
        created_at=review.created_at,
    )


def _build_review_export_payload(
    *,
    review: Review,
    photo_id: str,
    photo_url: str | None,
    photo_thumbnail_url: str | None,
    source_review_id: str | None,
) -> ReviewExportResponse:
    result_payload = dict(review.result_json or {})
    return ReviewExportResponse(
        photo={
            'photo_id': photo_id,
            'photo_url': photo_url,
            'photo_thumbnail_url': photo_thumbnail_url,
        },
        review={
            'review_id': review.public_id,
            'source_review_id': source_review_id,
            'mode': review.mode.value,
            'status': review.status.value,
            'image_type': _review_image_type(review),
            'model_name': str(review.model_name or ''),
            'model_version': _review_model_version(review),
            'final_score': float(review.final_score),
            'scores': _coerce_review_scores(result_payload.get('scores')),
            'advantage': str(result_payload.get('advantage') or ''),
            'critique': str(result_payload.get('critique') or ''),
            'suggestions': str(result_payload.get('suggestions') or ''),
            'favorite': bool(review.favorite),
            'tags': _normalize_review_tags(review.tags_json if isinstance(review.tags_json, list) else []),
            'note': review.note,
            'created_at': review.created_at,
            'exported_at': datetime.now(timezone.utc),
        },
    )


def _generate_review_share_token(db: Session) -> str:
    for _ in range(5):
        share_token = secrets.token_urlsafe(18)
        exists = db.query(Review.id).filter(Review.share_token == share_token).first()
        if exists is None:
            return share_token
    raise api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, 'SHARE_TOKEN_GENERATION_FAILED', 'Failed to generate share token')


def _attach_billing_info(
    result_payload: dict[str, Any],
    *,
    db: Session,
    user: User,
    charged: bool,
    guest_scope_key: str | None = None,
) -> None:
    if user.plan == UserPlan.guest:
        usage = guest_usage_snapshot(db, guest_scope_key) if guest_scope_key else None
    else:
        usage = user_usage_snapshot(db, user)

    result_payload['billing_info'] = {
        'quota_charged': charged,
        'remaining_quota': {
            'daily_remaining': usage.daily_remaining if usage else None,
            'monthly_remaining': usage.monthly_remaining if usage else None,
            'pro_monthly_remaining': usage.pro_monthly_remaining if usage else None,
        },
    }
