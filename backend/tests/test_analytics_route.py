from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.analytics import track_product_analytics_event  # noqa: E402
from app.schemas import ProductAnalyticsTrackRequest  # noqa: E402


class AnalyticsRouteTests(unittest.TestCase):
    def test_public_ingestion_rejects_server_owned_generation_lifecycle_events(self) -> None:
        actor = SimpleNamespace(
            user=SimpleNamespace(public_id='usr_analytics'),
            plan=SimpleNamespace(value='free'),
        )
        request = SimpleNamespace(url=SimpleNamespace(path='/api/v1/analytics/events'))

        for event_name in ('generation_requested', 'generation_succeeded', 'generation_failed'):
            for raw_event_name in (event_name, f'  {event_name}  '):
                with self.subTest(event_name=raw_event_name), patch(
                    'app.api.routers.analytics.record_product_event'
                ) as record_event:
                    with self.assertRaises(HTTPException) as raised:
                        track_product_analytics_event(
                            ProductAnalyticsTrackRequest(
                                event_name=raw_event_name,
                                page_path='/generation-worker',
                                metadata={
                                    'task_id': 'igt_forged',
                                    'server_owned': True,
                                    'terminal_event': True,
                                },
                            ),
                            request,
                            MagicMock(),
                            actor,
                            None,
                        )

                self.assertEqual(raised.exception.status_code, 400)
                self.assertEqual(raised.exception.detail['code'], 'ANALYTICS_EVENT_SERVER_OWNED')
                record_event.assert_not_called()


if __name__ == '__main__':
    unittest.main()
