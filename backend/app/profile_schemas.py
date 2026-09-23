from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ProfileSettingsUpdateRequest(BaseModel):
    public_profile_enabled: bool


class ProfileSettingsResponse(BaseModel):
    public_profile_enabled: bool
    public_profile_id: str | None = None
    username: str
    avatar_url: str | None = None
    gallery_review_count: int = 0


class PublicProfileGalleryItem(BaseModel):
    review_id: str
    photo_id: str
    photo_url: str | None = None
    photo_thumbnail_url: str | None = None
    mode: str
    image_type: str = 'default'
    final_score: float
    score_version: str = 'legacy'
    summary: str = ''
    like_count: int = 0
    recommended: bool = False
    score_percentile: float | None = None
    gallery_added_at: datetime
    created_at: datetime


class PublicProfileResponse(BaseModel):
    public_profile_id: str
    username: str
    avatar_url: str | None = None
    gallery_review_count: int = 0
    total_like_count: int = 0
    items: list[PublicProfileGalleryItem] = Field(default_factory=list)
    next_cursor: str | None = None
