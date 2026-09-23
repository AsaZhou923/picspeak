"""Add optional public profile fields.

Revision ID: 20260922_0009
Revises: 20260919_0008
Create Date: 2026-09-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = '20260922_0009'
down_revision = '20260919_0008'
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
    if not _has_table('users'):
        return
    if not _has_column('users', 'public_profile_id'):
        op.add_column('users', sa.Column('public_profile_id', sa.Text(), nullable=True))
    if not _has_column('users', 'public_profile_enabled'):
        op.add_column(
            'users',
            sa.Column('public_profile_enabled', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        )
    if not _has_index('users', 'uq_users_public_profile_id'):
        op.create_index('uq_users_public_profile_id', 'users', ['public_profile_id'], unique=True)


def downgrade() -> None:
    if not _has_table('users'):
        return
    if _has_index('users', 'uq_users_public_profile_id'):
        op.drop_index('uq_users_public_profile_id', table_name='users')
    if _has_column('users', 'public_profile_enabled'):
        op.drop_column('users', 'public_profile_enabled')
    if _has_column('users', 'public_profile_id'):
        op.drop_column('users', 'public_profile_id')
