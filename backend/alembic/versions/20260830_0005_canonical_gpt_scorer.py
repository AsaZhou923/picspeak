"""Record canonical scorer and selected writer models.

Revision ID: 20260830_0005
Revises: 20260828_0004
Create Date: 2026-08-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = '20260830_0005'
down_revision = '20260828_0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reviews', sa.Column('scorer_model_name', sa.Text(), nullable=True))
    op.add_column('reviews', sa.Column('writer_model_name', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('reviews', 'writer_model_name')
    op.drop_column('reviews', 'scorer_model_name')
