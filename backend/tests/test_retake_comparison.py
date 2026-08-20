from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from app.core.http_client import PooledHTTPResponse
from app.services.ai import AIReviewError
from app.services.retake_comparison import DIMENSION_KEYS, RETAKE_RESPONSE_SCHEMA, run_retake_comparison


def _dimension(before: int, after: int, evidence: str, gap: str) -> dict:
    return {
        'before_score': before,
        'after_score': after,
        'evidence': [evidence],
        'remaining_gap': gap,
    }


def _response_body(*, output_text: str | None = None) -> dict:
    comparison = {
        'is_comparable': True,
        'comparison_confidence': 'high',
        'comparison_caveat': '',
        'summary': 'The retake has a clearer subject and stronger visual hierarchy.',
        'dimensions': {
            'composition': _dimension(4, 8, 'The subject is no longer centered without intent.', 'Refine edge spacing.'),
            'lighting': _dimension(5, 6, 'Face shadows are softer.', 'Protect highlight detail.'),
            'color': _dimension(6, 6, 'White balance is consistent.', 'Reduce the green cast.'),
            'impact': _dimension(5, 7, 'The gesture reads more clearly.', 'Wait for a stronger expression.'),
            'technical': _dimension(7, 6, 'Motion blur is visible in the retake.', 'Raise shutter speed.'),
        },
        # Deliberately inconsistent: the server must derive this from score deltas.
        'strongest_improvement': 'technical',
        'next_actions': [
            {
                'priority': 1,
                'dimension': 'technical',
                'action': 'Use a shutter speed of at least 1/250s.',
                'success_check': 'Eyes and fingertips are sharp at 100% view.',
            }
        ],
        'visual_reference_prompt': 'A realistic portrait with clean edge spacing and soft directional light.',
    }
    text = output_text if output_text is not None else json.dumps(comparison)
    return {
        'id': 'resp_retake_123',
        'model': 'gpt-5.6-luna',
        'usage': {'input_tokens': 321, 'output_tokens': 210},
        'output': [
            {
                'type': 'message',
                'content': [{'type': 'output_text', 'text': text}],
            }
        ],
    }


class RetakeComparisonTests(unittest.TestCase):
    def _run(self):
        return run_retake_comparison(
            original_image_url='https://images.example/original.jpg',
            retake_image_url='https://images.example/retake.jpg',
            original_review_id='rev_original',
            original_photo_id='pho_original',
            retake_photo_id='pho_retake',
            locale='en',
            image_type='portrait',
        )

    def test_posts_two_ordered_images_with_strict_structured_output(self) -> None:
        response = PooledHTTPResponse(
            status=200,
            data=json.dumps(_response_body()).encode('utf-8'),
            headers={},
            reason='OK',
        )
        with patch('app.services.retake_comparison.settings') as mocked_settings:
            mocked_settings.openai_api_key = 'test-openai-key'
            mocked_settings.retake_analysis_model = 'gpt-5.6-luna'
            mocked_settings.retake_analysis_reasoning_effort = 'xhigh'
            mocked_settings.retake_analysis_api_url = 'https://api.openai.com/v1/responses'
            mocked_settings.retake_analysis_timeout_seconds = 180
            with patch('app.services.retake_comparison.pooled_request', return_value=response) as request:
                ai_response = self._run()

        payload = json.loads(request.call_args.kwargs['body'])
        content = payload['input'][0]['content']
        images = [item for item in content if item['type'] == 'input_image']
        self.assertEqual(payload['model'], 'gpt-5.6-luna')
        self.assertEqual(payload['reasoning'], {'effort': 'xhigh'})
        self.assertFalse(payload['store'])
        self.assertEqual(payload['text']['format']['type'], 'json_schema')
        self.assertTrue(payload['text']['format']['strict'])
        self.assertEqual([item['image_url'] for item in images], [
            'https://images.example/original.jpg',
            'https://images.example/retake.jpg',
        ])
        self.assertTrue(all(item['detail'] == 'high' for item in images))

        comparison = ai_response.result.comparison
        self.assertIsNotNone(comparison)
        assert comparison is not None
        self.assertEqual(comparison.dimensions['composition'].delta, 4)
        self.assertEqual(comparison.dimensions['technical'].delta, -1)
        self.assertEqual(comparison.strongest_improvement, 'composition')
        self.assertEqual(comparison.overall_before, 5.4)
        self.assertEqual(comparison.overall_after, 6.6)
        self.assertEqual(comparison.overall_delta, 1.2)
        self.assertEqual(ai_response.input_tokens, 321)
        self.assertEqual(ai_response.output_tokens, 210)

    def test_requires_openai_api_key(self) -> None:
        with patch('app.services.retake_comparison.settings') as mocked_settings:
            mocked_settings.openai_api_key = ''
            with self.assertRaisesRegex(AIReviewError, 'OPENAI_API_KEY'):
                self._run()

    def test_builds_responses_endpoint_from_openai_base_url(self) -> None:
        response = PooledHTTPResponse(
            status=200,
            data=json.dumps(_response_body()).encode('utf-8'),
            headers={},
            reason='OK',
        )
        with patch('app.services.retake_comparison.settings') as mocked_settings:
            mocked_settings.openai_api_key = 'test-openai-key'
            mocked_settings.openai_api_base_url = 'https://gateway.example/v1/'
            mocked_settings.retake_analysis_api_url = ''
            mocked_settings.retake_analysis_model = 'gpt-5.6-luna'
            mocked_settings.retake_analysis_reasoning_effort = 'xhigh'
            mocked_settings.retake_analysis_timeout_seconds = 180
            with patch('app.services.retake_comparison.pooled_request', return_value=response) as request:
                self._run()

        self.assertEqual(request.call_args.args[1], 'https://gateway.example/v1/responses')

    def test_rejects_invalid_structured_output_json(self) -> None:
        response = PooledHTTPResponse(
            status=200,
            data=json.dumps(_response_body(output_text='{not-json')).encode('utf-8'),
            headers={},
            reason='OK',
        )
        with patch('app.services.retake_comparison.settings') as mocked_settings:
            mocked_settings.openai_api_key = 'test-openai-key'
            mocked_settings.retake_analysis_model = 'gpt-5.6-luna'
            mocked_settings.retake_analysis_reasoning_effort = 'xhigh'
            mocked_settings.retake_analysis_api_url = 'https://api.openai.com/v1/responses'
            mocked_settings.retake_analysis_timeout_seconds = 180
            with patch('app.services.retake_comparison.pooled_request', return_value=response):
                with self.assertRaisesRegex(AIReviewError, 'not valid JSON'):
                    self._run()

    def test_rejects_incomplete_response(self) -> None:
        body = {
            'id': 'resp_incomplete',
            'model': 'gpt-5.6-luna',
            'status': 'incomplete',
            'incomplete_details': {'reason': 'max_output_tokens'},
            'output': [],
        }
        response = PooledHTTPResponse(status=200, data=json.dumps(body).encode('utf-8'), headers={}, reason='OK')
        with patch('app.services.retake_comparison.settings') as mocked_settings:
            mocked_settings.openai_api_key = 'test-openai-key'
            mocked_settings.retake_analysis_model = 'gpt-5.6-luna'
            mocked_settings.retake_analysis_reasoning_effort = 'xhigh'
            mocked_settings.retake_analysis_api_url = 'https://api.openai.com/v1/responses'
            mocked_settings.retake_analysis_timeout_seconds = 180
            with patch('app.services.retake_comparison.pooled_request', return_value=response):
                with self.assertRaisesRegex(AIReviewError, 'incomplete: max_output_tokens'):
                    self._run()

    def test_rejects_model_refusal(self) -> None:
        body = {
            'id': 'resp_refused',
            'model': 'gpt-5.6-luna',
            'output': [{
                'type': 'message',
                'content': [{'type': 'refusal', 'refusal': 'Unable to analyze this image.'}],
            }],
        }
        response = PooledHTTPResponse(status=200, data=json.dumps(body).encode('utf-8'), headers={}, reason='OK')
        with patch('app.services.retake_comparison.settings') as mocked_settings:
            mocked_settings.openai_api_key = 'test-openai-key'
            mocked_settings.retake_analysis_model = 'gpt-5.6-luna'
            mocked_settings.retake_analysis_reasoning_effort = 'xhigh'
            mocked_settings.retake_analysis_api_url = 'https://api.openai.com/v1/responses'
            mocked_settings.retake_analysis_timeout_seconds = 180
            with patch('app.services.retake_comparison.pooled_request', return_value=response):
                with self.assertRaisesRegex(AIReviewError, 'refused'):
                    self._run()

    def test_schema_requires_exactly_the_five_scoring_dimensions(self) -> None:
        dimensions = RETAKE_RESPONSE_SCHEMA['properties']['dimensions']

        self.assertFalse(dimensions['additionalProperties'])
        self.assertEqual(set(dimensions['properties']), set(DIMENSION_KEYS))
        self.assertEqual(set(dimensions['required']), set(DIMENSION_KEYS))

    def test_rejects_missing_dimension_in_structured_output(self) -> None:
        body = _response_body()
        content = body['output'][0]['content'][0]
        parsed = json.loads(content['text'])
        parsed['dimensions'].pop('technical')
        content['text'] = json.dumps(parsed)
        response = PooledHTTPResponse(status=200, data=json.dumps(body).encode('utf-8'), headers={}, reason='OK')
        with patch('app.services.retake_comparison.settings') as mocked_settings:
            mocked_settings.openai_api_key = 'test-openai-key'
            mocked_settings.retake_analysis_model = 'gpt-5.6-luna'
            mocked_settings.retake_analysis_reasoning_effort = 'xhigh'
            mocked_settings.retake_analysis_api_url = 'https://api.openai.com/v1/responses'
            mocked_settings.retake_analysis_timeout_seconds = 180
            with patch('app.services.retake_comparison.pooled_request', return_value=response):
                with self.assertRaisesRegex(AIReviewError, 'failed validation'):
                    self._run()


if __name__ == '__main__':
    unittest.main()
