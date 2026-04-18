from __future__ import annotations

import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentActor,
    get_current_actor,
    get_db,
    new_public_id,
)
from app.api.routers.gallery import (
    GALLERY_AUDIT_APPROVED,
    GALLERY_AUDIT_NONE,
    GALLERY_AUDIT_REJECTED,
    GALLERY_AUDIT_VALUES,
    _ensure_gallery_thumbnail,
)
from app.api.routers.photos import (
    PHOTO_THUMBNAIL_SIZE,
    _build_photo_proxy_url,
    _build_storage_photo_url,
    _find_photo_owned,
)
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import (
    Photo,
    PhotoStatus,
    Review,
    ReviewLike,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    UsageLedger,
    User,
    UserPlan,
)
from app.schemas import (
    PhotoReviewsResponse,
    REVIEW_SCHEMA_VERSION,
    ReviewCreateAsyncResponse,
    ReviewCreateRequest,
    ReviewCreateSyncResponse,
    ReviewExportResponse,
    ReviewGetResponse,
    ReviewHistoryItem,
    ReviewHistoryResponse,
    ReviewListItem,
    ReviewMetaResponse,
    ReviewMetaUpdateRequest,
    ReviewShareResponse,
    TaskStatusResponse,
)
from app.services.ai import AIReviewError, run_ai_review
from app.services.content_audit import ContentAuditError, run_content_audit
from app.services.guard import (
    enforce_guest_review_limits,
    enforce_user_quota,
    get_idempotency_record,
    guest_quota_scope_key,
    guest_rate_limit_scope_key,
    guest_usage_snapshot,
    hash_request,
    increment_quota,
    review_history_cutoff,
    save_idempotency_record,
    user_usage_snapshot,
)
from app.services.task_dispatcher import TaskDispatchError, enqueue_review_task
from app.services.task_events import record_task_event

router = APIRouter(tags=['reviews'])
logger = logging.getLogger(__name__)

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
        'remaining_quota': (
            {
                'daily_remaining': usage.get('daily_remaining'),
                'monthly_remaining': usage.get('monthly_remaining'),
                'pro_monthly_remaining': usage.get('pro_monthly_remaining'),
            }
            if usage is not None
            else None
        ),
    }


@router.post('/reviews', response_model=ReviewCreateAsyncResponse | ReviewCreateSyncResponse)
def create_review(
    payload: ReviewCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest and payload.mode == ReviewMode.pro.value:
        raise api_error(status.HTTP_403_FORBIDDEN, 'PLAN_MODE_FORBIDDEN', 'Guest users cannot use pro review mode')

    mode_enum = ReviewMode(payload.mode)
    photo = _find_photo_owned(db, payload.photo_id, actor.user.id)
    source_review = _resolve_source_review(db, actor, payload, photo)
    if photo.status != PhotoStatus.READY:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PHOTO_NOT_READY', 'Photo is not ready for review')

    idempotency_key = payload.idempotency_key or request.headers.get('Idempotency-Key')
    payload_dump = json.dumps(payload.model_dump(by_alias=True), ensure_ascii=False, sort_keys=True)

    if idempotency_key:
        record = get_idempotency_record(db, actor.user.id, '/reviews', idempotency_key)
        if record is not None and record.response_json is not None:
            response_json = dict(record.response_json)
            result_payload = response_json.get('result')
            if isinstance(result_payload, dict):
                response_json['result'] = _review_result_payload(result_payload, None)
            return response_json

    if actor.plan != UserPlan.guest and source_review is None:
        existing_review = (
            db.query(Review)
            .filter(
                Review.photo_id == photo.id,
                Review.owner_user_id == actor.user.id,
                Review.mode == mode_enum,
                Review.status == ReviewStatus.SUCCEEDED,
                Review.deleted_at.is_(None),
            )
            .order_by(Review.created_at.desc(), Review.id.desc())
            .first()
        )
        if existing_review is not None:
            response_sync = {
                'review_id': existing_review.public_id,
                'status': existing_review.status.value,
                'result': _review_result_payload(
                    existing_review.result_json,
                    existing_review.final_score,
                    model_name=existing_review.model_name,
                    model_version=_review_model_version(existing_review),
                    exif_info=photo.exif_data if photo.exif_data else None,
                    share_info_override=_review_share_info(request, existing_review, include_token=True),
                ),
            }
            if idempotency_key:
                save_idempotency_record(
                    db,
                    user_id=actor.user.id,
                    endpoint='/reviews',
                    key=idempotency_key,
                    request_hash=hash_request(payload_dump),
                    http_status=200,
                    response_json=response_sync,
                )
                db.commit()
            return response_sync

    if actor.plan == UserPlan.guest:
        enforce_guest_review_limits(
            db,
            actor,
            request_scope_key=guest_rate_limit_scope_key(request, actor.user),
            quota_scope_key=guest_quota_scope_key(request, actor.user),
        )
    else:
        enforce_user_quota(db, actor.user, mode=mode_enum)

    guest_scope_key = guest_quota_scope_key(request, actor.user) if actor.plan == UserPlan.guest else None

    if payload.async_mode:
        task_payload = payload.model_dump(by_alias=True)
        if source_review is not None:
            task_payload['source_review_internal_id'] = source_review.id
        if guest_scope_key:
            task_payload['_guest_scope_key'] = guest_scope_key
        task = ReviewTask(
            public_id=new_public_id('tsk'),
            photo_id=photo.id,
            owner_user_id=actor.user.id,
            mode=mode_enum,
            status=TaskStatus.PENDING,
            idempotency_key=idempotency_key,
            request_payload=task_payload,
            attempt_count=0,
            max_attempts=3,
            progress=0,
            next_attempt_at=datetime.now(timezone.utc),
            expire_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
        db.add(task)
        try:
            db.flush()
            record_task_event(db, task, event_type='TASK_CREATED', message='Task enqueued', payload={'mode': payload.mode, 'locale': payload.locale})
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            existing = (
                db.query(ReviewTask)
                .filter(ReviewTask.owner_user_id == actor.user.id, ReviewTask.idempotency_key == idempotency_key)
                .first()
            )
            if existing:
                return {'task_id': existing.public_id, 'status': existing.status.value, 'estimated_seconds': 12}
            raise api_error(status.HTTP_409_CONFLICT, 'TASK_DUPLICATE', 'Duplicate task') from exc

        response = {'task_id': task.public_id, 'status': task.status.value, 'estimated_seconds': 12}
        if settings.cloud_tasks_enabled:
            try:
                enqueue_review_task(task.public_id)
            except TaskDispatchError as exc:
                logger.exception('Failed to enqueue Cloud Task for review task %s', task.public_id)
                db.rollback()
                failed_task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first()
                if failed_task is not None:
                    failed_task.status = TaskStatus.FAILED
                    failed_task.progress = 100
                    failed_task.finished_at = datetime.now(timezone.utc)
                    failed_task.error_code = 'TASK_DISPATCH_FAILED'
                    failed_task.error_message = str(exc)[:500]
                    db.add(failed_task)
                    record_task_event(db, failed_task, event_type='TASK_DISPATCH_FAILED', message=failed_task.error_message)
                    db.commit()
                raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, 'TASK_DISPATCH_FAILED', 'Failed to enqueue async review task') from exc
        if idempotency_key:
            save_idempotency_record(
                db,
                user_id=actor.user.id,
                endpoint='/reviews',
                key=idempotency_key,
                request_hash=hash_request(payload_dump),
                http_status=200,
                response_json=response,
            )
            db.commit()
        return response

    image_url = _build_storage_photo_url(photo.bucket, photo.object_key)
    try:
        ai_response = run_ai_review(payload.mode, image_url=image_url, locale=payload.locale, exif_data=photo.exif_data or None, image_type=payload.image_type)
    except AIReviewError as exc:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'AI_REVIEW_FAILED', f'AI review failed: {exc}') from exc

    result_payload = _review_result_payload(
        ai_response.result.model_dump(),
        ai_response.result.final_score,
        prompt_version=ai_response.prompt_version,
        model_name=ai_response.model_name,
        model_version=ai_response.model_version,
        exif_info=photo.exif_data if photo.exif_data else None,
    )
    review = Review(
        public_id=new_public_id('rev'),
        task_id=None,
        photo_id=photo.id,
        owner_user_id=actor.user.id,
        source_review_id=source_review.id if source_review is not None else None,
        mode=mode_enum,
        status=ReviewStatus.SUCCEEDED,
        image_type=payload.image_type,
        schema_version=result_payload['schema_version'],
        result_json=result_payload,
        final_score=result_payload['final_score'],
        input_tokens=ai_response.input_tokens,
        output_tokens=ai_response.output_tokens,
        cost_usd=ai_response.cost_usd,
        latency_ms=ai_response.latency_ms,
        model_name=ai_response.model_name,
    )
    db.add(review)
    db.flush()
    db.add(
        UsageLedger(
            user_id=actor.user.id,
            review_id=review.id,
            task_id=None,
            usage_type='review_request',
            amount=1,
            unit='count',
            bill_date=datetime.now(timezone.utc).date(),
            metadata_json={'mode': payload.mode},
        )
    )
    increment_quota(db, actor.user)
    _attach_billing_info(result_payload, db=db, user=actor.user, charged=True, guest_scope_key=guest_scope_key)
    review.result_json = result_payload
    db.add(review)
    db.commit()
    db.refresh(review)

    response_sync = {'review_id': review.public_id, 'status': review.status.value, 'result': result_payload}
    if idempotency_key:
        save_idempotency_record(
            db,
            user_id=actor.user.id,
            endpoint='/reviews',
            key=idempotency_key,
            request_hash=hash_request(payload_dump),
            http_status=200,
            response_json=response_sync,
        )
        db.commit()
    return response_sync


@router.get('/reviews/{review_id}', response_model=ReviewGetResponse)
def get_review(
    review_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    review = db.query(Review).filter(
        Review.public_id == review_id,
        Review.deleted_at.is_(None),
        (Review.owner_user_id == actor.user.id) | (Review.is_public == True),  # noqa: E712
    ).first()
    if review is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    is_owner = review.owner_user_id == actor.user.id
    cutoff = review_history_cutoff(actor.plan)
    if (
        cutoff is not None
        and is_owner
        and not review.is_public
        and review.created_at < cutoff
    ):
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')

    photo = db.query(Photo).filter(Photo.id == review.photo_id).first()
    if photo is not None:
        photo_owner = db.query(User).filter(User.id == photo.owner_user_id).first()
        photo_url = _build_photo_proxy_url(request, photo.public_id, photo_owner.public_id) if photo_owner else None
    else:
        photo_url = None
    db.commit()
    return ReviewGetResponse(
        review_id=review.public_id,
        photo_id=photo.public_id if photo else 'unknown',
        photo_url=photo_url,
        mode=review.mode.value,
        status=review.status.value,
        image_type=_review_image_type(review),
        source_review_id=_review_source_public_id(db, review) if is_owner else None,
        viewer_is_owner=is_owner,
        favorite=bool(review.favorite) if is_owner else False,
        gallery_visible=bool(review.gallery_visible) if is_owner else False,
        gallery_audit_status=_review_gallery_audit_status(review) if is_owner else GALLERY_AUDIT_NONE,
        gallery_added_at=review.gallery_added_at if is_owner else None,
        gallery_rejected_reason=review.gallery_rejected_reason if is_owner else None,
        tags=_normalize_review_tags(review.tags_json if isinstance(review.tags_json, list) else []) if is_owner else [],
        note=review.note if is_owner else None,
        result=_review_result_payload(
            review.result_json,
            review.final_score,
            model_name=review.model_name,
            model_version=_review_model_version(review),
            exif_info=photo.exif_data if photo and photo.exif_data else None,
            share_info_override=_review_share_info(request, review, include_token=is_owner),
        ),
        created_at=review.created_at,
        exif_data=photo.exif_data if photo and photo.exif_data else None,
    )


@router.get('/public/reviews/{share_token}', response_model=ReviewGetResponse, name='get_public_review')
def get_public_review(
    share_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    review = db.query(Review).filter(
        Review.share_token == share_token,
        Review.is_public == True,  # noqa: E712
        Review.deleted_at.is_(None),
    ).first()
    if review is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')

    photo = db.query(Photo).filter(Photo.id == review.photo_id).first()
    if photo is not None:
        photo_owner = db.query(User).filter(User.id == photo.owner_user_id).first()
        photo_url = _build_photo_proxy_url(request, photo.public_id, photo_owner.public_id) if photo_owner else None
    else:
        photo_url = None

    db.commit()
    return ReviewGetResponse(
        review_id=review.public_id,
        photo_id=photo.public_id if photo else 'unknown',
        photo_url=photo_url,
        mode=review.mode.value,
        status=review.status.value,
        image_type=_review_image_type(review),
        source_review_id=None,
        viewer_is_owner=False,
        favorite=False,
        gallery_visible=False,
        gallery_audit_status=GALLERY_AUDIT_NONE,
        gallery_added_at=None,
        gallery_rejected_reason=None,
        tags=[],
        note=None,
        result=_review_result_payload(
            review.result_json,
            review.final_score,
            model_name=review.model_name,
            model_version=_review_model_version(review),
            exif_info=None,
            share_info_override=_review_share_info(request, review, include_token=False),
        ),
        created_at=review.created_at,
        exif_data=None,
    )


@router.get('/me/reviews', response_model=ReviewHistoryResponse)
def list_my_reviews(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    min_score: float | None = Query(default=None, ge=0, le=10),
    max_score: float | None = Query(default=None, ge=0, le=10),
    image_type: str | None = Query(default=None, pattern='^(default|landscape|portrait|street|still_life|architecture)$'),
    favorite_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        db.commit()
        return ReviewHistoryResponse(items=[], next_cursor=None)
    if created_from is not None and created_to is not None and created_from > created_to:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'REVIEW_FILTER_INVALID', 'created_from cannot be later than created_to')
    if min_score is not None and max_score is not None and min_score > max_score:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'REVIEW_FILTER_INVALID', 'min_score cannot be greater than max_score')

    query = (
        db.query(Review, Photo)
        .join(Photo, Photo.id == Review.photo_id)
        .filter(Review.owner_user_id == actor.user.id)
        .order_by(Review.created_at.desc(), Review.id.desc())
    )
    query = _apply_review_history_visibility(query, actor.plan)
    query = _apply_review_history_filters(
        query,
        created_from=created_from,
        created_to=created_to,
        min_score=min_score,
        max_score=max_score,
        image_type=image_type,
        favorite_only=favorite_only,
    )

    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
        except ValueError as exc:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'CURSOR_INVALID', 'Invalid cursor') from exc
        query = query.filter(Review.created_at < cursor_dt)

    rows = query.limit(limit + 1).all()
    has_next = len(rows) > limit
    rows = rows[:limit]
    source_review_ids = {review.source_review_id for review, _photo in rows if review.source_review_id}
    source_review_map = {
        review_id: public_id
        for review_id, public_id in db.query(Review.id, Review.public_id).filter(Review.id.in_(source_review_ids)).all()
    } if source_review_ids else {}

    items = [
        _review_history_item(request, review, photo, actor.user.public_id, source_review_map.get(review.source_review_id))
        for review, photo in rows
    ]
    next_cursor = rows[-1][0].created_at.isoformat() if has_next and rows else None

    db.commit()
    return ReviewHistoryResponse(items=items, next_cursor=next_cursor)


@router.get('/photos/{photo_id}/reviews', response_model=PhotoReviewsResponse)
def list_photo_reviews(
    photo_id: str,
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    photo = _find_photo_owned(db, photo_id, actor.user.id)
    if actor.plan == UserPlan.guest:
        db.commit()
        return PhotoReviewsResponse(items=[], next_cursor=None)

    query = (
        db.query(Review)
        .filter(Review.photo_id == photo.id, Review.owner_user_id == actor.user.id, Review.deleted_at.is_(None))
        .order_by(Review.created_at.desc())
    )
    query = _apply_review_history_visibility(query, actor.plan)

    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
        except ValueError as exc:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'CURSOR_INVALID', 'Invalid cursor') from exc
        query = query.filter(Review.created_at < cursor_dt)

    rows = query.limit(limit + 1).all()
    has_next = len(rows) > limit
    rows = rows[:limit]

    items = [ReviewListItem(review_id=row.public_id, mode=row.mode.value, status=row.status.value) for row in rows]
    next_cursor = rows[-1].created_at.isoformat() if has_next and rows else None

    db.commit()
    return PhotoReviewsResponse(items=items, next_cursor=next_cursor)


@router.post('/reviews/{review_id}/share', response_model=ReviewShareResponse)
def enable_review_share(
    review_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    review = _find_review_owned(db, review_id, actor.user.id)
    if not review.share_token:
        review.share_token = _generate_review_share_token(db)
    review.is_public = True
    db.add(review)
    db.commit()
    db.refresh(review)
    return ReviewShareResponse(
        review_id=review.public_id,
        share_token=review.share_token,
        share_url=str(request.url_for('get_public_review', share_token=review.share_token)),
        enabled=True,
    )


@router.patch('/reviews/{review_id}/meta', response_model=ReviewMetaResponse)
def update_review_meta(
    review_id: str,
    payload: ReviewMetaUpdateRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    review = _find_review_owned(db, review_id, actor.user.id)
    photo = db.query(Photo).filter(Photo.id == review.photo_id).first()
    if payload.favorite is not None:
        review.favorite = bool(payload.favorite)
    if payload.gallery_visible is not None:
        if payload.gallery_visible and actor.plan == UserPlan.guest:
            raise api_error(status.HTTP_403_FORBIDDEN, 'GALLERY_LOGIN_REQUIRED', 'Please sign in before submitting to the gallery')

        if payload.gallery_visible:
            if photo is None:
                raise api_error(status.HTTP_404_NOT_FOUND, 'PHOTO_NOT_FOUND', 'Photo not found')
            try:
                audit_result = run_content_audit(_build_storage_photo_url(photo.bucket, photo.object_key))
            except ContentAuditError as exc:
                raise api_error(status.HTTP_502_BAD_GATEWAY, 'IMAGE_AUDIT_FAILED', f'Image content audit failed: {exc}') from exc

            review.favorite = True
            review.gallery_visible = True
            review.gallery_added_at = datetime.now(timezone.utc)
            if audit_result.safe:
                _ensure_gallery_thumbnail(photo)
                review.gallery_audit_status = GALLERY_AUDIT_APPROVED
                review.gallery_rejected_reason = None
                review.is_public = True
                db.add(photo)
            else:
                review.gallery_audit_status = GALLERY_AUDIT_REJECTED
                review.gallery_rejected_reason = audit_result.reason or 'Image content did not pass gallery audit'
                review.is_public = bool(review.share_token)
        else:
            review.gallery_visible = False
            review.gallery_audit_status = GALLERY_AUDIT_NONE
            review.gallery_added_at = None
            review.gallery_rejected_reason = None
            review.is_public = bool(review.share_token)
    if payload.tags is not None:
        review.tags_json = _normalize_review_tags(payload.tags)
    if payload.note is not None:
        review.note = _normalize_review_note(payload.note)
    db.add(review)
    db.commit()
    db.refresh(review)
    return _review_meta_payload(review)


@router.get('/reviews/{review_id}/export', response_model=ReviewExportResponse)
def export_review(
    review_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    review = _find_review_owned(db, review_id, actor.user.id)
    photo = db.query(Photo).filter(Photo.id == review.photo_id).first()
    photo_public_id = photo.public_id if photo else 'unknown'
    photo_url = _build_photo_proxy_url(request, photo.public_id, actor.user.public_id) if photo else None
    photo_thumbnail_url = (
        _build_photo_proxy_url(request, photo.public_id, actor.user.public_id, size=PHOTO_THUMBNAIL_SIZE)
        if photo else None
    )
    payload = _build_review_export_payload(
        review=review,
        photo_id=photo_public_id,
        photo_url=photo_url,
        photo_thumbnail_url=photo_thumbnail_url,
        source_review_id=_review_source_public_id(db, review),
    )
    db.commit()
    return payload


@router.delete('/reviews/{review_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    review_id: str,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    review = _find_review_owned(db, review_id, actor.user.id, include_deleted=True)
    if review.deleted_at is None:
        review.deleted_at = datetime.now(timezone.utc)
        review.is_public = False
        review.gallery_visible = False
        review.gallery_audit_status = GALLERY_AUDIT_NONE
        review.gallery_added_at = None
        review.gallery_rejected_reason = None
        db.add(review)
        db.commit()
    else:
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
