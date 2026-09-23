from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy import Float, cast, func, select
from sqlalchemy.orm import Session

from app.db.models import Photo, Review, ReviewLike, User
from app.gallery_scoreboard_schemas import (
    GalleryNeighborItem,
    GalleryNeighborsResponse,
    GalleryScoreboardItem,
    GalleryScoreboardResponse,
)
from app.schemas import PublicGalleryItem
from app.api.routers.gallery_support import (
    _apply_review_history_filters_gallery,
    _as_utc_datetime,
    _gallery_like_counts,
    _gallery_thumbnail_url,
    _gallery_rank_score_expr,
    _public_gallery_filters,
    _public_gallery_item,
)

SCOREBOARD_ALLOWED_WINDOWS = {7, 30}
SCOREBOARD_LIMIT = 10
SCOREBOARD_MIN_PHOTOS_FOR_POPULAR = 10
SCOREBOARD_MIN_AUTHORS_FOR_POPULAR = 5
SCOREBOARD_MAX_ITEMS_PER_AUTHOR = 2
SCOREBOARD_RANKING_RULE_VERSION = 'gallery-scoreboard-v1'


@dataclass(frozen=True)
class GalleryScoreboardRow:
    review: Review
    photo: Photo
    owner: User
    like_count: int


def _scoreboard_as_of(as_of: datetime | None = None) -> datetime:
    return _as_utc_datetime(as_of or datetime.now(timezone.utc))


def _scoreboard_window(as_of: datetime, window_days: int) -> tuple[datetime, datetime]:
    normalized_as_of = _scoreboard_as_of(as_of)
    return normalized_as_of - timedelta(days=window_days), normalized_as_of


def _dedupe_latest_owner_photo(rows: list[tuple[Review, Photo, User]]) -> list[tuple[Review, Photo, User]]:
    selected: dict[tuple[int, int], tuple[Review, Photo, User]] = {}
    for review, photo, owner in sorted(
        rows,
        key=lambda row: (
            _as_utc_datetime(row[0].gallery_added_at or row[0].created_at),
            int(row[0].id),
        ),
        reverse=True,
    ):
        selected.setdefault((int(review.owner_user_id), int(review.photo_id)), (review, photo, owner))
    return list(selected.values())


def _apply_author_cap(rows: list[GalleryScoreboardRow]) -> list[GalleryScoreboardRow]:
    counts: dict[int, int] = {}
    capped: list[GalleryScoreboardRow] = []
    for row in rows:
        owner_id = int(row.review.owner_user_id)
        if counts.get(owner_id, 0) >= SCOREBOARD_MAX_ITEMS_PER_AUTHOR:
            continue
        counts[owner_id] = counts.get(owner_id, 0) + 1
        capped.append(row)
        if len(capped) >= SCOREBOARD_LIMIT:
            break
    return capped


def _scoreboard_cold_start_reasons(rows: list[GalleryScoreboardRow]) -> list[str]:
    reasons: list[str] = []
    owner_ids = {int(row.review.owner_user_id) for row in rows}
    if len(rows) < SCOREBOARD_MIN_PHOTOS_FOR_POPULAR:
        reasons.append('not_enough_photos')
    if len(owner_ids) < SCOREBOARD_MIN_AUTHORS_FOR_POPULAR:
        reasons.append('not_enough_authors')
    if rows and all(row.like_count == 0 for row in rows):
        reasons.append('all_zero_likes')
    if not rows:
        reasons.append('empty_window')
    return reasons


def _scoreboard_item_from_public(item: PublicGalleryItem) -> GalleryScoreboardItem:
    return GalleryScoreboardItem(**item.model_dump(), owner_profile_url=None)


def _owner_profile_url(owner: User) -> str | None:
    if not bool(getattr(owner, 'public_profile_enabled', False)):
        return None
    public_profile_id = (getattr(owner, 'public_profile_id', None) or '').strip()
    if not public_profile_id:
        return None
    return f'/u/{public_profile_id}'


def build_gallery_scoreboard(
    db: Session,
    request: Request,
    *,
    window_days: int,
    image_type: str | None = None,
    as_of: datetime | None = None,
) -> GalleryScoreboardResponse:
    active_as_of = _scoreboard_as_of(as_of)
    window_start, window_end = _scoreboard_window(active_as_of, window_days)
    candidate_query = (
        db.query(Review, Photo, User)
        .join(Photo, Photo.id == Review.photo_id)
        .join(User, User.id == Review.owner_user_id)
        .filter(*_public_gallery_filters())
        .filter(Review.gallery_added_at >= window_start, Review.gallery_added_at < window_end)
    )
    if image_type:
        candidate_query = candidate_query.filter(Review.image_type == image_type)

    candidate_rows = _dedupe_latest_owner_photo(candidate_query.all())
    review_ids = [review.id for review, _photo, _owner in candidate_rows]
    like_counts = _gallery_like_counts(db, review_ids)
    rows = [
        GalleryScoreboardRow(review=review, photo=photo, owner=owner, like_count=like_counts.get(review.id, 0))
        for review, photo, owner in candidate_rows
    ]
    eligible_photo_count = len(rows)
    eligible_author_count = len({int(row.review.owner_user_id) for row in rows})
    cold_start_reasons = _scoreboard_cold_start_reasons(rows)
    if cold_start_reasons:
        ranking_mode = 'collection'
        ranking_sort = ['gallery_added_at_desc', 'review_id_desc']
        ordered = sorted(
            rows,
            key=lambda row: (_as_utc_datetime(row.review.gallery_added_at or row.review.created_at), int(row.review.id)),
            reverse=True,
        )
    else:
        ranking_mode = 'popular'
        ranking_sort = ['like_count_desc', 'gallery_added_at_desc', 'review_id_desc']
        ordered = sorted(
            rows,
            key=lambda row: (
                int(row.like_count),
                _as_utc_datetime(row.review.gallery_added_at or row.review.created_at),
                int(row.review.id),
            ),
            reverse=True,
        )

    capped = _apply_author_cap(ordered)
    items: list[GalleryScoreboardItem] = []
    for row in capped:
        item = _scoreboard_item_from_public(
            _public_gallery_item(
              request,
              row.review,
              row.photo,
              row.owner,
              like_count=row.like_count,
              liked_by_viewer=False,
              recommendation=None,
            )
        )
        item.owner_profile_url = _owner_profile_url(row.owner)
        items.append(item)
    return GalleryScoreboardResponse(
        items=items,
        window_days=window_days,
        as_of=active_as_of,
        window_start=window_start,
        window_end=window_end,
        ranking_mode=ranking_mode,
        ranking_rule_version=SCOREBOARD_RANKING_RULE_VERSION,
        ranking_sort=ranking_sort,
        eligible_photo_count=eligible_photo_count,
        eligible_author_count=eligible_author_count,
        cold_start_reasons=cold_start_reasons,
        image_type=image_type,
    )


def _gallery_order_expr(sort: str, rank_reference_at: datetime | None):
    if sort == 'latest':
        return cast(func.extract('epoch', Review.gallery_added_at), Float).label('gallery_primary_val')
    if sort == 'score':
        return cast(Review.final_score, Float).label('gallery_primary_val')
    if sort == 'likes':
        return (
            select(func.count(ReviewLike.id))
            .where(ReviewLike.review_id == Review.id)
            .scalar_subquery()
            .label('gallery_primary_val')
        )
    return _gallery_rank_score_expr(reference_now=rank_reference_at).label('gallery_primary_val')


def _neighbor_item(row: tuple[Review, Photo, User, float], like_count: int) -> GalleryNeighborItem:
    review, photo, owner, _primary = row
    return GalleryNeighborItem(
        review_id=review.public_id,
        gallery_added_at=review.gallery_added_at or review.created_at,
        final_score=float(review.final_score),
        like_count=max(0, int(like_count)),
        owner_username=owner.username,
        photo_thumbnail_url=_gallery_thumbnail_url(photo),
    )


def build_gallery_neighbors(
    db: Session,
    *,
    review_public_id: str,
    back_href: str,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    min_score: float | None = None,
    max_score: float | None = None,
    image_type: str | None = None,
    sort: str = 'default',
    rank_reference_at: datetime | None = None,
) -> GalleryNeighborsResponse:
    primary_expr = _gallery_order_expr(sort, rank_reference_at)
    query = (
        db.query(Review, Photo, User, primary_expr)
        .join(Photo, Photo.id == Review.photo_id)
        .join(User, User.id == Review.owner_user_id)
        .filter(*_public_gallery_filters())
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
    rows = query.all()
    current_index = next((index for index, row in enumerate(rows) if row[0].public_id == review_public_id), None)
    if current_index is None:
        return GalleryNeighborsResponse(review_id=review_public_id, previous=None, next=None, back_href=back_href)

    neighbor_rows = [
        rows[current_index - 1] if current_index > 0 else None,
        rows[current_index + 1] if current_index + 1 < len(rows) else None,
    ]
    like_counts = _gallery_like_counts(db, [row[0].id for row in neighbor_rows if row is not None])
    previous = _neighbor_item(neighbor_rows[0], like_counts.get(neighbor_rows[0][0].id, 0)) if neighbor_rows[0] else None
    next_item = _neighbor_item(neighbor_rows[1], like_counts.get(neighbor_rows[1][0].id, 0)) if neighbor_rows[1] else None
    return GalleryNeighborsResponse(review_id=review_public_id, previous=previous, next=next_item, back_href=back_href)
