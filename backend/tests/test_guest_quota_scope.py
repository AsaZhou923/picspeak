from __future__ import annotations

from datetime import date
import unittest
from unittest.mock import Mock, patch

from starlette.requests import Request

from app.db.models import User, UserPlan, UserStatus
from app.services.guard import guest_rate_limit_scope_key, user_usage_snapshot


def _request(*, user_agent: str = 'TestAgent/1.0', client_host: str = '127.0.0.1') -> Request:
    return Request(
        {
            'type': 'http',
            'method': 'GET',
            'path': '/api/v1/me/usage',
            'headers': [(b'user-agent', user_agent.encode('utf-8'))],
            'client': (client_host, 1234),
            'scheme': 'http',
            'server': ('testserver', 80),
            'query_string': b'',
        }
    )


def _user(*, plan: UserPlan, public_id: str, daily_quota_used: int = 0) -> User:
    return User(
        id=1,
        public_id=public_id,
        email=f'{public_id}@example.com',
        username=public_id,
        plan=plan,
        daily_quota_total=0,
        daily_quota_used=daily_quota_used,
        daily_quota_date=date.today(),
        status=UserStatus.active,
    )


class GuestQuotaScopeTests(unittest.TestCase):
    def test_guest_scope_uses_guest_user_id_when_available(self) -> None:
        request = _request(user_agent='SharedAgent/1.0', client_host='203.0.113.10')
        guest = _user(plan=UserPlan.guest, public_id='gst_abc123')

        scope_key = guest_rate_limit_scope_key(request, guest)

        self.assertEqual(scope_key, 'guest_user:gst_abc123')

    def test_guest_scope_falls_back_to_device_or_ip_without_guest_user(self) -> None:
        request = _request(user_agent='SharedAgent/1.0', client_host='203.0.113.10')

        scope_key = guest_rate_limit_scope_key(request)

        self.assertTrue(scope_key.startswith('guest:'))
        self.assertNotEqual(scope_key, 'guest_user:gst_abc123')

    def test_free_user_usage_snapshot_reads_user_record_not_guest_counter_scope(self) -> None:
        db = Mock()
        free_user = _user(plan=UserPlan.free, public_id='usr_free001', daily_quota_used=2)

        with patch('app.services.guard.count_monthly_review_usage', return_value=7):
            usage = user_usage_snapshot(db, free_user)

        self.assertEqual(usage['daily_used'], 2)
        self.assertEqual(usage['daily_remaining'], 3)
        self.assertEqual(usage['monthly_used'], 7)
        self.assertEqual(usage['monthly_remaining'], 53)


if __name__ == '__main__':
    unittest.main()
