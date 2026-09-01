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
    SCORE_PROMPT_VERSION,
    SCORE_VERSION,
    SCORER_PREPROCESS_VERSION,
    build_cached_canonical_score,
    _normalize_review_result_fields,
    _prompt_for_mode_v3,
    _writing_prompt,
    _validate_suggestions_structure,
    model_name_for_mode,
    run_ai_review,
)


class AIPromptTests(unittest.TestCase):
    def test_prompt_versions_identify_canonical_gpt_scoring(self) -> None:
        self.assertEqual(PROMPT_VERSION, 'photo-review-v6-canonical-gpt-score')
        self.assertEqual(SCORE_PROMPT_VERSION, 'photo-score-v3-canonical-gpt')
        self.assertEqual(SCORE_VERSION, 'score-v3-canonical-gpt')

    def test_chinese_prompt_contains_stricter_scoring_rules(self) -> None:
        prompt = _prompt_for_mode_v3(mode='pro', locale='zh', image_type='street')

        self.assertIn('"schema_version":"1.0"', prompt)
        self.assertIn(
            '"scores":{"composition":0-10,"lighting":0-10,"color":0-10,"impact":0-10,"technical":0-10}',
            prompt,
        )

    def test_model_name_uses_configured_qwen37_flash(self) -> None:
        with patch(
            'app.services.ai.settings.ai_model_name', 'fallback-model'
        ), patch(
            'app.services.ai.settings.flash_model_name', 'qwen3.7-flash'
        ), patch('app.services.ai.settings.pro_model_name', ''):
            self.assertEqual(model_name_for_mode('flash'), 'qwen3.7-flash')

    def test_model_name_accepts_provider_defined_name(self) -> None:
        with patch(
            'app.services.ai.settings.ai_model_name',
            'future-provider-vision-model',
        ), patch(
            'app.services.ai.settings.flash_model_name', ''
        ), patch('app.services.ai.settings.pro_model_name', ''):
            self.assertEqual(model_name_for_mode('flash'), 'future-provider-vision-model')

    def test_model_name_for_mode_rejects_missing_configuration(self) -> None:
        with patch('app.services.ai.settings.ai_model_name', ''), patch(
            'app.services.ai.settings.flash_model_name', ''
        ), patch('app.services.ai.settings.pro_model_name', ''):
            with self.assertRaises(AIReviewError):
                model_name_for_mode('flash')

    def test_normalize_review_result_fields_joins_suggestions_list(self) -> None:
        normalized = _normalize_review_result_fields(
            {
                'advantage': ['\u4e3b\u4f53\u660e\u786e', '\u900f\u89c6\u63a7\u5236\u7a33\u5b9a'],
                'critique': '1. \u5bf9\u6bd4\u5ea6\u504f\u5e73',
                'suggestions': [
                    (
                        '\u89c2\u5bdf\uff1a\u524d\u666f\u5f15\u5bfc\u6027\u4e0d\u8db3\uff1b'
                        '\u539f\u56e0\uff1a\u753b\u9762\u524d\u666f\u5143\u7d20\u652f\u6491\u4e0d\u591f\uff1b'
                        '\u53ef\u6267\u884c\u52a8\u4f5c\uff1a\u5c1d\u8bd5\u6539\u53d8\u673a\u4f4d\u3002'
                    ),
                    (
                        '\u89c2\u5bdf\uff1a\u9ad8\u5149\u8fb9\u7f18\u7565\u786c\uff1b'
                        '\u539f\u56e0\uff1a\u66dd\u5149\u4f59\u91cf\u504f\u5c11\uff1b'
                        '\u53ef\u6267\u884c\u52a8\u4f5c\uff1a\u66dd\u5149 +0.7EV\u3002'
                    ),
                ],
            },
            image_type='architecture',
        )

        self.assertEqual(normalized['advantage'], '1. \u4e3b\u4f53\u660e\u786e\n2. \u900f\u89c6\u63a7\u5236\u7a33\u5b9a')
        self.assertEqual(normalized['critique'], '1. \u5bf9\u6bd4\u5ea6\u504f\u5e73')
        self.assertEqual(
            normalized['suggestions'],
            '1. \u89c2\u5bdf\uff1a\u524d\u666f\u5f15\u5bfc\u6027\u4e0d\u8db3\uff1b\u539f\u56e0\uff1a\u753b\u9762\u524d\u666f\u5143\u7d20\u652f\u6491\u4e0d\u591f\uff1b\u53ef\u6267\u884c\u52a8\u4f5c\uff1a\u5c1d\u8bd5\u6539\u53d8\u673a\u4f4d\u3002\n'
            '2. \u89c2\u5bdf\uff1a\u9ad8\u5149\u8fb9\u7f18\u7565\u786c\uff1b\u539f\u56e0\uff1a\u66dd\u5149\u4f59\u91cf\u504f\u5c11\uff1b\u53ef\u6267\u884c\u52a8\u4f5c\uff1a\u66dd\u5149 +0.7EV\u3002',
        )
        self.assertEqual(normalized['image_type'], 'architecture')

    def test_validate_suggestions_structure_accepts_three_part_point(self) -> None:
        _validate_suggestions_structure(
            '1. \u89c2\u5bdf\uff1a\u524d\u666f\u9634\u5f71\u504f\u6b7b\u9ed1\uff1b'
            '\u539f\u56e0\uff1a\u4e3b\u5149\u6bd4\u8fc7\u5927\u4e14\u6697\u90e8\u7f3a\u5c11\u7ec6\u8282\uff1b'
            '\u53ef\u6267\u884c\u52a8\u4f5c\uff1a\u540e\u671f\u5c06\u9634\u5f71\u63d0\u5347 +25~35\uff0c\u5e76\u5c40\u90e8\u63d0\u4eae\u524d\u666f\u3002'
        )

    def test_validate_suggestions_structure_rejects_missing_reason(self) -> None:
        with self.assertRaisesRegex(ValueError, 'Reason label'):
            _validate_suggestions_structure(
                '1. \u89c2\u5bdf\uff1a\u5f53\u524df/8\u5728\u5f3a\u5149\u4e0b\u66dd\u5149\u7565\u9ad8\uff1b'
                '\u5efa\u8bae\uff1a\u5c1d\u8bd5\u6536\u7f29\u81f3f/11\u6216\u964d\u4f4eEV -0.3\uff0c'
                '\u4ee5\u538b\u6697\u9ad8\u5149\u5e76\u4fdd\u7559\u66f4\u591a\u53f6\u7247\u8d28\u611f\u3002'
            )

    def test_normalize_review_result_fields_allows_unstructured_suggestions_when_disabled(self) -> None:
        normalized = _normalize_review_result_fields(
            {
                'advantage': '1. \u4e3b\u4f53\u660e\u786e',
                'critique': '1. \u5149\u5f71\u5c42\u6b21\u504f\u5e73',
                'suggestions': (
                    '1. \u89c2\u5bdf\uff1a\u5f53\u524df/8\u5728\u5f3a\u5149\u4e0b\u66dd\u5149\u7565\u9ad8\uff1b'
                    '\u5efa\u8bae\uff1a\u5c1d\u8bd5\u6536\u7f29\u81f3f/11\u6216\u964d\u4f4eEV -0.3\uff0c'
                    '\u4ee5\u538b\u6697\u9ad8\u5149\u5e76\u4fdd\u7559\u66f4\u591a\u53f6\u7247\u8d28\u611f\u3002'
                ),
            },
            image_type='architecture',
            enforce_suggestion_structure=False,
        )

        self.assertIn('\u5efa\u8bae\uff1a', normalized['suggestions'])

    def test_writing_prompt_flash_requires_single_target_next_shot_actions(self) -> None:
        prompt = _writing_prompt(
            mode='flash',
            locale='en',
            scores={'composition': 6, 'lighting': 5, 'color': 5, 'impact': 4, 'technical': 7},
            exif_data=None,
            image_type='architecture',
        )

        self.assertIn('Each flash suggestion should focus on one concrete adjustment for the next shot.', prompt)
        self.assertIn('Lead with the action first so it can double as a short next-shoot checklist item.', prompt)

    def test_writing_prompt_uses_english_action_labels_for_english_locale(self) -> None:
        prompt = _writing_prompt(
            mode='flash',
            locale='en',
            scores={'composition': 6, 'lighting': 5, 'color': 5, 'impact': 4, 'technical': 7},
            exif_data=None,
            image_type='architecture',
        )

        self.assertIn('"Observation: ...; Reason: ...; Action: ..."', prompt)
        self.assertNotIn('"观察：...；原因：...；可执行动作：..."', prompt)

    def test_writing_prompt_uses_japanese_action_labels_for_japanese_locale(self) -> None:
        prompt = _writing_prompt(
            mode='flash',
            locale='ja',
            scores={'composition': 6, 'lighting': 5, 'color': 5, 'impact': 4, 'technical': 7},
            exif_data=None,
            image_type='architecture',
        )

        self.assertIn('「観察：...；理由：...；行動：...」', prompt)
        self.assertNotIn('"观察：...；原因：...；可执行动作：..."', prompt)

    def test_qwen_writer_uses_canonical_gpt_scores(self) -> None:
        with patch('app.services.ai.settings.ai_api_key', 'test-qwen-key'), patch(
            'app.services.ai.settings.openai_api_key', 'test-openai-key'
        ), patch('app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'), patch(
            'app.services.ai.model_name_for_mode',
            side_effect=lambda mode: 'qwen3.5-plus' if mode == 'pro' else 'qwen3.5-flash',
        ), patch(
            'app.services.ai._request_openai_multimodal_json',
            return_value=AIJSONResponse(
                parsed={'scores': {'composition': 6, 'lighting': 5, 'color': 5, 'impact': 4, 'technical': 7}},
                model_name='gpt-5.6-luna',
                usage={'input_tokens': 100, 'output_tokens': 20},
                latency_ms=120,
            ),
        ), patch(
            'app.services.ai._request_multimodal_json',
            return_value=AIJSONResponse(
                parsed={
                    'advantage': '1. \u4e3b\u4f53\u660e\u786e',
                    'critique': '1. \u5149\u5f71\u5c42\u6b21\u504f\u5e73',
                    'suggestions': (
                        '1. \u89c2\u5bdf\uff1a\u524d\u666f\u5c42\u6b21\u7565\u8584\uff1b'
                        '\u539f\u56e0\uff1a\u673a\u4f4d\u7a0d\u9ad8\u5bfc\u81f4\u8fd1\u666f\u652f\u6491\u4e0d\u8db3\uff1b'
                        '\u53ef\u6267\u884c\u52a8\u4f5c\uff1a\u964d\u4f4e\u673a\u4f4d\u5e76\u589e\u52a0\u5c40\u90e8\u53cd\u5dee\u3002'
                    ),
                },
                model_name='qwen3.5-plus',
                usage={'prompt_tokens': 80, 'completion_tokens': 40},
                latency_ms=240,
            ),
        ) as writer_mock:
            response = run_ai_review(
                mode='pro',
                image_url='https://example.com/photo.jpg',
                locale='zh',
                exif_data=None,
                image_type='architecture',
            )

        self.assertEqual(response.model_name, 'qwen3.5-plus')
        self.assertEqual(response.scorer_model_name, 'gpt-5.6-luna')
        self.assertEqual(response.scorer_model_version, 'gpt-5.6-luna')
        self.assertEqual(response.writer_model_name, 'qwen3.5-plus')
        self.assertEqual(response.result.scores['composition'], 6)
        self.assertEqual(response.result.final_score, 5.4)
        self.assertEqual(response.result.score_version, SCORE_VERSION)
        self.assertEqual(response.result.advantage, '1. \u4e3b\u4f53\u660e\u786e')
        self.assertEqual(response.input_tokens, 180)
        self.assertEqual(response.output_tokens, 60)
        self.assertFalse(response.score_cache_hit)
        self.assertEqual(response.result.scorer_preprocess_version, SCORER_PREPROCESS_VERSION)
        self.assertEqual(writer_mock.call_count, 1)
        self.assertIn('openai:gpt-5.6-luna:standard', response.cost_rate_version or '')
        self.assertIn('alibaba-cn-beijing:qwen3.5-plus', response.cost_rate_version or '')

    def test_cached_score_is_shared_by_qwen_writer_without_another_score_call(self) -> None:
        cached_score = build_cached_canonical_score(
            {'composition': 7, 'lighting': 6, 'color': 6, 'impact': 5, 'technical': 6},
            scorer_model_name='gpt-5.6-luna',
            scorer_model_version='gpt-5.6-luna',
        )
        writer_response = AIJSONResponse(
            parsed={
                'advantage': '1. \u4e3b\u4f53\u660e\u786e',
                'critique': '1. \u5149\u5f71\u5c42\u6b21\u504f\u5e73',
                'suggestions': (
                    '1. \u89c2\u5bdf\uff1a\u524d\u666f\u5c42\u6b21\u7565\u8584\uff1b'
                    '\u539f\u56e0\uff1a\u673a\u4f4d\u7a0d\u9ad8；'
                    '\u53ef\u6267\u884c\u52a8\u4f5c\uff1a\u964d\u4f4e\u673a\u4f4d\u3002'
                ),
            },
            model_name='qwen3.5-plus',
            usage={'prompt_tokens': 80, 'completion_tokens': 40},
            latency_ms=240,
        )

        with patch('app.services.ai.settings.ai_api_key', 'test-qwen-key'), patch(
            'app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'
        ), patch('app.services.ai.model_name_for_mode', return_value='qwen3.5-plus'), patch(
            'app.services.ai._request_openai_multimodal_json'
        ) as scorer_mock, patch(
            'app.services.ai._request_multimodal_json', return_value=writer_response
        ):
            response = run_ai_review(
                mode='pro',
                image_url='https://example.com/photo.jpg',
                locale='zh',
                image_type='architecture',
                canonical_score=cached_score,
            )

        scorer_mock.assert_not_called()
        self.assertTrue(response.score_cache_hit)
        self.assertEqual(response.result.final_score, 6.0)
        self.assertEqual(response.input_tokens, 80)
        self.assertNotIn('openai:gpt-5.6-luna', response.cost_rate_version or '')


if __name__ == '__main__':
    unittest.main()
