from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


REVIEW_SCHEMA_VERSION = '1.0'


def default_review_scores() -> dict[str, int]:
    return {
        'composition': 0,
        'lighting': 0,
        'color': 0,
        'impact': 0,
        'technical': 0,
    }


def default_review_tags() -> list[str]:
    return []


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
    image_type: str = Field(default='default', pattern='^(default|landscape|portrait|street|still_life|architecture)$')
    source_review_id: str | None = None
    async_mode: bool = Field(default=True, alias='async')
    idempotency_key: str | None = None
    locale: str = Field(default='zh', pattern='^(zh|en|ja)$')


class GuestReviewMigrateRequest(BaseModel):
    guest_token: str | None = None
    recent_limit: int = Field(default=20, ge=1, le=100)


class AuthClerkExchangeRequest(BaseModel):
    guest_token: str | None = None
    recent_limit: int = Field(default=20, ge=1, le=100)


class GuestReviewMigrateResponse(BaseModel):
    migrated_reviews: int
    migrated_photos: int


class ReviewResult(BaseModel):
    schema_version: str = REVIEW_SCHEMA_VERSION
    prompt_version: str = ''
    score_version: str = 'legacy'
    model_name: str = ''
    model_version: str = ''
    scores: dict[str, int] = Field(default_factory=default_review_scores)
    final_score: float = 0.0
    advantage: str = ''
    critique: str = ''
    suggestions: str = ''
    image_type: str = 'default'
    billing_info: dict[str, Any] = Field(default_factory=dict)
    visual_analysis: dict[str, Any] = Field(default_factory=dict)
    tonal_analysis: dict[str, Any] = Field(default_factory=dict)
    issue_marks: list[dict[str, Any]] = Field(default_factory=list)
    exif_info: dict[str, Any] = Field(default_factory=dict)
    share_info: dict[str, Any] = Field(default_factory=dict)


class ReviewCreateAsyncResponse(BaseModel):
    task_id: str
    status: str
    estimated_seconds: int


class InternalTaskExecuteRequest(BaseModel):
    task_id: str


class ReviewCreateSyncResponse(BaseModel):
    review_id: str
    status: str
    result: ReviewResult


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: int
    review_id: str | None = None
    attempt_count: int = 0
    max_attempts: int = 0
    next_attempt_at: datetime | None = None
    last_heartbeat_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: dict[str, Any] | None = None


class GenerationTemplateItem(BaseModel):
    key: str
    label_zh: str
    label_en: str
    description: str
    default_negative: str


class GenerationTemplatesResponse(BaseModel):
    items: list[GenerationTemplateItem]
    credits_table: dict[str, dict[str, int]]


class GenerationCreateRequest(BaseModel):
    generation_mode: str = Field(default='general', pattern='^(general|review_linked)$')
    intent: str = Field(default='photo_inspiration', max_length=64)
    prompt: str = Field(min_length=3, max_length=4000)
    template_key: str | None = Field(default=None, max_length=64)
    prompt_example_id: str | None = Field(default=None, max_length=128)
    prompt_example_category: str | None = Field(default=None, max_length=64)
    source_photo_id: str | None = None
    source_review_id: str | None = None
    image_type: str = Field(default='default', pattern='^(default|landscape|portrait|street|still_life|architecture)$')
    quality: str = Field(default='low', pattern='^(low|medium|high)$')
    size: str = Field(default='1024x1024', max_length=32)
    style: str = Field(default='realistic', max_length=64)
    negative_prompt: str | None = Field(default=None, max_length=1000)
    output_format: str = Field(default='webp', pattern='^(webp|png|jpeg)$')
    async_mode: bool = Field(default=True, alias='async')
    idempotency_key: str | None = None


class GenerationCreateResponse(BaseModel):
    task_id: str
    status: str
    estimated_seconds: int
    credits_reserved: int


class GenerationTaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: int
    generation_id: str | None = None
    generation_mode: str = 'general'
    intent: str | None = None
    source_review_id: str | None = None
    attempt_count: int = 0
    max_attempts: int = 0
    next_attempt_at: datetime | None = None
    last_heartbeat_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: dict[str, Any] | None = None


class GeneratedImageItem(BaseModel):
    generation_id: str
    task_id: str | None = None
    image_url: str
    generation_mode: str
    intent: str
    prompt: str
    revised_prompt: str | None = None
    model_name: str
    model_snapshot: str | None = None
    quality: str
    size: str
    output_format: str
    credits_charged: int
    template_key: str | None = None
    source_photo_id: str | None = None
    source_review_id: str | None = None
    created_at: datetime


class GeneratedImageDetailResponse(GeneratedImageItem):
    cost_usd: float | None = None
    input_text_tokens: int | None = None
    input_image_tokens: int | None = None
    output_image_tokens: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GeneratedImageHistoryResponse(BaseModel):
    items: list[GeneratedImageItem]
    next_cursor: str | None = None


class ReviewGetResponse(BaseModel):
    review_id: str
    photo_id: str
    photo_url: str | None = None
    mode: str
    status: str
    image_type: str = 'default'
    source_review_id: str | None = None
    viewer_is_owner: bool = False
    favorite: bool = False
    gallery_visible: bool = False
    gallery_audit_status: str = 'none'
    gallery_added_at: datetime | None = None
    gallery_rejected_reason: str | None = None
    tags: list[str] = Field(default_factory=default_review_tags)
    note: str | None = None
    result: ReviewResult
    created_at: datetime
    exif_data: dict[str, Any] | None = None


class ReviewListItem(BaseModel):
    review_id: str
    mode: str
    status: str


class PhotoReviewsResponse(BaseModel):
    items: list[ReviewListItem]
    next_cursor: str | None = None


class ReviewHistoryItem(BaseModel):
    review_id: str
    photo_id: str
    photo_url: str | None = None
    photo_thumbnail_url: str | None = None
    mode: str
    status: str
    image_type: str = 'default'
    source_review_id: str | None = None
    final_score: float
    scores: dict[str, int] = Field(default_factory=default_review_scores)
    model_name: str = ''
    model_version: str = ''
    favorite: bool = False
    gallery_visible: bool = False
    gallery_audit_status: str = 'none'
    gallery_added_at: datetime | None = None
    tags: list[str] = Field(default_factory=default_review_tags)
    note: str | None = None
    is_shared: bool = False
    created_at: datetime


class ReviewHistoryResponse(BaseModel):
    items: list[ReviewHistoryItem]
    next_cursor: str | None = None


class ReviewShareResponse(BaseModel):
    review_id: str
    share_token: str
    share_url: str
    enabled: bool = True


class ReviewMetaUpdateRequest(BaseModel):
    favorite: bool | None = None
    gallery_visible: bool | None = None
    tags: list[str] | None = None
    note: str | None = None


class ReviewMetaResponse(BaseModel):
    review_id: str
    favorite: bool = False
    gallery_visible: bool = False
    gallery_audit_status: str = 'none'
    gallery_added_at: datetime | None = None
    gallery_rejected_reason: str | None = None
    tags: list[str] = Field(default_factory=default_review_tags)
    note: str | None = None


class PublicGalleryItem(BaseModel):
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
    like_count: int = 0
    liked_by_viewer: bool = False
    recommended: bool = False
    score_percentile: float | None = None
    gallery_added_at: datetime
    created_at: datetime


class PublicGalleryResponse(BaseModel):
    items: list[PublicGalleryItem]
    total_count: int = 0
    next_cursor: str | None = None


class GalleryLikeResponse(BaseModel):
    review_id: str
    like_count: int = 0
    liked_by_viewer: bool = False


class BlogPostViewItem(BaseModel):
    slug: str
    view_count: int = 0


class BlogPostViewsResponse(BaseModel):
    items: list[BlogPostViewItem] = Field(default_factory=list)


class BlogPostViewIncrementResponse(BaseModel):
    slug: str
    view_count: int = 0


class ProductAnalyticsTrackRequest(BaseModel):
    event_name: str = Field(min_length=1, max_length=64)
    source: str | None = Field(default=None, max_length=64)
    page_path: str | None = Field(default=None, max_length=512)
    locale: str | None = Field(default=None, max_length=16)
    session_id: str | None = Field(default=None, max_length=128)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProductAnalyticsTrackResponse(BaseModel):
    status: str
    event_name: str


class ReviewExportPhoto(BaseModel):
    photo_id: str
    photo_url: str | None = None
    photo_thumbnail_url: str | None = None


class ReviewExportData(BaseModel):
    review_id: str
    source_review_id: str | None = None
    mode: str
    status: str
    image_type: str = 'default'
    model_name: str = ''
    model_version: str = ''
    final_score: float
    scores: dict[str, int] = Field(default_factory=default_review_scores)
    advantage: str = ''
    critique: str = ''
    suggestions: str = ''
    favorite: bool = False
    tags: list[str] = Field(default_factory=default_review_tags)
    note: str | None = None
    created_at: datetime
    exported_at: datetime


class ReviewExportResponse(BaseModel):
    photo: ReviewExportPhoto
    review: ReviewExportData


class UsageQuota(BaseModel):
    daily_total: int | None = None
    daily_used: int | None = None
    daily_remaining: int | None = None
    monthly_total: int | None = None
    monthly_used: int | None = None
    monthly_remaining: int | None = None
    pro_monthly_total: int | None = None
    pro_monthly_used: int | None = None
    pro_monthly_remaining: int | None = None


class UsageFeatures(BaseModel):
    review_modes: list[str]
    history_retention_days: int | None = None
    priority_queue: bool


class UsageSubscription(BaseModel):
    provider: str | None = None
    status: str
    cancelled: bool = False
    renews_at: datetime | None = None
    ends_at: datetime | None = None
    current_period_ends_at: datetime | None = None


class UsageGenerationCredits(BaseModel):
    monthly_total: int | None = None
    monthly_used: int | None = None
    monthly_remaining: int | None = None


class UsageResponse(BaseModel):
    plan: str
    quota: UsageQuota
    generation_credits: UsageGenerationCredits
    features: UsageFeatures
    subscription: UsageSubscription | None = None
    rate_limit: dict[str, Any]


class BillingCheckoutRequest(BaseModel):
    plan: str = Field(pattern='^(pro)$')
    locale: str | None = Field(default=None, max_length=16)


class BillingCheckoutResponse(BaseModel):
    status: str
    plan: str
    message: str
    checkout_url: str | None = None


class CreditPackCheckoutRequest(BaseModel):
    pack: str = Field(default='image_credits_300', pattern='^(image_credits_300)$')
    currency: str = Field(default='usd', pattern='^(usd|rmb)$')
    locale: str | None = Field(default=None, max_length=16)


class CreditPackCheckoutResponse(BaseModel):
    status: str
    pack: str
    credits: int
    currency: str
    price: str
    message: str
    checkout_url: str | None = None


class BillingPortalResponse(BaseModel):
    status: str
    portal_url: str | None = None
    message: str


class ActivationCodeRedeemRequest(BaseModel):
    code: str = Field(min_length=6, max_length=128)


class ActivationCodeRedeemResponse(BaseModel):
    status: str
    plan: str
    provider: str
    message: str
    activated_until: datetime


class ImageCreditCodeRedeemRequest(BaseModel):
    code: str = Field(min_length=3, max_length=64)


class ImageCreditCodeRedeemResponse(BaseModel):
    status: str
    code: str
    credits_granted: int
    message: str
    monthly_total: int | None
    monthly_used: int | None
    monthly_remaining: int | None


class AuthGoogleLoginRequest(BaseModel):
    id_token: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user_id: str
    plan: str
    auth_provider: str = 'google'
    clerk_user_id: str | None = None
    migrated_reviews: int = 0
    migrated_photos: int = 0


class AuthGuestResponse(AuthTokenResponse):
    auth_provider: str = 'guest'
