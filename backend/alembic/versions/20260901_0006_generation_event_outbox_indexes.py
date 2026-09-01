"""Index durable generation analytics outbox markers.

Revision ID: 20260901_0006
Revises: 20260830_0005
Create Date: 2026-09-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = '20260901_0006'
down_revision = '20260830_0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        'idx_image_generation_tasks_pending_request_event',
        'image_generation_tasks',
        ['id'],
        postgresql_where=sa.text("request_payload ? 'pending_request_event'"),
    )
    op.create_index(
        'idx_image_generation_tasks_pending_terminal_event',
        'image_generation_tasks',
        ['id'],
        postgresql_where=sa.text("request_payload ? 'pending_terminal_event'"),
    )


def downgrade() -> None:
    op.drop_index('idx_image_generation_tasks_pending_terminal_event', table_name='image_generation_tasks')
    op.drop_index('idx_image_generation_tasks_pending_request_event', table_name='image_generation_tasks')
