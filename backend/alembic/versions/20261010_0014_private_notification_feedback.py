"""Lock private notification and feedback tables away from browser roles.

Revision ID: 20261010_0014
Revises: 20261010_0013
"""
from __future__ import annotations

from alembic import op


revision = '20261010_0014'
down_revision = '20261010_0013'
branch_labels = None
depends_on = None


PRIVATE_TABLES = (
    'announcements',
    'notification_events',
    'notification_preferences',
    'notifications',
    'review_score_feedback',
    'review_score_snapshots',
)


def upgrade() -> None:
    table_list = ', '.join(f"'{table_name}'" for table_name in PRIVATE_TABLES)
    for table_name in PRIVATE_TABLES:
        op.execute(f'ALTER TABLE IF EXISTS public.{table_name} ENABLE ROW LEVEL SECURITY')
        op.execute(f'REVOKE ALL PRIVILEGES ON TABLE public.{table_name} FROM PUBLIC')

    op.execute(
        f"""
        DO $$
        DECLARE
            role_name text;
            table_name text;
        BEGIN
            FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
            LOOP
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                    FOREACH table_name IN ARRAY ARRAY[{table_list}]
                    LOOP
                        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, role_name);
                    END LOOP;
                END IF;
            END LOOP;
        END
        $$;
        """
    )
    op.execute(
        f"""
        DO $$
        DECLARE
            role_name text;
            sequence_name regclass;
        BEGIN
            FOR sequence_name IN
                SELECT sequence_class.oid::regclass
                FROM pg_class AS sequence_class
                JOIN pg_depend AS dep ON dep.objid = sequence_class.oid
                JOIN pg_class AS table_class ON table_class.oid = dep.refobjid
                JOIN pg_namespace AS ns ON ns.oid = table_class.relnamespace
                WHERE sequence_class.relkind = 'S'
                    AND dep.deptype = 'a'
                    AND ns.nspname = 'public'
                    AND table_class.relname IN ({table_list})
            LOOP
                EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC', sequence_name);
                FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
                LOOP
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM %I', sequence_name, role_name);
                    END IF;
                END LOOP;
            END LOOP;
        END
        $$;
        """
    )


def downgrade() -> None:
    # Intentionally do not restore broad browser-role grants or disable RLS on
    # private tables. Older migrations can still drop these tables during full
    # downgrade flows.
    pass
