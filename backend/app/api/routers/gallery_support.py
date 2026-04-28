from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Request, status
from sqlalchemy import Float, cast, func
from sqlalchemy.orm import Session

from app.api.deps import get_user_from_token
from app.api.routers.photos import (
    GALLERY_THUMBNAIL_CACHE_CONTROL,
    PHOTO_THUMBNAIL_MAX_SIZE,
    _build_photo_proxy_url,
    _build_storage_photo_url,
    _build_thumbnail_bytes,
    _get_photo_object,
    _photo_client_meta,
)
from app.core.errors import api_error
from app.db.models import Photo, Review, ReviewLike, User
from app.schemas import PublicGalleryItem
from app.services.object_storage import get_object_storage_client

GALLERY_AUDIT_NONE = 'none'
GALLERY_AUDIT_APPROVED = 'approved'
GALLERY_AUDIT_REJECTED = 'rejected'
GALLERY_AUDIT_VALUES = {GALLERY_AUDIT_NONE, GALLERY_AUDIT_APPROVED, GALLERY_AUDIT_REJECTED}
GALLERY_RECOMMEND_PERCENTILE_THRESHOLD = 80.0
GALLERY_RECOMMEND_MIN_IMAGE_TYPE_SAMPLE = 8
GALLERY_SCORE_WEIGHT = 0.6
GALLERY_FRESHNESS_WEIGHT = 0.4
GALLERY_FRESHNESS_HALF_LIFE_DAYS = 45
GALLERY_FRESHNESS_HALF_LIFE_SECONDS = GALLERY_FRESHNESS_HALF_LIFE_DAYS * 24 * 3600
GALLERY_CURSOR_SCORE_EPSILON = 1e-9


def _as_utc_datetime(value: datetime) -> datetime:
  if value.tzinfo is None:
    return value.replace(tzinfo=timezone.utc)
  return value.astimezone(timezone.utc)


def _gallery_rank_score_value(
  final_score: float,
  gallery_added_at: datetime,
  *,
  now: datetime | None = None,
) -> float:
  reference_now = _as_utc_datetime(now or datetime.now(timezone.utc))
  published_at = _as_utc_datetime(gallery_added_at)
  age_seconds = max((reference_now - published_at).total_seconds(), 0.0)
  freshness_score = 10.0 * (0.5 ** (age_seconds / GALLERY_FRESHNESS_HALF_LIFE_SECONDS))
  return (float(final_score) * GALLERY_SCORE_WEIGHT) + (freshness_score * GALLERY_FRESHNESS_WEIGHT)


def _gallery_rank_score_expr():
  age_seconds = func.extract('epoch', func.now() - Review.gallery_added_at)
  freshness_score = 10.0 * func.power(0.5, age_seconds / GALLERY_FRESHNESS_HALF_LIFE_SECONDS)
  return (Review.final_score * GALLERY_SCORE_WEIGHT) + (freshness_score * GALLERY_FRESHNESS_WEIGHT)


def _encode_public_gallery_cursor(rank_score: float, gallery_added_at: datetime, review_id: int) -> str:
  return f'{float(rank_score):.12f}|{_as_utc_datetime(gallery_added_at).isoformat()}|{review_id}'


def _decode_public_gallery_cursor(cursor: str) -> tuple[float | None, datetime, int | None]:
  parts = cursor.split('|', 2)
  if len(parts) != 3:
    try:
      return None, datetime.fromisoformat(cursor), None
    except ValueError as exc:
      raise api_error(status.HTTP_400_BAD_REQUEST, 'CURSOR_INVALID', 'Invalid cursor') from exc

  raw_score, raw_dt, raw_id = parts
  try:
    return float(raw_score), datetime.fromisoformat(raw_dt), int(raw_id)
  except ValueError as exc:
    raise api_error(status.HTTP_400_BAD_REQUEST, 'CURSOR_INVALID', 'Invalid cursor') from exc


def _gallery_thumbnail_object_key(photo: Photo, *, size: int = PHOTO_THUMBNAIL_MAX_SIZE) -> str:
  return f'gallery-thumbnails/{photo.public_id}/{size}.webp'


def _gallery_thumbnail_url(photo: Photo) -> str | None:
  object_key = _photo_client_meta(photo).get('gallery_thumbnail_key')
  if not isinstance(object_key, str) or not object_key.strip():
    return None
  return _build_storage_photo_url(photo.bucket, object_key.strip())


def _ensure_gallery_thumbnail(photo: Photo, *, size: int = PHOTO_THUMBNAIL_MAX_SIZE) -> str:
  existing_url = _gallery_thumbnail_url(photo)
  if existing_url:
    return existing_url

  _, source_bytes = _get_photo_object(photo)
  thumbnail_bytes, media_type = _build_thumbnail_bytes(source_bytes, size)
  if media_type != 'image/webp' or not thumbnail_bytes:
    raise api_error(
      status.HTTP_502_BAD_GATEWAY,
      'GALLERY_THUMBNAIL_BUILD_FAILED',
      'Failed to build gallery thumbnail',
    )

  object_key = _gallery_thumbnail_object_key(photo, size=size)
  try:
    storage = get_object_storage_client()
    storage.put_object(
      Bucket=photo.bucket,
      Key=object_key,
      Body=thumbnail_bytes,
      ContentType='image/webp',
      CacheControl=GALLERY_THUMBNAIL_CACHE_CONTROL,
    )
  except Exception as exc:
    raise api_error(
      status.HTTP_502_BAD_GATEWAY,
      'GALLERY_THUMBNAIL_UPLOAD_FAILED',
      f'Failed to upload gallery thumbnail: {exc}',
    ) from exc

  client_meta = _photo_client_meta(photo)
  client_meta['gallery_thumbnail_key'] = object_key
  client_meta['gallery_thumbnail_size'] = size
  client_meta['gallery_thumbnail_content_type'] = 'image/webp'
  photo.client_meta = client_meta
  return _build_storage_photo_url(photo.bucket, object_key)


def _gallery_like_counts(db: Session, review_ids: list[int]) -> dict[int, int]:
  if not review_ids:
    return {}

  rows = (
    db.query(ReviewLike.review_id, func.count(ReviewLike.id))
    .filter(ReviewLike.review_id.in_(review_ids))
    .group_by(ReviewLike.review_id)
    .all()
  )
  return {int(review_id): int(count) for review_id, count in rows}


def _gallery_viewer_likes(db: Session, review_ids: list[int], user_id: int | None) -> set[int]:
  if not review_ids or user_id is None:
    return set()

  rows = (
    db.query(ReviewLike.review_id)
    .filter(ReviewLike.review_id.in_(review_ids), ReviewLike.user_id == user_id)
    .all()
  )
  return {int(review_id) for (review_id,) in rows}


def _gallery_like_count(db: Session, review_id: int) -> int:
  return int(db.query(func.count(ReviewLike.id)).filter(ReviewLike.review_id == review_id).scalar() or 0)


def _public_gallery_filters() -> tuple[Any, ...]:
  return (
    Review.deleted_at.is_(None),
    Review.gallery_visible == True,  # noqa: E712
    Review.gallery_audit_status == GALLERY_AUDIT_APPROVED,
  )


def _find_public_gallery_review(db: Session, review_public_id: str) -> Review:
  review = db.query(Review).filter(Review.public_id == review_public_id, *_public_gallery_filters()).first()
  if review is None:
    raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
  return review


def _optional_gallery_viewer(authorization: str | None, db: Session) -> User | None:
  if not authorization:
    return None
  if not authorization.lower().startswith('bearer '):
    return None
  token = authorization[7:].strip()
  if not token:
    return None
  return get_user_from_token(token, db)


def _gallery_recommendation_map(db: Session, review_ids: list[int]) -> dict[int, dict[str, float | bool | None]]:
  if not review_ids:
    return {}

  target_ids = [int(review_id) for review_id in review_ids]
  ranked_reviews = (
    db.query(
      Review.id.label('review_id'),
      func.count(Review.id).over().label('global_count'),
      func.count(Review.id).over(partition_by=Review.image_type).label('type_count'),
      func.percent_rank().over(order_by=Review.final_score).label('global_percent_rank'),
      func.percent_rank().over(partition_by=Review.image_type, order_by=Review.final_score).label('type_percent_rank'),
    )
    .filter(*_public_gallery_filters())
    .subquery()
  )
  rows = (
    db.query(
      ranked_reviews.c.review_id,
      ranked_reviews.c.global_count,
      ranked_reviews.c.type_count,
      ranked_reviews.c.global_percent_rank,
      ranked_reviews.c.type_percent_rank,
    )
    .filter(ranked_reviews.c.review_id.in_(target_ids))
    .all()
  )

  recommendations: dict[int, dict[str, float | bool | None]] = {}
  for row in rows:
    type_count = int(row.type_count or 0)
    if type_count >= GALLERY_RECOMMEND_MIN_IMAGE_TYPE_SAMPLE:
      sample_count = type_count
      raw_percentile = row.type_percent_rank
    else:
      sample_count = int(row.global_count or 0)
      raw_percentile = row.global_percent_rank

    percentile = 100.0 if sample_count == 1 else round(float(raw_percentile or 0) * 100.0, 1)
    recommendations[int(row.review_id)] = {
      'recommended': bool(percentile is not None and percentile >= GALLERY_RECOMMEND_PERCENTILE_THRESHOLD),
      'score_percentile': percentile,
    }
  return recommendations


def _review_image_type_gallery(review: Review) -> str:
  raw_payload = dict(review.result_json or {})
  return str(review.image_type or raw_payload.get('image_type') or 'default')


def _review_gallery_summary(review: Review) -> str:
  import re
  payload = dict(review.result_json or {})
  for field_name in ('suggestions', 'critique', 'advantage'):
    raw_value = payload.get(field_name)
    if not isinstance(raw_value, str):
      continue
    for line in raw_value.splitlines():
      normalized = re.sub(r'^\d+\.\s*', '', line).strip()
      if normalized:
        return normalized[:180]
  return 'Saved to the public gallery.'


def _public_gallery_item(
  request: Request,
  review: Review,
  photo: Photo,
  owner: User,
  *,
  like_count: int = 0,
  liked_by_viewer: bool = False,
  recommendation: dict[str, float | bool | None] | None = None,
) -> PublicGalleryItem:
  gallery_thumbnail_url = _gallery_thumbnail_url(photo)
  return PublicGalleryItem(
    review_id=review.public_id,
    photo_id=photo.public_id,
    photo_url=_build_photo_proxy_url(request, photo.public_id, owner.public_id),
    photo_thumbnail_url=gallery_thumbnail_url or _build_photo_proxy_url(
      request,
      photo.public_id,
      owner.public_id,
      size=PHOTO_THUMBNAIL_MAX_SIZE,
    ),
    mode=review.mode.value,
    image_type=_review_image_type_gallery(review),
    final_score=float(review.final_score),
    score_version=str((review.result_json or {}).get('score_version') or 'legacy'),
    summary=_review_gallery_summary(review),
    owner_username=owner.username,
    owner_avatar_url=owner.avatar_url,
    like_count=max(0, int(like_count)),
    liked_by_viewer=bool(liked_by_viewer),
    recommended=bool((recommendation or {}).get('recommended')),
    score_percentile=(
      float((recommendation or {}).get('score_percentile'))
      if (recommendation or {}).get('score_percentile') is not None
      else None
    ),
    gallery_added_at=review.gallery_added_at or review.created_at,
    created_at=review.created_at,
  )


def _apply_review_history_filters_gallery(
  query,
  *,
  date_field=None,
  created_from: datetime | None = None,
  created_to: datetime | None = None,
  min_score: float | None = None,
  max_score: float | None = None,
  image_type: str | None = None,
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
  return query
