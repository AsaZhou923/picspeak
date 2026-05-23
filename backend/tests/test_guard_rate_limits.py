from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.errors import ApiHTTPException
from app.db.models import User, UserPlan, UserStatus
from app.services.guard import (
    ACTIVATION_CODE_RATE_LIMIT_PER_HOUR,
    _enforce_scope_rate_limit,
    enforce_activation_code_rate_limit,
)


class GuardRateLimitTests(unittest.TestCase):
    def test_scope_rate_limit_returns_remaining_and_reset_after_first_hit(self) -> None:
        db = MagicMock()
        db.execute.return_value.scalar_one_or_none.return_value = 1
        window_start = datetime(2026, 5, 23, 9, 0, tzinfo=timezone.utc)

        payload = _enforce_scope_rate_limit(
            db,
            scope='guest_api_minute',
            scope_key='guest:test',
            endpoint='review_create',
            per_minute_limit=3,
            window_start=window_start,
            window_seconds=60,
        )

        self.assertEqual(payload['limit_per_min'], 3)
        self.assertEqual(payload['remaining'], 2)
        self.assertEqual(payload['reset_at'], '2026-05-23T09:01:00+00:00')
        db.execute.assert_called_once()
        db.add.assert_not_called()

    def test_scope_rate_limit_raises_without_incrementing_when_limit_is_exhausted(self) -> None:
        db = MagicMock()
        db.execute.return_value.scalar_one_or_none.return_value = None

        with self.assertRaises(ApiHTTPException) as raised:
            _enforce_scope_rate_limit(
                db,
                scope='activation_code_redeem',
                scope_key='user:usr_limit',
                endpoint='activation_code_redeem',
                per_minute_limit=10,
                window_start=datetime(2026, 5, 23, 9, 0, tzinfo=timezone.utc),
                window_seconds=3600,
            )

        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(raised.exception.detail['code'], 'RATE_LIMIT_EXCEEDED')
        db.execute.assert_called_once()
        db.add.assert_not_called()

    def test_activation_code_rate_limit_uses_user_scoped_hour_window(self) -> None:
        db = MagicMock()
        user = User(
            id=31,
            public_id='usr_activation_limit',
            email='limit@example.com',
            username='limit_user',
            plan=UserPlan.free,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )

        with patch('app.services.guard._enforce_scope_rate_limit') as enforce_limit:
            enforce_activation_code_rate_limit(db, user)

        enforce_limit.assert_called_once()
        self.assertEqual(enforce_limit.call_args.kwargs['scope'], 'activation_code_redeem')
        self.assertEqual(enforce_limit.call_args.kwargs['scope_key'], 'user:usr_activation_limit')
        self.assertEqual(enforce_limit.call_args.kwargs['endpoint'], 'activation_code_redeem')
        self.assertEqual(enforce_limit.call_args.kwargs['per_minute_limit'], ACTIVATION_CODE_RATE_LIMIT_PER_HOUR)
        self.assertEqual(enforce_limit.call_args.kwargs['window_seconds'], 3600)


if __name__ == '__main__':
    unittest.main()
