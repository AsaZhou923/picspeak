from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from uuid import uuid4

import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

class PracticeMigrationPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        raw_url = os.environ.get('PICSPEAK_TEST_DATABASE_URL')
        if not raw_url:
            self.skipTest('PICSPEAK_TEST_DATABASE_URL is not configured')
        self.base_url = make_url(raw_url)
        if self.base_url.get_backend_name() != 'postgresql':
            self.skipTest('practice migration roundtrip requires PostgreSQL')
        self.db_name = f'picspeak_practice_mig_{uuid4().hex[:24]}'
        self.test_url = self.base_url.set(database=self.db_name)
        self.admin_engine = sa.create_engine(self.base_url.set(database='postgres'), isolation_level='AUTOCOMMIT')
        with self.admin_engine.connect() as conn:
            conn.execute(sa.text(f'CREATE DATABASE "{self.db_name}"'))

    def tearDown(self) -> None:
        if hasattr(self, 'admin_engine'):
            with self.admin_engine.connect() as conn:
                conn.execute(sa.text(f'DROP DATABASE IF EXISTS "{self.db_name}" WITH (FORCE)'))
            self.admin_engine.dispose()

    def _config(self) -> Config:
        config = Config(str(BACKEND_ROOT / 'alembic.ini'))
        config.set_main_option('script_location', str(BACKEND_ROOT / 'alembic'))
        config.set_main_option('sqlalchemy.url', str(self.test_url))
        return config

    def _run_alembic(self, fn, revision: str) -> None:
        engine = sa.create_engine(self.test_url)
        try:
            with engine.begin() as connection:
                config = self._config()
                config.attributes['connection'] = connection
                fn(config, revision)
        finally:
            engine.dispose()

    def test_practice_migration_upgrade_downgrade_upgrade_and_metadata_bootstrap(self) -> None:
        self._run_alembic(command.upgrade, 'head')
        engine = sa.create_engine(self.test_url)
        inspector = sa.inspect(engine)
        self.assertTrue(inspector.has_table('practice_sessions'))
        self.assertTrue(inspector.has_table('practice_attempts'))
        self.assertTrue(inspector.has_table('practice_feedback'))
        self.assertTrue(inspector.has_table('review_call_costs'))
        self.assertIn('dedupe_key', {column['name'] for column in inspector.get_columns('product_analytics_events')})
        self.assertIn(
            'uq_product_analytics_events_dedupe_key',
            {index['name'] for index in inspector.get_indexes('product_analytics_events')},
        )

        self._run_alembic(command.downgrade, '20260901_0006')
        inspector = sa.inspect(engine)
        self.assertFalse(inspector.has_table('practice_sessions'))
        with engine.begin() as conn:
            user_id = conn.execute(sa.text(
                """
                INSERT INTO users (public_id, email, username, plan, daily_quota_total, daily_quota_used, status)
                VALUES ('usr_existing_practice_migration', 'existing-practice-migration@example.test', 'existing_practice_migration', 'free', 0, 0, 'active')
                RETURNING id
                """
            )).scalar_one()
            photo_id = conn.execute(sa.text(
                """
                INSERT INTO photos (public_id, owner_user_id, upload_id, bucket, object_key, content_type, size_bytes, status, exif_data, client_meta)
                VALUES ('pho_existing_practice_migration', :user_id, 'upl_existing_practice_migration', 'bucket', 'object.jpg', 'image/jpeg', 100, 'READY', '{}'::jsonb, '{}'::jsonb)
                RETURNING id
                """
            ), {'user_id': user_id}).scalar_one()
            review_id = conn.execute(sa.text(
                """
                INSERT INTO reviews (public_id, photo_id, owner_user_id, mode, status, image_type, schema_version, result_json, final_score)
                VALUES ('rev_existing_practice_migration', :photo_id, :user_id, 'flash', 'SUCCEEDED', 'default', '1.0', '{"scores":{}}'::jsonb, 7.0)
                RETURNING id
                """
            ), {'photo_id': photo_id, 'user_id': user_id}).scalar_one()
        self._run_alembic(command.upgrade, 'head')
        inspector = sa.inspect(engine)
        self.assertTrue(inspector.has_table('practice_sessions'))
        self.assertTrue(inspector.has_table('review_call_costs'))
        with engine.connect() as conn:
            self.assertEqual(
                conn.execute(sa.text("SELECT public_id FROM reviews WHERE id=:review_id"), {'review_id': review_id}).scalar_one(),
                'rev_existing_practice_migration',
            )
        engine.dispose()


if __name__ == '__main__':
    unittest.main()
