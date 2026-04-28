"""Baseline current runtime schema under Alembic.

Revision ID: 20260428_0001
Revises:
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Iterable

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Connection

revision = '20260428_0001'
down_revision = None
branch_labels = None
depends_on = None

USER_PLAN = postgresql.ENUM('guest', 'free', 'pro', name='user_plan', create_type=False)
USER_STATUS = postgresql.ENUM('active', 'suspended', 'deleted', name='user_status', create_type=False)
PHOTO_STATUS = postgresql.ENUM('UPLOADING', 'READY', 'REJECTED', name='photo_status', create_type=False)
REVIEW_MODE = postgresql.ENUM('flash', 'pro', name='review_mode', create_type=False)
TASK_STATUS = postgresql.ENUM(
    'PENDING',
    'RUNNING',
    'SUCCEEDED',
    'FAILED',
    'EXPIRED',
    'DEAD_LETTER',
    name='task_status',
    create_type=False,
)
REVIEW_STATUS = postgresql.ENUM('SUCCEEDED', 'FAILED', name='review_status', create_type=False)

BASELINE_METADATA = sa.MetaData()


def _id() -> sa.Column:
    return sa.Column('id', sa.BigInteger, primary_key=True)


def _public_id() -> sa.Column:
    return sa.Column('public_id', sa.Text, nullable=False, unique=True)


def _created_at() -> sa.Column:
    return sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def _updated_at() -> sa.Column:
    return sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def _jsonb(name: str, default: str = "'{}'::jsonb") -> sa.Column:
    return sa.Column(name, postgresql.JSONB, nullable=False, server_default=sa.text(default))


users = sa.Table(
    'users',
    BASELINE_METADATA,
    _id(),
    _public_id(),
    sa.Column('clerk_user_id', sa.Text, unique=True),
    sa.Column('avatar_url', sa.Text),
    sa.Column('email', sa.Text, nullable=False, unique=True),
    sa.Column('username', sa.Text, nullable=False, unique=True),
    sa.Column('password_hash', sa.Text),
    sa.Column('plan', USER_PLAN, nullable=False, server_default='free'),
    sa.Column('daily_quota_total', sa.Integer, nullable=False, server_default='0'),
    sa.Column('daily_quota_used', sa.Integer, nullable=False, server_default='0'),
    sa.Column('daily_quota_date', sa.Date, nullable=False, server_default=sa.text('CURRENT_DATE')),
    sa.Column('status', USER_STATUS, nullable=False, server_default='active'),
    sa.Column('last_login_at', sa.DateTime(timezone=True)),
    _created_at(),
    _updated_at(),
    sa.CheckConstraint('daily_quota_total >= 0', name='chk_users_daily_quota_total_non_negative'),
    sa.CheckConstraint('daily_quota_used >= 0', name='chk_users_daily_quota_used_non_negative'),
)

photos = sa.Table(
    'photos',
    BASELINE_METADATA,
    _id(),
    _public_id(),
    sa.Column('owner_user_id', sa.BigInteger, sa.ForeignKey('users.id'), nullable=False),
    sa.Column('upload_id', sa.Text, nullable=False),
    sa.Column('bucket', sa.Text, nullable=False),
    sa.Column('object_key', sa.Text, nullable=False),
    sa.Column('content_type', sa.Text, nullable=False),
    sa.Column('size_bytes', sa.BigInteger, nullable=False),
    sa.Column('checksum_sha256', sa.Text),
    sa.Column('width', sa.Integer),
    sa.Column('height', sa.Integer),
    sa.Column('status', PHOTO_STATUS, nullable=False, server_default='UPLOADING'),
    _jsonb('exif_data'),
    _jsonb('client_meta'),
    sa.Column('nsfw_label', sa.Text),
    sa.Column('nsfw_score', sa.Numeric(5, 4)),
    sa.Column('rejected_reason', sa.Text),
    _created_at(),
    _updated_at(),
    sa.UniqueConstraint('bucket', 'object_key', name='uq_photos_bucket_object'),
    sa.CheckConstraint('size_bytes > 0', name='chk_photos_size_bytes'),
    sa.CheckConstraint(
        'nsfw_score IS NULL OR (nsfw_score >= 0 AND nsfw_score <= 1)',
        name='chk_photos_nsfw_score',
    ),
)

review_tasks = sa.Table(
    'review_tasks',
    BASELINE_METADATA,
    _id(),
    _public_id(),
    sa.Column('photo_id', sa.BigInteger, sa.ForeignKey('photos.id'), nullable=False),
    sa.Column('owner_user_id', sa.BigInteger, sa.ForeignKey('users.id'), nullable=False),
    sa.Column('mode', REVIEW_MODE, nullable=False),
    sa.Column('status', TASK_STATUS, nullable=False, server_default='PENDING'),
    sa.Column('idempotency_key', sa.Text),
    _jsonb('request_payload'),
    sa.Column('attempt_count', sa.Integer, nullable=False, server_default='0'),
    sa.Column('max_attempts', sa.Integer, nullable=False, server_default='3'),
    sa.Column('progress', sa.Integer, nullable=False, server_default='0'),
    sa.Column('error_code', sa.Text),
    sa.Column('error_message', sa.Text),
    sa.Column('next_attempt_at', sa.DateTime(timezone=True)),
    sa.Column('claimed_by', sa.Text),
    sa.Column('last_heartbeat_at', sa.DateTime(timezone=True)),
    sa.Column('dead_lettered_at', sa.DateTime(timezone=True)),
    sa.Column('started_at', sa.DateTime(timezone=True)),
    sa.Column('finished_at', sa.DateTime(timezone=True)),
    sa.Column('expire_at', sa.DateTime(timezone=True)),
    _created_at(),
    _updated_at(),
    sa.UniqueConstraint('owner_user_id', 'idempotency_key', name='uq_review_tasks_user_idempotency'),
    sa.CheckConstraint('attempt_count >= 0', name='chk_review_tasks_attempt_count_non_negative'),
    sa.CheckConstraint('max_attempts > 0', name='chk_review_tasks_max_attempts_positive'),
    sa.CheckConstraint('progress >= 0 AND progress <= 100', name='chk_review_tasks_progress_range'),
)

reviews = sa.Table(
    'reviews',
    BASELINE_METADATA,
    _id(),
    _public_id(),
    sa.Column('task_id', sa.BigInteger, sa.ForeignKey('review_tasks.id'), unique=True),
    sa.Column('photo_id', sa.BigInteger, sa.ForeignKey('photos.id'), nullable=False),
    sa.Column('owner_user_id', sa.BigInteger, sa.ForeignKey('users.id'), nullable=False),
    sa.Column('source_review_id', sa.BigInteger, sa.ForeignKey('reviews.id')),
    sa.Column('mode', REVIEW_MODE, nullable=False),
    sa.Column('status', REVIEW_STATUS, nullable=False),
    sa.Column('image_type', sa.Text, nullable=False, server_default='default'),
    sa.Column('schema_version', sa.Text, nullable=False, server_default='1.0'),
    _jsonb('result_json'),
    sa.Column('final_score', sa.Numeric(4, 2), nullable=False),
    sa.Column('is_public', sa.Boolean, nullable=False, server_default=sa.false()),
    sa.Column('share_token', sa.Text),
    sa.Column('favorite', sa.Boolean, nullable=False, server_default=sa.false()),
    sa.Column('gallery_visible', sa.Boolean, nullable=False, server_default=sa.false()),
    sa.Column('gallery_audit_status', sa.Text, nullable=False, server_default='none'),
    sa.Column('gallery_added_at', sa.DateTime(timezone=True)),
    sa.Column('gallery_rejected_reason', sa.Text),
    _jsonb('tags_json', "'[]'::jsonb"),
    sa.Column('note', sa.Text),
    sa.Column('deleted_at', sa.DateTime(timezone=True)),
    sa.Column('input_tokens', sa.Integer),
    sa.Column('output_tokens', sa.Integer),
    sa.Column('cost_usd', sa.Numeric(12, 6)),
    sa.Column('latency_ms', sa.Integer),
    sa.Column('model_name', sa.Text),
    _created_at(),
    _updated_at(),
    sa.CheckConstraint(
        '(input_tokens IS NULL OR input_tokens >= 0) AND '
        '(output_tokens IS NULL OR output_tokens >= 0) AND '
        '(latency_ms IS NULL OR latency_ms >= 0)',
        name='chk_reviews_tokens_non_negative',
    ),
)

review_likes = sa.Table(
    'review_likes',
    BASELINE_METADATA,
    _id(),
    sa.Column('review_id', sa.BigInteger, sa.ForeignKey('reviews.id'), nullable=False),
    sa.Column('user_id', sa.BigInteger, sa.ForeignKey('users.id'), nullable=False),
    _created_at(),
    sa.UniqueConstraint('review_id', 'user_id', name='uq_review_likes_review_user'),
)

blog_post_views = sa.Table(
    'blog_post_views',
    BASELINE_METADATA,
    _id(),
    sa.Column('slug', sa.Text, nullable=False),
    sa.Column('view_count', sa.Integer, nullable=False, server_default='0'),
    _created_at(),
    _updated_at(),
    sa.UniqueConstraint('slug', name='uq_blog_post_views_slug'),
    sa.CheckConstraint('view_count >= 0', name='chk_blog_post_views_count_non_negative'),
)

review_task_events = sa.Table(
    'review_task_events',
    BASELINE_METADATA,
    _id(),
    sa.Column('task_id', sa.BigInteger, sa.ForeignKey('review_tasks.id'), nullable=False),
    sa.Column('task_public_id', sa.Text, nullable=False),
    sa.Column('event_type', sa.Text, nullable=False),
    sa.Column('status', sa.Text, nullable=False),
    sa.Column('progress', sa.Integer, nullable=False, server_default='0'),
    sa.Column('attempt_count', sa.Integer, nullable=False, server_default='0'),
    sa.Column('error_code', sa.Text),
    sa.Column('message', sa.Text),
    _jsonb('payload_json'),
    _created_at(),
)

image_generation_tasks = sa.Table(
    'image_generation_tasks',
    BASELINE_METADATA,
    _id(),
    _public_id(),
    sa.Column('owner_user_id', sa.BigInteger, sa.ForeignKey('users.id'), nullable=False),
    sa.Column('source_photo_id', sa.BigInteger, sa.ForeignKey('photos.id')),
    sa.Column('source_review_id', sa.BigInteger, sa.ForeignKey('reviews.id')),
    sa.Column('status', TASK_STATUS, nullable=False, server_default='PENDING'),
    sa.Column('generation_mode', sa.Text, nullable=False, server_default='general'),
    sa.Column('intent', sa.Text, nullable=False),
    sa.Column('prompt', sa.Text, nullable=False),
    sa.Column('prompt_hash', sa.Text, nullable=False),
    sa.Column('idempotency_key', sa.Text),
    _jsonb('request_payload'),
    sa.Column('attempt_count', sa.Integer, nullable=False, server_default='0'),
    sa.Column('max_attempts', sa.Integer, nullable=False, server_default='2'),
    sa.Column('progress', sa.Integer, nullable=False, server_default='0'),
    sa.Column('error_code', sa.Text),
    sa.Column('error_message', sa.Text),
    sa.Column('started_at', sa.DateTime(timezone=True)),
    sa.Column('finished_at', sa.DateTime(timezone=True)),
    sa.Column('next_attempt_at', sa.DateTime(timezone=True)),
    sa.Column('claimed_by', sa.Text),
    sa.Column('last_heartbeat_at', sa.DateTime(timezone=True)),
    _created_at(),
    _updated_at(),
    sa.UniqueConstraint('owner_user_id', 'idempotency_key', name='uq_image_generation_tasks_user_idempotency'),
)

generated_images = sa.Table(
    'generated_images',
    BASELINE_METADATA,
    _id(),
    _public_id(),
    sa.Column('task_id', sa.BigInteger, sa.ForeignKey('image_generation_tasks.id')),
    sa.Column('owner_user_id', sa.BigInteger, sa.ForeignKey('users.id'), nullable=False),
    sa.Column('source_photo_id', sa.BigInteger, sa.ForeignKey('photos.id')),
    sa.Column('source_review_id', sa.BigInteger, sa.ForeignKey('reviews.id')),
    sa.Column('object_bucket', sa.Text, nullable=False),
    sa.Column('object_key', sa.Text, nullable=False),
    sa.Column('content_type', sa.Text, nullable=False, server_default='image/webp'),
    sa.Column('width', sa.Integer),
    sa.Column('height', sa.Integer),
    sa.Column('intent', sa.Text, nullable=False),
    sa.Column('generation_mode', sa.Text, nullable=False, server_default='general'),
    sa.Column('prompt', sa.Text, nullable=False),
    sa.Column('revised_prompt', sa.Text),
    sa.Column('model_name', sa.Text, nullable=False),
    sa.Column('model_snapshot', sa.Text),
    sa.Column('quality', sa.Text, nullable=False),
    sa.Column('size', sa.Text, nullable=False),
    sa.Column('output_format', sa.Text, nullable=False),
    sa.Column('input_text_tokens', sa.Integer),
    sa.Column('input_image_tokens', sa.Integer),
    sa.Column('output_image_tokens', sa.Integer),
    sa.Column('cost_usd', sa.Numeric(12, 6)),
    sa.Column('credits_charged', sa.Integer, nullable=False),
    sa.Column('template_key', sa.Text),
    _jsonb('metadata_json'),
    sa.Column('deleted_at', sa.DateTime(timezone=True)),
    _created_at(),
    _updated_at(),
    sa.CheckConstraint('credits_charged >= 0', name='chk_generated_images_credits_charged_non_negative'),
)

usage_ledger = sa.Table(
    'usage_ledger',
    BASELINE_METADATA,
    _id(),
    sa.Column('user_id', sa.BigInteger, sa.ForeignKey('users.id'), nullable=False),
    sa.Column('review_id', sa.BigInteger, sa.ForeignKey('reviews.id')),
    sa.Column('task_id', sa.BigInteger, sa.ForeignKey('review_tasks.id')),
    sa.Column('usage_type', sa.Text, nullable=False),
    sa.Column('amount', sa.Numeric(18, 6), nullable=False),
    sa.Column('unit', sa.Text, nullable=False),
    sa.Column('bill_date', sa.Date, nullable=False),
    _jsonb('metadata'),
    _created_at(),
)

billing_subscriptions = sa.Table(
    'billing_subscriptions',
    BASELINE_METADATA,
    _id(),
    sa.Column('user_id', sa.BigInteger, sa.ForeignKey('users.id'), nullable=False),
    sa.Column('provider', sa.Text, nullable=False, server_default='lemonsqueezy'),
    sa.Column('provider_customer_id', sa.Text),
    sa.Column('provider_order_id', sa.Text),
    sa.Column('provider_subscription_id', sa.Text),
    sa.Column('store_id', sa.Text),
    sa.Column('product_id', sa.Text),
    sa.Column('variant_id', sa.Text),
    sa.Column('product_name', sa.Text),
    sa.Column('variant_name', sa.Text),
    sa.Column('status', sa.Text, nullable=False, server_default='pending'),
    sa.Column('user_email', sa.Text),
    sa.Column('cancelled', sa.Boolean, nullable=False, server_default=sa.false()),
    sa.Column('test_mode', sa.Boolean, nullable=False, server_default=sa.false()),
    sa.Column('renews_at', sa.DateTime(timezone=True)),
    sa.Column('ends_at', sa.DateTime(timezone=True)),
    sa.Column('trial_ends_at', sa.DateTime(timezone=True)),
    sa.Column('update_payment_method_url', sa.Text),
    sa.Column('customer_portal_url', sa.Text),
    sa.Column('customer_portal_update_subscription_url', sa.Text),
    sa.Column('last_event_name', sa.Text),
    sa.Column('last_event_at', sa.DateTime(timezone=True)),
    sa.Column('last_invoice_id', sa.Text),
    sa.Column('last_payment_status', sa.Text),
    sa.Column('last_payment_at', sa.DateTime(timezone=True)),
    _jsonb('raw_payload'),
    _created_at(),
    _updated_at(),
)

billing_activation_codes = sa.Table(
    'billing_activation_codes',
    BASELINE_METADATA,
    _id(),
    sa.Column('code_hash', sa.Text, nullable=False),
    sa.Column('code_prefix', sa.Text, nullable=False),
    sa.Column('duration_days', sa.Integer, nullable=False, server_default='30'),
    sa.Column('source', sa.Text, nullable=False, server_default='ifdian'),
    sa.Column('batch_id', sa.Text),
    sa.Column('note', sa.Text),
    sa.Column('redeemed_by_user_id', sa.BigInteger, sa.ForeignKey('users.id')),
    sa.Column('redeemed_at', sa.DateTime(timezone=True)),
    sa.Column('expires_at', sa.DateTime(timezone=True)),
    sa.Column('disabled_at', sa.DateTime(timezone=True)),
    _jsonb('metadata_json'),
    _created_at(),
    _updated_at(),
    sa.UniqueConstraint('code_hash', name='uq_billing_activation_codes_hash'),
    sa.CheckConstraint('duration_days > 0', name='chk_billing_activation_codes_duration_days'),
)

billing_webhook_events = sa.Table(
    'billing_webhook_events',
    BASELINE_METADATA,
    _id(),
    sa.Column('provider', sa.Text, nullable=False, server_default='lemonsqueezy'),
    sa.Column('event_name', sa.Text, nullable=False),
    sa.Column('event_hash', sa.Text, nullable=False),
    sa.Column('resource_type', sa.Text),
    sa.Column('resource_id', sa.Text),
    sa.Column('test_mode', sa.Boolean, nullable=False, server_default=sa.false()),
    sa.Column('outcome', sa.Text),
    sa.Column('user_id', sa.BigInteger, sa.ForeignKey('users.id')),
    _jsonb('payload_json'),
    sa.Column('processed_at', sa.DateTime(timezone=True)),
    _created_at(),
)

rate_limit_counters = sa.Table(
    'rate_limit_counters',
    BASELINE_METADATA,
    _id(),
    sa.Column('scope', sa.Text, nullable=False),
    sa.Column('scope_key', sa.Text, nullable=False),
    sa.Column('endpoint', sa.Text),
    sa.Column('window_start', sa.DateTime(timezone=True), nullable=False),
    sa.Column('window_seconds', sa.Integer, nullable=False),
    sa.Column('hit_count', sa.Integer, nullable=False, server_default='0'),
    _created_at(),
    _updated_at(),
    sa.UniqueConstraint('scope', 'scope_key', 'endpoint', 'window_start', 'window_seconds', name='uq_rate_limit_window'),
)

idempotency_keys = sa.Table(
    'idempotency_keys',
    BASELINE_METADATA,
    _id(),
    sa.Column('user_id', sa.BigInteger, sa.ForeignKey('users.id'), nullable=False),
    sa.Column('endpoint', sa.Text, nullable=False),
    sa.Column('idempotency_key', sa.Text, nullable=False),
    sa.Column('request_hash', sa.Text, nullable=False),
    sa.Column('http_status', sa.Integer),
    sa.Column('response_json', postgresql.JSONB),
    sa.Column('expire_at', sa.DateTime(timezone=True), nullable=False),
    _created_at(),
    sa.UniqueConstraint('user_id', 'endpoint', 'idempotency_key', name='uq_idempotency_user_endpoint_key'),
)

api_request_logs = sa.Table(
    'api_request_logs',
    BASELINE_METADATA,
    _id(),
    sa.Column('request_id', sa.Text, nullable=False, unique=True),
    sa.Column('method', sa.Text, nullable=False),
    sa.Column('path', sa.Text, nullable=False),
    sa.Column('query_string', sa.Text),
    sa.Column('endpoint', sa.Text),
    sa.Column('client_ip', sa.Text),
    sa.Column('user_public_id', sa.Text),
    sa.Column('user_agent', sa.Text),
    sa.Column('request_body', sa.Text),
    sa.Column('status_code', sa.Integer, nullable=False),
    sa.Column('duration_ms', sa.Integer, nullable=False),
    _created_at(),
)

product_analytics_events = sa.Table(
    'product_analytics_events',
    BASELINE_METADATA,
    _id(),
    sa.Column('event_name', sa.Text, nullable=False),
    sa.Column('user_public_id', sa.Text),
    sa.Column('plan', sa.Text, nullable=False, server_default='guest'),
    sa.Column('device_id', sa.Text),
    sa.Column('session_id', sa.Text),
    sa.Column('source', sa.Text, nullable=False, server_default='unknown'),
    sa.Column('page_path', sa.Text),
    sa.Column('locale', sa.Text),
    _jsonb('metadata_json'),
    _created_at(),
)

sa.Index('idx_users_status_plan', users.c.status, users.c.plan)
sa.Index('idx_photos_owner_created', photos.c.owner_user_id, photos.c.created_at.desc())
sa.Index('idx_photos_status', photos.c.status)
sa.Index('idx_review_tasks_status_created', review_tasks.c.status, review_tasks.c.created_at)
sa.Index('idx_review_tasks_photo_created', review_tasks.c.photo_id, review_tasks.c.created_at.desc())
sa.Index('idx_review_tasks_owner_created', review_tasks.c.owner_user_id, review_tasks.c.created_at.desc())
sa.Index('idx_review_tasks_next_attempt', review_tasks.c.status, review_tasks.c.next_attempt_at)
sa.Index('idx_reviews_photo_created', reviews.c.photo_id, reviews.c.created_at.desc())
sa.Index('idx_reviews_owner_created', reviews.c.owner_user_id, reviews.c.created_at.desc())
sa.Index('idx_reviews_owner_deleted_created', reviews.c.owner_user_id, reviews.c.deleted_at, reviews.c.created_at.desc())
sa.Index('idx_reviews_owner_image_type_created', reviews.c.owner_user_id, reviews.c.image_type, reviews.c.created_at.desc())
sa.Index('idx_reviews_source_review', reviews.c.source_review_id)
sa.Index(
    'uq_reviews_share_token',
    reviews.c.share_token,
    unique=True,
    postgresql_where=reviews.c.share_token.isnot(None),
)
sa.Index(
    'idx_reviews_gallery_public',
    reviews.c.gallery_added_at.desc(),
    reviews.c.id.desc(),
    postgresql_where=sa.and_(
        reviews.c.gallery_visible.is_(True),
        reviews.c.gallery_audit_status == 'approved',
        reviews.c.deleted_at.is_(None),
    ),
)
sa.Index(
    'idx_reviews_gallery_recommendation',
    reviews.c.image_type,
    reviews.c.final_score,
    reviews.c.id,
    postgresql_where=sa.and_(
        reviews.c.gallery_visible.is_(True),
        reviews.c.gallery_audit_status == 'approved',
        reviews.c.deleted_at.is_(None),
    ),
)
sa.Index('idx_review_likes_review_created', review_likes.c.review_id, review_likes.c.created_at.desc())
sa.Index('idx_review_likes_user_created', review_likes.c.user_id, review_likes.c.created_at.desc())
sa.Index('idx_blog_post_views_count', blog_post_views.c.view_count.desc())
sa.Index('idx_review_task_events_task_created', review_task_events.c.task_id, review_task_events.c.created_at)
sa.Index('idx_review_task_events_public_created', review_task_events.c.task_public_id, review_task_events.c.created_at)
sa.Index('idx_review_task_events_type_created', review_task_events.c.event_type, review_task_events.c.created_at)
sa.Index('idx_image_generation_tasks_status_created', image_generation_tasks.c.status, image_generation_tasks.c.created_at.desc())
sa.Index('idx_image_generation_tasks_owner_created', image_generation_tasks.c.owner_user_id, image_generation_tasks.c.created_at.desc())
sa.Index('idx_image_generation_tasks_review_created', image_generation_tasks.c.source_review_id, image_generation_tasks.c.created_at.desc())
sa.Index('idx_generated_images_owner_created', generated_images.c.owner_user_id, generated_images.c.created_at.desc())
sa.Index('idx_generated_images_task', generated_images.c.task_id)
sa.Index('idx_generated_images_review_created', generated_images.c.source_review_id, generated_images.c.created_at.desc())
sa.Index('idx_usage_ledger_user_bill_date', usage_ledger.c.user_id, usage_ledger.c.bill_date)
sa.Index('idx_usage_ledger_type_bill_date', usage_ledger.c.usage_type, usage_ledger.c.bill_date)
sa.Index('idx_usage_ledger_user_type', usage_ledger.c.user_id, usage_ledger.c.usage_type)
sa.Index(
    'uq_billing_subscriptions_provider_subscription',
    billing_subscriptions.c.provider,
    billing_subscriptions.c.provider_subscription_id,
    unique=True,
)
sa.Index('idx_billing_subscriptions_user_provider', billing_subscriptions.c.user_id, billing_subscriptions.c.provider)
sa.Index('idx_billing_subscriptions_status_updated', billing_subscriptions.c.status, billing_subscriptions.c.updated_at.desc())
sa.Index('idx_billing_activation_codes_prefix', billing_activation_codes.c.code_prefix)
sa.Index('idx_billing_activation_codes_batch_created', billing_activation_codes.c.batch_id, billing_activation_codes.c.created_at.desc())
sa.Index('idx_billing_activation_codes_redeemed', billing_activation_codes.c.redeemed_at.desc())
sa.Index(
    'uq_billing_webhook_events_provider_hash',
    billing_webhook_events.c.provider,
    billing_webhook_events.c.event_hash,
    unique=True,
)
sa.Index('idx_billing_webhook_events_provider_created', billing_webhook_events.c.provider, billing_webhook_events.c.created_at.desc())
sa.Index('idx_billing_webhook_events_event_name_created', billing_webhook_events.c.event_name, billing_webhook_events.c.created_at.desc())
sa.Index('idx_rate_limit_scope_window', rate_limit_counters.c.scope, rate_limit_counters.c.scope_key, rate_limit_counters.c.window_start)
sa.Index('idx_idempotency_expire_at', idempotency_keys.c.expire_at)
sa.Index('idx_api_request_logs_created', api_request_logs.c.created_at)
sa.Index('idx_api_request_logs_user_created', api_request_logs.c.user_public_id, api_request_logs.c.created_at)
sa.Index('idx_api_request_logs_ip_created', api_request_logs.c.client_ip, api_request_logs.c.created_at)
sa.Index('idx_api_request_logs_path_created', api_request_logs.c.path, api_request_logs.c.created_at)
sa.Index('idx_product_analytics_events_name_created', product_analytics_events.c.event_name, product_analytics_events.c.created_at)
sa.Index('idx_product_analytics_events_source_created', product_analytics_events.c.source, product_analytics_events.c.created_at)
sa.Index('idx_product_analytics_events_plan_created', product_analytics_events.c.plan, product_analytics_events.c.created_at)
sa.Index('idx_product_analytics_events_user_created', product_analytics_events.c.user_public_id, product_analytics_events.c.created_at)
sa.Index('idx_product_analytics_events_device_created', product_analytics_events.c.device_id, product_analytics_events.c.created_at)

POSTGRES_ENUMS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ('user_plan', ('guest', 'free', 'pro')),
    ('user_status', ('active', 'suspended', 'deleted')),
    ('photo_status', ('UPLOADING', 'READY', 'REJECTED')),
    ('review_mode', ('flash', 'pro')),
    ('task_status', ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'DEAD_LETTER')),
    ('review_status', ('SUCCEEDED', 'FAILED')),
)

POSTGRES_COMPATIBILITY_SQL: tuple[str, ...] = (
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_users_clerk_user_id ON users (clerk_user_id) WHERE clerk_user_id IS NOT NULL',
    'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS source_review_id BIGINT REFERENCES reviews(id)',
    "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS image_type TEXT DEFAULT 'default'",
    'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE',
    'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS share_token TEXT',
    'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT FALSE',
    'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS gallery_visible BOOLEAN DEFAULT FALSE',
    "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS gallery_audit_status TEXT DEFAULT 'none'",
    'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS gallery_added_at TIMESTAMPTZ',
    'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS gallery_rejected_reason TEXT',
    "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tags_json JSONB DEFAULT '[]'::jsonb",
    'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS note TEXT',
    'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
    "UPDATE reviews SET image_type = COALESCE(NULLIF(result_json->>'image_type', ''), image_type, 'default') WHERE image_type IS NULL OR image_type = ''",
    'UPDATE reviews SET is_public = FALSE WHERE is_public IS NULL',
    'UPDATE reviews SET favorite = FALSE WHERE favorite IS NULL',
    'UPDATE reviews SET gallery_visible = FALSE WHERE gallery_visible IS NULL',
    "UPDATE reviews SET gallery_audit_status = 'none' WHERE gallery_audit_status IS NULL OR gallery_audit_status = ''",
    "UPDATE reviews SET tags_json = '[]'::jsonb WHERE tags_json IS NULL",
    "ALTER TABLE reviews ALTER COLUMN image_type SET DEFAULT 'default'",
    'ALTER TABLE reviews ALTER COLUMN image_type SET NOT NULL',
    'ALTER TABLE reviews ALTER COLUMN is_public SET DEFAULT FALSE',
    'ALTER TABLE reviews ALTER COLUMN is_public SET NOT NULL',
    'ALTER TABLE reviews ALTER COLUMN favorite SET DEFAULT FALSE',
    'ALTER TABLE reviews ALTER COLUMN favorite SET NOT NULL',
    'ALTER TABLE reviews ALTER COLUMN gallery_visible SET DEFAULT FALSE',
    'ALTER TABLE reviews ALTER COLUMN gallery_visible SET NOT NULL',
    "ALTER TABLE reviews ALTER COLUMN gallery_audit_status SET DEFAULT 'none'",
    'ALTER TABLE reviews ALTER COLUMN gallery_audit_status SET NOT NULL',
    "ALTER TABLE reviews ALTER COLUMN tags_json SET DEFAULT '[]'::jsonb",
    'ALTER TABLE reviews ALTER COLUMN tags_json SET NOT NULL',
    "ALTER TABLE product_analytics_events ALTER COLUMN plan SET DEFAULT 'guest'",
    "ALTER TABLE product_analytics_events ALTER COLUMN source SET DEFAULT 'unknown'",
    "ALTER TABLE product_analytics_events ALTER COLUMN metadata_json SET DEFAULT '{}'::jsonb",
)


def _is_postgresql(conn: Connection) -> bool:
    return conn.dialect.name == 'postgresql'


def _quoted_enum_values(values: Iterable[str]) -> str:
    return ', '.join(f"'{value}'" for value in values)


def _create_postgres_enums(conn: Connection) -> None:
    for enum_name, values in POSTGRES_ENUMS:
        conn.execute(
            text(
                f"""
                DO $$
                BEGIN
                    CREATE TYPE {enum_name} AS ENUM ({_quoted_enum_values(values)});
                EXCEPTION WHEN duplicate_object THEN
                    NULL;
                END
                $$;
                """
            )
        )


def _create_baseline_indexes(conn: Connection) -> None:
    for table in BASELINE_METADATA.sorted_tables:
        for index in table.indexes:
            index.create(bind=conn, checkfirst=True)


def _run_postgres_compatibility_sql(conn: Connection) -> None:
    for statement in POSTGRES_COMPATIBILITY_SQL:
        conn.execute(text(statement))


def upgrade() -> None:
    conn = op.get_bind()
    if _is_postgresql(conn):
        _create_postgres_enums(conn)

    BASELINE_METADATA.create_all(bind=conn, checkfirst=True)

    if _is_postgresql(conn):
        _run_postgres_compatibility_sql(conn)

    if not op.get_context().as_sql:
        _create_baseline_indexes(conn)


def downgrade() -> None:
    # This baseline adopts existing production schemas; do not drop user data on downgrade.
    pass
