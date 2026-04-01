from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.content_audit import _build_content_audit_prompt


class ContentAuditPromptTests(unittest.TestCase):
    def test_prompt_explicitly_allows_common_borderline_gallery_content(self) -> None:
        prompt = _build_content_audit_prompt()

        self.assertIn('只拦截明确违规内容', prompt)
        self.assertIn('泳装', prompt)
        self.assertIn('非露点内衣或贴身服装', prompt)
        self.assertIn('如果无法确定，默认倾向 safe', prompt)


if __name__ == '__main__':
    unittest.main()
