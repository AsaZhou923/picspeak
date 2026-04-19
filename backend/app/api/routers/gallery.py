from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy import Float, and_, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_current_actor, get_db
from app.api.routers.photos import _build_photo_proxy_url, _build_thumbnail_bytes, _get_photo_object
from app.core.errors import api_error
from app.db.models import Photo, Review, ReviewLike, User, UserPlan
from app.schemas import GalleryLikeResponse, PublicGalleryResponse
from app.services.object_storage import get_object_storage_client
from .gallery_support import (
  GALLERY_AUDIT_APPROVED,
  GALLERY_AUDIT_NONE,
  GALLERY_AUDIT_REJECTED,
  GALLERY_AUDIT_VALUES,
  _apply_review_history_filters_gallery,
  _decode_public_gallery_cursor,
  _encode_public_gallery_cursor,
  _ensure_gallery_thumbnail,
  _find_public_gallery_review,
  _gallery_like_count,
  _gallery_like_counts,
  _gallery_rank_score_expr,
  _gallery_rank_score_value,
  _gallery_recommendation_map,
  _gallery_viewer_likes,
  _optional_gallery_viewer,
  _public_gallery_filters,
  _public_gallery_item,
  _review_gallery_summary,
)

router = APIRouter(prefix='/gallery', tags=['gallery'])


@router.get('', response_model=PublicGalleryResponse)
def list_public_gallery(
  request: Request,
  limit: int = Query(default=24, ge=1, le=60),
  cursor: str | None = Query(default=None),
  created_from: datetime | None = Query(default=None),
  created_to: datetime | None = Query(default=None),
  min_score: float | None = Query(default=None, ge=0, le=10),
  max_score: float | None = Query(default=None, ge=0, le=10),
  image_type: str | None = Query(default=None, pattern='^(default|landscape|portrait|street|still_life|architecture)$'),
  sort: str = Query(default='default', pattern='^(default|latest|score|likes)$'),
  authorization: str | None = Header(default=None),
  db: Session = Depends(get_db),
):
  if created_from is not None and created_to is not None and created_from > created_to:
    raise api_error(status.HTTP_400_BAD_REQUEST, 'GALLERY_FILTER_INVALID', 'created_from cannot be later than created_to')
  if min_score is not None and max_score is not None and min_score > max_score:
    raise api_error(status.HTTP_400_BAD_REQUEST, 'GALLERY_FILTER_INVALID', 'min_score cannot be greater than max_score')

  viewer = _optional_gallery_viewer(authorization, db)
  gallery_filters = _public_gallery_filters()

  if sort == 'latest':
    primary_expr = cast(func.extract('epoch', Review.gallery_added_at), Float).label('gallery_primary_val')
  elif sort == 'score':
    primary_expr = cast(Review.final_score, Float).label('gallery_primary_val')
  elif sort == 'likes':
    primary_expr = (
      select(func.count(ReviewLike.id))
      .where(ReviewLike.review_id == Review.id)
      .scalar_subquery()
      .label('gallery_primary_val')
    )
  else:
    primary_expr = _gallery_rank_score_expr().label('gallery_primary_val')

  count_query = db.query(func.count(Review.id)).filter(*gallery_filters)
  count_query = _apply_review_history_filters_gallery(
    count_query,
    date_field=Review.gallery_added_at,
    created_from=created_from,
    created_to=created_to,
    min_score=min_score,
    max_score=max_score,
    image_type=image_type,
  )
  total_count = count_query.scalar() or 0
  query = (
    db.query(Review, Photo, User, primary_expr)
    .join(Photo, Photo.id == Review.photo_id)
    .join(User, User.id == Review.owner_user_id)
    .filter(*gallery_filters)
    .order_by(primary_expr.desc(), Review.gallery_added_at.desc(), Review.id.desc())
  )
  query = _apply_review_history_filters_gallery(
    query,
    date_field=Review.gallery_added_at,
    created_from=created_from,
    created_to=created_to,
    min_score=min_score,
    max_score=max_score,
    image_type=image_type,
  )

  if cursor:
    cursor_val, cursor_dt, cursor_review_id = _decode_public_gallery_cursor(cursor)
    if cursor_val is None or cursor_review_id is None:
      query = query.filter(Review.gallery_added_at < cursor_dt)
    else:
      same_val = func.abs(primary_expr - cursor_val) <= 1e-9
      query = query.filter(
        or_(
          primary_expr < cursor_val - 1e-9,
          and_(same_val, Review.gallery_added_at < cursor_dt),
          and_(same_val, Review.gallery_added_at == cursor_dt, Review.id < cursor_review_id),
        )
      )

  rows = query.limit(limit + 1).all()
  has_next = len(rows) > limit
  rows = rows[:limit]
  review_ids = [review.id for review, _photo, _owner, _primary_val in rows]
  like_counts = _gallery_like_counts(db, review_ids)
  viewer_likes = _gallery_viewer_likes(db, review_ids, None if viewer is None else viewer.id)
  recommendations = _gallery_recommendation_map(db, review_ids)
  items = [
    _public_gallery_item(
      request,
      review,
      photo,
      owner,
      like_count=like_counts.get(review.id, 0),
      liked_by_viewer=review.id in viewer_likes,
      recommendation=recommendations.get(review.id),
    )
    for review, photo, owner, _primary_val in rows
  ]
  next_cursor = None
  if has_next and rows and rows[-1][0].gallery_added_at:
    last_review, _last_photo, _last_owner, last_primary_val = rows[-1]
    next_cursor = _encode_public_gallery_cursor(
      rank_score=float(last_primary_val),
      gallery_added_at=last_review.gallery_added_at,
      review_id=last_review.id,
    )

  db.commit()
  return PublicGalleryResponse(items=items, total_count=total_count, next_cursor=next_cursor)


@router.post('/{review_id}/likes', response_model=GalleryLikeResponse)
def like_public_gallery_review(
  review_id: str,
  db: Session = Depends(get_db),
  actor: CurrentActor = Depends(get_current_actor),
):
  if actor.plan == UserPlan.guest:
    raise api_error(status.HTTP_403_FORBIDDEN, 'GALLERY_LIKE_LOGIN_REQUIRED', 'Please sign in before liking gallery items')

  review = _find_public_gallery_review(db, review_id)
  existing = (
    db.query(ReviewLike)
    .filter(ReviewLike.review_id == review.id, ReviewLike.user_id == actor.user.id)
    .first()
  )
  if existing is None:
    db.add(ReviewLike(review_id=review.id, user_id=actor.user.id))
    try:
      db.commit()
    except IntegrityError:
      db.rollback()
  else:
    db.commit()

  like_count = _gallery_like_count(db, review.id)
  return GalleryLikeResponse(review_id=review.public_id, like_count=like_count, liked_by_viewer=True)


@router.delete('/{review_id}/likes', response_model=GalleryLikeResponse)
def unlike_public_gallery_review(
  review_id: str,
  db: Session = Depends(get_db),
  actor: CurrentActor = Depends(get_current_actor),
):
  if actor.plan == UserPlan.guest:
    raise api_error(status.HTTP_403_FORBIDDEN, 'GALLERY_LIKE_LOGIN_REQUIRED', 'Please sign in before liking gallery items')

  review = _find_public_gallery_review(db, review_id)
  (
    db.query(ReviewLike)
    .filter(ReviewLike.review_id == review.id, ReviewLike.user_id == actor.user.id)
    .delete(synchronize_session=False)
  )
  db.commit()

  like_count = _gallery_like_count(db, review.id)
  return GalleryLikeResponse(review_id=review.public_id, like_count=like_count, liked_by_viewer=False)
