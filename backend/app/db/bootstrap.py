from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

logger = logging.getLogger(__name__)

_MIGRATION_LOCK_TIMEOUT_SECONDS = 300
_MIGRATION_LOCK_NAMESPACE = 'picspeak'
_MIGRATION_LOCK_NAME = 'schema-migration'


class _MigrationSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            '.env',
            '../.env',
            'backend/.env',
            str(Path(__file__).resolve().parents[3] / '.env'),
            str(Path(__file__).resolve().parents[2] / '.env'),
        ),
        env_file_encoding='utf-8-sig',
        extra='ignore',
    )

    database_url: str = (
        'postgresql+psycopg2://postgres:postgres@localhost:5432/aipingtubackend'
    )


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _escape_alembic_value(value: str) -> str:
    return value.replace('%', '%%')


def _database_url() -> str:
    return _MigrationSettings().database_url


def _alembic_config() -> Config:
    backend_root = _backend_root()
    config = Config(str(backend_root / 'alembic.ini'))
    config.set_main_option('script_location', str(backend_root / 'alembic'))
    config.set_main_option('sqlalchemy.url', _escape_alembic_value(_database_url()))
    return config


def ensure_runtime_schema() -> None:
    config = _alembic_config()
    engine = create_engine(_database_url(), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            if connection.dialect.name == 'postgresql':
                connection.execute(
                    text("SELECT set_config('lock_timeout', :timeout, true)"),
                    {'timeout': f'{_MIGRATION_LOCK_TIMEOUT_SECONDS}s'},
                )
                connection.execute(
                    text(
                        'SELECT pg_advisory_xact_lock('
                        'hashtext(:namespace), hashtext(:lock_name)'
                        ')'
                    ),
                    {
                        'namespace': _MIGRATION_LOCK_NAMESPACE,
                        'lock_name': _MIGRATION_LOCK_NAME,
                    },
                )
            config.attributes['connection'] = connection
            command.upgrade(config, 'head')
    finally:
        engine.dispose()
    logger.info('Runtime schema checks completed through Alembic head')
