from __future__ import annotations

from secrets import token_urlsafe

from fastapi import Request, status
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.routers.gallery_support import (
    _gallery_like_counts,
    _gallery_recommendation_map,
    _public_gallery_filters,
    _public_gallery_item,
)
from app.core.errors import api_error
from app.db.models import Photo, PhotoStatus, Review, ReviewLike, ReviewStatus, User, UserPlan, UserStatus
from app.profile_schemas import (
    ProfileSettingsResponse,
    PublicProfileGalleryItem,
    PublicProfileResponse,
)

PUBLIC_PROFILE_ID_PREFIX = 'upp'
PUBLIC_PROFILE_ID_RANDOM_BYTES = 18
PUBLIC_PROFILE_ID_RETRY_LIMIT = 8


def _new_public_profile_id() -> str:
    return f'{PUBLIC_PROFILE_ID_PREFIX}_{token_urlsafe(PUBLIC_PROFILE_ID_RANDOM_BYTES)}'


def _public_profile_filters(user: User) -> tuple:
    return (
        Review.owner_user_id == user.id,
        Photo.owner_user_id == user.id,
        Review.status == ReviewStatus.SUCCEEDED,
        Photo.status == PhotoStatus.READY,
        *_public_gallery_filters(),
    )


def _gallery_review_count(db: Session, user: User) -> int:
    return int(
        db.query(func.count(Review.id))
        .join(Photo, Photo.id == Review.photo_id)
        .filter(*_public_profile_filters(user))
        .scalar()
        or 0
    )


def _gallery_total_like_count(db: Session, user: User) -> int:
    return int(
        db.query(func.count(ReviewLike.id))
        .join(Review, Review.id == ReviewLike.review_id)
        .join(Photo, Photo.id == Review.photo_id)
        .filter(*_public_profile_filters(user))
        .scalar()
        or 0
    )


def _ensure_public_profile_id(db: Session, user: User) -> str:
    existing = (user.public_profile_id or '').strip()
    if existing:
        return existing

    for _ in range(PUBLIC_PROFILE_ID_RETRY_LIMIT):
        candidate = _new_public_profile_id()
        if db.query(User.id).filter(User.public_profile_id == candidate).first() is None:
            user.public_profile_id = candidate
            return candidate

    raise api_error(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        'PUBLIC_PROFILE_ID_UNAVAILABLE',
        'Could not allocate a public profile id',
    )


def _profile_settings_response(db: Session, user: User) -> ProfileSettingsResponse:
    return ProfileSettingsResponse(
        public_profile_enabled=bool(user.public_profile_enabled),
        public_profile_id=user.public_profile_id if user.public_profile_enabled else None,
        username=user.username,
        avatar_url=user.avatar_url,
        gallery_review_count=_gallery_review_count(db, user),
    )


def get_my_profile_settings(db: Session, user: User) -> ProfileSettingsResponse:
    return _profile_settings_response(db, user)


def update_my_profile_settings(
    db: Session,
    user: User,
    *,
    public_profile_enabled: bool,
) -> ProfileSettingsResponse:
    if user.plan == UserPlan.guest:
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            'PUBLIC_PROFILE_LOGIN_REQUIRED',
            'Please sign in before publishing a profile',
        )

    for _ in range(PUBLIC_PROFILE_ID_RETRY_LIMIT):
        if public_profile_enabled:
            _ensure_public_profile_id(db, user)
        user.public_profile_enabled = bool(public_profile_enabled)
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            db.refresh(user)
            continue
        else:
            db.refresh(user)
            return _profile_settings_response(db, user)

    raise api_error(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        'PUBLIC_PROFILE_ID_UNAVAILABLE',
        'Could not allocate a public profile id',
    )


def _encode_public_profile_cursor(gallery_added_at, review_id: int) -> str:
    return f'{gallery_added_at.isoformat()}|{review_id}'


def _decode_public_profile_cursor(cursor: str):
    from datetime import datetime

    parts = cursor.split('|')
    if len(parts) != 2:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'CURSOR_INVALID', 'Invalid cursor')
    try:
        return datetime.fromisoformat(parts[0]), int(parts[1])
    except ValueError as exc:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'CURSOR_INVALID', 'Invalid cursor') from exc


def _profile_item_from_gallery_item(item) -> PublicProfileGalleryItem:
    payload = item.model_dump() if hasattr(item, 'model_dump') else dict(item)
    payload.pop('owner_username', None)
    payload.pop('owner_avatar_url', None)
    payload.pop('liked_by_viewer', None)
    return PublicProfileGalleryItem(**payload)


def get_public_profile(
    db: Session,
    request: Request,
    public_profile_id: str,
    *,
    limit: int = 24,
    cursor: str | None = None,
) -> PublicProfileResponse:
    user = (
        db.query(User)
        .filter(
            User.public_profile_id == public_profile_id,
            User.public_profile_enabled == True,  # noqa: E712
            User.status == UserStatus.active,
        )
        .first()
    )
    if user is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'PUBLIC_PROFILE_NOT_FOUND', 'Public profile not found')

    total_count = _gallery_review_count(db, user)
    total_like_count = _gallery_total_like_count(db, user)
    query = (
        db.query(Review, Photo)
        .join(Photo, Photo.id == Review.photo_id)
        .filter(*_public_profile_filters(user))
        .order_by(Review.gallery_added_at.desc(), Review.id.desc())
    )
    if cursor:
        cursor_dt, cursor_review_id = _decode_public_profile_cursor(cursor)
        query = query.filter(
            or_(
                Review.gallery_added_at < cursor_dt,
                and_(Review.gallery_added_at == cursor_dt, Review.id < cursor_review_id),
            )
        )
    rows = query.limit(limit + 1).all()
    has_next = len(rows) > limit
    rows = rows[:limit]
    review_ids = [review.id for review, _photo in rows]
    like_counts = _gallery_like_counts(db, review_ids)
    recommendations = _gallery_recommendation_map(db, review_ids)
    items = [
        _profile_item_from_gallery_item(
            _public_gallery_item(
                request,
                review,
                photo,
                user,
                like_count=like_counts.get(review.id, 0),
                liked_by_viewer=False,
                recommendation=recommendations.get(review.id),
            )
        )
        for review, photo in rows
    ]

    return PublicProfileResponse(
        public_profile_id=user.public_profile_id or public_profile_id,
        username=user.username,
        avatar_url=user.avatar_url,
        gallery_review_count=total_count,
        total_like_count=total_like_count,
        items=items,
        next_cursor=(
            _encode_public_profile_cursor(rows[-1][0].gallery_added_at, rows[-1][0].id)
            if has_next and rows and rows[-1][0].gallery_added_at
            else None
        ),
    )
