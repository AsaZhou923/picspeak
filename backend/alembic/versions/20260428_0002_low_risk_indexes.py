"""Add low-risk query coverage indexes.

Revision ID: 20260428_0002
Revises: 20260428_0001
Create Date: 2026-04-28
"""

from __future__ import annotations

from alembic import op

revision = '20260428_0002'
down_revision = '20260428_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_reviews_gallery_public
        ON reviews (gallery_added_at DESC, id DESC)
        WHERE gallery_visible = TRUE
          AND gallery_audit_status = 'approved'
          AND deleted_at IS NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_reviews_gallery_recommendation
        ON reviews (image_type, final_score, id)
        WHERE gallery_visible = TRUE
          AND gallery_audit_status = 'approved'
          AND deleted_at IS NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_usage_ledger_user_type
        ON usage_ledger (user_id, usage_type)
        """
    )


def downgrade() -> None:
    op.drop_index('idx_usage_ledger_user_type', table_name='usage_ledger', if_exists=True)
    op.drop_index('idx_reviews_gallery_recommendation', table_name='reviews', if_exists=True)
    op.drop_index('idx_reviews_gallery_public', table_name='reviews', if_exists=True)
