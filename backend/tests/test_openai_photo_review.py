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
TESTS_ROOT = Path(__file__).resolve().parent
if str(TESTS_ROOT) not in sys.path:
    sys.path.insert(0, str(TESTS_ROOT))

from app.core.http_client import PooledHTTPRequestError, PooledHTTPResponse, PooledHTTPStatusError
from app.services.ai import AIReviewError, build_cached_canonical_score, observe_ai_provider_calls, run_ai_review
from scoring_fixtures import LOW_SCORES, model_score_payload, score_evidence_fixture


def _response(payload: dict, *, model: str = 'gpt-5.6-luna', input_tokens: int = 100, output_tokens: int = 20):
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


def _cached_score():
    with patch('app.services.ai.settings.openai_score_model', 'gpt-6-luna'):
        return build_cached_canonical_score(
            LOW_SCORES,
            scorer_model_name='gpt-6-luna',
            scorer_model_version='gpt-6-luna',
            score_evidence=score_evidence_fixture(LOW_SCORES),
            scorer_reasoning_effort='low',
        )


def _cached_sol_score():
    with patch('app.services.ai.settings.openai_score_model', 'gpt-6-sol'):
        return build_cached_canonical_score(
            LOW_SCORES,
            scorer_model_name='gpt-6-sol',
            scorer_model_version='gpt-6-sol',
            score_evidence=score_evidence_fixture(LOW_SCORES),
            scorer_reasoning_effort='low',
        )


class OpenAIPhotoReviewTests(unittest.TestCase):
    def test_gpt_review_uses_responses_image_input_and_locks_scores(self) -> None:
        scoring = _response(
            model_score_payload(LOW_SCORES),
            model='gpt-5.6-luna-2026-08-01',
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
            model='gpt-5.6-luna-2026-08-01',
            input_tokens=180,
            output_tokens=70,
        )

        with patch('app.services.ai.settings.openai_api_key', 'test-key'), patch(
            'app.services.ai.settings.openai_api_base_url', 'https://api.openai.com/v1'
        ), patch('app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'), patch(
            'app.services.ai.settings.openai_score_reasoning_effort', 'high'
        ), patch('app.services.ai.settings.openai_score_timeout_seconds', 120
        ), patch('app.services.ai.settings.openai_review_model', 'gpt-5.6-luna'), patch(
            'app.services.ai.settings.openai_review_reasoning_effort', 'xhigh'
        ), patch('app.services.ai.settings.openai_review_timeout_seconds', 180), patch(
            'app.services.ai.pooled_request', side_effect=[scoring, writing]
        ) as request_mock:
            response = run_ai_review(
                mode='flash',
                image_url='data:image/jpeg;base64,abc',
                locale='en',
                image_type='portrait',
                review_model='gpt-5.6-luna',
            )

        self.assertEqual(response.model_name, 'gpt-5.6-luna-2026-08-01')
        self.assertEqual(response.scorer_model_name, 'gpt-5.6-luna')
        self.assertEqual(response.scorer_model_version, 'gpt-5.6-luna-2026-08-01')
        self.assertEqual(response.result.scorer_reasoning_effort, 'high')
        self.assertEqual(response.writer_model_name, 'gpt-5.6-luna')
        self.assertEqual(response.writer_model_version, 'gpt-5.6-luna-2026-08-01')
        self.assertEqual(response.result.writer_reasoning_effort, 'xhigh')
        self.assertEqual(response.result.scores['composition'], 7)
        self.assertEqual(response.result.score_evidence['dimensions']['composition']['strength'], 'The frame gives the main subject a readable position.')
        self.assertEqual(response.result.final_score, 6.0)
        self.assertEqual(response.input_tokens, 300)
        self.assertEqual(response.output_tokens, 100)
        self.assertEqual(response.cost_usd, 0.00018)
        self.assertIn('openai:gpt-5.6-luna:standard', response.cost_rate_version or '')
        self.assertEqual(request_mock.call_count, 2)

        first_url = request_mock.call_args_list[0].args[1]
        first_payload = json.loads(request_mock.call_args_list[0].kwargs['body'])
        second_payload = json.loads(request_mock.call_args_list[1].kwargs['body'])
        self.assertEqual(first_url, 'https://api.openai.com/v1/responses')
        self.assertEqual(first_payload['model'], 'gpt-5.6-luna')
        self.assertEqual(first_payload['reasoning'], {'effort': 'high'})
        self.assertFalse(first_payload['store'])
        self.assertEqual(first_payload['input'][0]['content'][1]['type'], 'input_image')
        self.assertEqual(first_payload['input'][0]['content'][1]['detail'], 'high')
        self.assertEqual(first_payload['text']['format']['type'], 'json_schema')
        self.assertTrue(first_payload['text']['format']['strict'])
        self.assertEqual(second_payload['text']['format']['name'], 'picspeak_photo_review')
        self.assertEqual(second_payload['reasoning'], {'effort': 'xhigh'})

    def test_gpt_review_requires_openai_key(self) -> None:
        with patch('app.services.ai.settings.openai_api_key', ''):
            with self.assertRaisesRegex(AIReviewError, 'OPENAI_API_KEY'):
                run_ai_review(
                    mode='flash',
                    image_url='https://example.com/photo.jpg',
                    review_model='gpt-5.6-luna',
                )

    def test_gpt_writer_reuses_cached_canonical_score(self) -> None:
        cached_score = _cached_score()
        writing = _response(
            {
                'advantage': '1. Clear subject separation.',
                'critique': '1. The light is visually flat.',
                'suggestions': (
                    '1. Observation: The face and background have similar brightness; '
                    'Reason: Weak tonal separation reduces depth; '
                    'Action: Move the subject closer to the side light.'
                ),
            },
            input_tokens=180,
            output_tokens=70,
        )

        with patch('app.services.ai.settings.openai_api_key', 'test-key'), patch(
            'app.services.ai.settings.openai_score_model', 'gpt-6-luna'
        ), patch('app.services.ai.settings.openai_review_model', 'gpt-5.6-luna'), patch(
            'app.services.ai.pooled_request', return_value=writing
        ) as request_mock:
            response = run_ai_review(
                mode='flash',
                image_url='data:image/jpeg;base64,abc',
                locale='en',
                image_type='portrait',
                review_model='gpt-5.6-luna',
                canonical_score=cached_score,
            )

        self.assertEqual(request_mock.call_count, 1)
        self.assertTrue(response.score_cache_hit)
        self.assertEqual(response.result.final_score, 6.0)
        self.assertEqual(response.input_tokens, 180)

    def test_malformed_billed_writer_response_is_observed_before_validation_failure(self) -> None:
        cached_score = _cached_score()
        malformed = _response(
            {'advantage': '', 'critique': '', 'suggestions': ''},
            model='gpt-5.6-luna-2026-08-01',
            input_tokens=77,
            output_tokens=9,
        )
        observed = []

        with patch('app.services.ai.settings.openai_api_key', 'test-key'), patch(
            'app.services.ai.settings.openai_score_model', 'gpt-6-luna'
        ), patch(
            'app.services.ai.settings.openai_review_model', 'gpt-5.6-luna'
        ), patch('app.services.ai.pooled_request', return_value=malformed), observe_ai_provider_calls(observed.append):
            with self.assertRaises(AIReviewError) as raised:
                run_ai_review(
                    mode='flash',
                    image_url='https://example.com/photo.jpg',
                    locale='en',
                    canonical_score=cached_score,
                    review_model='gpt-5.6-luna',
                )

        self.assertEqual(raised.exception.stage, 'writing')
        self.assertEqual(len(observed), 1)
        self.assertEqual(observed[0].stage, 'writer')
        self.assertEqual(observed[0].outcome, 'unknown')
        self.assertEqual(observed[0].input_tokens, 77)
        self.assertEqual(observed[0].output_tokens, 9)
        self.assertIn('openai:gpt-5.6-luna', observed[0].cost_rate_version or '')

    def test_network_writer_failure_is_observed_without_usage_or_cost(self) -> None:
        cached_score = _cached_score()
        observed = []

        with patch('app.services.ai.settings.openai_api_key', 'test-key'), patch(
            'app.services.ai.settings.openai_score_model', 'gpt-6-luna'
        ), patch(
            'app.services.ai.settings.openai_review_model', 'gpt-5.6-luna'
        ), patch(
            'app.services.ai.pooled_request',
            side_effect=PooledHTTPRequestError('connection reset'),
        ), observe_ai_provider_calls(observed.append):
            with self.assertRaises(AIReviewError) as raised:
                run_ai_review(
                    mode='flash',
                    image_url='https://example.com/photo.jpg',
                    locale='en',
                    canonical_score=cached_score,
                    review_model='gpt-5.6-luna',
                )

        self.assertEqual(raised.exception.stage, 'writing')
        self.assertEqual(len(observed), 1)
        self.assertEqual(observed[0].stage, 'writer')
        self.assertEqual(observed[0].outcome, 'failed')
        self.assertIsNone(observed[0].input_tokens)
        self.assertIsNone(observed[0].output_tokens)
        self.assertIsNone(observed[0].cost_usd)

    def test_openai_http_error_masks_signed_image_url_echo(self) -> None:
        cached_score = _cached_score()
        body = {
            'error': {
                'message': (
                    'provider echoed https://storage.example.com/photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256'
                    '&X-Amz-Credential=credential-secret'
                    '&X-Amz-Signature=signature-secret'
                    '&photo_token=photo-secret'
                ),
                'type': 'invalid_request',
            }
        }
        status_error = PooledHTTPStatusError(
            PooledHTTPResponse(status=400, data=json.dumps(body).encode('utf-8'), headers={}, reason='Bad Request')
        )

        with patch('app.services.ai.settings.openai_api_key', 'test-key'), patch(
            'app.services.ai.settings.openai_score_model', 'gpt-6-luna'
        ), patch(
            'app.services.ai.settings.openai_review_model', 'gpt-5.6-luna'
        ), patch('app.services.ai.pooled_request', side_effect=status_error):
            with self.assertRaises(AIReviewError) as raised:
                run_ai_review(
                    mode='flash',
                    image_url='https://storage.example.com/local.jpg?X-Amz-Signature=local-secret',
                    locale='en',
                    canonical_score=cached_score,
                    review_model='gpt-5.6-luna',
                )

        message = str(raised.exception)
        self.assertIn('OpenAI review API HTTP 400', message)
        self.assertIn('invalid_request', message)
        for secret in ('credential-secret', 'signature-secret', 'photo-secret', 'local-secret'):
            self.assertNotIn(secret, message)

    def test_unknown_review_model_is_rejected(self) -> None:
        with self.assertRaisesRegex(AIReviewError, 'Unsupported review model'):
            run_ai_review(
                mode='flash',
                image_url='https://example.com/photo.jpg',
                review_model='unknown',
            )

    def test_gpt6_sol_selector_routes_to_configured_sol_responses_payload(self) -> None:
        cached_score = _cached_sol_score()
        writing = _response(
            {
                'advantage': '1. Clear subject separation.',
                'critique': '1. The light is visually flat.',
                'suggestions': (
                    '1. Observation: The face and background have similar brightness; '
                    'Reason: Weak tonal separation reduces depth; '
                    'Action: Move the subject closer to the side light.'
                ),
            },
            model='gpt-6-sol-2026-10-09',
            input_tokens=180,
            output_tokens=70,
        )

        with patch('app.services.ai.settings.openai_api_key', 'test-key'), patch(
            'app.services.ai.settings.openai_score_model', 'gpt-6-sol'
        ), patch('app.services.ai.settings.openai_review_model', 'gpt-6-sol'), patch(
            'app.services.ai.settings.openai_review_reasoning_effort', 'high'
        ), patch('app.services.ai.pooled_request', return_value=writing) as request_mock:
            response = run_ai_review(
                mode='flash',
                image_url='data:image/jpeg;base64,abc',
                locale='en',
                image_type='portrait',
                review_model='gpt-6-sol',
                canonical_score=cached_score,
            )

        payload = json.loads(request_mock.call_args.kwargs['body'])
        self.assertEqual(payload['model'], 'gpt-6-sol')
        self.assertEqual(payload['reasoning'], {'effort': 'high'})
        self.assertEqual(response.writer_model_name, 'gpt-6-sol')
        self.assertEqual(response.writer_model_version, 'gpt-6-sol-2026-10-09')
        self.assertIn('openai:gpt-6-sol:standard', response.writer_cost_rate_version or '')

    def test_mode_profiles_route_flash_and_pro_to_distinct_openai_payloads(self) -> None:
        scoring = _response(
            model_score_payload(LOW_SCORES),
            model='gpt-6.1-sol-2026-10-09',
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
                    'Action: Move the subject closer to side light.'
                ),
            },
            model='gpt-6.1-sol-2026-10-09',
            input_tokens=180,
            output_tokens=70,
        )

        with patch('app.services.ai.settings.openai_api_key', 'test-key'), patch(
            'app.services.ai.settings.openai_pro_model', 'gpt-6.1-sol'
        ), patch('app.services.ai.settings.openai_pro_reasoning_effort', 'high'), patch(
            'app.services.ai.pooled_request', side_effect=[scoring, writing]
        ) as request_mock:
            response = run_ai_review(
                mode='pro',
                image_url='data:image/jpeg;base64,abc',
                locale='en',
                image_type='portrait',
                review_model='gpt-6-sol',
            )

        score_payload = json.loads(request_mock.call_args_list[0].kwargs['body'])
        writer_payload = json.loads(request_mock.call_args_list[1].kwargs['body'])
        self.assertEqual(score_payload['model'], 'gpt-6.1-sol')
        self.assertEqual(score_payload['reasoning'], {'effort': 'high'})
        self.assertEqual(writer_payload['model'], 'gpt-6.1-sol')
        self.assertEqual(writer_payload['reasoning'], {'effort': 'high'})
        self.assertEqual(response.scorer_model_name, 'gpt-6.1-sol')
        self.assertEqual(response.writer_model_name, 'gpt-6.1-sol')
        self.assertEqual(response.result.scorer_reasoning_effort, 'high')
        self.assertEqual(response.result.writer_reasoning_effort, 'high')


if __name__ == '__main__':
    unittest.main()
