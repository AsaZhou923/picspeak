from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class AlembicBootstrapTests(unittest.TestCase):
    def test_alembic_config_points_to_backend_migrations(self) -> None:
        from app.db import bootstrap

        config = bootstrap._alembic_config()

        self.assertEqual(config.config_file_name, str(BACKEND_ROOT / 'alembic.ini'))
        self.assertEqual(config.get_main_option('script_location'), str(BACKEND_ROOT / 'alembic'))
        self.assertEqual(config.get_main_option('sqlalchemy.url'), bootstrap._database_url())

    def test_ensure_runtime_schema_upgrades_to_head(self) -> None:
        from app.db import bootstrap

        database_url = 'postgresql+psycopg2://postgres:postgres@db.example.test/picspeak'
        connection = MagicMock()
        connection.dialect.name = 'postgresql'
        engine = MagicMock()
        engine.begin.return_value.__enter__.return_value = connection

        with patch.object(bootstrap, '_database_url', return_value=database_url), patch.object(
            bootstrap, 'create_engine', return_value=engine
        ) as create_engine, patch.object(bootstrap.command, 'upgrade') as upgrade:
            bootstrap.ensure_runtime_schema()

        create_engine.assert_called_once_with(database_url, poolclass=bootstrap.NullPool)
        upgrade.assert_called_once()
        config, revision = upgrade.call_args.args
        self.assertEqual(config.get_main_option('script_location'), str(BACKEND_ROOT / 'alembic'))
        self.assertIs(config.attributes['connection'], connection)
        self.assertEqual(revision, 'head')
        statements = [str(call.args[0]) for call in connection.execute.call_args_list]
        self.assertTrue(any('set_config' in statement for statement in statements))
        self.assertTrue(any('pg_advisory_xact_lock' in statement for statement in statements))
        engine.dispose.assert_called_once_with()

    def test_ensure_runtime_schema_skips_postgres_lock_for_other_dialects(self) -> None:
        from app.db import bootstrap

        connection = MagicMock()
        connection.dialect.name = 'sqlite'
        engine = MagicMock()
        engine.begin.return_value.__enter__.return_value = connection

        with patch.object(bootstrap, '_database_url', return_value='sqlite+pysqlite:///:memory:'), patch.object(
            bootstrap, 'create_engine', return_value=engine
        ), patch.object(bootstrap.command, 'upgrade') as upgrade:
            bootstrap.ensure_runtime_schema()

        connection.execute.assert_not_called()
        config, revision = upgrade.call_args.args
        self.assertIs(config.attributes['connection'], connection)
        self.assertEqual(revision, 'head')
        engine.dispose.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
