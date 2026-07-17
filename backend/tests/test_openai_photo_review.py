from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.ai import AIReviewError, run_ai_review


def _response(payload: dict, *, model: str = 'gpt-5.5', input_tokens: int = 100, output_tokens: int = 20):
    body = {
        'id': 'resp_test',
        'status': 'completed',
        'model': model,
        'output': [
            {
                'type': 'message',
                'content': [{'type': 'output_text', 'text': json.dumps(payload)}],
            }
        ],
        'usage': {'input_tokens': input_tokens, 'output_tokens': output_tokens},
    }
    return SimpleNamespace(data=json.dumps(body).encode('utf-8'))


class OpenAIPhotoReviewTests(unittest.TestCase):
    def test_gpt_review_uses_responses_image_input_and_locks_scores(self) -> None:
        scoring = _response(
            {'scores': {'composition': 7, 'lighting': 6, 'color': 6, 'impact': 5, 'technical': 6}},
            input_tokens=120,
            output_tokens=30,
        )
        writing = _response(
            {
                'advantage': '1. Clear subject separation.',
                'critique': '1. The light is visually flat.',
                'suggestions': (
                    '1. Observation: The face and background have similar brightness; '
                    'Reason: Weak tonal separation reduces depth; '
                    'Action: Move the subject closer to the side light and expose for the face.'
                ),
            },
            input_tokens=180,
            output_tokens=70,
        )

        with patch('app.services.ai.settings.openai_api_key', 'test-key'), patch(
            'app.services.ai.settings.openai_api_base_url', 'https://api.openai.com/v1'
        ), patch('app.services.ai.settings.openai_review_model', 'gpt-5.5'), patch(
            'app.services.ai.settings.openai_review_reasoning_effort', 'medium'
        ), patch('app.services.ai.settings.openai_review_timeout_seconds', 180), patch(
            'app.services.ai.pooled_request', side_effect=[scoring, writing]
        ) as request_mock:
            response = run_ai_review(
                mode='flash',
                image_url='data:image/jpeg;base64,abc',
                locale='en',
                image_type='portrait',
                review_model='gpt-5.5',
            )

        self.assertEqual(response.model_name, 'gpt-5.5')
        self.assertEqual(response.result.scores['composition'], 7)
        self.assertEqual(response.result.final_score, 6.0)
        self.assertEqual(response.input_tokens, 300)
        self.assertEqual(response.output_tokens, 100)
        self.assertEqual(request_mock.call_count, 2)

        first_url = request_mock.call_args_list[0].args[1]
        first_payload = json.loads(request_mock.call_args_list[0].kwargs['body'])
        second_payload = json.loads(request_mock.call_args_list[1].kwargs['body'])
        self.assertEqual(first_url, 'https://api.openai.com/v1/responses')
        self.assertEqual(first_payload['model'], 'gpt-5.5')
        self.assertFalse(first_payload['store'])
        self.assertEqual(first_payload['reasoning'], {'effort': 'medium'})
        self.assertEqual(first_payload['input'][0]['content'][1]['type'], 'input_image')
        self.assertEqual(first_payload['input'][0]['content'][1]['detail'], 'high')
        self.assertEqual(first_payload['text']['format']['type'], 'json_schema')
        self.assertTrue(first_payload['text']['format']['strict'])
        self.assertEqual(second_payload['text']['format']['name'], 'picspeak_photo_review')

    def test_gpt_review_requires_openai_key(self) -> None:
        with patch('app.services.ai.settings.openai_api_key', ''):
            with self.assertRaisesRegex(AIReviewError, 'OPENAI_API_KEY'):
                run_ai_review(
                    mode='flash',
                    image_url='https://example.com/photo.jpg',
                    review_model='gpt-5.5',
                )

    def test_unknown_review_model_is_rejected(self) -> None:
        with self.assertRaisesRegex(AIReviewError, 'Unsupported review model'):
            run_ai_review(
                mode='flash',
                image_url='https://example.com/photo.jpg',
                review_model='unknown',
            )


if __name__ == '__main__':
    unittest.main()
