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
    _build_public_gallery_thumbnail_url,
    _gallery_like_counts,
    _gallery_rank_score_expr,
    _public_gallery_filters,
    _public_gallery_item,
)

SCOREBOARD_ALLOWED_WINDOWS = {7, 30}
SCOREBOARD_LIMIT = 10
SCOREBOARD_MIN_PHOTOS_FOR_POPULAR = 10
SCOREBOARD_MIN_AUTHORS_FOR_POPULAR = 5
SCOREBOARD_MAX_ITEMS_PER_AUTHOR = 1
SCOREBOARD_RANKING_RULE_VERSION = 'gallery-scoreboard-v2'


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
    # Rank only scalar columns. Full critique payloads are loaded for at most
    # SCOREBOARD_LIMIT winners, rather than every photo in the window.
    representatives = select(
        Review.id.label('review_id'),
        Review.owner_user_id.label('owner_id'),
        Review.gallery_added_at.label('added_at'),
        func.row_number().over(
            partition_by=(Review.owner_user_id, Review.photo_id),
            order_by=(Review.gallery_added_at.desc(), Review.id.desc()),
        ).label('photo_rank'),
    ).where(
        *_public_gallery_filters(),
        Review.gallery_added_at >= window_start,
        Review.gallery_added_at < window_end,
    )
    if image_type:
        representatives = representatives.where(Review.image_type == image_type)
    representatives = representatives.cte('scoreboard_representatives')
    eligible = select(
        representatives.c.review_id, representatives.c.owner_id, representatives.c.added_at,
    ).where(representatives.c.photo_rank == 1).cte('scoreboard_eligible')
    likes = select(
        ReviewLike.review_id,
        func.count(ReviewLike.id).label('like_count'),
    ).join(eligible, eligible.c.review_id == ReviewLike.review_id).group_by(
        ReviewLike.review_id,
    ).cte('scoreboard_likes')
    candidates = select(
        eligible.c.review_id, eligible.c.owner_id, eligible.c.added_at,
        func.coalesce(likes.c.like_count, 0).label('like_count'),
    ).outerjoin(likes, likes.c.review_id == eligible.c.review_id).cte('scoreboard_candidates')
    eligible_photo_count, eligible_author_count, max_likes = db.execute(select(
        func.count(candidates.c.review_id),
        func.count(func.distinct(candidates.c.owner_id)),
        func.coalesce(func.max(candidates.c.like_count), 0),
    )).one()
    cold_start_reasons = []
    if eligible_photo_count < SCOREBOARD_MIN_PHOTOS_FOR_POPULAR:
        cold_start_reasons.append('not_enough_photos')
    if eligible_author_count < SCOREBOARD_MIN_AUTHORS_FOR_POPULAR:
        cold_start_reasons.append('not_enough_authors')
    if eligible_photo_count and max_likes == 0:
        cold_start_reasons.append('all_zero_likes')
    if not eligible_photo_count:
        cold_start_reasons.append('empty_window')
    ranking_mode = 'collection' if cold_start_reasons else 'popular'
    ranking_sort = (['like_count_desc'] if ranking_mode == 'popular' else []) + [
        'gallery_added_at_desc', 'review_id_desc',
    ]

    def order(columns):
        return ((columns.like_count.desc(),) if ranking_mode == 'popular' else ()) + (
            columns.added_at.desc(), columns.review_id.desc(),
        )

    ranked = select(
        candidates,
        func.row_number().over(
            partition_by=candidates.c.owner_id, order_by=order(candidates.c),
        ).label('author_rank'),
    ).cte('scoreboard_ranked')
    winners = select(ranked).where(
        ranked.c.author_rank <= SCOREBOARD_MAX_ITEMS_PER_AUTHOR,
    ).order_by(*order(ranked.c)).limit(SCOREBOARD_LIMIT).subquery('scoreboard_winners')
    winner_rows = (
        db.query(Review, Photo, User, winners.c.like_count)
        .join(winners, winners.c.review_id == Review.id)
        .join(Photo, Photo.id == Review.photo_id)
        .join(User, User.id == Review.owner_user_id)
        .order_by(*order(winners.c))
        .all()
    )
    capped = [GalleryScoreboardRow(review, photo, owner, int(count)) for review, photo, owner, count in winner_rows]
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


def _neighbor_item(request: Request, row: tuple[Review, Photo, User, float], like_count: int) -> GalleryNeighborItem:
    review, _photo, owner, _primary = row
    return GalleryNeighborItem(
        review_id=review.public_id,
        gallery_added_at=review.gallery_added_at or review.created_at,
        final_score=float(review.final_score),
        like_count=max(0, int(like_count)),
        owner_username=owner.username,
        photo_thumbnail_url=_build_public_gallery_thumbnail_url(request, review.public_id),
    )


def build_gallery_neighbors(
    db: Session,
    request: Request,
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
    previous = _neighbor_item(request, neighbor_rows[0], like_counts.get(neighbor_rows[0][0].id, 0)) if neighbor_rows[0] else None
    next_item = _neighbor_item(request, neighbor_rows[1], like_counts.get(neighbor_rows[1][0].id, 0)) if neighbor_rows[1] else None
    return GalleryNeighborsResponse(review_id=review_public_id, previous=previous, next=next_item, back_href=back_href)
