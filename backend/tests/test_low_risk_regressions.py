from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import Response
from starlette.requests import Request

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.auth import auth_clerk_exchange
from app.core.network import client_ip_from_request
from app.core.security import JWTValidationError, create_access_token, validate_access_token


def _request(headers: dict[str, str] | None = None) -> Request:
    return Request(
        {
            'type': 'http',
            'method': 'POST',
            'path': '/',
            'headers': [
                (key.lower().encode('latin-1'), value.encode('latin-1'))
                for key, value in (headers or {}).items()
            ],
            'client': ('10.0.0.5', 12345),
            'scheme': 'http',
            'server': ('testserver', 80),
        }
    )


class LowRiskRegressionTests(unittest.TestCase):
    def test_forwarded_for_rejects_invalid_ip_before_fallback(self) -> None:
        request = _request({'x-forwarded-for': 'not-an-ip, 203.0.113.10'})

        with patch('app.core.network.settings.trust_x_forwarded_for', True):
            self.assertEqual(client_ip_from_request(request), '10.0.0.5')

    def test_forwarded_for_accepts_valid_first_ip(self) -> None:
        request = _request({'x-forwarded-for': '203.0.113.10, 10.0.0.5'})

        with patch('app.core.network.settings.trust_x_forwarded_for', True):
            self.assertEqual(client_ip_from_request(request), '203.0.113.10')

    def test_access_token_split_handles_extra_separator_as_invalid_encoding(self) -> None:
        token = create_access_token({'sub': 'usr_test'})

        with self.assertRaises(JWTValidationError) as raised:
            validate_access_token(f'{token}.extra')

        self.assertNotEqual(str(raised.exception), 'malformed jwt')

    def test_explicit_empty_clerk_guest_token_does_not_fall_back_to_cookie(self) -> None:
        db = MagicMock()
        request = _request({'cookie': 'ps_guest_token=cookie-token'})
        response = Response()
        user = SimpleNamespace(public_id='usr_clerk')
        identity = SimpleNamespace(user_id='clerk_user')
        payload = SimpleNamespace(guest_token='', recent_limit=20)

        with patch('app.api.routers.auth.verify_clerk_session_token', return_value=identity), patch(
            'app.api.routers.auth._sync_clerk_user',
            return_value=user,
        ), patch('app.api.routers.auth._migrate_guest_records', return_value=(0, 0)) as migrate_guest_records, patch(
            'app.api.routers.auth._serialize_auth_response',
            return_value=SimpleNamespace(access_token='jwt'),
        ):
            auth_clerk_exchange(
                request=request,
                response=response,
                payload=payload,
                db=db,
                authorization='Bearer session-token',
            )

        self.assertEqual(migrate_guest_records.call_args.kwargs['guest_token'], '')


if __name__ == '__main__':
    unittest.main()
