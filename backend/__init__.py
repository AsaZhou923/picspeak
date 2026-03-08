from __future__ import annotations

import sys
from pathlib import Path


# Allow both `uvicorn app.main:app` (cwd=`backend/`) and
# `uvicorn backend.app.main:app` (cwd=repo root) to resolve `app.*` imports.
_backend_dir = Path(__file__).resolve().parent
_backend_dir_str = str(_backend_dir)
if _backend_dir_str not in sys.path:
    sys.path.insert(0, _backend_dir_str)
