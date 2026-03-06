from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ErrorPayload(BaseModel):
    code: str
    message: str
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorPayload


class PresignRequest(BaseModel):
    filename: str
    content_type: str
    size_bytes: int = Field(gt=0)
    sha256: str | None = None


class PresignResponse(BaseModel):
    upload_id: str
    object_key: str
    put_url: str
    headers: dict[str, str]
    expires_at: datetime


class PhotoCreateRequest(BaseModel):
    upload_id: str
    exif_data: dict[str, Any] = Field(default_factory=dict)
    client_meta: dict[str, Any] = Field(default_factory=dict)


class PhotoCreateResponse(BaseModel):
    photo_id: str
    photo_url: str
    status: str


class ReviewCreateRequest(BaseModel):
    photo_id: str
    mode: str = Field(pattern='^(flash|pro)$')
    async_mode: bool = Field(default=True, alias='async')
    idempotency_key: str | None = None
    locale: str = Field(default='zh', pattern='^(zh|en|ja)$')


class ReviewResult(BaseModel):
    schema_version: str = '1.0'
    scores: dict[str, int]
    final_score: float
    advantage: str
    critique: str
    suggestions: str


class ReviewCreateAsyncResponse(BaseModel):
    task_id: str
    status: str
    estimated_seconds: int


class ReviewCreateSyncResponse(BaseModel):
    review_id: str
    status: str
    result: ReviewResult


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: int
    review_id: str | None = None
    error: dict[str, Any] | None = None


class ReviewGetResponse(BaseModel):
    review_id: str
    photo_id: str
    mode: str
    status: str
    result: ReviewResult
    created_at: datetime


class ReviewListItem(BaseModel):
    review_id: str
    mode: str
    status: str


class PhotoReviewsResponse(BaseModel):
    items: list[ReviewListItem]
    next_cursor: str | None = None


class UsageResponse(BaseModel):
    plan: str
    quota: dict[str, int]
    rate_limit: dict[str, Any]


class AuthGoogleLoginRequest(BaseModel):
    id_token: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user_id: str
    plan: str


class AuthGuestResponse(AuthTokenResponse):
    pass
