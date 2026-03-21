from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.ai import PROMPT_VERSION, _prompt_for_mode_v3


class AIPromptTests(unittest.TestCase):
    def test_prompt_version_bumped_for_stricter_scoring(self) -> None:
        self.assertEqual(PROMPT_VERSION, 'photo-review-v4-strict')

    def test_chinese_prompt_contains_stricter_scoring_rules(self) -> None:
        prompt = _prompt_for_mode_v3(mode='pro', locale='zh', image_type='street')

        self.assertIn('普通照片应主要落在 3-6 分', prompt)
        self.assertIn('8 分必须接近可入作品集的完成度', prompt)
        self.assertIn('9-10 分应极少出现', prompt)
        self.assertIn('不要因为“电影感”“情绪感”“风格化”', prompt)
        self.assertIn('对应维度通常应压在 6 分及以下', prompt)


if __name__ == '__main__':
    unittest.main()
