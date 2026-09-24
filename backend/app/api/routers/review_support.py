from __future__ import annotations

from copy import deepcopy

import re
import secrets
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit

from fastapi import Request, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, object_session

from app.api.deps import CurrentActor
from app.api.routers.gallery import GALLERY_AUDIT_APPROVED, GALLERY_AUDIT_NONE, GALLERY_AUDIT_VALUES
from app.api.routers.photos import (
    PHOTO_THUMBNAIL_SIZE,
    _build_photo_proxy_url,
)
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import Photo, PhotoStatus, Review, ReviewMode, ReviewStatus, User, UserPlan
from app.schemas import (
    REVIEW_SCHEMA_VERSION,
    ReviewCreateRequest,
    ReviewExportResponse,
    ReviewHistoryItem,
    ReviewMetaResponse,
    ReviewVisibilityResponse,
)
from app.services.guard import guest_usage_snapshot, review_history_cutoff, user_usage_snapshot
from app.services.practice import owner_practice_context_for_review
from app.services.practice_access import ACCESS_AVAILABLE, review_access_status

REVIEW_TAG_LIMIT = 8
REVIEW_TAG_MAX_LENGTH = 32
REVIEW_NOTE_MAX_LENGTH = 1000
_EXIF_UNSET = object()
_PRACTICE_CONTEXT_UNSET = object()


def _sql_like_literal(value: str) -> str:
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


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


def _review_has_gallery_public_channel(review: Review) -> bool:
    return (
        bool(review.gallery_visible)
        and _review_gallery_audit_status(review) == GALLERY_AUDIT_APPROVED
        and getattr(review, 'deleted_at', None) is None
    )


def _review_has_share_public_channel(review: Review) -> bool:
    return bool(review.share_token) and getattr(review, 'deleted_at', None) is None


def _review_public_enabled(review: Review) -> bool:
    return _review_has_gallery_public_channel(review) or _review_has_share_public_channel(review)


def _frontend_share_url(share_token: str) -> str:
    origin_parts = urlsplit(settings.frontend_origin)
    if origin_parts.scheme not in {'http', 'https'} or not origin_parts.netloc:
        origin = 'http://localhost:3000'
    else:
        origin = urlunsplit((origin_parts.scheme, origin_parts.netloc, '', '', '')).rstrip('/')
    return f"{origin}/share/{quote(share_token, safe='')}"


def _sync_review_public_flag(review: Review) -> None:
    review.is_public = _review_public_enabled(review)


def _review_visibility_payload(request: Request, review: Review) -> ReviewVisibilityResponse:
    share_enabled = _review_has_share_public_channel(review)
    return ReviewVisibilityResponse(
        review_id=review.public_id,
        is_public=_review_public_enabled(review),
        gallery_visible=bool(review.gallery_visible),
        gallery_audit_status=_review_gallery_audit_status(review),
        gallery_added_at=review.gallery_added_at,
        gallery_rejected_reason=review.gallery_rejected_reason,
        share_enabled=share_enabled,
        share_token=review.share_token if share_enabled else None,
        share_url=_frontend_share_url(review.share_token) if share_enabled and review.share_token else None,
    )


def _source_review_public_id_if_available(
    review: Review,
    *,
    source_review: Review | None,
    source_photo: Photo | None,
    owner_user_id: int,
    cutoff: datetime | None,
) -> str | None:
    if not review.source_review_id:
        return None
    if review.owner_user_id != owner_user_id:
        return None
    if source_review is None or review_access_status(source_review, cutoff) != ACCESS_AVAILABLE:
        return None
    if source_review.owner_user_id != owner_user_id or source_review.status != ReviewStatus.SUCCEEDED:
        return None
    if source_photo is None or source_photo.owner_user_id != owner_user_id or source_photo.status != PhotoStatus.READY:
        return None
    if source_review.photo_id != source_photo.id:
        return None
    return source_review.public_id


def _review_source_public_id(
    db: Session,
    review: Review,
    *,
    owner_user_id: int | None = None,
    cutoff: datetime | None = None,
) -> str | None:
    if not review.source_review_id:
        return None
    resolved_owner_user_id = review.owner_user_id if owner_user_id is None else owner_user_id
    source_review = db.query(Review).filter(Review.id == review.source_review_id).first()
    source_photo = db.query(Photo).filter(Photo.id == source_review.photo_id).first() if source_review is not None else None
    return _source_review_public_id_if_available(
        review,
        source_review=source_review,
        source_photo=source_photo,
        owner_user_id=resolved_owner_user_id,
        cutoff=cutoff,
    )


def _review_source_public_ids_from_maps(
    reviews: list[Review],
    *,
    source_reviews_by_id: dict[int, Review],
    source_photos_by_id: dict[int, Photo],
    owner_user_id: int,
    cutoff: datetime | None,
) -> dict[int, str]:
    resolved: dict[int, str] = {}
    for review in reviews:
        if not review.source_review_id:
            continue
        source_review = source_reviews_by_id.get(review.source_review_id)
        source_photo = source_photos_by_id.get(source_review.photo_id) if source_review is not None else None
        source_public_id = _source_review_public_id_if_available(
            review,
            source_review=source_review,
            source_photo=source_photo,
            owner_user_id=owner_user_id,
            cutoff=cutoff,
        )
        if source_public_id:
            resolved[review.id] = source_public_id
    return resolved


def _review_share_info(request: Request, review: Review, *, include_token: bool) -> dict[str, Any]:
    if not _review_has_share_public_channel(review):
        return {}

    payload: dict[str, Any] = {
        'enabled': True,
        'share_url': _frontend_share_url(review.share_token),
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
    scorer_model_name: str | None = None,
    scorer_model_version: str | None = None,
    writer_model_name: str | None = None,
    writer_model_version: str | None = None,
    score_prompt_version: str | None = None,
    scorer_preprocess_version: str | None = None,
    score_cache_hit: bool | None = None,
    exif_info: dict[str, Any] | None | object = _EXIF_UNSET,
    share_info_override: dict[str, Any] | None = None,
    include_goal_assessment: bool = True,
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

    comparison = _public_comparison_payload(raw_payload.get('comparison'))
    payload = {
        'schema_version': str(raw_payload.get('schema_version') or REVIEW_SCHEMA_VERSION),
        'prompt_version': str(raw_payload.get('prompt_version') or prompt_version or ''),
        'score_version': str(raw_payload.get('score_version') or 'legacy'),
        'score_prompt_version': str(raw_payload.get('score_prompt_version') or score_prompt_version or ''),
        'model_name': str(raw_payload.get('model_name') or model_name or ''),
        'model_version': str(raw_payload.get('model_version') or model_version or ''),
        'scorer_model_name': str(raw_payload.get('scorer_model_name') or scorer_model_name or ''),
        'scorer_model_version': str(raw_payload.get('scorer_model_version') or scorer_model_version or ''),
        'writer_model_name': str(raw_payload.get('writer_model_name') or writer_model_name or model_name or ''),
        'writer_model_version': str(raw_payload.get('writer_model_version') or writer_model_version or model_version or ''),
        'scorer_preprocess_version': str(
            raw_payload.get('scorer_preprocess_version') or scorer_preprocess_version or ''
        ),
        'score_cache_hit': bool(
            raw_payload.get('score_cache_hit')
            if raw_payload.get('score_cache_hit') is not None
            else score_cache_hit
        ),
        'scores': scores,
        'score_evidence': deepcopy(raw_payload.get('score_evidence')),
        'final_score': float(resolved_final_score),
        'advantage': str(raw_payload.get('advantage') or ''),
        'critique': str(raw_payload.get('critique') or ''),
        'suggestions': str(raw_payload.get('suggestions') or ''),
        'image_type': str(raw_payload.get('image_type') or 'default'),
        'visual_analysis': visual_analysis,
        'tonal_analysis': tonal_analysis,
        'issue_marks': issue_marks,
        'billing_info': billing_info,
        'exif_info': stored_exif_info if exif_info is _EXIF_UNSET else (exif_info if isinstance(exif_info, dict) else {}),
        'share_info': share_info_override if isinstance(share_info_override, dict) else share_info,
        'comparison': comparison,
    }
    if include_goal_assessment:
        payload['goal_assessment'] = _public_goal_assessment_payload(raw_payload.get('goal_assessment'))
    return payload


def _public_comparison_payload(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    payload = dict(value)
    # The Responses API identifier is retained in Review.result_json for audit,
    # but is never exposed through owner, public-share, history, or export APIs.
    payload['openai_response_id'] = ''
    return payload


def _public_goal_assessment_payload(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    return {
        'goal_version': str(value.get('goal_version') or ''),
        'status': str(value.get('status') or 'indeterminate'),
        'evidence': deepcopy(value.get('evidence')) if isinstance(value.get('evidence'), list) else [],
        'limitations': deepcopy(value.get('limitations')) if isinstance(value.get('limitations'), list) else [],
        'next_action': str(value.get('next_action') or ''),
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
    if payload.analysis_type == 'retake_compare' and not payload.source_review_id:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'RETAKE_SOURCE_REQUIRED',
            'Retake comparison requires a source review',
        )
    if not payload.source_review_id:
        return None

    source_review = _find_review_owned(db, payload.source_review_id, actor.user.id)
    if source_review.status != ReviewStatus.SUCCEEDED:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'RETAKE_SOURCE_NOT_READY',
            'Source review is not ready for comparison',
        )
    if payload.analysis_type == 'retake_compare':
        if source_review.photo_id == photo.id:
            raise api_error(
                status.HTTP_400_BAD_REQUEST,
                'RETAKE_PHOTO_DUPLICATE',
                'Retake comparison requires a newly uploaded photo',
            )
        source_photo_checksum = db.query(Photo.checksum_sha256).filter(Photo.id == source_review.photo_id).scalar()
        if source_photo_checksum and getattr(photo, 'checksum_sha256', None) and source_photo_checksum == photo.checksum_sha256:
            raise api_error(
                status.HTTP_400_BAD_REQUEST,
                'RETAKE_PHOTO_DUPLICATE',
                'Retake comparison requires a newly uploaded photo',
            )
        return source_review
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


def _review_tag_values_alias(name: str = 'review_tag_values'):
    return func.jsonb_array_elements_text(Review.tags_json).table_valued('value').alias(name)


def _review_tags_have_literal(value: str):
    tag_values = _review_tag_values_alias()
    return exists(
        select(1)
        .select_from(tag_values)
        .where(func.lower(tag_values.c.value) == value.lower())
    )


def _review_tags_contain_literal(value: str):
    tag_values = _review_tag_values_alias()
    pattern = f"%{_sql_like_literal(value)}%"
    return exists(
        select(1)
        .select_from(tag_values)
        .where(tag_values.c.value.ilike(pattern, escape='\\'))
    )


def _apply_review_history_organization_filters(
    query,
    *,
    q: str | None = None,
    tags: list[str] | None = None,
):
    normalized_q = re.sub(r'\s+', ' ', q or '').strip()[:100]
    normalized_tags = _normalize_review_tags(tags or [])
    if normalized_q:
        pattern = f"%{_sql_like_literal(normalized_q)}%"
        query = query.filter(or_(
            Review.note.ilike(pattern, escape='\\'),
            _review_tags_contain_literal(normalized_q),
        ))
    if normalized_tags:
        query = query.filter(or_(*[_review_tags_have_literal(tag) for tag in normalized_tags]))
    return query


def _review_history_item(
    request: Request,
    review: Review,
    photo: Photo,
    owner_public_id: str,
    source_review_id: str | None,
    *,
    practice_context_override: dict[str, Any] | None | object = _PRACTICE_CONTEXT_UNSET,
) -> ReviewHistoryItem:
    result_payload = dict(review.result_json or {})
    if practice_context_override is _PRACTICE_CONTEXT_UNSET:
        db = object_session(review)
        practice_context = owner_practice_context_for_review(db, review) if db is not None else None
    else:
        practice_context = practice_context_override
    return ReviewHistoryItem(
        review_id=review.public_id,
        photo_id=photo.public_id,
        photo_url=_build_photo_proxy_url(request, photo.public_id, owner_public_id),
        photo_thumbnail_url=_build_photo_proxy_url(request, photo.public_id, owner_public_id, size=PHOTO_THUMBNAIL_SIZE),
        mode=review.mode.value,
        status=review.status.value,
        image_type=_review_image_type(review),
        source_review_id=source_review_id,
        practice=practice_context,
        practice_session_id=practice_context.get('session_id') if practice_context else None,
        comparison=_public_comparison_payload(result_payload.get('comparison')),
        goal_assessment=_public_goal_assessment_payload(result_payload.get('goal_assessment')),
        final_score=float(review.final_score),
        scores=_coerce_review_scores(result_payload.get('scores')),
        model_name=str(review.model_name or ''),
        model_version=_review_model_version(review),
        scorer_model_name=str(review.scorer_model_name or result_payload.get('scorer_model_name') or ''),
        scorer_model_version=str(result_payload.get('scorer_model_version') or ''),
        writer_model_name=str(review.writer_model_name or result_payload.get('writer_model_name') or review.model_name or ''),
        writer_model_version=str(result_payload.get('writer_model_version') or _review_model_version(review)),
        score_version=str(result_payload.get('score_version') or 'legacy'),
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
    db = object_session(review)
    practice_context = owner_practice_context_for_review(db, review) if db is not None else None
    return ReviewExportResponse(
        photo={
            'photo_id': photo_id,
            'photo_url': photo_url,
            'photo_thumbnail_url': photo_thumbnail_url,
        },
        review={
            'review_id': review.public_id,
            'source_review_id': source_review_id,
            'practice': practice_context,
            'practice_session_id': practice_context.get('session_id') if practice_context else None,
            'mode': review.mode.value,
            'status': review.status.value,
            'image_type': _review_image_type(review),
            'model_name': str(review.model_name or ''),
            'model_version': _review_model_version(review),
            'scorer_model_name': str(review.scorer_model_name or result_payload.get('scorer_model_name') or ''),
            'scorer_model_version': str(result_payload.get('scorer_model_version') or ''),
            'writer_model_name': str(review.writer_model_name or result_payload.get('writer_model_name') or review.model_name or ''),
            'writer_model_version': str(result_payload.get('writer_model_version') or _review_model_version(review)),
            'score_version': str(result_payload.get('score_version') or 'legacy'),
            'final_score': float(review.final_score),
            'scores': _coerce_review_scores(result_payload.get('scores')),
            'score_evidence': deepcopy(result_payload.get('score_evidence')),
            'advantage': str(result_payload.get('advantage') or ''),
            'critique': str(result_payload.get('critique') or ''),
            'suggestions': str(result_payload.get('suggestions') or ''),
            'comparison': _public_comparison_payload(result_payload.get('comparison')),
            'goal_assessment': _public_goal_assessment_payload(result_payload.get('goal_assessment')),
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

    existing_billing_info = result_payload.get('billing_info')
    billing_info = dict(existing_billing_info) if isinstance(existing_billing_info, dict) else {}
    billing_info.update({
        'quota_charged': charged,
        'remaining_quota': {
            'daily_remaining': usage.get('daily_remaining') if usage else None,
            'monthly_remaining': usage.get('monthly_remaining') if usage else None,
            'pro_monthly_remaining': usage.get('pro_monthly_remaining') if usage else None,
        },
    })
    result_payload['billing_info'] = billing_info
