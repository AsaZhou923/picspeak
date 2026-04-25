from __future__ import annotations

import logging

from sqlalchemy import text

from app.db import models  # noqa: F401
from app.db.session import Base, engine

logger = logging.getLogger(__name__)


def ensure_runtime_schema() -> None:
    Base.metadata.create_all(
        bind=engine,
        tables=[
            models.BlogPostView.__table__,
            models.BillingActivationCode.__table__,
            models.BillingSubscription.__table__,
            models.BillingWebhookEvent.__table__,
            models.ImageGenerationTask.__table__,
            models.GeneratedImage.__table__,
            models.ProductAnalyticsEvent.__table__,
            models.ReviewLike.__table__,
        ],
    )

    statements = [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT',
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_users_clerk_user_id ON users (clerk_user_id) WHERE clerk_user_id IS NOT NULL',
        "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS source_review_id BIGINT REFERENCES reviews(id)",
        "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS image_type TEXT DEFAULT 'default'",
        "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE",
        'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS share_token TEXT',
        "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT FALSE",
        "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS gallery_visible BOOLEAN DEFAULT FALSE",
        "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS gallery_audit_status TEXT DEFAULT 'none'",
        'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS gallery_added_at TIMESTAMPTZ',
        'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS gallery_rejected_reason TEXT',
        "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tags_json JSONB DEFAULT '[]'::jsonb",
        'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS note TEXT',
        'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
        "UPDATE reviews SET image_type = COALESCE(NULLIF(result_json->>'image_type', ''), image_type, 'default') WHERE image_type IS NULL OR image_type = ''",
        "UPDATE reviews SET is_public = FALSE WHERE is_public IS NULL",
        "UPDATE reviews SET favorite = FALSE WHERE favorite IS NULL",
        "UPDATE reviews SET gallery_visible = FALSE WHERE gallery_visible IS NULL",
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
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_share_token ON reviews (share_token) WHERE share_token IS NOT NULL',
        'CREATE INDEX IF NOT EXISTS idx_reviews_owner_deleted_created ON reviews (owner_user_id, deleted_at, created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_reviews_owner_image_type_created ON reviews (owner_user_id, image_type, created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_reviews_source_review ON reviews (source_review_id)',
        "CREATE INDEX IF NOT EXISTS idx_reviews_gallery_public ON reviews (gallery_added_at DESC, id DESC) WHERE gallery_visible = TRUE AND gallery_audit_status = 'approved' AND deleted_at IS NULL",
        'CREATE INDEX IF NOT EXISTS idx_review_likes_review_created ON review_likes (review_id, created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_review_likes_user_created ON review_likes (user_id, created_at DESC)',
        "CREATE TABLE IF NOT EXISTS blog_post_views (id BIGSERIAL PRIMARY KEY, slug TEXT NOT NULL, view_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT uq_blog_post_views_slug UNIQUE (slug), CONSTRAINT chk_blog_post_views_count_non_negative CHECK (view_count >= 0))",
        'CREATE INDEX IF NOT EXISTS idx_blog_post_views_count ON blog_post_views (view_count DESC)',
        "CREATE TABLE IF NOT EXISTS product_analytics_events (id BIGSERIAL PRIMARY KEY, event_name TEXT NOT NULL, user_public_id TEXT, plan TEXT NOT NULL DEFAULT 'guest', device_id TEXT, session_id TEXT, source TEXT NOT NULL DEFAULT 'unknown', page_path TEXT, locale TEXT, metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "ALTER TABLE product_analytics_events ALTER COLUMN plan SET DEFAULT 'guest'",
        "ALTER TABLE product_analytics_events ALTER COLUMN source SET DEFAULT 'unknown'",
        "ALTER TABLE product_analytics_events ALTER COLUMN metadata_json SET DEFAULT '{}'::jsonb",
        'CREATE INDEX IF NOT EXISTS idx_product_analytics_events_name_created ON product_analytics_events (event_name, created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_product_analytics_events_source_created ON product_analytics_events (source, created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_product_analytics_events_plan_created ON product_analytics_events (plan, created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_product_analytics_events_user_created ON product_analytics_events (user_public_id, created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_product_analytics_events_device_created ON product_analytics_events (device_id, created_at DESC)',
        "CREATE TABLE IF NOT EXISTS image_generation_tasks (id BIGSERIAL PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, owner_user_id BIGINT NOT NULL REFERENCES users(id), source_photo_id BIGINT REFERENCES photos(id), source_review_id BIGINT REFERENCES reviews(id), status task_status NOT NULL DEFAULT 'PENDING'::task_status, generation_mode TEXT NOT NULL DEFAULT 'general', intent TEXT NOT NULL, prompt TEXT NOT NULL, prompt_hash TEXT NOT NULL, idempotency_key TEXT, request_payload JSONB NOT NULL DEFAULT '{}'::jsonb, attempt_count INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 2, progress INTEGER NOT NULL DEFAULT 0, error_code TEXT, error_message TEXT, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, next_attempt_at TIMESTAMPTZ, claimed_by TEXT, last_heartbeat_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT uq_image_generation_tasks_user_idempotency UNIQUE (owner_user_id, idempotency_key))",
        'CREATE INDEX IF NOT EXISTS idx_image_generation_tasks_status_created ON image_generation_tasks (status, created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_image_generation_tasks_owner_created ON image_generation_tasks (owner_user_id, created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_image_generation_tasks_review_created ON image_generation_tasks (source_review_id, created_at DESC)',
        "CREATE TABLE IF NOT EXISTS generated_images (id BIGSERIAL PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, task_id BIGINT REFERENCES image_generation_tasks(id), owner_user_id BIGINT NOT NULL REFERENCES users(id), source_photo_id BIGINT REFERENCES photos(id), source_review_id BIGINT REFERENCES reviews(id), object_bucket TEXT NOT NULL, object_key TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'image/webp', width INTEGER, height INTEGER, intent TEXT NOT NULL, generation_mode TEXT NOT NULL DEFAULT 'general', prompt TEXT NOT NULL, revised_prompt TEXT, model_name TEXT NOT NULL, model_snapshot TEXT, quality TEXT NOT NULL, size TEXT NOT NULL, output_format TEXT NOT NULL, input_text_tokens INTEGER, input_image_tokens INTEGER, output_image_tokens INTEGER, cost_usd NUMERIC(12,6), credits_charged INTEGER NOT NULL, template_key TEXT, metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb, deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        'CREATE INDEX IF NOT EXISTS idx_generated_images_owner_created ON generated_images (owner_user_id, created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_generated_images_task ON generated_images (task_id)',
        'CREATE INDEX IF NOT EXISTS idx_generated_images_review_created ON generated_images (source_review_id, created_at DESC)',
    ]

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))

    logger.info('Runtime schema checks completed')
