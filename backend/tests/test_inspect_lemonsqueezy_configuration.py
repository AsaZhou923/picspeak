from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts import inspect_lemonsqueezy_configuration as inspect

TARGET = 'https://api.picspeak.art/api/v1/webhooks/lemonsqueezy'


def deployment():
    values = {
        'LEMONSQUEEZY_API_KEY': 'cloud-api-key-private',
        'LEMONSQUEEZY_WEBHOOK_SIGNING_SECRET': 'webhook-signing-private',
        'LEMONSQUEEZY_STORE_ID': '17', 'LEMONSQUEEZY_WEBHOOK_URL': TARGET,
        'LEMONSQUEEZY_CHECKOUT_TEST_MODE': 'false', 'LEMONSQUEEZY_WEBHOOK_TEST_MODE': 'false',
        'LEMONSQUEEZY_PRO_VARIANT_ID': '101', 'LEMONSQUEEZY_ZH_PRO_VARIANT_ID': '102',
        'LEMONSQUEEZY_IMAGE_CREDIT_PACK_VARIANT_ID': '103', 'UNRELATED_SECRET': 'unrelated-private',
    }
    return {'metadata': {'generation': 3},
            'spec': {'template': {'spec': {'containers': [{'env': [{'name': key, 'value': value} for key, value in values.items()]}]}}},
            'status': {'latestCreatedRevisionName': 'fixture-revision', 'latestReadyRevisionName': 'fixture-revision',
                       'observedGeneration': 3, 'traffic': [{'revisionName': 'fixture-revision', 'percent': 100}]}}


def resource(kind, identifier, **attributes):
    return {'data': {'type': kind, 'id': str(identifier), 'attributes': attributes}}


class PaymentConfigurationInspectionTests(unittest.TestCase):
    def setUp(self):
        self.calls = []

    def api(self, path):
        self.calls.append(path)
        self.assertEqual(inspect.lemonsqueezy.settings.lemonsqueezy_api_key, 'cloud-api-key-private')
        parsed = urlsplit(path)
        query = parse_qs(parsed.query)
        if parsed.path == '/stores/17':
            return resource('stores', '17', currency='USD', account_private='owner-private')
        if parsed.path == '/webhooks':
            self.assertEqual(query['filter[store_id]'], ['17'])
            return {'data': [{'type': 'webhooks', 'id': '900', 'attributes': {
                'store_id': 17, 'url': TARGET, 'test_mode': False,
                'events': ['order_created', 'subscription_created'], 'secret': 'supplier-signing-private',
            }}], 'meta': {'page': {'lastPage': 1}}}
        if parsed.path.startswith('/variants/') and parsed.path.endswith('/price-model'):
            variant_id = parsed.path.split('/')[2]
            return resource('prices', '400' + variant_id, variant_id=int(variant_id), category='subscription',
                            scheme='standard', unit_price=399, renewal_interval_unit='month', renewal_interval_quantity=1)
        if parsed.path.startswith('/variants/'):
            return resource('variants', parsed.path.split('/')[-1], name='Public variant', product_id=201,
                            status='published', price=999999, description='raw-description-private', test_mode=False)
        if parsed.path == '/products/201':
            return resource('products', '201', name='Public product', store_id=17, status='published', buy_now_url='checkout-private')
        if parsed.path == '/prices':
            variant_id = query['filter[variant_id]'][0]
            return {'data': [resource('prices', '400' + variant_id, variant_id=int(variant_id), unit_price=399)['data']],
                    'meta': {'page': {'lastPage': 1}}}
        raise AssertionError('Unexpected or non-read resource requested')

    def test_cloud_source_is_explicit_and_output_is_whitelisted(self):
        with patch.object(inspect, 'gcloud_json', return_value=deployment()), patch.object(
            inspect.lemonsqueezy, '_api_request', side_effect=self.api,
        ), patch.object(inspect.lemonsqueezy.settings, 'lemonsqueezy_api_key', 'local-env-private'):
            report = inspect.inspect_configuration(project='test-project', region='test-region', service='test-service')
            self.assertEqual(inspect.lemonsqueezy.settings.lemonsqueezy_api_key, 'local-env-private')
        encoded = json.dumps(report)
        for private in ('cloud-api-key-private', 'webhook-signing-private', 'unrelated-private', 'owner-private',
                        'supplier-signing-private', 'raw-description-private', 'checkout-private', 'local-env-private'):
            self.assertNotIn(private, encoded)
        self.assertEqual(report['provider']['status'], 'verified_get_only')
        self.assertEqual(report['cloud_run']['configuration_source'], 'latest_template')
        self.assertTrue(report['cloud_run']['serving_configuration_verified'])
        self.assertTrue(report['provider']['webhooks'][0]['target_matches_configured_url'])
        self.assertIn('subscription_payment_refunded', report['provider']['webhooks'][0]['missing_required_events'])
        self.assertEqual(report['provider']['variants'][0]['current_price']['unit_price'], 399)
        self.assertNotIn('price', report['provider']['variants'][0])
        self.assertIsNone(report['provider_net_settlement'])
        self.assertTrue(all(path.startswith(('/stores/', '/webhooks?', '/variants/', '/products/', '/prices?')) for path in self.calls))

    def test_provider_401_does_not_expose_raw_error_body_and_restores_local_settings(self):
        error = inspect.lemonsqueezy.LemonSqueezyAPIError('private-key-in-message', status_code=401, response_body='customer-private')
        with patch.object(inspect, 'gcloud_json', return_value=deployment()), patch.object(
            inspect.lemonsqueezy, '_api_request', side_effect=error,
        ), patch.object(inspect.lemonsqueezy.settings, 'lemonsqueezy_api_key', 'old-private'):
            report = inspect.inspect_configuration(project='p', region='r', service='s')
            self.assertEqual(inspect.lemonsqueezy.settings.lemonsqueezy_api_key, 'old-private')
        self.assertEqual(report['provider'], {'status': 'provider_read_failed', 'http_status': 401})
        self.assertNotIn('private-key-in-message', json.dumps(report))
        self.assertNotIn('customer-private', json.dumps(report))

    def test_unready_latest_template_is_not_reported_as_serving_configuration(self):
        doc = deployment()
        doc['status']['latestCreatedRevisionName'] = 'fixture-unready'
        with patch.object(inspect, 'gcloud_json', return_value=doc), patch.object(
            inspect.lemonsqueezy, '_api_request', side_effect=AssertionError('Provider inspection must fail closed'),
        ) as api:
            report = inspect.inspect_configuration(project='p', region='r', service='s')
        self.assertFalse(report['cloud_run']['latest_created_is_ready'])
        self.assertFalse(report['cloud_run']['serving_configuration_verified'])
        self.assertEqual(report['provider']['status'], 'deployment_serving_configuration_unverified')
        api.assert_not_called()

    def test_split_traffic_is_not_reported_as_wholly_using_latest_template(self):
        doc = deployment()
        doc['status']['traffic'] = [
            {'revisionName': 'fixture-revision', 'percent': 90},
            {'revisionName': 'fixture-older', 'percent': 10},
        ]
        with patch.object(inspect, 'gcloud_json', return_value=doc), patch.object(inspect.lemonsqueezy, '_api_request') as api:
            report = inspect.inspect_configuration(project='p', region='r', service='s')
        self.assertTrue(report['cloud_run']['latest_created_is_ready'])
        self.assertFalse(report['cloud_run']['ready_revision_receives_all_traffic'])
        self.assertFalse(report['cloud_run']['serving_configuration_verified'])
        api.assert_not_called()

    def test_unobserved_template_generation_prevents_current_configuration_claim(self):
        doc = deployment()
        doc['metadata']['generation'] = 4
        with patch.object(inspect, 'gcloud_json', return_value=doc), patch.object(inspect.lemonsqueezy, '_api_request') as api:
            report = inspect.inspect_configuration(project='p', region='r', service='s')
        self.assertFalse(report['cloud_run']['template_generation_observed'])
        self.assertFalse(report['cloud_run']['serving_configuration_verified'])
        api.assert_not_called()

    def test_secret_manager_alias_is_resolved_and_secret_is_never_a_command_argument(self):
        doc = deployment()
        doc['metadata'] = {'annotations': {'run.googleapis.com/secrets': 'api-alias:projects/123/secrets/payment-api'}}
        environment = {'LEMONSQUEEZY_API_KEY': {'valueFrom': {'secretKeyRef': {'name': 'api-alias', 'key': '5'}}}}
        with patch.object(inspect.shutil, 'which', return_value='gcloud.cmd'), patch.object(
            inspect.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='retrieved-private\n'),
        ) as run:
            self.assertEqual(inspect.api_key_from_deployment(environment, doc, project='fallback'), 'retrieved-private')
        command = run.call_args.args[0]
        self.assertIn('--secret=payment-api', command)
        self.assertIn('--project=123', command)
        self.assertNotIn('retrieved-private', str(command))

    def test_url_summary_hides_userinfo_query_and_nonstandard_token_paths(self):
        self.assertEqual(inspect.safe_webhook_url('https://user:private@api.picspeak.art/api/v1/webhooks/lemonsqueezy?token=private#secret'), TARGET)
        self.assertNotIn('token-in-path', inspect.safe_webhook_url('https://example.test/token-in-path'))

    def test_shell_metacharacters_never_reach_windows_gcloud_batch_arguments(self):
        with patch.object(inspect, 'gcloud_json') as cloud:
            with self.assertRaises(inspect.InspectionError):
                inspect.inspect_configuration(project='p&echo-private', region='r', service='s')
            cloud.assert_not_called()
        environment = {'LEMONSQUEEZY_API_KEY': {'valueFrom': {'secretKeyRef': {'name': 'secret&echo-private', 'key': 'latest'}}}}
        with patch.object(inspect.subprocess, 'run') as run:
            with self.assertRaises(inspect.InspectionError):
                inspect.api_key_from_deployment(environment, {}, project='safe-project')
            run.assert_not_called()

    def test_pagination_uses_fixed_resource_paths_and_preserves_store_filter(self):
        replies = [
            {'data': [{'id': '1'}], 'meta': {'page': {'lastPage': 2}}, 'links': {'next': 'https://untrusted.invalid/private'}},
            {'data': [{'id': '2'}], 'meta': {'page': {'lastPage': 2}}},
        ]
        with patch.object(inspect.lemonsqueezy, '_api_request', side_effect=replies) as api:
            rows = inspect._list_resources('webhooks', {'filter[store_id]': '17'})
        self.assertEqual([row['id'] for row in rows], ['1', '2'])
        for call in api.call_args_list:
            self.assertTrue(call.args[0].startswith('/webhooks?'))
            self.assertEqual(parse_qs(urlsplit(call.args[0]).query)['filter[store_id]'], ['17'])

    def test_cli_hides_unexpected_cloud_exception_and_returns_failure(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', ['inspect', '--project=p', '--region=r', '--service=s']), patch.object(
            inspect, 'gcloud_json', side_effect=RuntimeError('private-cloud-output'),
        ), redirect_stdout(stdout), redirect_stderr(stderr):
            self.assertEqual(inspect.main(), 1)
        self.assertNotIn('private-cloud-output', stdout.getvalue() + stderr.getvalue())

    def test_startup_validation_failure_is_redacted_for_cli_and_import(self):
        invalid_value = 'startup-secret-canary-never-print'
        credential_value = 'api-key-canary-never-print'
        environment = {**os.environ, 'PRO_REVIEW_SOFT_LIMIT_PER_MONTH': invalid_value,
                       'LEMONSQUEEZY_API_KEY': credential_value}
        script = BACKEND_ROOT / 'scripts' / 'inspect_lemonsqueezy_configuration.py'
        import_code = f'import sys; sys.path.insert(0, {str(BACKEND_ROOT)!r}); import scripts.inspect_lemonsqueezy_configuration'
        commands = ([sys.executable, str(script), '--help'], [sys.executable, '-c', import_code])
        for command in commands:
            with self.subTest(entrypoint='cli' if '--help' in command else 'import'):
                result = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=20)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, '')
                self.assertEqual(result.stderr.strip(), 'Payment configuration inspection could not initialize local runtime settings.')
                output = result.stdout + result.stderr
                for private in (invalid_value, credential_value, 'input_value', 'Traceback', 'ValidationError'):
                    self.assertNotIn(private, output)


if __name__ == '__main__':
    unittest.main()
