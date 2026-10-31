from __future__ import annotations

import hashlib
import hmac
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from starlette.requests import Request

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.errors import ApiHTTPException
from app.services.lemonsqueezy_webhooks import verify_lemonsqueezy_webhook


def signed_request(payload, *, signature=None):
    body = json.dumps(payload).encode()
    digest = hmac.new(b'local-test-signing-secret', body, hashlib.sha256).hexdigest()

    async def receive():
        return {'type': 'http.request', 'body': body, 'more_body': False}

    return Request({'type': 'http', 'headers': [(b'x-signature', (signature or digest).encode())]}, receive)


class LemonSqueezyWebhookSignatureTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        secret = patch('app.services.lemonsqueezy_webhooks.webhook_signing_secret', return_value='local-test-signing-secret')
        secret.start()
        self.addCleanup(secret.stop)

    async def test_valid_signed_resource_uses_attributes_mode_when_meta_mode_is_missing(self):
        payload = {'meta': {'event_name': 'subscription_expired'},
                   'data': {'type': 'subscriptions', 'id': 'sub_1', 'attributes': {'test_mode': False}}}
        event = await verify_lemonsqueezy_webhook(signed_request(payload))
        self.assertEqual(event.event_name, 'subscription_expired')
        self.assertIs(event.test_mode, False)
        self.assertEqual(event.resource_id, 'sub_1')

    async def test_incorrect_signature_is_rejected_before_payload_parsing(self):
        with self.assertRaises(ApiHTTPException) as raised:
            await verify_lemonsqueezy_webhook(signed_request({}, signature='0' * 64))
        self.assertEqual(raised.exception.status_code, 401)

    async def test_string_payment_mode_cannot_reach_the_boolean_database_column(self):
        payload = {'meta': {'event_name': 'subscription_created', 'test_mode': 'false'},
                   'data': {'type': 'subscriptions', 'id': 'sub_1'}}
        with self.assertRaises(ApiHTTPException) as raised:
            await verify_lemonsqueezy_webhook(signed_request(payload))
        self.assertEqual(raised.exception.status_code, 400)


if __name__ == '__main__':
    unittest.main()
