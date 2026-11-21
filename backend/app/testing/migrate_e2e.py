"""Apply runtime migrations for the E2E smoke runner, local disposable databases only.

``scripts/ensure_runtime_schema.py`` resolves its database through the migration
bootstrap's own settings, which bypass the fake-AI local-database guard. The
smoke runner migrates through this entry point instead: it resolves the exact
URL the migration will use, refuses unless its effective libpq destination is
loopback and the database carries the disposable marker, and only then migrates.
"""

from __future__ import annotations

import sys

from app.db import bootstrap
from app.testing.wait_for_e2e_db import wait_for_database


def main() -> int:
    database_url = bootstrap._database_url()
    try:
        wait_for_database(database_url, required_successes=1, timeout_seconds=10.0, require_marker=True)
    except (RuntimeError, TimeoutError) as exc:
        print(f'migrate_e2e: {exc}', file=sys.stderr)
        return 1
    bootstrap.ensure_runtime_schema()
    print('Runtime schema ensured for disposable E2E database.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
