"""PostgreSQL ACL and RLS coverage for private notification/feedback tables."""
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


PRIVATE_TABLES = (
    'announcements',
    'notification_events',
    'notification_preferences',
    'notifications',
    'review_score_feedback',
    'review_score_snapshots',
)
BROWSER_ROLES = ('anon', 'authenticated')


@unittest.skipUnless(os.environ.get('PICSPEAK_TEST_DATABASE_URL'), 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class NotificationFeedbackAclPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        raw_url = os.environ['PICSPEAK_TEST_DATABASE_URL']
        self.base_url = make_url(raw_url)
        if self.base_url.get_backend_name() != 'postgresql':
            self.skipTest('ACL migration coverage requires PostgreSQL')
        self.database = 'picspeak_acl_' + uuid4().hex[:24]
        self.test_url = self.base_url.set(database=self.database)
        self.created_roles: list[str] = []
        self.admin = sa.create_engine(self.base_url.set(database='postgres'), isolation_level='AUTOCOMMIT')
        with self.admin.begin() as conn:
            for role in BROWSER_ROLES:
                exists = conn.execute(sa.text('SELECT 1 FROM pg_roles WHERE rolname = :role'), {'role': role}).scalar()
                if not exists:
                    conn.execute(sa.text(f'CREATE ROLE "{role}" NOLOGIN'))
                    self.created_roles.append(role)
            conn.execute(sa.text(f'CREATE DATABASE "{self.database}"'))
        self.engine = sa.create_engine(self.test_url)

    def tearDown(self) -> None:
        if hasattr(self, 'engine'):
            self.engine.dispose()
        if hasattr(self, 'admin'):
            with self.admin.begin() as conn:
                conn.execute(sa.text(f'DROP DATABASE IF EXISTS "{self.database}" WITH (FORCE)'))
                for role in self.created_roles:
                    conn.execute(sa.text(f'DROP ROLE IF EXISTS "{role}"'))
            self.admin.dispose()

    def migrate(self, operation, revision: str) -> None:
        config = Config(str(BACKEND_ROOT / 'alembic.ini'))
        config.set_main_option('script_location', str(BACKEND_ROOT / 'alembic'))
        with self.engine.begin() as connection:
            config.attributes['connection'] = connection
            operation(config, revision)

    def browser_sequences(self, conn: sa.Connection) -> list[str]:
        rows = conn.execute(
            sa.text(
                """
                SELECT sequence_class.oid::regclass::text
                FROM pg_class AS sequence_class
                JOIN pg_depend AS dep ON dep.objid = sequence_class.oid
                JOIN pg_class AS table_class ON table_class.oid = dep.refobjid
                JOIN pg_namespace AS ns ON ns.oid = table_class.relnamespace
                WHERE sequence_class.relkind = 'S'
                    AND dep.deptype = 'a'
                    AND ns.nspname = 'public'
                    AND table_class.relname = ANY(:tables)
                ORDER BY sequence_class.relname
                """
            ),
            {'tables': list(PRIVATE_TABLES)},
        ).scalars()
        return list(rows)

    def simulate_supabase_browser_grants(self) -> None:
        with self.engine.begin() as conn:
            for role in BROWSER_ROLES:
                conn.execute(sa.text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
                conn.execute(sa.text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{role}"'))
                conn.execute(sa.text(f'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "{role}"'))

    def assert_browser_table_privileges(self, expected: bool) -> None:
        with self.engine.connect() as conn:
            for role in BROWSER_ROLES:
                for table in PRIVATE_TABLES:
                    for privilege in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'):
                        self.assertEqual(
                            conn.execute(
                                sa.text("SELECT has_table_privilege(:role, :table_name, :privilege)"),
                                {'role': role, 'table_name': f'public.{table}', 'privilege': privilege},
                            ).scalar_one(),
                            expected,
                            f'{role} {privilege} on {table}',
                        )

    def assert_browser_sequence_privileges(self, expected: bool) -> list[str]:
        with self.engine.connect() as conn:
            sequences = self.browser_sequences(conn)
            self.assertTrue(sequences)
            for role in BROWSER_ROLES:
                for sequence in sequences:
                    for privilege in ('USAGE', 'SELECT', 'UPDATE'):
                        self.assertEqual(
                            conn.execute(
                                sa.text("SELECT has_sequence_privilege(:role, :sequence_name, :privilege)"),
                                {'role': role, 'sequence_name': sequence, 'privilege': privilege},
                            ).scalar_one(),
                            expected,
                            f'{role} {privilege} on {sequence}',
                        )
            return sequences

    def assert_role_statement_rejected(self, role: str, statement: str) -> None:
        with self.engine.connect().execution_options(isolation_level='AUTOCOMMIT') as conn:
            conn.execute(sa.text(f'SET ROLE "{role}"'))
            try:
                with self.assertRaises(sa.exc.DBAPIError) as rejected:
                    conn.execute(sa.text(statement))
                self.assertEqual(getattr(rejected.exception.orig, 'pgcode', None), '42501')
            finally:
                conn.execute(sa.text('RESET ROLE'))

    def assert_private_tables_hardened(self) -> None:
        with self.engine.connect() as conn:
            rows = conn.execute(
                sa.text(
                    """
                    SELECT relname, relrowsecurity, relforcerowsecurity
                    FROM pg_class
                    WHERE relnamespace = 'public'::regnamespace
                        AND relname = ANY(:tables)
                    """
                ),
                {'tables': list(PRIVATE_TABLES)},
            ).mappings()
            by_table = {row['relname']: row for row in rows}
            self.assertEqual(set(by_table), set(PRIVATE_TABLES))
            for table, row in by_table.items():
                self.assertTrue(row['relrowsecurity'], table)
                self.assertFalse(row['relforcerowsecurity'], table)
                for privilege in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'):
                    self.assertTrue(
                        conn.execute(
                            sa.text('SELECT has_table_privilege(current_user, :table_name, :privilege)'),
                            {'table_name': f'public.{table}', 'privilege': privilege},
                        ).scalar_one(),
                        f'owner {privilege} on {table}',
                    )
                conn.execute(sa.text(f'SELECT count(*) FROM public.{table}'))

        self.assert_browser_table_privileges(False)
        sequences = self.assert_browser_sequence_privileges(False)
        for role in BROWSER_ROLES:
            for table in PRIVATE_TABLES:
                self.assert_role_statement_rejected(role, f'SELECT count(*) FROM public.{table}')
                self.assert_role_statement_rejected(role, f'INSERT INTO public.{table} DEFAULT VALUES')
                key_column = 'user_id' if table == 'notification_preferences' else 'id'
                self.assert_role_statement_rejected(role, f'UPDATE public.{table} SET {key_column} = {key_column} WHERE false')
                self.assert_role_statement_rejected(role, f'DELETE FROM public.{table} WHERE false')
            for sequence in sequences:
                self.assert_role_statement_rejected(role, f"SELECT nextval('{sequence}')")

    def test_acl_migration_revokes_supabase_style_browser_grants_and_is_reapplicable(self) -> None:
        self.migrate(command.upgrade, '20261010_0013')
        self.simulate_supabase_browser_grants()
        self.assert_browser_table_privileges(True)
        self.assert_browser_sequence_privileges(True)

        self.migrate(command.upgrade, 'head')
        self.assert_private_tables_hardened()

        self.migrate(command.downgrade, '20261010_0013')
        self.assert_private_tables_hardened()

        self.migrate(command.upgrade, 'head')
        self.assert_private_tables_hardened()

    def test_ci_downgrade_to_0003_then_upgrade_head_still_succeeds(self) -> None:
        self.migrate(command.upgrade, 'head')
        self.migrate(command.downgrade, '20260523_0003')
        with self.engine.connect() as conn:
            for table in PRIVATE_TABLES:
                self.assertFalse(sa.inspect(conn).has_table(table))

        self.migrate(command.upgrade, 'head')
        self.assert_private_tables_hardened()


if __name__ == '__main__':
    unittest.main()
