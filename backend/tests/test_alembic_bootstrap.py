from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class AlembicBootstrapTests(unittest.TestCase):
    def test_alembic_config_points_to_backend_migrations(self) -> None:
        from app.core.config import settings
        from app.db import bootstrap

        config = bootstrap._alembic_config()

        self.assertEqual(config.config_file_name, str(BACKEND_ROOT / 'alembic.ini'))
        self.assertEqual(config.get_main_option('script_location'), str(BACKEND_ROOT / 'alembic'))
        self.assertEqual(config.get_main_option('sqlalchemy.url'), settings.database_url)

    def test_ensure_runtime_schema_upgrades_to_head(self) -> None:
        from app.db import bootstrap

        with patch.object(bootstrap.command, 'upgrade') as upgrade:
            bootstrap.ensure_runtime_schema()

        upgrade.assert_called_once()
        config, revision = upgrade.call_args.args
        self.assertEqual(config.get_main_option('script_location'), str(BACKEND_ROOT / 'alembic'))
        self.assertEqual(revision, 'head')


if __name__ == '__main__':
    unittest.main()
