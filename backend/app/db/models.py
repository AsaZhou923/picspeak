from __future__ import annotations

from datetime import date, datetime
import enum

from sqlalchemy import (
    Boolean,
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class UserPlan(str, enum.Enum):
    guest = 'guest'
    free = 'free'
    pro = 'pro'


class UserStatus(str, enum.Enum):
    active = 'active'
    suspended = 'suspended'
    deleted = 'deleted'


class PhotoStatus(str, enum.Enum):
    UPLOADING = 'UPLOADING'
    READY = 'READY'
    REJECTED = 'REJECTED'


class ReviewMode(str, enum.Enum):
    flash = 'flash'
    pro = 'pro'


class TaskStatus(str, enum.Enum):
    PENDING = 'PENDING'
    RUNNING = 'RUNNING'
    SUCCEEDED = 'SUCCEEDED'
    FAILED = 'FAILED'
    EXPIRED = 'EXPIRED'
    DEAD_LETTER = 'DEAD_LETTER'


class ReviewStatus(str, enum.Enum):
    SUCCEEDED = 'SUCCEEDED'
    FAILED = 'FAILED'


class User(Base):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    public_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    clerk_user_id: Mapped[str | None] = mapped_column(Text, unique=True)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    username: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text)
    plan: Mapped[UserPlan] = mapped_column(Enum(UserPlan, name='user_plan', create_type=False), nullable=False, default=UserPlan.free)
    daily_quota_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    daily_quota_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    daily_quota_date: Mapped[date] = mapped_column(Date, nullable=False, server_default=func.current_date())
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus, name='user_status', create_type=False), nullable=False, default=UserStatus.active)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Photo(Base):
    __tablename__ = 'photos'
    __table_args__ = (
        UniqueConstraint('bucket', 'object_key', name='uq_photos_bucket_object'),
        CheckConstraint('size_bytes > 0', name='chk_photos_size_bytes'),
        CheckConstraint('nsfw_score IS NULL OR (nsfw_score >= 0 AND nsfw_score <= 1)', name='chk_photos_nsfw_score'),
        Index('idx_photos_owner_created', 'owner_user_id', 'created_at'),
        Index('idx_photos_status', 'status'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    public_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    owner_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.id'), nullable=False)
    upload_id: Mapped[str] = mapped_column(Text, nullable=False)
    bucket: Mapped[str] = mapped_column(Text, nullable=False)
    object_key: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str | None] = mapped_column(Text)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[PhotoStatus] = mapped_column(Enum(PhotoStatus, name='photo_status', create_type=False), nullable=False, default=PhotoStatus.UPLOADING)
    exif_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    client_meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    nsfw_label: Mapped[str | None] = mapped_column(Text)
    nsfw_score: Mapped[float | None] = mapped_column(Numeric(5, 4))
    rejected_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ReviewTask(Base):
    __tablename__ = 'review_tasks'
    __table_args__ = (
        UniqueConstraint('owner_user_id', 'idempotency_key', name='uq_review_tasks_user_idempotency'),
        Index('idx_review_tasks_status_created', 'status', 'created_at'),
        Index('idx_review_tasks_photo_created', 'photo_id', 'created_at'),
        Index('idx_review_tasks_owner_created', 'owner_user_id', 'created_at'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    public_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    photo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('photos.id'), nullable=False)
    owner_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.id'), nullable=False)
    mode: Mapped[ReviewMode] = mapped_column(Enum(ReviewMode, name='review_mode', create_type=False), nullable=False)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus, name='task_status', create_type=False), nullable=False, default=TaskStatus.PENDING)
    idempotency_key: Mapped[str | None] = mapped_column(Text)
    request_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_code: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    claimed_by: Mapped[str | None] = mapped_column(Text)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dead_lettered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expire_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    photo: Mapped[Photo] = relationship()


class Review(Base):
    __tablename__ = 'reviews'
    __table_args__ = (
        Index('idx_reviews_photo_created', 'photo_id', 'created_at'),
        Index('idx_reviews_owner_created', 'owner_user_id', 'created_at'),
        Index('idx_reviews_owner_deleted_created', 'owner_user_id', 'deleted_at', 'created_at'),
        Index('idx_reviews_owner_image_type_created', 'owner_user_id', 'image_type', 'created_at'),
        Index('idx_reviews_source_review', 'source_review_id'),
        Index('uq_reviews_share_token', 'share_token', unique=True),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    public_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    task_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey('review_tasks.id'), unique=True)
    photo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('photos.id'), nullable=False)
    owner_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.id'), nullable=False)
    source_review_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey('reviews.id'))
    mode: Mapped[ReviewMode] = mapped_column(Enum(ReviewMode, name='review_mode', create_type=False), nullable=False)
    status: Mapped[ReviewStatus] = mapped_column(Enum(ReviewStatus, name='review_status', create_type=False), nullable=False)
    image_type: Mapped[str] = mapped_column(Text, nullable=False, default='default', server_default='default')
    schema_version: Mapped[str] = mapped_column(Text, nullable=False, default='1.0')
    result_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    final_score: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)
    is_public: Mapped[bool] = mapped_column(nullable=False, default=False, server_default='false')
    share_token: Mapped[str | None] = mapped_column(Text)
    favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    gallery_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    gallery_audit_status: Mapped[str] = mapped_column(Text, nullable=False, default='none', server_default='none')
    gallery_added_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    gallery_rejected_reason: Mapped[str | None] = mapped_column(Text)
    tags_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    note: Mapped[str | None] = mapped_column(Text)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[float | None] = mapped_column(Numeric(12, 6))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    model_name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ReviewLike(Base):
    __tablename__ = 'review_likes'
    __table_args__ = (
        UniqueConstraint('review_id', 'user_id', name='uq_review_likes_review_user'),
        Index('idx_review_likes_review_created', 'review_id', 'created_at'),
        Index('idx_review_likes_user_created', 'user_id', 'created_at'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    review_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('reviews.id'), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BlogPostView(Base):
    __tablename__ = 'blog_post_views'
    __table_args__ = (
        CheckConstraint('view_count >= 0', name='chk_blog_post_views_count_non_negative'),
        UniqueConstraint('slug', name='uq_blog_post_views_slug'),
        Index('idx_blog_post_views_count', 'view_count'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    slug: Mapped[str] = mapped_column(Text, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default='0')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class ReviewTaskEvent(Base):
    __tablename__ = 'review_task_events'
    __table_args__ = (
        Index('idx_review_task_events_task_created', 'task_id', 'created_at'),
        Index('idx_review_task_events_public_created', 'task_public_id', 'created_at'),
        Index('idx_review_task_events_type_created', 'event_type', 'created_at'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('review_tasks.id'), nullable=False)
    task_public_id: Mapped[str] = mapped_column(Text, nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_code: Mapped[str | None] = mapped_column(Text)
    message: Mapped[str | None] = mapped_column(Text)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UsageLedger(Base):
    __tablename__ = 'usage_ledger'
    __table_args__ = (
        Index('idx_usage_ledger_user_bill_date', 'user_id', 'bill_date'),
        Index('idx_usage_ledger_type_bill_date', 'usage_type', 'bill_date'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.id'), nullable=False)
    review_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey('reviews.id'))
    task_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey('review_tasks.id'))
    usage_type: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    bill_date: Mapped[date] = mapped_column(Date, nullable=False)
    metadata_json: Mapped[dict] = mapped_column('metadata', JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BillingSubscription(Base):
    __tablename__ = 'billing_subscriptions'
    __table_args__ = (
        Index('uq_billing_subscriptions_provider_subscription', 'provider', 'provider_subscription_id', unique=True),
        Index('idx_billing_subscriptions_user_provider', 'user_id', 'provider'),
        Index('idx_billing_subscriptions_status_updated', 'status', 'updated_at'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.id'), nullable=False)
    provider: Mapped[str] = mapped_column(Text, nullable=False, default='lemonsqueezy')
    provider_customer_id: Mapped[str | None] = mapped_column(Text)
    provider_order_id: Mapped[str | None] = mapped_column(Text)
    provider_subscription_id: Mapped[str | None] = mapped_column(Text)
    store_id: Mapped[str | None] = mapped_column(Text)
    product_id: Mapped[str | None] = mapped_column(Text)
    variant_id: Mapped[str | None] = mapped_column(Text)
    product_name: Mapped[str | None] = mapped_column(Text)
    variant_name: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, default='pending')
    user_email: Mapped[str | None] = mapped_column(Text)
    cancelled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    test_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    renews_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    update_payment_method_url: Mapped[str | None] = mapped_column(Text)
    customer_portal_url: Mapped[str | None] = mapped_column(Text)
    customer_portal_update_subscription_url: Mapped[str | None] = mapped_column(Text)
    last_event_name: Mapped[str | None] = mapped_column(Text)
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_invoice_id: Mapped[str | None] = mapped_column(Text)
    last_payment_status: Mapped[str | None] = mapped_column(Text)
    last_payment_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    raw_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BillingActivationCode(Base):
    __tablename__ = 'billing_activation_codes'
    __table_args__ = (
        UniqueConstraint('code_hash', name='uq_billing_activation_codes_hash'),
        CheckConstraint('duration_days > 0', name='chk_billing_activation_codes_duration_days'),
        Index('idx_billing_activation_codes_prefix', 'code_prefix'),
        Index('idx_billing_activation_codes_batch_created', 'batch_id', 'created_at'),
        Index('idx_billing_activation_codes_redeemed', 'redeemed_at'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code_hash: Mapped[str] = mapped_column(Text, nullable=False)
    code_prefix: Mapped[str] = mapped_column(Text, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default='30')
    source: Mapped[str] = mapped_column(Text, nullable=False, default='ifdian', server_default='ifdian')
    batch_id: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    redeemed_by_user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey('users.id'))
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BillingWebhookEvent(Base):
    __tablename__ = 'billing_webhook_events'
    __table_args__ = (
        Index('uq_billing_webhook_events_provider_hash', 'provider', 'event_hash', unique=True),
        Index('idx_billing_webhook_events_provider_created', 'provider', 'created_at'),
        Index('idx_billing_webhook_events_event_name_created', 'event_name', 'created_at'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    provider: Mapped[str] = mapped_column(Text, nullable=False, default='lemonsqueezy')
    event_name: Mapped[str] = mapped_column(Text, nullable=False)
    event_hash: Mapped[str] = mapped_column(Text, nullable=False)
    resource_type: Mapped[str | None] = mapped_column(Text)
    resource_id: Mapped[str | None] = mapped_column(Text)
    test_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    outcome: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey('users.id'))
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class RateLimitCounter(Base):
    __tablename__ = 'rate_limit_counters'
    __table_args__ = (
        UniqueConstraint('scope', 'scope_key', 'endpoint', 'window_start', 'window_seconds', name='uq_rate_limit_window'),
        Index('idx_rate_limit_scope_window', 'scope', 'scope_key', 'window_start'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    scope_key: Mapped[str] = mapped_column(Text, nullable=False)
    endpoint: Mapped[str | None] = mapped_column(Text)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    window_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class IdempotencyKey(Base):
    __tablename__ = 'idempotency_keys'
    __table_args__ = (
        UniqueConstraint('user_id', 'endpoint', 'idempotency_key', name='uq_idempotency_user_endpoint_key'),
        Index('idx_idempotency_expire_at', 'expire_at'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.id'), nullable=False)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(Text, nullable=False)
    request_hash: Mapped[str] = mapped_column(Text, nullable=False)
    http_status: Mapped[int | None] = mapped_column(Integer)
    response_json: Mapped[dict | None] = mapped_column(JSONB)
    expire_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ApiRequestLog(Base):
    __tablename__ = 'api_request_logs'
    __table_args__ = (
        Index('idx_api_request_logs_created', 'created_at'),
        Index('idx_api_request_logs_user_created', 'user_public_id', 'created_at'),
        Index('idx_api_request_logs_ip_created', 'client_ip', 'created_at'),
        Index('idx_api_request_logs_path_created', 'path', 'created_at'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    request_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    method: Mapped[str] = mapped_column(Text, nullable=False)
    path: Mapped[str] = mapped_column(Text, nullable=False)
    query_string: Mapped[str | None] = mapped_column(Text)
    endpoint: Mapped[str | None] = mapped_column(Text)
    client_ip: Mapped[str | None] = mapped_column(Text)
    user_public_id: Mapped[str | None] = mapped_column(Text)
    user_agent: Mapped[str | None] = mapped_column(Text)
    request_body: Mapped[str | None] = mapped_column(Text)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
