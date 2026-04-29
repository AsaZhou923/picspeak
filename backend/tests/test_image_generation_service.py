from __future__ import annotations

import base64
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.image_generation import OpenAIImageGenerationClient  # noqa: E402


class ImageGenerationServiceTests(unittest.TestCase):
    def test_openai_client_parses_mocked_base64_image_response(self) -> None:
        image_bytes = b'fake-webp'
        response_payload = {
            'data': [
                {
                    'b64_json': base64.b64encode(image_bytes).decode('ascii'),
                    'revised_prompt': 'revised prompt',
                }
            ],
            'usage': {
                'input_tokens': 11,
                'input_image_tokens': 0,
                'output_image_tokens': 222,
            },
        }
        client = OpenAIImageGenerationClient(api_key='test-key', api_base_url='https://api.openai.test/v1')

        with patch.object(client, '_post_json', return_value=response_payload):
            result = client.generate(
                prompt='prompt',
                quality='low',
                size='1024x1024',
                output_format='webp',
            )

        self.assertEqual(result.image_bytes, image_bytes)
        self.assertEqual(result.content_type, 'image/webp')
        self.assertEqual(result.revised_prompt, 'revised prompt')
        self.assertEqual(result.input_text_tokens, 11)
        self.assertEqual(result.output_image_tokens, 222)

    def test_openai_client_uses_generation_endpoint_url_without_double_suffix(self) -> None:
        client = OpenAIImageGenerationClient(
            api_key='test-key',
            api_url='https://api.apimart.ai/v1/images/generations',
        )

        self.assertEqual(client.api_url, 'https://api.apimart.ai/v1/images/generations')

    def test_openai_client_accepts_legacy_base_url_constructor(self) -> None:
        client = OpenAIImageGenerationClient(api_key='test-key', api_base_url='https://api.openai.test/v1')

        self.assertEqual(client.api_url, 'https://api.openai.test/v1/images/generations')

    def test_openai_client_posts_reference_edits_to_edits_endpoint(self) -> None:
        image_bytes = b'edited-webp'
        response_payload = {
            'data': [{'b64_json': base64.b64encode(image_bytes).decode('ascii')}],
            'usage': {'input_tokens': 12, 'input_image_tokens': 34, 'output_image_tokens': 56},
        }
        client = OpenAIImageGenerationClient(api_key='test-key', api_base_url='https://api.openai.test/v1')

        with patch.object(client, '_post_multipart', return_value=response_payload) as post_multipart:
            result = client.edit(
                prompt='make a cleaner lighting reference',
                quality='low',
                size='1024x1024',
                image_bytes=b'original',
                image_content_type='image/png',
                image_filename='reference.png',
            )

        self.assertEqual(result.image_bytes, image_bytes)
        self.assertEqual(result.input_image_tokens, 34)
        self.assertEqual(post_multipart.call_args.args[0], 'https://api.openai.test/v1/images/edits')
        fields = post_multipart.call_args.kwargs['fields']
        self.assertEqual(fields['prompt'], 'make a cleaner lighting reference')
        self.assertEqual(fields['response_format'], 'b64_json')
        files = post_multipart.call_args.kwargs['files']
        self.assertEqual(files['image'][0], 'reference.png')

    def test_apimart_endpoint_uses_official_model_ratio_size_and_async_result(self) -> None:
        client = OpenAIImageGenerationClient(
            api_key='test-key',
            api_url='https://api.apimart.ai/v1/images/generations',
            model_name='gpt-image-2',
        )
        submitted_payload = {'code': 200, 'data': [{'status': 'submitted', 'task_id': 'task_123'}]}
        completed_payload = {
            'code': 200,
            'data': {
                'id': 'task_123',
                'status': 'completed',
                'progress': 100,
                'result': {'images': [{'url': ['https://upload.example.com/generated.png']}]},
            },
        }

        with (
            patch.object(client, '_post_json', return_value=submitted_payload) as post_json,
            patch.object(client, '_get_json', return_value=completed_payload),
            patch.object(client, '_download_image', return_value=(b'png-bytes', 'image/png')),
        ):
            result = client.generate(
                prompt='prompt',
                quality='high',
                size='1024x1536',
                output_format='webp',
            )

        self.assertEqual(client.model_name, 'gpt-image-2-official')
        self.assertEqual(result.image_bytes, b'png-bytes')
        self.assertEqual(result.content_type, 'image/png')
        request_payload = post_json.call_args.args[0]
        self.assertEqual(request_payload['model'], 'gpt-image-2-official')
        self.assertEqual(request_payload['size'], '9:16')
        self.assertEqual(request_payload['resolution'], '4k')
        self.assertNotIn('response_format', request_payload)

    def test_resolution_mode_can_be_forced_for_custom_proxy_url(self) -> None:
        client = OpenAIImageGenerationClient(
            api_key='test-key',
            api_url='http://45.76.203.46/v1/images/generations',
            api_mode='resolution',
            model_name='gpt-image-2',
        )
        submitted_payload = {'code': 200, 'data': [{'status': 'submitted', 'task_id': 'task_proxy'}]}
        completed_payload = {
            'code': 200,
            'data': {
                'status': 'completed',
                'result': {'images': [{'url': ['https://upload.example.com/proxy-generated.png']}]},
            },
        }

        with (
            patch.object(client, '_post_json', return_value=submitted_payload) as post_json,
            patch.object(client, '_get_json', return_value=completed_payload),
            patch.object(client, '_download_image', return_value=(b'png-bytes', 'image/png')),
        ):
            client.generate(prompt='prompt', quality='high', size='1536x1024', output_format='webp')

        self.assertEqual(client.model_name, 'gpt-image-2')
        request_payload = post_json.call_args.args[0]
        self.assertEqual(request_payload['size'], '1536x1024')
        self.assertEqual(request_payload['resolution'], '4k')
        self.assertNotIn('response_format', request_payload)

    def test_apimart_endpoint_differentiates_resolution_by_quality(self) -> None:
        client = OpenAIImageGenerationClient(
            api_key='test-key',
            api_url='https://api.apimart.ai/v1/images/generations',
        )
        submitted_payload = {'code': 200, 'data': [{'status': 'submitted', 'task_id': 'task_123'}]}
        completed_payload = {
            'code': 200,
            'data': {
                'status': 'completed',
                'result': {'images': [{'url': ['https://upload.example.com/generated.png']}]},
            },
        }

        with (
            patch.object(client, '_post_json', return_value=submitted_payload) as post_json,
            patch.object(client, '_get_json', return_value=completed_payload),
            patch.object(client, '_download_image', return_value=(b'png-bytes', 'image/png')),
        ):
            client.generate(prompt='low', quality='low', size='1024x1536')
            client.generate(prompt='medium', quality='medium', size='1024x1536')
            client.generate(prompt='high square', quality='high', size='1024x1024')

        payloads = [call.args[0] for call in post_json.call_args_list]
        self.assertEqual([payload['resolution'] for payload in payloads], ['1k', '2k', '2k'])
        self.assertEqual(payloads[2]['size'], '1:1')

    def test_apimart_reference_edit_posts_image_urls_to_generation_endpoint(self) -> None:
        client = OpenAIImageGenerationClient(
            api_key='test-key',
            api_url='https://api.apimart.ai/v1/images/generations',
        )
        submitted_payload = {'code': 200, 'data': [{'status': 'submitted', 'task_id': 'task_ref'}]}
        completed_payload = {
            'code': 200,
            'data': {
                'status': 'completed',
                'result': {'images': [{'url': ['https://upload.example.com/generated.png']}]},
            },
        }

        with (
            patch.object(client, '_post_json', return_value=submitted_payload) as post_json,
            patch.object(client, '_get_json', return_value=completed_payload),
            patch.object(client, '_download_image', return_value=(b'png-bytes', 'image/png')),
        ):
            result = client.edit(
                prompt='make a cleaner lighting reference',
                quality='low',
                size='1024x1536',
                output_format='webp',
                reference_image_url='https://cdn.example.com/source.png',
            )

        self.assertEqual(result.image_bytes, b'png-bytes')
        request_payload = post_json.call_args.args[0]
        self.assertEqual(request_payload['model'], 'gpt-image-2-official')
        self.assertEqual(request_payload['image_urls'], ['https://cdn.example.com/source.png'])
        self.assertEqual(request_payload['size'], '9:16')
        self.assertEqual(request_payload['resolution'], '1k')
        self.assertNotIn('response_format', request_payload)


if __name__ == '__main__':
    unittest.main()
