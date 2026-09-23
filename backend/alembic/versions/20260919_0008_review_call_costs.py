"""Add review provider call cost ledger.

Revision ID: 20260919_0008
Revises: 20260919_0007
Create Date: 2026-09-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = '20260919_0008'
down_revision = '20260919_0007'
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return _inspector().has_table(name)


def _has_column(table_name: str, column_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(column['name'] == column_name for column in _inspector().get_columns(table_name))


def _has_index(table_name: str, index_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(index['name'] == index_name for index in _inspector().get_indexes(table_name))


def upgrade() -> None:
    if not _has_table('review_call_costs'):
        op.create_table(
            'review_call_costs',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('task_id', sa.BigInteger(), nullable=False),
            sa.Column('owner_user_id', sa.BigInteger(), nullable=False),
            sa.Column('call_key', sa.Text(), nullable=False),
            sa.Column('stage', sa.Text(), nullable=False),
            sa.Column('outcome', sa.Text(), nullable=False),
            sa.Column('model_name', sa.Text(), nullable=True),
            sa.Column('input_tokens', sa.Integer(), nullable=True),
            sa.Column('output_tokens', sa.Integer(), nullable=True),
            sa.Column('cost_usd', sa.Numeric(12, 6), nullable=True),
            sa.Column('cost_rate_version', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint("stage IN ('scorer', 'writer', 'pair')", name='chk_review_call_costs_stage'),
            sa.CheckConstraint("outcome IN ('succeeded', 'failed', 'unknown')", name='chk_review_call_costs_outcome'),
            sa.ForeignKeyConstraint(['owner_user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['task_id'], ['review_tasks.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('task_id', 'call_key', name='uq_review_call_costs_task_call_key'),
        )
    if not _has_index('review_call_costs', 'idx_review_call_costs_task_created'):
        op.create_index('idx_review_call_costs_task_created', 'review_call_costs', ['task_id', 'created_at'])
    if not _has_index('review_call_costs', 'idx_review_call_costs_owner_created'):
        op.create_index('idx_review_call_costs_owner_created', 'review_call_costs', ['owner_user_id', 'created_at'])
    if not _has_index('review_call_costs', 'idx_review_call_costs_stage_outcome_created'):
        op.create_index(
            'idx_review_call_costs_stage_outcome_created',
            'review_call_costs',
            ['stage', 'outcome', 'created_at'],
        )

    if _has_table('product_analytics_events'):
        if not _has_column('product_analytics_events', 'dedupe_key'):
            op.add_column('product_analytics_events', sa.Column('dedupe_key', sa.Text(), nullable=True))
        if not _has_index('product_analytics_events', 'uq_product_analytics_events_dedupe_key'):
            op.create_index(
                'uq_product_analytics_events_dedupe_key',
                'product_analytics_events',
                ['dedupe_key'],
                unique=True,
            )


def downgrade() -> None:
    if _has_index('product_analytics_events', 'uq_product_analytics_events_dedupe_key'):
        op.drop_index('uq_product_analytics_events_dedupe_key', table_name='product_analytics_events')
    if _has_column('product_analytics_events', 'dedupe_key'):
        op.drop_column('product_analytics_events', 'dedupe_key')

    if _has_table('review_call_costs'):
        if _has_index('review_call_costs', 'idx_review_call_costs_stage_outcome_created'):
            op.drop_index('idx_review_call_costs_stage_outcome_created', table_name='review_call_costs')
        if _has_index('review_call_costs', 'idx_review_call_costs_owner_created'):
            op.drop_index('idx_review_call_costs_owner_created', table_name='review_call_costs')
        if _has_index('review_call_costs', 'idx_review_call_costs_task_created'):
            op.drop_index('idx_review_call_costs_task_created', table_name='review_call_costs')
        op.drop_table('review_call_costs')
