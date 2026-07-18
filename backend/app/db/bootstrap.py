from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.core.config import settings

logger = logging.getLogger(__name__)


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _escape_alembic_value(value: str) -> str:
    return value.replace('%', '%%')


def _alembic_config() -> Config:
    backend_root = _backend_root()
    config = Config(str(backend_root / 'alembic.ini'))
    config.set_main_option('script_location', str(backend_root / 'alembic'))
    config.set_main_option('sqlalchemy.url', _escape_alembic_value(settings.database_url))
    return config


def ensure_runtime_schema() -> None:
    command.upgrade(_alembic_config(), 'head')
    logger.info('Runtime schema checks completed through Alembic head')
