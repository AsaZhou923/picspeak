from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class GalleryScoreboardItem(BaseModel):
    review_id: str
    photo_id: str
    photo_url: str | None = None
    photo_thumbnail_url: str | None = None
    mode: str
    image_type: str = 'default'
    final_score: float
    score_version: str = 'legacy'
    summary: str = ''
    owner_username: str
    owner_avatar_url: str | None = None
    owner_profile_url: str | None = None
    like_count: int = 0
    liked_by_viewer: bool = False
    recommended: bool = False
    score_percentile: float | None = None
    gallery_added_at: datetime
    created_at: datetime


class GalleryScoreboardResponse(BaseModel):
    items: list[GalleryScoreboardItem]
    window_days: int = Field(ge=1)
    as_of: datetime
    window_start: datetime
    window_end: datetime
    ranking_mode: str = Field(pattern='^(popular|collection)$')
    ranking_rule_version: str
    ranking_sort: list[str] = Field(default_factory=list)
    eligible_photo_count: int = 0
    eligible_author_count: int = 0
    cold_start_reasons: list[str] = Field(default_factory=list)
    image_type: str | None = None


class GalleryListResponse(BaseModel):
    items: list[GalleryScoreboardItem]
    total_count: int = 0
    next_cursor: str | None = None


class GalleryNeighborItem(BaseModel):
    review_id: str
    gallery_added_at: datetime
    final_score: float
    like_count: int = 0
    owner_username: str
    photo_thumbnail_url: str | None = None


class GalleryNeighborsResponse(BaseModel):
    review_id: str
    previous: GalleryNeighborItem | None = None
    next: GalleryNeighborItem | None = None
    back_href: str
