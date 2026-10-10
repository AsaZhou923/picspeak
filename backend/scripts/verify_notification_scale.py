from __future__ import annotations

import argparse
import importlib
import importlib.util
import json
import os
import random
import statistics
import string
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import sqlalchemy as sa
from sqlalchemy.engine import Engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug() -> str:
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(random.choice(alphabet) for _ in range(8))


def _admin_url(raw_url: str) -> sa.URL:
    url = make_url(raw_url)
    if url.get_backend_name() != 'postgresql':
        raise SystemExit('PENDING: scale verification requires PostgreSQL')
    return url.set(database='postgres')


def _database_exists(admin: Engine, name: str) -> bool:
    with admin.connect() as connection:
        return bool(
            connection.execute(
                sa.text('SELECT 1 FROM pg_database WHERE datname = :name'),
                {'name': name},
            ).scalar()
        )


def _create_database(admin: Engine, name: str) -> bool:
    if _database_exists(admin, name):
        raise SystemExit(
            f"FAILED: database {name!r} already exists; choose a new --database-name or pass --drop-existing"
        )
    with admin.connect() as connection:
        connection.execute(sa.text(f'CREATE DATABASE "{name}"'))
    return True


def _drop_database(admin: Engine, name: str) -> None:
    if not _database_exists(admin, name):
        return
    with admin.connect() as connection:
        connection.execute(
            sa.text(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = :name AND pid <> pg_backend_pid()
                """
            ),
            {'name': name},
        )
        connection.execute(sa.text(f'DROP DATABASE "{name}"'))


def _run_alembic(database_url: str) -> None:
    env = os.environ.copy()
    env['DATABASE_URL'] = database_url
    env['PICSPEAK_TEST_DATABASE_URL'] = database_url
    subprocess.run(
        [sys.executable, '-m', 'alembic', '-c', str(BACKEND_ROOT / 'alembic.ini'), 'upgrade', 'head'],
        cwd=str(REPO_ROOT),
        env=env,
        check=True,
    )


def _columns(engine: Engine, table: str) -> dict[str, dict[str, Any]]:
    query = sa.text(
        """
        SELECT column_name, is_nullable, column_default, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :table
        """
    )
    with engine.connect() as connection:
        rows = connection.execute(query, {'table': table}).mappings().all()
    return {row['column_name']: dict(row) for row in rows}


def _require_table(engine: Engine, table: str) -> dict[str, dict[str, Any]]:
    cols = _columns(engine, table)
    if not cols:
        raise SystemExit(f'PENDING: required table {table!r} does not exist after migrations')
    return cols


def _insert_users(engine: Engine, user_count: int, run_id: str) -> list[int]:
    existing = _columns(engine, 'users')
    if not existing:
        raise SystemExit("PENDING: users table does not exist after migrations")

    fields: dict[str, str] = {
        'public_id': "concat('usr_notify_scale_', :run_id, '_', gs)",
        'email': "concat('notify-scale-', :run_id, '-', gs, '@example.test')",
        'username': "concat('notify_scale_', :run_id, '_', gs)",
        'plan': "'free'",
        'status': "'active'",
        'daily_quota_total': '0',
        'daily_quota_used': '0',
    }
    selected = {name: value for name, value in fields.items() if name in existing}
    missing = [
        name
        for name, meta in existing.items()
        if meta['is_nullable'] == 'NO'
        and meta['column_default'] is None
        and name not in selected
        and name != 'id'
    ]
    if missing:
        raise SystemExit(f"PENDING: users has unsupported required columns: {', '.join(sorted(missing))}")

    names = ', '.join(selected)
    values = ', '.join(selected.values())
    sql = sa.text(
        f"""
        INSERT INTO users ({names})
        SELECT {values}
        FROM generate_series(1, :user_count) AS gs
        RETURNING id
        """
    )
    with engine.begin() as connection:
        return list(connection.execute(sql, {'run_id': run_id, 'user_count': user_count}).scalars())


def _notification_insert_columns(cols: dict[str, dict[str, Any]]) -> dict[str, str]:
    candidates: dict[str, str] = {
        'public_id': "concat('ntf_scale_', :run_id, '_', gs)",
        'recipient_user_id': 'u.user_id',
        'category': "CASE WHEN gs % 5 = 0 THEN 'announcement' WHEN gs % 3 = 0 THEN 'interaction' ELSE 'system' END",
        'type': "CASE WHEN gs % 5 = 0 THEN 'announcement.published' WHEN gs % 3 = 0 THEN 'gallery.review_liked' ELSE 'review.completed' END",
        'notification_type': "CASE WHEN gs % 5 = 0 THEN 'announcement.published' WHEN gs % 3 = 0 THEN 'gallery.review_liked' ELSE 'review.completed' END",
        'dedupe_key': "concat('scale:', :run_id, ':', gs)",
        'template_key': "CASE WHEN gs % 5 = 0 THEN 'announcement.published' WHEN gs % 3 = 0 THEN 'gallery.review_liked' ELSE 'review.completed' END",
        'template_version': '1',
        'template_params': "'{}'::jsonb",
        'template_params_json': "'{}'::jsonb",
        'target_type': "'review'",
        'target_public_id': "concat('rev_scale_', :run_id, '_', gs)",
        'announcement_id': 'NULL',
        'occurred_at': "clock_timestamp() - ((gs % 43200) || ' seconds')::interval",
        'delivered_at': "clock_timestamp() - ((gs % 43200) || ' seconds')::interval",
        'read_at': "CASE WHEN gs % 4 = 0 THEN clock_timestamp() ELSE NULL END",
        'archived_at': "CASE WHEN gs % 20 = 0 THEN clock_timestamp() ELSE NULL END",
        'revoked_at': 'NULL',
        'expires_at': "clock_timestamp() + interval '90 days'",
        'created_at': 'clock_timestamp()',
        'updated_at': 'clock_timestamp()',
    }
    selected = {name: expr for name, expr in candidates.items() if name in cols}
    missing = [
        name
        for name, meta in cols.items()
        if meta['is_nullable'] == 'NO'
        and meta['column_default'] is None
        and name not in selected
        and name != 'id'
    ]
    if missing:
        raise SystemExit(f"PENDING: notifications has unsupported required columns: {', '.join(sorted(missing))}")
    for required in ('recipient_user_id', 'dedupe_key', 'delivered_at'):
        if required not in selected:
            raise SystemExit(f'PENDING: notifications is missing expected column {required!r}')
    return selected


def _insert_notifications(engine: Engine, user_ids: list[int], notification_count: int, run_id: str) -> None:
    cols = _require_table(engine, 'notifications')
    selected = _notification_insert_columns(cols)
    user_values = ', '.join(f'({user_id})' for user_id in user_ids)
    names = ', '.join(selected)
    values = ', '.join(selected.values())
    sql = sa.text(
        f"""
        WITH seeded_users(user_id) AS (VALUES {user_values}),
        numbered AS (
          SELECT gs, seeded_users.user_id
          FROM generate_series(1, :notification_count) AS gs
          JOIN seeded_users ON seeded_users.user_id = (
            SELECT user_id
            FROM seeded_users
            OFFSET ((gs - 1) % :user_count)
            LIMIT 1
          )
        )
        INSERT INTO notifications ({names})
        SELECT {values}
        FROM numbered AS u(gs, user_id)
        """
    )
    with engine.begin() as connection:
        connection.execute(
            sql,
            {'run_id': run_id, 'notification_count': notification_count, 'user_count': len(user_ids)},
        )


def _visibility_predicate(cols: dict[str, dict[str, Any]], include_archived: bool = False) -> str:
    parts = ['recipient_user_id = :recipient_user_id']
    if 'archived_at' in cols and not include_archived:
        parts.append('archived_at IS NULL')
    if 'revoked_at' in cols:
        parts.append('revoked_at IS NULL')
    if 'expires_at' in cols:
        parts.append('(expires_at IS NULL OR expires_at > now())')
    return ' AND '.join(parts)


def _time_query(engine: Engine, statement: sa.TextClause, params: dict[str, Any], iterations: int) -> dict[str, Any]:
    timings: list[float] = []
    with engine.connect() as connection:
        for _ in range(iterations):
            start = time.perf_counter()
            list(connection.execute(statement, params))
            timings.append((time.perf_counter() - start) * 1000)
    return {
        'iterations': iterations,
        'min_ms': min(timings),
        'median_ms': statistics.median(timings),
        'p95_ms': statistics.quantiles(timings, n=100)[94] if len(timings) >= 100 else max(timings),
        'max_ms': max(timings),
    }


def _time_actual_api(engine: Engine, recipient_user_id: int, iterations: int, limit: int) -> dict[str, Any]:
    from fastapi import Response

    from app.db.models import User
    try:
        notification_routes = importlib.import_module('app.api.routers.notifications')
    except ModuleNotFoundError:
        route_path = BACKEND_ROOT / 'app' / 'api' / 'routers' / 'notifications.py'
        spec = importlib.util.spec_from_file_location('app.api.routers.notifications', route_path)
        if spec is None or spec.loader is None:
            raise
        notification_routes = importlib.util.module_from_spec(spec)
        sys.modules['app.api.routers.notifications'] = notification_routes
        spec.loader.exec_module(notification_routes)

    Session = sessionmaker(bind=engine, expire_on_commit=False)
    with Session() as db:
        user_row = db.query(User.id, User.public_id).filter(User.id == recipient_user_id).one()
    user = SimpleNamespace(id=user_row.id, public_id=user_row.public_id)
    timings: list[float] = []
    query_counts: list[int] = []

    for _ in range(iterations):
        count = 0

        def before_cursor_execute(*_args: Any, **_kwargs: Any) -> None:
            nonlocal count
            count += 1

        sa.event.listen(engine, 'before_cursor_execute', before_cursor_execute)
        try:
            with Session() as db:
                start = time.perf_counter()
                response = Response()
                notification_routes.list_notifications(
                    response,
                    category='all',
                    unread_only=False,
                    archived=False,
                    cursor=None,
                    limit=limit,
                    db=db,
                    user=user,
                )
                notification_routes.notification_unread_count(response, db=db, user=user)
                timings.append((time.perf_counter() - start) * 1000)
        finally:
            sa.event.remove(engine, 'before_cursor_execute', before_cursor_execute)
        query_counts.append(count)

    return {
        'iterations': iterations,
        'limit': limit,
        'min_ms': min(timings),
        'median_ms': statistics.median(timings),
        'p95_ms': statistics.quantiles(timings, n=100)[94] if len(timings) >= 100 else max(timings),
        'max_ms': max(timings),
        'query_count_min': min(query_counts),
        'query_count_median': statistics.median(query_counts),
        'query_count_p95': statistics.quantiles(query_counts, n=100)[94] if len(query_counts) >= 100 else max(query_counts),
        'query_count_max': max(query_counts),
    }


def _seed_visibility_mix(engine: Engine, recipient_user_id: int, run_id: str) -> dict[str, Any]:
    """Seed latest inbox rows with available and unavailable private targets."""
    notification_cols = _columns(engine, 'notifications')
    required_notification_cols = {'category', 'notification_type', 'template_key', 'template_params_json', 'target_type', 'target_public_id'}
    if not required_notification_cols.issubset(notification_cols):
        return {'status': 'pending', 'reason': 'notification target columns unavailable'}
    for table_name in ('photos', 'reviews'):
        if not _columns(engine, table_name):
            return {'status': 'pending', 'reason': f'{table_name} table does not exist'}

    with engine.begin() as connection:
        other_user_id = connection.execute(
            sa.text('SELECT id FROM users WHERE id <> :recipient_user_id ORDER BY id LIMIT 1'),
            {'recipient_user_id': recipient_user_id},
        ).scalar()
        if other_user_id is None:
            return {'status': 'pending', 'reason': 'need at least two users for private target mix'}
        connection.execute(
            sa.text(
                """
                WITH mix(ord, review_public_id, owner_user_id, gallery_visible, gallery_audit_status, deleted_at) AS (
                  VALUES
                    (1, concat('rev_mix_', :run_id, '_available_1'), :recipient_user_id, true, 'approved', NULL::timestamptz),
                    (2, concat('rev_mix_', :run_id, '_available_2'), :recipient_user_id, true, 'approved', NULL::timestamptz),
                    (3, concat('rev_mix_', :run_id, '_available_3'), :recipient_user_id, true, 'approved', NULL::timestamptz),
                    (4, concat('rev_mix_', :run_id, '_available_4'), :recipient_user_id, true, 'approved', NULL::timestamptz),
                    (5, concat('rev_mix_', :run_id, '_hidden_1'), :recipient_user_id, false, 'none', NULL::timestamptz),
                    (6, concat('rev_mix_', :run_id, '_hidden_2'), :recipient_user_id, true, 'pending', NULL::timestamptz),
                    (7, concat('rev_mix_', :run_id, '_hidden_3'), :recipient_user_id, false, 'approved', NULL::timestamptz),
                    (8, concat('rev_mix_', :run_id, '_deleted_1'), :recipient_user_id, true, 'approved', clock_timestamp()),
                    (9, concat('rev_mix_', :run_id, '_deleted_2'), :recipient_user_id, true, 'approved', clock_timestamp()),
                    (10, concat('rev_mix_', :run_id, '_deleted_3'), :recipient_user_id, false, 'none', clock_timestamp()),
                    (11, concat('rev_mix_', :run_id, '_other_1'), :other_user_id, true, 'approved', NULL::timestamptz),
                    (12, concat('rev_mix_', :run_id, '_other_2'), :other_user_id, true, 'approved', NULL::timestamptz)
                ),
                inserted_photos AS (
                  INSERT INTO photos (public_id, owner_user_id, upload_id, bucket, object_key, content_type, size_bytes, status)
                  SELECT concat('photo_', review_public_id), owner_user_id, concat('upload_', review_public_id),
                         'scale-test', concat('objects/', review_public_id, '.webp'), 'image/webp', 12345, 'READY'
                  FROM mix
                  ON CONFLICT DO NOTHING
                  RETURNING id, public_id
                ),
                existing_photos AS (
                  SELECT p.id, p.public_id
                  FROM photos p
                  JOIN mix ON p.public_id = concat('photo_', mix.review_public_id)
                ),
                all_photos AS (
                  SELECT id, public_id FROM inserted_photos
                  UNION ALL
                  SELECT id, public_id FROM existing_photos
                )
                INSERT INTO reviews (
                  public_id, photo_id, owner_user_id, mode, status, image_type, schema_version,
                  result_json, final_score, is_public, gallery_visible, gallery_audit_status, deleted_at
                )
                SELECT mix.review_public_id, all_photos.id, mix.owner_user_id, 'flash', 'SUCCEEDED', 'default', '1.0',
                       '{}'::jsonb, 7.50, false, mix.gallery_visible, mix.gallery_audit_status, mix.deleted_at
                FROM mix
                JOIN all_photos ON all_photos.public_id = concat('photo_', mix.review_public_id)
                ON CONFLICT DO NOTHING
                """
            ),
            {'run_id': run_id, 'recipient_user_id': recipient_user_id, 'other_user_id': other_user_id},
        )
        connection.execute(
            sa.text(
                """
                WITH mix(ord, review_public_id) AS (
                  VALUES
                    (1, concat('rev_mix_', :run_id, '_available_1')),
                    (2, concat('rev_mix_', :run_id, '_available_2')),
                    (3, concat('rev_mix_', :run_id, '_available_3')),
                    (4, concat('rev_mix_', :run_id, '_available_4')),
                    (5, concat('rev_mix_', :run_id, '_hidden_1')),
                    (6, concat('rev_mix_', :run_id, '_hidden_2')),
                    (7, concat('rev_mix_', :run_id, '_hidden_3')),
                    (8, concat('rev_mix_', :run_id, '_deleted_1')),
                    (9, concat('rev_mix_', :run_id, '_deleted_2')),
                    (10, concat('rev_mix_', :run_id, '_deleted_3')),
                    (11, concat('rev_mix_', :run_id, '_other_1')),
                    (12, concat('rev_mix_', :run_id, '_other_2'))
                ),
                chosen AS (
                  SELECT id, row_number() OVER (ORDER BY delivered_at DESC, id DESC) AS ord
                  FROM notifications
                  WHERE recipient_user_id = :recipient_user_id
                  ORDER BY delivered_at DESC, id DESC
                  LIMIT 12
                )
                UPDATE notifications n
                SET category = 'interaction',
                    notification_type = 'gallery.review_liked',
                    template_key = 'gallery.review_liked',
                    template_params_json = jsonb_build_object('review_id', mix.review_public_id),
                    target_type = 'review',
                    target_public_id = mix.review_public_id,
                    delivered_at = clock_timestamp() + ((13 - mix.ord) || ' seconds')::interval,
                    occurred_at = clock_timestamp() + ((13 - mix.ord) || ' seconds')::interval,
                    read_at = NULL,
                    archived_at = NULL,
                    revoked_at = NULL,
                    expires_at = clock_timestamp() + interval '90 days'
                FROM chosen
                JOIN mix ON mix.ord = chosen.ord
                WHERE n.id = chosen.id
                """
            ),
            {'run_id': run_id, 'recipient_user_id': recipient_user_id},
        )
    return {'status': 'ok', 'expected_available_targets': 7, 'seeded_notifications': 12}


def _check_visibility_mix(engine: Engine, recipient_user_id: int) -> dict[str, Any]:
    from fastapi import Response

    notification_routes = importlib.import_module('app.api.routers.notifications')
    from app.db.models import User

    Session = sessionmaker(bind=engine, expire_on_commit=False)
    with Session() as db:
        user_row = db.query(User.id, User.public_id).filter(User.id == recipient_user_id).one()
        user = SimpleNamespace(id=user_row.id, public_id=user_row.public_id)
        response = Response()
        result = notification_routes.list_notifications(
            response,
            category='all',
            unread_only=False,
            archived=False,
            cursor=None,
            limit=12,
            db=db,
            user=user,
        )
        items = [item.model_dump() if hasattr(item, 'model_dump') else item.dict() for item in result.items]
        targets_present = [item for item in items if item.get('target')]
        targets_available = [
            item
            for item in targets_present
            if isinstance(item.get('target'), dict) and item['target'].get('state') == 'available'
        ]
        blank_titles = [item['notification_id'] for item in items if not item.get('title') or not item.get('summary')]
    return {
        'status': 'ok',
        'items_checked': len(items),
        'targets_present': len(targets_present),
        'available_target_states': len(targets_available),
        'unavailable_target_states': len(items) - len(targets_available),
        'blank_title_or_summary_count': len(blank_titles),
        'blank_title_or_summary_sample': blank_titles[:5],
        'target_samples': [
            {
                'notification_id': item.get('notification_id'),
                'type': item.get('type'),
                'target': item.get('target'),
                'title': item.get('title'),
                'summary': item.get('summary'),
            }
            for item in items[:12]
        ],
    }


def _explain(engine: Engine, sql: str, params: dict[str, Any]) -> Any:
    with engine.connect() as connection:
        return connection.execute(
            sa.text('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql),
            params,
        ).scalar()


def _seed_events_if_available(engine: Engine, user_ids: list[int], run_id: str) -> dict[str, Any]:
    cols = _columns(engine, 'notification_events')
    if not cols:
        return {'status': 'pending', 'reason': 'notification_events table does not exist'}
    selected: dict[str, str] = {
        'public_id': "concat('nev_scale_', :run_id, '_', gs)",
        'event_type': "'review.completed'",
        'dedupe_key': "concat('event-scale:', :run_id, ':', gs)",
        'schema_version': '1',
        'payload_json': "'{}'::jsonb",
        'cursor_json': "'{}'::jsonb",
        'recipient_user_id': 'u.user_id',
        'occurred_at': 'clock_timestamp()',
        'status': "'pending'",
        'attempts': '0',
        'available_at': 'clock_timestamp()',
        'created_at': 'clock_timestamp()',
        'updated_at': 'clock_timestamp()',
    }
    selected = {name: expr for name, expr in selected.items() if name in cols}
    required_missing = [
        name
        for name, meta in cols.items()
        if meta['is_nullable'] == 'NO'
        and meta['column_default'] is None
        and name not in selected
        and name != 'id'
    ]
    if required_missing:
        return {'status': 'pending', 'reason': f"unsupported required columns: {', '.join(sorted(required_missing))}"}

    user_values = ', '.join(f'({user_id})' for user_id in user_ids[:100])
    names = ', '.join(selected)
    values = ', '.join(selected.values())
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                f"""
                WITH seeded_users(user_id) AS (VALUES {user_values})
                INSERT INTO notification_events ({names})
                SELECT {values}
                FROM generate_series(1, 1000) AS gs
                JOIN seeded_users AS u ON u.user_id = (
                  SELECT user_id FROM seeded_users OFFSET ((gs - 1) % 100) LIMIT 1
                )
                ON CONFLICT DO NOTHING
                """
            ),
            {'run_id': run_id},
        )

    processor_result: dict[str, Any] = {'status': 'pending', 'reason': 'processor not invoked'}
    try:
        from app.services.notification_processor import process_pending_notifications

        Session = sessionmaker(bind=engine, expire_on_commit=False)
        query_count = 0

        def before_cursor_execute(*_args: Any, **_kwargs: Any) -> None:
            nonlocal query_count
            query_count += 1

        sa.event.listen(engine, 'before_cursor_execute', before_cursor_execute)
        try:
            with Session() as db:
                started = time.perf_counter()
                processed = process_pending_notifications(
                    db,
                    limit=100,
                    max_batches=1,
                    time_budget_seconds=5,
                )
                elapsed_ms = (time.perf_counter() - started) * 1000
                pending_remaining = int(
                    db.execute(
                        sa.text("SELECT count(*) FROM notification_events WHERE status = 'pending'")
                    ).scalar()
                    or 0
                )
                processor_result = {
                    'status': 'ok',
                    'limit': 100,
                    'max_batches': 1,
                    'elapsed_ms': elapsed_ms,
                    'query_count': query_count,
                    'result': processed,
                    'pending_remaining': pending_remaining,
                }
        finally:
            sa.event.remove(engine, 'before_cursor_execute', before_cursor_execute)
    except Exception as exc:
        processor_result = {'status': 'failed', 'error': f'{type(exc).__name__}: {exc}'}

    predicate = "status = 'pending'"
    if 'available_at' in cols:
        predicate += ' AND available_at <= now()'
    claim_sql = f"""
        SELECT id
        FROM notification_events
        WHERE {predicate}
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 100
    """
    return {'status': 'ok', 'claim_batch_explain': _explain(engine, claim_sql, {}), 'processor': processor_result}


def run(args: argparse.Namespace) -> dict[str, Any]:
    base_url = args.database_url or os.environ.get('PICSPEAK_TEST_DATABASE_URL') or os.environ.get('DATABASE_URL')
    if not base_url:
        raise SystemExit('PENDING: set PICSPEAK_TEST_DATABASE_URL or pass --database-url')
    admin = sa.create_engine(_admin_url(base_url), isolation_level='AUTOCOMMIT', pool_pre_ping=True)
    database_name = args.database_name or f'picspeak_notify_scale_{_slug()}'
    test_url = make_url(base_url).set(database=database_name).render_as_string(hide_password=False)

    created_database = False
    if args.drop_existing:
        _drop_database(admin, database_name)
    created_database = _create_database(admin, database_name)
    try:
        if not args.skip_migrations:
            _run_alembic(test_url)
        engine = sa.create_engine(test_url, pool_pre_ping=True)
        run_id = _slug()
        user_ids = _insert_users(engine, args.users, run_id)
        started = time.perf_counter()
        _insert_notifications(engine, user_ids, args.notifications, run_id)
        seed_ms = (time.perf_counter() - started) * 1000
        cols = _require_table(engine, 'notifications')
        recipient = user_ids[len(user_ids) // 2]
        visibility_mix_seed = _seed_visibility_mix(engine, recipient, run_id)
        predicate = _visibility_predicate(cols)
        select_columns = ['id', 'delivered_at', 'read_at']
        if 'public_id' in cols:
            select_columns.insert(1, 'public_id')
        if 'category' in cols:
            select_columns.insert(-2, 'category')
        select_sql = f"""
            SELECT {', '.join(select_columns)}
            FROM notifications
            WHERE {predicate}
            ORDER BY delivered_at DESC, id DESC
            LIMIT 20
        """
        count_sql = f"""
            SELECT count(*)
            FROM notifications
            WHERE {predicate} AND read_at IS NULL
        """
        return {
            'status': 'ok',
            'generated_at': _now_iso(),
            'database': database_name,
            'users': len(user_ids),
            'notifications': args.notifications,
            'seed_ms': seed_ms,
            'list_query': _time_query(engine, sa.text(select_sql), {'recipient_user_id': recipient}, args.iterations),
            'unread_count_query': _time_query(engine, sa.text(count_sql), {'recipient_user_id': recipient}, args.iterations),
            'actual_api': _time_actual_api(engine, recipient, args.iterations, args.limit),
            'visibility_mix': {
                'seed': visibility_mix_seed,
                'api': _check_visibility_mix(engine, recipient) if visibility_mix_seed.get('status') == 'ok' else {'status': 'pending'},
            },
            'list_explain': _explain(engine, select_sql, {'recipient_user_id': recipient}),
            'unread_count_explain': _explain(engine, count_sql, {'recipient_user_id': recipient}),
            'event_batch': _seed_events_if_available(engine, user_ids, run_id),
            'target': {'api_p95_ms': args.p95_ms},
        }
    finally:
        if args.keep_database:
            print(f'Kept verification database: {database_name}', file=sys.stderr)
        elif created_database:
            _drop_database(admin, database_name)


def _verification_failures(result: dict[str, Any]) -> list[str]:
    if result.get('status') != 'ok':
        return ['status']
    target_ms = float((result.get('target') or {}).get('api_p95_ms') or 0)
    failures = [
        name
        for name in ('list_query', 'unread_count_query', 'actual_api')
        if target_ms > 0 and float((result.get(name) or {}).get('p95_ms') or 0) > target_ms
    ]
    visibility = result.get('visibility_mix') or {}
    for name in ('seed', 'api'):
        status = (visibility.get(name) or {}).get('status')
        if status == 'failed' or (name == 'api' and status not in {'ok', 'pending'}):
            failures.append(f'visibility_mix.{name}')
    event_batch = result.get('event_batch') or {}
    if event_batch.get('status') == 'failed':
        failures.append('event_batch')
    processor = event_batch.get('processor') or {}
    if processor.get('status') == 'failed':
        failures.append('event_batch.processor')
    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description='Verify PicSpeak notification scale contract on an isolated PostgreSQL DB.')
    parser.add_argument('--database-url', help='Base PostgreSQL URL. Defaults to PICSPEAK_TEST_DATABASE_URL or DATABASE_URL.')
    parser.add_argument('--database-name', help='Temporary database name. Defaults to a generated isolated name.')
    parser.add_argument('--users', type=int, default=1000)
    parser.add_argument('--notifications', type=int, default=100000)
    parser.add_argument('--iterations', type=int, default=200)
    parser.add_argument('--limit', type=int, default=20)
    parser.add_argument('--p95-ms', type=float, default=500.0)
    parser.add_argument('--keep-database', action='store_true')
    parser.add_argument('--drop-existing', action='store_true')
    parser.add_argument('--skip-migrations', action='store_true')
    parser.add_argument('--output', type=Path, help='Write JSON result to this path.')
    args = parser.parse_args()

    result = run(args)
    payload = json.dumps(result, ensure_ascii=False, indent=2, default=str)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + '\n', encoding='utf-8')
    print(payload)
    failures = _verification_failures(result)
    if failures:
        raise SystemExit(f"FAILED: notification scale checks failed for {', '.join(failures)}")


if __name__ == '__main__':
    main()
