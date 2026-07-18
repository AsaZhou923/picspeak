from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_current_actor, get_db
from app.api.routers.gallery import GALLERY_AUDIT_NONE
from app.api.routers.photos import _build_photo_proxy_url, _find_photo_owned
from app.core.errors import api_error
from app.db.models import Photo, Review, User, UserPlan
from app.schemas import PhotoReviewsResponse, ReviewGetResponse, ReviewHistoryResponse, ReviewListItem
from app.services.guard import review_history_cutoff
from .review_support import (
    _apply_review_history_filters,
    _apply_review_history_visibility,
    _normalize_review_tags,
    _review_gallery_audit_status,
    _review_history_item,
    _review_image_type,
    _review_model_version,
    _review_result_payload,
    _review_share_info,
    _review_source_public_id,
)

router = APIRouter(tags=['reviews'])


@router.get('/reviews/{review_id}', response_model=ReviewGetResponse)
def get_review(
    review_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    row = (
        db.query(Review, Photo, User)
        .join(Photo, Photo.id == Review.photo_id)
        .join(User, User.id == Photo.owner_user_id)
        .filter(
            Review.public_id == review_id,
            Review.deleted_at.is_(None),
            (Review.owner_user_id == actor.user.id) | (Review.is_public == True),  # noqa: E712
        )
        .first()
    )
    if row is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    review, photo, photo_owner = row
    is_owner = review.owner_user_id == actor.user.id
    cutoff = review_history_cutoff(actor.plan)
    if cutoff is not None and is_owner and not review.is_public and review.created_at < cutoff:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')

    photo_url = _build_photo_proxy_url(request, photo.public_id, photo_owner.public_id)
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
    row = (
        db.query(Review, Photo, User)
        .join(Photo, Photo.id == Review.photo_id)
        .join(User, User.id == Photo.owner_user_id)
        .filter(
            Review.share_token == share_token,
            Review.is_public == True,  # noqa: E712
            Review.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    review, photo, photo_owner = row

    photo_url = _build_photo_proxy_url(request, photo.public_id, photo_owner.public_id)

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
    _ = request
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
