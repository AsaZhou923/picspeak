from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class VerifyProductAnalyticsWriteScriptTests(unittest.TestCase):
    def test_verify_product_analytics_write_inserts_reads_back_and_cleans_up(self) -> None:
        from scripts.verify_product_analytics_write import verify_product_analytics_write

        db = MagicMock()
        query = MagicMock()
        db.query.return_value = query
        query.filter.return_value = query
        inserted_event = SimpleNamespace(id=42, created_at=datetime(2026, 4, 19, 1, 2, 3, tzinfo=timezone.utc))
        query.one_or_none.return_value = inserted_event

        with patch('scripts.verify_product_analytics_write.record_product_event') as record_product_event, patch(
            'scripts.verify_product_analytics_write.uuid4',
            return_value=SimpleNamespace(hex='abc123'),
        ):
            result = verify_product_analytics_write(db)

        record_product_event.assert_called_once()
        self.assertEqual(result['inserted_id'], 42)
        self.assertEqual(result['session_id'], 'ops_verify_abc123')
        self.assertEqual(result['page_path'], '/ops/verify/analytics')
        self.assertEqual(result['cleanup'], 'deleted')
        self.assertEqual(db.commit.call_count, 2)
        db.delete.assert_called_once_with(inserted_event)


if __name__ == '__main__':
    unittest.main()
