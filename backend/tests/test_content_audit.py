from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.http_client import PooledHTTPResponse, PooledHTTPStatusError
from app.services.content_audit import ContentAuditError, _build_content_audit_prompt, run_content_audit


class ContentAuditPromptTests(unittest.TestCase):
    def test_prompt_explicitly_allows_common_borderline_gallery_content(self) -> None:
        prompt = _build_content_audit_prompt()

        self.assertIn('只拦截明确违规内容', prompt)
        self.assertIn('泳装', prompt)
        self.assertIn('非露点内衣或贴身服装', prompt)
        self.assertIn('如果无法确定，默认倾向 safe', prompt)

    def test_provider_http_error_masks_signed_audit_image_url(self) -> None:
        body = (
            b'{"error":"cannot read https://storage.example.com/a.jpg?X-Amz-Credential=credential-secret'
            b'\\u0026X-Amz-Signature=signature-secret\\u0026photo_token=photo-secret","code":"bad_image"}'
        )
        error = PooledHTTPStatusError(PooledHTTPResponse(status=400, data=body, headers={}, reason='Bad Request'))

        with (
            patch('app.services.content_audit.settings.image_audit_enabled', True),
            patch('app.services.content_audit.settings.ai_api_key', 'test-key'),
            patch('app.services.content_audit.settings.ai_api_base_url', 'https://provider.example/v1'),
            patch('app.services.content_audit.settings.ai_model_name', 'vision-audit'),
            patch('app.services.content_audit.settings.ai_timeout_seconds', 30),
            patch('app.services.content_audit.pooled_request', side_effect=error),
        ):
            with self.assertRaises(ContentAuditError) as raised:
                run_content_audit('https://api.example/photos/pho/image?photo_token=local-secret')

        message = str(raised.exception)
        self.assertIn('AI provider HTTP 400', message)
        self.assertIn('bad_image', message)
        for secret in ('credential-secret', 'signature-secret', 'photo-secret', 'local-secret'):
            self.assertNotIn(secret, message)


if __name__ == '__main__':
    unittest.main()
