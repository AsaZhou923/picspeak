"""Harden review findings with indexes and cascade cleanup.

Revision ID: 20260523_0003
Revises: 20260428_0002
Create Date: 2026-05-23
"""

from __future__ import annotations

from alembic import op

revision = '20260523_0003'
down_revision = '20260428_0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        'idx_image_generation_tasks_status_next_attempt',
        'image_generation_tasks',
        ['status', 'next_attempt_at'],
        if_not_exists=True,
    )
    op.create_index(
        'idx_generated_images_object',
        'generated_images',
        ['object_bucket', 'object_key'],
        if_not_exists=True,
    )
    op.create_index(
        'idx_billing_subscriptions_provider_customer',
        'billing_subscriptions',
        ['provider_customer_id'],
        if_not_exists=True,
    )
    op.create_index(
        'idx_reviews_mode_created',
        'reviews',
        ['mode', 'created_at'],
        if_not_exists=True,
    )
    op.drop_constraint('review_task_events_task_id_fkey', 'review_task_events', type_='foreignkey')
    op.create_foreign_key(
        'review_task_events_task_id_fkey',
        'review_task_events',
        'review_tasks',
        ['task_id'],
        ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint('review_task_events_task_id_fkey', 'review_task_events', type_='foreignkey')
    op.create_foreign_key(
        'review_task_events_task_id_fkey',
        'review_task_events',
        'review_tasks',
        ['task_id'],
        ['id'],
    )
    op.drop_index('idx_reviews_mode_created', table_name='reviews', if_exists=True)
    op.drop_index('idx_billing_subscriptions_provider_customer', table_name='billing_subscriptions', if_exists=True)
    op.drop_index('idx_generated_images_object', table_name='generated_images', if_exists=True)
    op.drop_index('idx_image_generation_tasks_status_next_attempt', table_name='image_generation_tasks', if_exists=True)
