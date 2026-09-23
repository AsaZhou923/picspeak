"""Add practice sessions, attempts, and feedback.

Revision ID: 20260919_0007
Revises: 20260901_0006
Create Date: 2026-09-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = '20260919_0007'
down_revision = '20260901_0006'
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(name)


def upgrade() -> None:
    if not _has_table('practice_sessions'):
        op.create_table(
            'practice_sessions',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('public_id', sa.Text(), nullable=False),
            sa.Column('owner_user_id', sa.BigInteger(), nullable=False),
            sa.Column('source_review_id', sa.BigInteger(), nullable=False),
            sa.Column('source_photo_id', sa.BigInteger(), nullable=False),
            sa.Column('practice_kind', sa.Text(), nullable=False),
            sa.Column('lifecycle', sa.Text(), server_default='active', nullable=False),
            sa.Column('goal_snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('success_criteria', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('locale', sa.Text(), server_default='en', nullable=False),
            sa.Column('idempotency_key', sa.Text(), nullable=True),
            sa.Column('request_hash', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint("practice_kind IN ('capture_retake', 'edit_revision', 'same_image_recheck')", name='chk_practice_sessions_kind'),
            sa.CheckConstraint("lifecycle IN ('active', 'completed', 'archived')", name='chk_practice_sessions_lifecycle'),
            sa.ForeignKeyConstraint(['owner_user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['source_photo_id'], ['photos.id']),
            sa.ForeignKeyConstraint(['source_review_id'], ['reviews.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('owner_user_id', 'idempotency_key', name='uq_practice_sessions_user_idempotency'),
            sa.UniqueConstraint('public_id', name='uq_practice_sessions_public_id'),
        )
        op.create_index('idx_practice_sessions_owner_created', 'practice_sessions', ['owner_user_id', 'created_at'])
        op.create_index('idx_practice_sessions_owner_lifecycle_created', 'practice_sessions', ['owner_user_id', 'lifecycle', 'created_at'])

    if not _has_table('practice_attempts'):
        op.create_table(
            'practice_attempts',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('public_id', sa.Text(), nullable=False),
            sa.Column('session_id', sa.BigInteger(), nullable=False),
            sa.Column('owner_user_id', sa.BigInteger(), nullable=False),
            sa.Column('task_id', sa.BigInteger(), nullable=False),
            sa.Column('review_id', sa.BigInteger(), nullable=True),
            sa.Column('sequence', sa.Integer(), nullable=False),
            sa.Column('photo_id', sa.BigInteger(), nullable=False),
            sa.Column('source_review_id', sa.BigInteger(), nullable=False),
            sa.Column('attempt_kind', sa.Text(), nullable=False),
            sa.Column('request_hash', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint("attempt_kind IN ('capture_retake', 'edit_revision', 'same_image_recheck')", name='chk_practice_attempts_kind'),
            sa.CheckConstraint('sequence > 0', name='chk_practice_attempts_sequence_positive'),
            sa.ForeignKeyConstraint(['owner_user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['photo_id'], ['photos.id']),
            sa.ForeignKeyConstraint(['review_id'], ['reviews.id']),
            sa.ForeignKeyConstraint(['session_id'], ['practice_sessions.id']),
            sa.ForeignKeyConstraint(['source_review_id'], ['reviews.id']),
            sa.ForeignKeyConstraint(['task_id'], ['review_tasks.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('public_id', name='uq_practice_attempts_public_id'),
            sa.UniqueConstraint('review_id', name='uq_practice_attempts_review'),
            sa.UniqueConstraint('session_id', 'sequence', name='uq_practice_attempts_session_sequence'),
            sa.UniqueConstraint('task_id', name='uq_practice_attempts_task'),
        )
        op.create_index('idx_practice_attempts_owner_created', 'practice_attempts', ['owner_user_id', 'created_at'])
        op.create_index('idx_practice_attempts_session_created', 'practice_attempts', ['session_id', 'created_at'])

    if not _has_table('practice_feedback'):
        op.create_table(
            'practice_feedback',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('public_id', sa.Text(), nullable=False),
            sa.Column('session_id', sa.BigInteger(), nullable=False),
            sa.Column('attempt_id', sa.BigInteger(), nullable=True),
            sa.Column('review_id', sa.BigInteger(), nullable=True),
            sa.Column('owner_user_id', sa.BigInteger(), nullable=False),
            sa.Column('verdict', sa.Text(), nullable=False),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint("verdict IN ('helpful', 'not_helpful', 'incorrect')", name='chk_practice_feedback_verdict'),
            sa.ForeignKeyConstraint(['attempt_id'], ['practice_attempts.id']),
            sa.ForeignKeyConstraint(['owner_user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['review_id'], ['reviews.id']),
            sa.ForeignKeyConstraint(['session_id'], ['practice_sessions.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('public_id', name='uq_practice_feedback_public_id'),
        )
        op.create_index('idx_practice_feedback_owner_created', 'practice_feedback', ['owner_user_id', 'created_at'])
        op.create_index('idx_practice_feedback_session_created', 'practice_feedback', ['session_id', 'created_at'])


def downgrade() -> None:
    if _has_table('practice_feedback'):
        op.drop_index('idx_practice_feedback_session_created', table_name='practice_feedback')
        op.drop_index('idx_practice_feedback_owner_created', table_name='practice_feedback')
        op.drop_table('practice_feedback')
    if _has_table('practice_attempts'):
        op.drop_index('idx_practice_attempts_session_created', table_name='practice_attempts')
        op.drop_index('idx_practice_attempts_owner_created', table_name='practice_attempts')
        op.drop_table('practice_attempts')
    if _has_table('practice_sessions'):
        op.drop_index('idx_practice_sessions_owner_lifecycle_created', table_name='practice_sessions')
        op.drop_index('idx_practice_sessions_owner_created', table_name='practice_sessions')
        op.drop_table('practice_sessions')
