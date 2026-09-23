"""Add practice scene groups.

Revision ID: 20260922_0010
Revises: 20260922_0009
Create Date: 2026-09-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = '20260922_0010'
down_revision = '20260922_0009'
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return _inspector().has_table(name)


def _has_index(table_name: str, index_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(index['name'] == index_name for index in _inspector().get_indexes(table_name))


def upgrade() -> None:
    if not _has_table('practice_scene_groups'):
        op.create_table(
            'practice_scene_groups',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('public_id', sa.Text(), nullable=False),
            sa.Column('owner_user_id', sa.BigInteger(), nullable=False),
            sa.Column('session_id', sa.BigInteger(), nullable=False),
            sa.Column('label', sa.Text(), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('visibility', sa.Text(), server_default='private', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint("visibility IN ('private')", name='chk_practice_scene_groups_visibility'),
            sa.ForeignKeyConstraint(['owner_user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['session_id'], ['practice_sessions.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('public_id', name='uq_practice_scene_groups_public_id'),
            sa.UniqueConstraint('session_id', name='uq_practice_scene_groups_session'),
        )
    if not _has_index('practice_scene_groups', 'idx_practice_scene_groups_owner_label'):
        op.create_index('idx_practice_scene_groups_owner_label', 'practice_scene_groups', ['owner_user_id', 'label'])
    if not _has_index('practice_scene_groups', 'idx_practice_scene_groups_owner_updated'):
        op.create_index('idx_practice_scene_groups_owner_updated', 'practice_scene_groups', ['owner_user_id', 'updated_at'])


def downgrade() -> None:
    if not _has_table('practice_scene_groups'):
        return
    if _has_index('practice_scene_groups', 'idx_practice_scene_groups_owner_updated'):
        op.drop_index('idx_practice_scene_groups_owner_updated', table_name='practice_scene_groups')
    if _has_index('practice_scene_groups', 'idx_practice_scene_groups_owner_label'):
        op.drop_index('idx_practice_scene_groups_owner_label', table_name='practice_scene_groups')
    op.drop_table('practice_scene_groups')
