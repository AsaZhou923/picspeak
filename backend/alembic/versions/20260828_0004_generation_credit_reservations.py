"""Add generation credit reservations.

Revision ID: 20260828_0004
Revises: 20260523_0003
Create Date: 2026-08-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = '20260828_0004'
down_revision = '20260523_0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reviews', sa.Column('cost_rate_version', sa.Text(), nullable=True))
    op.create_table(
        'generation_credit_reservations',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('generation_task_id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('credits', sa.Integer(), nullable=False),
        sa.Column('bill_period_start', sa.Date(), nullable=False),
        sa.Column('bill_period_end', sa.Date(), nullable=False),
        sa.Column('status', sa.Text(), server_default='held', nullable=False),
        sa.Column('consumed_usage_ledger_id', sa.BigInteger(), nullable=True),
        sa.Column('release_reason', sa.Text(), nullable=True),
        sa.Column('held_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('held', 'consumed', 'released')", name='chk_generation_credit_reservations_status'),
        sa.CheckConstraint('credits > 0', name='chk_generation_credit_reservations_credits_positive'),
        sa.CheckConstraint('bill_period_end > bill_period_start', name='chk_generation_credit_reservations_period'),
        sa.ForeignKeyConstraint(['consumed_usage_ledger_id'], ['usage_ledger.id']),
        sa.ForeignKeyConstraint(['generation_task_id'], ['image_generation_tasks.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('generation_task_id', name='uq_generation_credit_reservations_task'),
        sa.UniqueConstraint('consumed_usage_ledger_id', name='uq_generation_credit_reservations_consumed_ledger'),
    )
    op.create_index(
        'idx_generation_credit_reservations_user_period_status',
        'generation_credit_reservations',
        ['user_id', 'bill_period_start', 'status'],
    )
    op.create_index(
        'idx_generation_credit_reservations_status_created',
        'generation_credit_reservations',
        ['status', 'created_at'],
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_generation_credit_reservation_updated_at()
        RETURNS trigger AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_generation_credit_reservations_updated_at
            BEFORE UPDATE ON generation_credit_reservations
            FOR EACH ROW
        EXECUTE FUNCTION set_generation_credit_reservation_updated_at()
        """
    )
    op.execute(
        """
        INSERT INTO generation_credit_reservations (
            generation_task_id,
            user_id,
            credits,
            bill_period_start,
            bill_period_end,
            status,
            held_at,
            created_at,
            updated_at
        )
        SELECT
            t.id,
            t.owner_user_id,
            (t.request_payload ->> 'credits_reserved')::integer,
            date_trunc('month', t.created_at)::date,
            (date_trunc('month', t.created_at)::date + interval '1 month')::date,
            'held',
            t.created_at,
            now(),
            now()
        FROM image_generation_tasks t
        WHERE t.status IN ('PENDING', 'RUNNING')
          AND (t.request_payload ->> 'credits_reserved') ~ '^[1-9][0-9]*$'
        ON CONFLICT ON CONSTRAINT uq_generation_credit_reservations_task DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute('DROP TRIGGER IF EXISTS trg_generation_credit_reservations_updated_at ON generation_credit_reservations')
    op.execute('DROP FUNCTION IF EXISTS set_generation_credit_reservation_updated_at()')
    op.drop_index('idx_generation_credit_reservations_status_created', table_name='generation_credit_reservations')
    op.drop_index('idx_generation_credit_reservations_user_period_status', table_name='generation_credit_reservations')
    op.drop_table('generation_credit_reservations')
    op.drop_column('reviews', 'cost_rate_version')
