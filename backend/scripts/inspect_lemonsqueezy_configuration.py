"""Read-only, redacted inspection of an explicit Cloud Run payment deployment.

Only official Lemon Squeezy GET endpoints are used. Credentials stay in process
memory. Output contains selected configuration and product fields, never raw
provider responses, signing secrets, customer records or checkout URLs.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    from app.services import lemonsqueezy
    from scripts.register_lemonsqueezy_webhook import DEFAULT_EVENTS
except Exception:
    # Pydantic startup failures can include secret-bearing input values. Keep
    # the import boundary as redacted as provider and cloud failures below.
    raise SystemExit('Payment configuration inspection could not initialize local runtime settings.') from None

VARIANT_SETTINGS = {
    'pro_monthly': 'LEMONSQUEEZY_PRO_VARIANT_ID',
    'pro_one_time': 'LEMONSQUEEZY_PRO_ONE_TIME_VARIANT_ID',
    'legacy_zh': 'LEMONSQUEEZY_ZH_PRO_VARIANT_ID',
    'image_credits': 'LEMONSQUEEZY_IMAGE_CREDIT_PACK_VARIANT_ID',
}
PRICE_FIELDS = (
    'variant_id', 'category', 'scheme', 'unit_price', 'unit_price_decimal',
    'usage_aggregation', 'setup_fee_enabled', 'setup_fee', 'package_size',
    'renewal_interval_unit', 'renewal_interval_quantity', 'trial_interval_unit',
    'trial_interval_quantity', 'tax_code', 'created_at', 'updated_at',
)


class InspectionError(RuntimeError):
    """Fixed, non-sensitive failure code suitable for operator output."""


def gcloud_json(arguments: list[str]) -> dict:
    command = shutil.which('gcloud.cmd') or shutil.which('gcloud')
    if not command:
        raise InspectionError('gcloud_not_available')
    try:
        result = subprocess.run([command, *arguments, '--format=json'], capture_output=True, text=True, timeout=45)
        if result.returncode:
            raise InspectionError('gcloud_read_failed')
        payload = json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        raise InspectionError('gcloud_read_failed') from None
    if not isinstance(payload, dict):
        raise InspectionError('gcloud_payload_invalid')
    return payload


def credential_source(item: dict) -> dict:
    reference = item.get('valueFrom', {}).get('secretKeyRef')
    if isinstance(reference, dict):
        return {'present': True, 'source': 'secretRef', 'reference': {'name': reference.get('name'), 'version': reference.get('key')}}
    return {'present': bool(item.get('value')), 'source': 'literal' if item.get('value') else 'absent'}


def api_key_from_deployment(environment: dict, deployment: dict, *, project: str) -> str:
    item = environment.get('LEMONSQUEEZY_API_KEY', {})
    if item.get('value'):
        return str(item['value']).strip()
    reference = item.get('valueFrom', {}).get('secretKeyRef', {})
    secret_name = str(reference.get('name') or '')
    version = str(reference.get('key') or '')
    annotations = {
        **deployment.get('metadata', {}).get('annotations', {}),
        **deployment.get('spec', {}).get('template', {}).get('metadata', {}).get('annotations', {}),
    }
    aliases = {}
    for mapping in annotations.get('run.googleapis.com/secrets', '').split(','):
        if ':' in mapping:
            alias, resource = mapping.split(':', 1)
            aliases[alias.strip()] = resource.strip()
    secret_name = aliases.get(secret_name, secret_name)
    if secret_name.startswith('projects/'):
        match = re.fullmatch(r'projects/([^/]+)/secrets/([^/]+)', secret_name)
        if not match:
            raise InspectionError('api_key_secret_reference_invalid')
        project, secret_name = match.groups()
    if not secret_name or not version:
        raise InspectionError('deployment_api_key_missing')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', secret_name) or not re.fullmatch(r'(latest|[0-9]+)', version):
        raise InspectionError('api_key_secret_reference_invalid')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9:_.-]*', project):
        raise InspectionError('api_key_secret_reference_invalid')
    command = shutil.which('gcloud.cmd') or shutil.which('gcloud')
    if not command:
        raise InspectionError('gcloud_not_available')
    try:
        result = subprocess.run(
            [command, 'secrets', 'versions', 'access', version, f'--secret={secret_name}', f'--project={project}'],
            capture_output=True, text=True, timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise InspectionError('api_key_secret_read_failed') from None
    if result.returncode or not result.stdout.strip():
        raise InspectionError('api_key_secret_read_failed')
    return result.stdout.strip()


def safe_webhook_url(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        return '[invalid URL]'
    known_paths = {'/api/webhook/lemonsqueezy', '/api/v1/webhooks/lemonsqueezy'}
    path = parsed.path if parsed.path in known_paths else '/[nonstandard path hidden]'
    return f'{parsed.scheme}://{parsed.hostname}{path}'


def _positive_id(value) -> str:
    identifier = str(value or '')
    if not re.fullmatch(r'[1-9][0-9]*', identifier):
        raise InspectionError('provider_identifier_invalid')
    return identifier


def _list_resources(resource: str, filters: dict) -> list[dict]:
    rows = []
    for number in range(1, 21):
        query = urlencode({**filters, 'page[number]': number, 'page[size]': 100})
        payload = lemonsqueezy._api_request(f'/{resource}?{query}')
        data = payload.get('data')
        if not isinstance(data, list):
            raise InspectionError('provider_list_payload_invalid')
        rows.extend(data)
        last_page = payload.get('meta', {}).get('page', {}).get('lastPage')
        if isinstance(last_page, int) and number >= last_page:
            return rows
        if last_page is None and not payload.get('links', {}).get('next'):
            return rows
    raise InspectionError('provider_pagination_limit_reached')


def _resource_attributes(payload: dict, *, expected_type: str, expected_id: str) -> dict:
    resource = payload.get('data', {})
    if resource.get('type') != expected_type or str(resource.get('id')) != expected_id:
        raise InspectionError('provider_resource_mismatch')
    attributes = resource.get('attributes')
    if not isinstance(attributes, dict):
        raise InspectionError('provider_attributes_invalid')
    return attributes


def _inspect_provider(environment: dict) -> dict:
    store_id = _positive_id(environment.get('LEMONSQUEEZY_STORE_ID', {}).get('value'))
    store = _resource_attributes(lemonsqueezy._api_request(f'/stores/{store_id}'), expected_type='stores', expected_id=store_id)
    target = str(environment.get('LEMONSQUEEZY_WEBHOOK_URL', {}).get('value') or '')
    hooks = []
    for hook in _list_resources('webhooks', {'filter[store_id]': store_id}):
        attributes = hook.get('attributes', {})
        events = attributes.get('events', [])
        if not isinstance(events, list) or any(not isinstance(event, str) for event in events):
            raise InspectionError('provider_webhook_events_invalid')
        hooks.append({
            'id': str(hook.get('id')), 'store_matches': str(attributes.get('store_id')) == store_id,
            'url': safe_webhook_url(str(attributes.get('url') or '')),
            'target_matches_configured_url': attributes.get('url') == target,
            'test_mode': attributes.get('test_mode'), 'events': sorted(events),
            'missing_required_events': sorted(set(DEFAULT_EVENTS) - set(events)),
            'extra_events': sorted(set(events) - set(DEFAULT_EVENTS)),
            'last_sent_at': attributes.get('last_sent_at'), 'updated_at': attributes.get('updated_at'),
        })
    variants = []
    for role, setting in VARIANT_SETTINGS.items():
        variant_id = _positive_id(environment.get(setting, {}).get('value'))
        attributes = _resource_attributes(lemonsqueezy._api_request(f'/variants/{variant_id}'), expected_type='variants', expected_id=variant_id)
        product_id = _positive_id(attributes.get('product_id'))
        product = _resource_attributes(lemonsqueezy._api_request(f'/products/{product_id}'), expected_type='products', expected_id=product_id)
        current_payload = lemonsqueezy._api_request(f'/variants/{variant_id}/price-model')
        current_id = _positive_id(current_payload.get('data', {}).get('id'))
        current = _resource_attributes(current_payload, expected_type='prices', expected_id=current_id)
        if str(current.get('variant_id')) != variant_id:
            raise InspectionError('provider_current_price_variant_mismatch')
        prices = _list_resources('prices', {'filter[variant_id]': variant_id})
        if any(str(price.get('attributes', {}).get('variant_id')) != variant_id for price in prices):
            raise InspectionError('provider_price_variant_mismatch')
        variants.append({
            'role': role, 'variant_id': variant_id, 'variant_name': attributes.get('name'),
            'variant_status': attributes.get('status'), 'test_mode': attributes.get('test_mode'),
            'product_id': product_id, 'product_name': product.get('name'), 'product_status': product.get('status'),
            'product_store_matches': str(product.get('store_id')) == store_id,
            'store_currency': store.get('currency'),
            'price_selection_source': 'variant.price-model relationship',
            'current_price': {'id': current_id, **{field: current.get(field) for field in PRICE_FIELDS}},
            'prices': [{'id': str(price.get('id')), **{field: price.get('attributes', {}).get(field) for field in PRICE_FIELDS}} for price in prices],
        })
    return {'status': 'verified_get_only', 'store_currency': store.get('currency'), 'webhooks': hooks, 'variants': variants}


def inspect_configuration(*, project: str, region: str, service: str) -> dict:
    if any(not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9:_.-]*', value) for value in (project, region, service)):
        raise InspectionError('cloud_identifier_invalid')
    deployment = gcloud_json(['run', 'services', 'describe', service, f'--project={project}', f'--region={region}'])
    environment = {item['name']: item for item in deployment['spec']['template']['spec']['containers'][0].get('env', [])}
    status = deployment.get('status', {})
    created, ready = status.get('latestCreatedRevisionName'), status.get('latestReadyRevisionName')
    generation = deployment.get('metadata', {}).get('generation')
    observed_generation = status.get('observedGeneration')
    created_is_ready = created == ready if created and ready else None
    generation_observed = generation == observed_generation if generation is not None and observed_generation is not None else None
    serving_targets = [item for item in status.get('traffic', []) if isinstance(item.get('percent'), int) and item['percent'] > 0]
    ready_has_all_traffic = bool(ready and len(serving_targets) == 1 and serving_targets[0].get('revisionName') == ready and serving_targets[0]['percent'] == 100)
    serving_verified = created_is_ready is True and generation_observed is True and ready_has_all_traffic
    report = {
        'observed_at_utc': datetime.now(timezone.utc).isoformat(),
        'cloud_run': {
            'project': project, 'region': region, 'service': service,
            'configuration_source': 'latest_template',
            'latest_created_revision': created, 'latest_ready_revision': ready,
            'latest_created_is_ready': created_is_ready,
            'template_generation_observed': generation_observed,
            'ready_revision_receives_all_traffic': ready_has_all_traffic,
            'serving_configuration_verified': serving_verified,
            'traffic': [{field: item.get(field) for field in ('revisionName', 'percent', 'latestRevision')} for item in status.get('traffic', [])],
            'credentials': {name: credential_source(environment.get(name, {})) for name in ('LEMONSQUEEZY_API_KEY', 'LEMONSQUEEZY_WEBHOOK_SIGNING_SECRET')},
            'configuration': {name: environment.get(name, {}).get('value') for name in (
                'APP_ENV', 'LEMONSQUEEZY_CHECKOUT_TEST_MODE', 'LEMONSQUEEZY_WEBHOOK_TEST_MODE', *VARIANT_SETTINGS.values(),
            )},
            'webhook_target': safe_webhook_url(str(environment.get('LEMONSQUEEZY_WEBHOOK_URL', {}).get('value') or '')),
        },
        'tax_rate': None, 'provider_fees': None, 'provider_net_settlement': None,
        'limitations': [
            'Price objects report integer cents and billing cycle; store currency is reported separately.',
            'Tax category is not the buyer-specific tax rate or an inclusive/exclusive tax setting.',
            'GET inspection does not verify webhook delivery, signing-secret equality or a payment/refund round trip.',
            'Provider fees and net settlement require separate provider settlement evidence.',
        ],
    }
    if not serving_verified:
        report['provider'] = {'status': 'deployment_serving_configuration_unverified'}
        return report
    original_key = lemonsqueezy.settings.lemonsqueezy_api_key
    try:
        lemonsqueezy.settings.lemonsqueezy_api_key = api_key_from_deployment(environment, deployment, project=project)
        report['provider'] = _inspect_provider(environment)
    except lemonsqueezy.LemonSqueezyAPIError as exc:
        report['provider'] = {'status': 'provider_read_failed', 'http_status': exc.status_code}
    except (InspectionError, lemonsqueezy.LemonSqueezyConfigurationError):
        report['provider'] = {'status': 'configuration_or_payload_read_failed'}
    finally:
        lemonsqueezy.settings.lemonsqueezy_api_key = original_key
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--region', required=True)
    parser.add_argument('--service', required=True)
    args = parser.parse_args()
    try:
        report = inspect_configuration(project=args.project, region=args.region, service=args.service)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report['provider']['status'] == 'verified_get_only' else 1
    except Exception:
        # Never print raw cloud/provider errors, tracebacks or captured output.
        print('Payment configuration inspection failed. Verify read access and deployment metadata.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
