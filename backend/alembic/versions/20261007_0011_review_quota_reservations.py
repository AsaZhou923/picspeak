"""Reserve review quota before provider calls.

Revision ID: 20261007_0011
Revises: 20260922_0010
"""
from alembic import op
import sqlalchemy as sa

revision = '20261007_0011'
down_revision = '20260922_0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table('review_quota_reservations'):
        op.create_table(
            'review_quota_reservations',
            sa.Column('id', sa.BigInteger(), primary_key=True),
            sa.Column('task_id', sa.BigInteger(), sa.ForeignKey('review_tasks.id', ondelete='CASCADE'), unique=True),
            sa.Column('user_id', sa.BigInteger(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('mode', sa.Text(), nullable=False),
            sa.Column('bill_date', sa.Date(), nullable=False),
            sa.Column('status', sa.Text(), nullable=False),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint("status IN ('held', 'consumed', 'released')", name='chk_review_quota_reservations_status'),
        )
    indexes = {index['name'] for index in sa.inspect(op.get_bind()).get_indexes('review_quota_reservations')}
    if 'idx_review_quota_reservations_user_day_status' not in indexes:
        op.create_index('idx_review_quota_reservations_user_day_status', 'review_quota_reservations', ['user_id', 'bill_date', 'status'])


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table('review_quota_reservations'):
        op.drop_table('review_quota_reservations')
