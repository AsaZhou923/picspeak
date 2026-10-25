"""Track physical removal of stored originals and generated images.

Revision ID: 20261025_0015
Revises: 20261010_0014
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '20261025_0015'
down_revision = '20261010_0014'
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {column['name'] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    return {index['name'] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    # New enum values cannot be used in the transaction that adds them; nothing here uses them.
    op.execute("ALTER TYPE photo_status ADD VALUE IF NOT EXISTS 'PURGING'")
    op.execute("ALTER TYPE photo_status ADD VALUE IF NOT EXISTS 'PURGED'")

    photo_columns = _columns('photos')
    if 'original_purged_at' not in photo_columns:
        op.add_column('photos', sa.Column('original_purged_at', sa.DateTime(timezone=True), nullable=True))
    if 'original_purge_reason' not in photo_columns:
        op.add_column('photos', sa.Column('original_purge_reason', sa.Text(), nullable=True))

    if 'object_purged_at' not in _columns('generated_images'):
        op.add_column('generated_images', sa.Column('object_purged_at', sa.DateTime(timezone=True), nullable=True))

    if 'idx_generated_images_deleted_unpurged' not in _indexes('generated_images'):
        op.create_index(
            'idx_generated_images_deleted_unpurged',
            'generated_images',
            ['deleted_at'],
            postgresql_where=sa.text('deleted_at IS NOT NULL AND object_purged_at IS NULL'),
        )


def downgrade() -> None:
    if 'idx_generated_images_deleted_unpurged' in _indexes('generated_images'):
        op.drop_index('idx_generated_images_deleted_unpurged', table_name='generated_images')
    if 'object_purged_at' in _columns('generated_images'):
        op.drop_column('generated_images', 'object_purged_at')

    # PostgreSQL cannot drop enum values, so rebuild the type. A purged original
    # cannot be READY again; record it as rejected with an explicit reason.
    op.execute(
        """
        UPDATE photos
           SET status = CASE WHEN status::text = 'PURGING' THEN 'READY' ELSE 'REJECTED' END::text::photo_status,
               rejected_reason = CASE WHEN status::text = 'PURGED' THEN 'ORIGINAL_PURGED' ELSE rejected_reason END
         WHERE status::text IN ('PURGING', 'PURGED')
        """
    )
    op.execute('ALTER TABLE photos ALTER COLUMN status DROP DEFAULT')
    op.execute('ALTER TYPE photo_status RENAME TO photo_status_with_purge')
    op.execute("CREATE TYPE photo_status AS ENUM ('UPLOADING', 'READY', 'REJECTED')")
    op.execute('ALTER TABLE photos ALTER COLUMN status TYPE photo_status USING status::text::photo_status')
    op.execute("ALTER TABLE photos ALTER COLUMN status SET DEFAULT 'UPLOADING'::photo_status")
    op.execute('DROP TYPE photo_status_with_purge')

    photo_columns = _columns('photos')
    if 'original_purge_reason' in photo_columns:
        op.drop_column('photos', 'original_purge_reason')
    if 'original_purged_at' in photo_columns:
        op.drop_column('photos', 'original_purged_at')
