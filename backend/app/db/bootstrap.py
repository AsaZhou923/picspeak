from __future__ import annotations

import logging

from sqlalchemy import text

from app.db import models  # noqa: F401
from app.db.session import Base, engine

logger = logging.getLogger(__name__)


def ensure_runtime_schema() -> None:
    Base.metadata.create_all(bind=engine, tables=[models.BillingSubscription.__table__, models.BillingWebhookEvent.__table__])

    statements = [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT',
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
    ]

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))

    logger.info('Runtime schema checks completed')
