"""Add review score feedback snapshots.

Revision ID: 20261010_0013
Revises: 20261010_0012
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '20261010_0013'
down_revision = '20261010_0012'
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def upgrade() -> None:
    if not _has_table('review_score_snapshots'):
        op.create_table(
            'review_score_snapshots',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('public_id', sa.Text(), nullable=False),
            sa.Column('review_id', sa.BigInteger(), nullable=False),
            sa.Column('revision_hash', sa.Text(), nullable=False),
            sa.Column('snapshot_schema_version', sa.Text(), nullable=False),
            sa.Column('analysis_type', sa.Text(), nullable=False),
            sa.Column('mode', sa.Text(), nullable=False),
            sa.Column('image_type', sa.Text(), nullable=False),
            sa.Column('final_score', sa.Numeric(10, 6), nullable=False),
            sa.Column('scores_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('score_version', sa.Text(), nullable=True),
            sa.Column('score_prompt_version', sa.Text(), nullable=True),
            sa.Column('scorer_model_name', sa.Text(), nullable=True),
            sa.Column('scorer_model_version', sa.Text(), nullable=True),
            sa.Column('scorer_reasoning_effort', sa.Text(), nullable=True),
            sa.Column('scorer_preprocess_version', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint("analysis_type = 'single'", name='chk_review_score_snapshots_analysis_type'),
            sa.CheckConstraint('final_score >= 0 AND final_score <= 10', name='chk_review_score_snapshots_score'),
            sa.ForeignKeyConstraint(['review_id'], ['reviews.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('public_id', name='uq_review_score_snapshots_public_id'),
            sa.UniqueConstraint('review_id', 'revision_hash', name='uq_review_score_snapshots_revision'),
        )
        op.create_index('idx_review_score_snapshots_review_created', 'review_score_snapshots', ['review_id', 'created_at'])
        op.create_index('idx_review_score_snapshots_version_mode', 'review_score_snapshots', ['score_version', 'mode', 'created_at'])

    if not _has_table('review_score_feedback'):
        op.create_table(
            'review_score_feedback',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('public_id', sa.Text(), nullable=False),
            sa.Column('snapshot_id', sa.BigInteger(), nullable=False),
            sa.Column('user_id', sa.BigInteger(), nullable=False),
            sa.Column('role_at_submission', sa.Text(), nullable=False),
            sa.Column('source_surface', sa.Text(), nullable=False),
            sa.Column('verdict', sa.Text(), nullable=False),
            sa.Column('state', sa.Text(), server_default='active', nullable=False),
            sa.Column('feedback_version', sa.Integer(), server_default='1', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('withdrawn_at', sa.DateTime(timezone=True), nullable=True),
            sa.CheckConstraint("verdict IN ('accurate', 'too_high', 'too_low')", name='chk_review_score_feedback_verdict'),
            sa.CheckConstraint("role_at_submission IN ('author', 'community')", name='chk_review_score_feedback_role'),
            sa.CheckConstraint("source_surface IN ('result', 'gallery')", name='chk_review_score_feedback_surface'),
            sa.CheckConstraint("state IN ('active', 'withdrawn')", name='chk_review_score_feedback_state'),
            sa.CheckConstraint('feedback_version >= 1', name='chk_review_score_feedback_version'),
            sa.CheckConstraint("(state = 'active' AND withdrawn_at IS NULL) OR (state = 'withdrawn' AND withdrawn_at IS NOT NULL)", name='chk_review_score_feedback_withdrawn'),
            sa.ForeignKeyConstraint(['snapshot_id'], ['review_score_snapshots.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('public_id', name='uq_review_score_feedback_public_id'),
            sa.UniqueConstraint('snapshot_id', 'user_id', name='uq_review_score_feedback_snapshot_user'),
        )
        op.create_index('idx_review_score_feedback_snapshot_role_state', 'review_score_feedback', ['snapshot_id', 'role_at_submission', 'state'])
        op.create_index('idx_review_score_feedback_user_created', 'review_score_feedback', ['user_id', 'created_at'])

    # Enforce immutability for SQL writes as well as application code. Cascading
    # deletion still follows the original review/account retention contract.
    op.execute("""
        CREATE OR REPLACE FUNCTION reject_review_score_snapshot_update() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Review score snapshots are immutable';
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute('DROP TRIGGER IF EXISTS review_score_snapshot_immutable ON review_score_snapshots')
    op.execute("""
        CREATE TRIGGER review_score_snapshot_immutable BEFORE UPDATE ON review_score_snapshots
        FOR EACH ROW EXECUTE FUNCTION reject_review_score_snapshot_update()
    """)


def downgrade() -> None:
    if _has_table('review_score_feedback'):
        op.drop_index('idx_review_score_feedback_user_created', table_name='review_score_feedback')
        op.drop_index('idx_review_score_feedback_snapshot_role_state', table_name='review_score_feedback')
        op.drop_table('review_score_feedback')
    if _has_table('review_score_snapshots'):
        op.drop_index('idx_review_score_snapshots_version_mode', table_name='review_score_snapshots')
        op.drop_index('idx_review_score_snapshots_review_created', table_name='review_score_snapshots')
        op.drop_table('review_score_snapshots')
    op.execute('DROP FUNCTION IF EXISTS reject_review_score_snapshot_update()')
