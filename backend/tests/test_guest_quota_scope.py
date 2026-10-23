from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from starlette.requests import Request

from app.db.models import User, UserPlan, UserStatus
from app.services.guard import (
    enforce_guest_creation_rate_limit,
    enforce_guest_review_limits,
    guest_network_scope_key,
    guest_quota_scope_key,
    guest_rate_limit_scope_key,
    guest_usage_snapshot,
    user_usage_snapshot,
    utc_now,
)


def _request(
    *,
    user_agent: str = 'TestAgent/1.0',
    client_host: str = '127.0.0.1',
    device_id: str | None = None,
) -> Request:
    headers: list[tuple[bytes, bytes]] = [(b'user-agent', user_agent.encode('utf-8'))]
    if device_id:
        headers.append((b'x-device-id', device_id.encode('utf-8')))

    return Request(
        {
            'type': 'http',
            'method': 'GET',
            'path': '/api/v1/me/usage',
            'headers': headers,
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
        daily_quota_date=utc_now().date(),
        status=UserStatus.active,
    )


class GuestQuotaScopeTests(unittest.TestCase):
    def test_guest_rate_limit_scope_uses_request_fingerprint_even_with_guest_user(self) -> None:
        request = _request(user_agent='SharedAgent/1.0', client_host='203.0.113.10')
        guest = _user(plan=UserPlan.guest, public_id='gst_abc123')

        scope_key = guest_rate_limit_scope_key(request, guest)

        self.assertTrue(scope_key.startswith('guest:'))
        self.assertNotEqual(scope_key, 'guest_user:gst_abc123')

    def test_guest_quota_scope_prefers_guest_user_over_ua_fingerprint(self) -> None:
        request = _request(user_agent='SharedAgent/1.0', client_host='203.0.113.10')
        guest = _user(plan=UserPlan.guest, public_id='gst_abc123')
        other_guest = _user(plan=UserPlan.guest, public_id='gst_other99')

        scope_key = guest_quota_scope_key(request, guest)

        # Guests sharing one address and browser keep separate buckets, but the
        # network stays part of the key.
        self.assertTrue(scope_key.startswith('guest:'))
        self.assertNotEqual(scope_key, guest_quota_scope_key(request, other_guest))
        self.assertNotEqual(scope_key, guest_rate_limit_scope_key(request, guest))
        self.assertNotEqual(
            scope_key,
            guest_quota_scope_key(_request(user_agent='SharedAgent/1.0', client_host='198.51.100.20'), guest),
        )

    def test_guest_quota_scope_includes_network_with_explicit_device_id(self) -> None:
        guest = _user(plan=UserPlan.guest, public_id='gst_abc123')
        first = guest_quota_scope_key(_request(client_host='203.0.113.10', device_id='browser-123'), guest)
        same = guest_quota_scope_key(_request(client_host='203.0.113.10', device_id='browser-123'), guest)
        moved = guest_quota_scope_key(_request(client_host='198.51.100.20', device_id='browser-123'), guest)

        self.assertEqual(first, same)
        self.assertNotEqual(first, moved)

    def test_rotating_device_id_keeps_the_same_network_scope(self) -> None:
        requests = [_request(client_host='203.0.113.10', device_id=device) for device in ('a', 'b', 'c')]

        device_keys = {guest_quota_scope_key(request) for request in requests}
        network_keys = {guest_network_scope_key(request) for request in requests}

        self.assertEqual(len(device_keys), 3)
        self.assertEqual(len(network_keys), 1)
        self.assertTrue(next(iter(network_keys)).startswith('guest:'))

    def test_network_scope_ignores_spoofed_forwarded_for_prefix(self) -> None:
        def forwarded(value: str) -> Request:
            request = _request(client_host='10.0.0.5', device_id='browser-123')
            request.scope['headers'].append((b'x-forwarded-for', value.encode('latin-1')))
            return request

        with patch('app.core.network.settings.trust_x_forwarded_for', True):
            first = guest_network_scope_key(forwarded('1.1.1.1, 203.0.113.10'))
            second = guest_network_scope_key(forwarded('2.2.2.2, 203.0.113.10'))

        self.assertEqual(first, second)

    def test_network_scope_is_absent_without_a_parseable_client_address(self) -> None:
        self.assertIsNone(guest_network_scope_key(_request(client_host='testclient')))

    def test_guest_quota_scope_prefers_explicit_device_id_when_present(self) -> None:
        request = _request(user_agent='SharedAgent/1.0', client_host='203.0.113.10', device_id='browser-123')
        guest = _user(plan=UserPlan.guest, public_id='gst_abc123')

        scope_key = guest_quota_scope_key(request, guest)

        self.assertTrue(scope_key.startswith('guest:'))
        self.assertNotEqual(scope_key, 'guest_user:gst_abc123')

    def test_guest_scope_falls_back_to_guest_user_when_request_fingerprint_missing(self) -> None:
        request = Request(
            {
                'type': 'http',
                'method': 'GET',
                'path': '/api/v1/me/usage',
                'headers': [],
                'scheme': 'http',
                'server': ('testserver', 80),
                'query_string': b'',
            }
        )
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

        with (
            patch('app.services.guard.count_monthly_review_usage', return_value=7),
            patch('app.services.guard.count_review_quota_holds', return_value=0),
        ):
            usage = user_usage_snapshot(db, free_user)

        self.assertEqual(usage['daily_used'], 2)
        self.assertEqual(usage['daily_remaining'], 3)
        self.assertEqual(usage['monthly_used'], 7)
        self.assertEqual(usage['monthly_remaining'], 53)


class GuestNetworkLimitTests(unittest.TestCase):
    def _guest_actor(self) -> Mock:
        actor = Mock()
        actor.plan = UserPlan.guest
        return actor

    def test_review_limits_enforce_network_caps_on_the_network_key(self) -> None:
        with patch('app.services.guard._enforce_scope_rate_limit', return_value={}) as enforce:
            limits = enforce_guest_review_limits(
                Mock(),
                self._guest_actor(),
                request_scope_key='guest:device-request',
                quota_scope_key='guest:device-quota',
                network_scope_key='guest:network',
            )

        calls = {call.kwargs['scope']: call.kwargs for call in enforce.call_args_list}
        self.assertEqual(calls['guest_review_network_daily']['scope_key'], 'guest:network')
        self.assertEqual(calls['guest_review_network_daily']['per_minute_limit'], 12)
        self.assertEqual(calls['guest_review_network_monthly']['scope_key'], 'guest:network')
        self.assertEqual(calls['guest_review_network_monthly']['per_minute_limit'], 120)
        self.assertEqual(calls['guest_review_daily']['scope_key'], 'guest:device-quota')
        self.assertIn('guest_review_network_daily', limits)

    def test_review_network_caps_can_be_disabled(self) -> None:
        with (
            patch('app.services.guard._enforce_scope_rate_limit', return_value={}) as enforce,
            patch('app.services.guard.settings.guest_review_network_limit_per_day', 0),
            patch('app.services.guard.settings.guest_review_network_limit_per_month', 0),
        ):
            enforce_guest_review_limits(
                Mock(),
                self._guest_actor(),
                request_scope_key='guest:device-request',
                quota_scope_key='guest:device-quota',
                network_scope_key='guest:network',
            )

        scopes = [call.kwargs['scope'] for call in enforce.call_args_list]
        self.assertEqual(scopes, ['guest_review_minute', 'guest_review_daily', 'guest_review_monthly'])

    def test_review_limits_skip_network_caps_when_network_is_unknown(self) -> None:
        with patch('app.services.guard._enforce_scope_rate_limit', return_value={}) as enforce:
            enforce_guest_review_limits(
                Mock(),
                self._guest_actor(),
                request_scope_key='guest:device-request',
                quota_scope_key='guest:device-quota',
                network_scope_key=None,
            )

        scopes = [call.kwargs['scope'] for call in enforce.call_args_list]
        self.assertNotIn('guest_review_network_daily', scopes)

    def test_guest_creation_is_also_capped_per_network(self) -> None:
        with patch('app.services.guard._enforce_scope_rate_limit', return_value={}) as enforce:
            enforce_guest_creation_rate_limit(Mock(), 'guest:device', 'guest:network')

        calls = {call.kwargs['scope']: call.kwargs for call in enforce.call_args_list}
        self.assertEqual(calls['guest_creation_minute']['scope_key'], 'guest:device')
        self.assertEqual(calls['guest_creation_network_minute']['scope_key'], 'guest:network')
        self.assertEqual(calls['guest_creation_network_minute']['per_minute_limit'], 60)

    def test_usage_snapshot_reports_the_tighter_network_remaining(self) -> None:
        counts = {
            ('guest_review_daily', 'guest:device'): 1,
            ('guest_review_monthly', 'guest:device'): 1,
            ('guest_review_network_daily', 'guest:network'): 11,
            ('guest_review_network_monthly', 'guest:network'): 119,
        }

        def hit_count(_db, *, scope, scope_key, **_kwargs):
            return counts.get((scope, scope_key), 0)

        with patch('app.services.guard._counter_hit_count', side_effect=hit_count):
            device_only = guest_usage_snapshot(Mock(), 'guest:device')
            with_network = guest_usage_snapshot(Mock(), 'guest:device', network_scope_key='guest:network')

        self.assertEqual(device_only['daily_remaining'], 2)
        self.assertEqual(device_only['monthly_remaining'], 29)
        self.assertEqual(with_network['daily_used'], 1)
        self.assertEqual(with_network['daily_remaining'], 1)
        self.assertEqual(with_network['monthly_remaining'], 1)


if __name__ == '__main__':
    unittest.main()
