from __future__ import annotations

from bisect import bisect_right
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy import Float, and_, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_current_actor, get_db, get_user_from_token
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
from app.db.models import Photo, Review, ReviewLike, User, UserPlan
from app.schemas import GalleryLikeResponse, PublicGalleryItem, PublicGalleryResponse
from app.services.object_storage import get_object_storage_client

router = APIRouter(prefix='/gallery', tags=['gallery'])

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


def _score_percentile(value: float, sorted_values: list[float]) -> float | None:
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return 100.0
    rank = bisect_right(sorted_values, value) - 1
    rank = max(0, min(rank, len(sorted_values) - 1))
    return round((rank / (len(sorted_values) - 1)) * 100.0, 1)


def _gallery_recommendation_map(db: Session, review_ids: list[int]) -> dict[int, dict[str, float | bool | None]]:
    if not review_ids:
        return {}

    gallery_rows = (
        db.query(Review.id, Review.image_type, Review.final_score)
        .filter(*_public_gallery_filters())
        .all()
    )
    if not gallery_rows:
        return {}

    global_scores = sorted(float(row.final_score) for row in gallery_rows)
    scores_by_type: dict[str, list[float]] = {}
    row_map: dict[int, tuple[str, float]] = {}
    for row in gallery_rows:
        image_type = str(row.image_type or 'default')
        score = float(row.final_score)
        scores_by_type.setdefault(image_type, []).append(score)
        row_map[int(row.id)] = (image_type, score)

    for scores in scores_by_type.values():
        scores.sort()

    recommendations: dict[int, dict[str, float | bool | None]] = {}
    for review_id in review_ids:
        row = row_map.get(int(review_id))
        if row is None:
            continue
        image_type, score = row
        type_scores = scores_by_type.get(image_type, [])
        percentile = (
            _score_percentile(score, type_scores)
            if len(type_scores) >= GALLERY_RECOMMEND_MIN_IMAGE_TYPE_SAMPLE
            else _score_percentile(score, global_scores)
        )
        recommendations[int(review_id)] = {
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
