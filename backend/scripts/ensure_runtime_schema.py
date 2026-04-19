from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.bootstrap import ensure_runtime_schema


def main() -> int:
    ensure_runtime_schema()
    print('Runtime schema ensured.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
