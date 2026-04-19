from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_current_actor, get_db
from app.api.routers.gallery import GALLERY_AUDIT_APPROVED, GALLERY_AUDIT_NONE, GALLERY_AUDIT_REJECTED, _ensure_gallery_thumbnail
from app.api.routers.photos import PHOTO_THUMBNAIL_SIZE, _build_photo_proxy_url, _build_storage_photo_url
from app.core.errors import api_error
from app.db.models import Photo, UserPlan
from app.schemas import ReviewExportResponse, ReviewMetaResponse, ReviewMetaUpdateRequest, ReviewShareResponse
from app.services.content_audit import ContentAuditError, run_content_audit
from .review_support import (
    _build_review_export_payload,
    _find_review_owned,
    _generate_review_share_token,
    _normalize_review_note,
    _normalize_review_tags,
    _review_meta_payload,
    _review_source_public_id,
)

router = APIRouter(tags=['reviews'])


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
