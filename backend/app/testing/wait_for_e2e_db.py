"""Wait until the E2E PostgreSQL server answers real queries over TCP.

The official postgres image initialises a fresh data directory with a temporary
server that listens only on the container's Unix socket, stops it, then starts
the final server. ``pg_isready`` over that socket can succeed against the
temporary server, so this probe connects through the same host and port the app
uses and requires several consecutive ``SELECT 1`` successes before returning.
With ``--mark-disposable`` it then creates the disposable-database marker that
``seed_e2e`` requires, on the same verified TCP destination.
"""

from __future__ import annotations

import argparse
import os
import sys
import time

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool


E2E_DB_MARKER_TABLE = '_picspeak_e2e_disposable_marker'
E2E_DB_MARKER_VALUE = 'picspeak-e2e-smoke'


def _mark_disposable(connection) -> None:
    connection.execute(text(
        f'CREATE TABLE IF NOT EXISTS {E2E_DB_MARKER_TABLE} '
        '(marker text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())'
    ))
    connection.execute(
        text(f'INSERT INTO {E2E_DB_MARKER_TABLE} (marker) VALUES (:marker) ON CONFLICT DO NOTHING'),
        {'marker': E2E_DB_MARKER_VALUE},
    )


def wait_for_database(
    database_url: str,
    *,
    required_successes: int = 5,
    interval_seconds: float = 0.3,
    timeout_seconds: float = 60.0,
    mark_disposable: bool = False,
) -> int:
    url = make_url(database_url)
    if url.get_backend_name() != 'postgresql':
        raise RuntimeError('wait_for_e2e_db only supports PostgreSQL URLs.')
    if mark_disposable:
        from app.core.config import is_local_database_url

        if not is_local_database_url(database_url):
            raise RuntimeError('Refusing to mark a non-loopback database as disposable.')

    engine = create_engine(url, poolclass=NullPool, connect_args={'connect_timeout': 2})
    deadline = time.monotonic() + timeout_seconds
    attempts = 0
    consecutive = 0
    last_error = 'no attempt completed'
    try:
        while time.monotonic() < deadline:
            attempts += 1
            try:
                with engine.connect() as connection:
                    connection.execute(text('SELECT 1')).scalar_one()
                    consecutive += 1
                    if consecutive >= required_successes:
                        if mark_disposable:
                            _mark_disposable(connection)
                            connection.commit()
                        return attempts
            except SQLAlchemyError as exc:
                consecutive = 0
                last_error = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
            time.sleep(interval_seconds)
    finally:
        engine.dispose()

    raise TimeoutError(
        f'PostgreSQL at {url.host}:{url.port} did not answer {required_successes} consecutive '
        f'SELECT 1 probes within {timeout_seconds:.0f}s ({attempts} attempts; last error: {last_error})'
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--database-url', default=os.environ.get('DATABASE_URL', ''))
    parser.add_argument('--required-successes', type=int, default=5)
    parser.add_argument('--interval', type=float, default=0.3)
    parser.add_argument('--timeout', type=float, default=60.0)
    parser.add_argument('--mark-disposable', action='store_true')
    args = parser.parse_args(argv)
    if not args.database_url:
        parser.error('--database-url or DATABASE_URL is required')

    try:
        attempts = wait_for_database(
            args.database_url,
            required_successes=args.required_successes,
            interval_seconds=args.interval,
            timeout_seconds=args.timeout,
            mark_disposable=args.mark_disposable,
        )
    except (RuntimeError, TimeoutError) as exc:
        print(f'wait_for_e2e_db: {exc}', file=sys.stderr)
        return 1
    suffix = ' and marked disposable' if args.mark_disposable else ''
    print(f'PostgreSQL ready after {attempts} probes{suffix}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
