from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from starlette.requests import Request

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.network import client_ip_from_request, client_network_from_request


def _request(*, forwarded_for: str | None = None, client_host: str = '10.0.0.5') -> Request:
    headers = [(b'x-forwarded-for', forwarded_for.encode('latin-1'))] if forwarded_for is not None else []
    return Request(
        {
            'type': 'http',
            'method': 'POST',
            'path': '/',
            'headers': headers,
            'client': (client_host, 12345),
            'scheme': 'http',
            'server': ('testserver', 80),
        }
    )


class ClientIpFromRequestTests(unittest.TestCase):
    def test_untrusted_forwarded_for_uses_socket_peer(self) -> None:
        request = _request(forwarded_for='203.0.113.10')

        with patch('app.core.network.settings.trust_x_forwarded_for', False):
            self.assertEqual(client_ip_from_request(request), '10.0.0.5')

    def test_single_trusted_hop_takes_rightmost_entry(self) -> None:
        # Cloud Run appends the real client after any client-supplied value.
        request = _request(forwarded_for='1.2.3.4, 5.6.7.8, 203.0.113.10')

        with (
            patch('app.core.network.settings.trust_x_forwarded_for', True),
            patch('app.core.network.settings.trusted_proxy_hops', 1),
        ):
            self.assertEqual(client_ip_from_request(request), '203.0.113.10')

    def test_two_trusted_hops_skip_load_balancer_entry(self) -> None:
        request = _request(forwarded_for='1.2.3.4, 203.0.113.10, 35.191.0.1')

        with (
            patch('app.core.network.settings.trust_x_forwarded_for', True),
            patch('app.core.network.settings.trusted_proxy_hops', 2),
        ):
            self.assertEqual(client_ip_from_request(request), '203.0.113.10')

    def test_chain_shorter_than_trusted_hops_falls_back_to_socket_peer(self) -> None:
        request = _request(forwarded_for='203.0.113.10')

        with (
            patch('app.core.network.settings.trust_x_forwarded_for', True),
            patch('app.core.network.settings.trusted_proxy_hops', 2),
        ):
            self.assertEqual(client_ip_from_request(request), '10.0.0.5')

    def test_non_positive_hop_setting_is_treated_as_one(self) -> None:
        request = _request(forwarded_for='1.2.3.4, 203.0.113.10')

        with (
            patch('app.core.network.settings.trust_x_forwarded_for', True),
            patch('app.core.network.settings.trusted_proxy_hops', 0),
        ):
            self.assertEqual(client_ip_from_request(request), '203.0.113.10')


class ClientNetworkFromRequestTests(unittest.TestCase):
    def test_ipv4_network_is_the_address(self) -> None:
        self.assertEqual(client_network_from_request(_request(client_host='203.0.113.10')), '203.0.113.10')

    def test_ipv6_addresses_in_one_slash_64_share_a_network(self) -> None:
        first = client_network_from_request(_request(client_host='2001:db8:1:2::1'))
        second = client_network_from_request(_request(client_host='2001:db8:1:2:ffff:ffff:ffff:ffff'))
        other = client_network_from_request(_request(client_host='2001:db8:1:3::1'))

        self.assertEqual(first, '2001:db8:1:2::/64')
        self.assertEqual(first, second)
        self.assertNotEqual(first, other)

    def test_ipv4_mapped_ipv6_collapses_to_ipv4(self) -> None:
        self.assertEqual(client_network_from_request(_request(client_host='::ffff:203.0.113.10')), '203.0.113.10')

    def test_unparseable_client_host_has_no_network(self) -> None:
        self.assertIsNone(client_network_from_request(_request(client_host='testclient')))


if __name__ == '__main__':
    unittest.main()
