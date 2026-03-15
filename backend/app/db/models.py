from __future__ import annotations

from datetime import date, datetime
import enum

from sqlalchemy import (
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
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    public_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    task_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey('review_tasks.id'), unique=True)
    photo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('photos.id'), nullable=False)
    owner_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.id'), nullable=False)
    mode: Mapped[ReviewMode] = mapped_column(Enum(ReviewMode, name='review_mode', create_type=False), nullable=False)
    status: Mapped[ReviewStatus] = mapped_column(Enum(ReviewStatus, name='review_status', create_type=False), nullable=False)
    schema_version: Mapped[str] = mapped_column(Text, nullable=False, default='1.0')
    result_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    final_score: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)
    is_public: Mapped[bool] = mapped_column(nullable=False, default=False, server_default='false')
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[float | None] = mapped_column(Numeric(12, 6))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    model_name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


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
