from __future__ import annotations

import logging

from sqlalchemy import text

from app.db.session import engine

logger = logging.getLogger(__name__)


def ensure_runtime_schema() -> None:
    statements = [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT',
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_users_clerk_user_id ON users (clerk_user_id) WHERE clerk_user_id IS NOT NULL',
    ]

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))

    logger.info('Runtime schema checks completed')
