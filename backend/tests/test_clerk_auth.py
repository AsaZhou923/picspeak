from __future__ import annotations

import sys
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services import clerk_auth


class ClerkAuthCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        clerk_auth._jwks_cache['expires_at'] = 0.0
        clerk_auth._jwks_cache['keys'] = []

    def tearDown(self) -> None:
        clerk_auth._jwks_cache['expires_at'] = 0.0
        clerk_auth._jwks_cache['keys'] = []

    def test_fetch_jwks_coalesces_concurrent_refreshes(self) -> None:
        start_barrier = threading.Barrier(5)
        upstream_calls: list[tuple[str, str]] = []
        results: list[list[dict[str, str]]] = []
        failures: list[BaseException] = []
        expected_keys = [{'kid': 'kid_123', 'n': 'abc', 'e': 'AQAB'}]

        def fake_clerk_request(method: str, path: str) -> dict[str, object]:
            upstream_calls.append((method, path))
            time.sleep(0.05)
            return {'keys': expected_keys}

        def worker() -> None:
            try:
                start_barrier.wait(timeout=1)
                results.append(clerk_auth._fetch_jwks())
            except BaseException as exc:  # pragma: no cover - captured for assertion
                failures.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(4)]
        with patch('app.services.clerk_auth._clerk_request', side_effect=fake_clerk_request):
            for thread in threads:
                thread.start()

            start_barrier.wait(timeout=1)
            for thread in threads:
                thread.join(timeout=2)

        self.assertEqual(failures, [])
        self.assertEqual(upstream_calls, [('GET', '/v1/jwks')])
        self.assertEqual(results, [expected_keys] * 4)


if __name__ == '__main__':
    unittest.main()
