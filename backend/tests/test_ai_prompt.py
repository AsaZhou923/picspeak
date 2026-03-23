from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.ai import (
    AIJSONResponse,
    AIReviewError,
    PROMPT_VERSION,
    SCORE_VERSION,
    _is_multimodal_model,
    _normalize_review_result_fields,
    _prompt_for_mode_v3,
    run_ai_review,
    model_name_for_mode,
)


class AIPromptTests(unittest.TestCase):
    def test_prompt_version_bumped_for_stricter_scoring(self) -> None:
        self.assertEqual(PROMPT_VERSION, 'photo-review-v5-split-score-lock')

    def test_chinese_prompt_contains_stricter_scoring_rules(self) -> None:
        prompt = _prompt_for_mode_v3(mode='pro', locale='zh', image_type='street')

        self.assertIn('"schema_version":"1.0"', prompt)
        self.assertIn('"scores":{"composition":0-10,"lighting":0-10,"color":0-10,"impact":0-10,"technical":0-10}', prompt)

    def test_multimodal_model_detection_accepts_dashscope_qwen35_models(self) -> None:
        self.assertTrue(_is_multimodal_model('qwen3.5-flash'))
        self.assertTrue(_is_multimodal_model('qwen3.5-plus'))
        self.assertTrue(_is_multimodal_model('qwen3.5-flash-2026-02-23'))
        self.assertTrue(_is_multimodal_model('qwen-vl-plus'))

    def test_model_name_for_mode_accepts_qwen35_flash_without_vl_suffix(self) -> None:
        with patch('app.services.ai.settings.ai_model_name', 'qwen3.5-flash'), patch(
            'app.services.ai.settings.flash_model_name', ''
        ), patch('app.services.ai.settings.pro_model_name', ''):
            self.assertEqual(model_name_for_mode('flash'), 'qwen3.5-flash')

    def test_model_name_for_mode_rejects_non_multimodal_model(self) -> None:
        with patch('app.services.ai.settings.ai_model_name', 'qwen-plus'), patch(
            'app.services.ai.settings.flash_model_name', ''
        ), patch('app.services.ai.settings.pro_model_name', ''):
            with self.assertRaises(AIReviewError):
                model_name_for_mode('flash')

    def test_normalize_review_result_fields_joins_suggestions_list(self) -> None:
        normalized = _normalize_review_result_fields(
            {
                'advantage': ['主体明确', '透视控制稳定'],
                'critique': '1. 对比度偏平',
                'suggestions': ['尝试改变机位', '曝光 +0.7EV'],
            },
            image_type='architecture',
        )

        self.assertEqual(normalized['advantage'], '1. 主体明确\n2. 透视控制稳定')
        self.assertEqual(normalized['critique'], '1. 对比度偏平')
        self.assertEqual(normalized['suggestions'], '1. 尝试改变机位\n2. 曝光 +0.7EV')
        self.assertEqual(normalized['image_type'], 'architecture')

    def test_run_ai_review_locks_scores_from_scoring_pass(self) -> None:
        with patch('app.services.ai.settings.ai_api_key', 'test-key'), patch(
            'app.services.ai.model_name_for_mode',
            side_effect=lambda mode: 'qwen3.5-plus' if mode == 'pro' else 'qwen3.5-flash',
        ), patch(
            'app.services.ai._request_multimodal_json',
            side_effect=[
                AIJSONResponse(
                    parsed={'scores': {'composition': 6, 'lighting': 5, 'color': 5, 'impact': 4, 'technical': 7}},
                    model_name='qwen3.5-flash',
                    usage={'prompt_tokens': 100, 'completion_tokens': 20},
                    latency_ms=120,
                ),
                AIJSONResponse(
                    parsed={
                        'advantage': '1. 主体明确',
                        'critique': '1. 光影层次偏平',
                        'suggestions': '1. 调整机位并增加局部反差',
                    },
                    model_name='qwen3.5-plus',
                    usage={'prompt_tokens': 80, 'completion_tokens': 40},
                    latency_ms=240,
                ),
            ],
        ):
            response = run_ai_review(
                mode='pro',
                image_url='https://example.com/photo.jpg',
                locale='zh',
                exif_data=None,
                image_type='architecture',
            )

        self.assertEqual(response.model_name, 'qwen3.5-plus')
        self.assertEqual(response.result.scores['composition'], 6)
        self.assertEqual(response.result.final_score, 5.4)
        self.assertEqual(response.result.score_version, SCORE_VERSION)
        self.assertEqual(response.result.advantage, '1. 主体明确')
        self.assertEqual(response.input_tokens, 180)
        self.assertEqual(response.output_tokens, 60)


if __name__ == '__main__':
    unittest.main()
