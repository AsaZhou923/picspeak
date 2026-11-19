"""Index rate-limit windows so expired counters can be cleaned up in bounded chunks.

Revision ID: 20261119_0016
Revises: 20261025_0015
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '20261119_0016'
down_revision = '20261025_0015'
branch_labels = None
depends_on = None


def _indexes(table_name: str) -> set[str]:
    return {index['name'] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    # Migrations run inside ensure_runtime_schema's transaction, so CONCURRENTLY is
    # unavailable here. On a large table, create the index concurrently by hand
    # first (CREATE INDEX CONCURRENTLY idx_rate_limit_window_start ON
    # rate_limit_counters (window_start)); this migration then skips it.
    if 'idx_rate_limit_window_start' not in _indexes('rate_limit_counters'):
        op.create_index('idx_rate_limit_window_start', 'rate_limit_counters', ['window_start'])


def downgrade() -> None:
    if 'idx_rate_limit_window_start' in _indexes('rate_limit_counters'):
        op.drop_index('idx_rate_limit_window_start', table_name='rate_limit_counters')
