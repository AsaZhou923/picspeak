"""Add notification inbox tables.

Revision ID: 20261010_0012
Revises: 20261007_0011
Create Date: 2026-10-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = '20261010_0012'
down_revision = '20261007_0011'
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _has_index(table_name: str, index_name: str) -> bool:
    indexes = sa.inspect(op.get_bind()).get_indexes(table_name)
    return any(index.get('name') == index_name for index in indexes)


def _create_index_once(name: str, table_name: str, columns: list[str], **kwargs) -> None:
    if not _has_index(table_name, name):
        op.create_index(name, table_name, columns, **kwargs)


def upgrade() -> None:
    if not _has_table('announcements'):
        op.create_table(
            'announcements',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('public_id', sa.Text(), nullable=False),
            sa.Column('content_version', sa.Integer(), server_default='1', nullable=False),
            sa.Column('title_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('summary_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('body_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('cta_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('audience_type', sa.Text(), nullable=False),
            sa.Column('audience_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('status', sa.Text(), server_default='draft', nullable=False),
            sa.Column('idempotency_key', sa.Text(), nullable=True),
            sa.Column('content_fingerprint', sa.Text(), nullable=False),
            sa.Column('update_id', sa.Text(), nullable=True),
            sa.Column('created_by', sa.Text(), nullable=True),
            sa.Column('operation_log_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
            sa.CheckConstraint("status IN ('draft', 'published', 'cancelled')", name='chk_announcements_status'),
            sa.CheckConstraint("audience_type IN ('all_existing_users', 'specific_users')", name='chk_announcements_audience_type'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('public_id', name='uq_announcements_public_id'),
            sa.UniqueConstraint('idempotency_key', name='uq_announcements_idempotency_key'),
        )
    _create_index_once('idx_announcements_status_published', 'announcements', ['status', 'published_at'])
    _create_index_once(
        'uq_announcements_active_update',
        'announcements',
        ['update_id'],
        unique=True,
        postgresql_where=sa.text("update_id IS NOT NULL AND status = 'published'"),
    )

    if not _has_table('notification_preferences'):
        op.create_table(
            'notification_preferences',
            sa.Column('user_id', sa.BigInteger(), nullable=False),
            sa.Column('likes_enabled', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('announcements_enabled', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('likes_enabled_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('announcements_enabled_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('user_id'),
            sa.UniqueConstraint('user_id', name='uq_notification_preferences_user'),
        )

    if not _has_table('notification_events'):
        op.create_table(
            'notification_events',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('public_id', sa.Text(), nullable=False),
            sa.Column('event_type', sa.Text(), nullable=False),
            sa.Column('dedupe_key', sa.Text(), nullable=False),
            sa.Column('schema_version', sa.Integer(), server_default='1', nullable=False),
            sa.Column('payload_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('recipient_user_id', sa.BigInteger(), nullable=True),
            sa.Column('optional_preference_eligible', sa.Boolean(), nullable=True),
            sa.Column('occurred_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('status', sa.Text(), server_default='pending', nullable=False),
            sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
            sa.Column('available_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('last_error_code', sa.Text(), nullable=True),
            sa.Column('cursor_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.CheckConstraint(
                "status IN ('pending', 'processing', 'delivered', 'suppressed_preferences', 'suppressed_limit', 'suppressed_inactive', 'suppressed_self', 'expired_delivery', 'failed')",
                name='chk_notification_events_status',
            ),
            sa.ForeignKeyConstraint(['recipient_user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('public_id', name='uq_notification_events_public_id'),
            sa.UniqueConstraint('dedupe_key', name='uq_notification_events_dedupe_key'),
        )
    _create_index_once('idx_notification_events_status_available', 'notification_events', ['status', 'available_at', 'id'])
    _create_index_once('idx_notification_events_recipient_occurred', 'notification_events', ['recipient_user_id', 'occurred_at'])

    if not _has_table('notifications'):
        op.create_table(
            'notifications',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('public_id', sa.Text(), nullable=False),
            sa.Column('recipient_user_id', sa.BigInteger(), nullable=False),
            sa.Column('category', sa.Text(), nullable=False),
            sa.Column('notification_type', sa.Text(), nullable=False),
            sa.Column('dedupe_key', sa.Text(), nullable=False),
            sa.Column('template_key', sa.Text(), nullable=False),
            sa.Column('template_version', sa.Integer(), server_default='1', nullable=False),
            sa.Column('template_params_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('target_type', sa.Text(), nullable=True),
            sa.Column('target_public_id', sa.Text(), nullable=True),
            sa.Column('announcement_id', sa.BigInteger(), nullable=True),
            sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('delivered_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
            sa.CheckConstraint("category IN ('system', 'announcement', 'interaction')", name='chk_notifications_category'),
            sa.ForeignKeyConstraint(['announcement_id'], ['announcements.id']),
            sa.ForeignKeyConstraint(['recipient_user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('public_id', name='uq_notifications_public_id'),
            sa.UniqueConstraint('recipient_user_id', 'dedupe_key', name='uq_notifications_recipient_dedupe'),
        )
    _create_index_once('idx_notifications_recipient_delivered', 'notifications', ['recipient_user_id', 'delivered_at', 'id'])
    _create_index_once('idx_notifications_announcement', 'notifications', ['announcement_id'])
    _create_index_once(
        'idx_notifications_recipient_unread',
        'notifications',
        ['recipient_user_id', 'delivered_at'],
        postgresql_where=sa.text('read_at IS NULL AND archived_at IS NULL AND revoked_at IS NULL'),
    )


def downgrade() -> None:
    for index_name, table_name in (
        ('idx_notifications_recipient_unread', 'notifications'),
        ('idx_notifications_announcement', 'notifications'),
        ('idx_notifications_recipient_delivered', 'notifications'),
        ('idx_notification_events_recipient_occurred', 'notification_events'),
        ('idx_notification_events_status_available', 'notification_events'),
        ('uq_announcements_active_update', 'announcements'),
        ('idx_announcements_status_published', 'announcements'),
    ):
        if _has_table(table_name) and _has_index(table_name, index_name):
            op.drop_index(index_name, table_name=table_name)

    for table_name in ('notifications', 'notification_events', 'notification_preferences', 'announcements'):
        if _has_table(table_name):
            op.drop_table(table_name)
