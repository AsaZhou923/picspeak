"""Provision the notification sweep without exposing its shared dispatch secret.

Requires gcloud authentication and the Cloud Scheduler API to be enabled.
Reads the deployed Cloud Run configuration; never changes that configuration.
See https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs.
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import shutil
import subprocess
import sys
from typing import Any
from urllib import error, parse, request


API_ROOT = 'https://cloudscheduler.googleapis.com/v1'
UPDATE_FIELDS = ('httpTarget', 'schedule', 'timeZone', 'attemptDeadline', 'retryConfig')


class ProvisionError(Exception):
    """An intentionally sanitized operator-facing error."""


class ApiError(ProvisionError):
    def __init__(self, status: int):
        self.status = status
        super().__init__(f'Cloud Scheduler request failed (HTTP {status}).')


def gcloud_output(arguments: list[str]) -> str:
    executable = shutil.which('gcloud')
    if not executable:
        raise ProvisionError('gcloud is unavailable; authenticate with the Google Cloud CLI first.')
    try:
        completed = subprocess.run(
            [executable, *arguments, '--quiet'], capture_output=True, text=True,
            encoding='utf-8', timeout=90, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise ProvisionError('Google Cloud CLI invocation failed or timed out.') from None
    if completed.returncode:
        # gcloud errors can contain environment values; never forward stderr.
        raise ProvisionError('Google Cloud CLI invocation failed; check authentication and read permissions.')
    return completed.stdout.strip()


def read_json(text: str, source: str) -> dict[str, Any]:
    try:
        result = json.loads(text)
    except (ValueError, TypeError):
        raise ProvisionError(f'{source} returned invalid JSON.') from None
    if not isinstance(result, dict):
        raise ProvisionError(f'{source} returned an unexpected document.')
    return result


def resolve_env(entry: dict[str, Any], service: dict[str, Any], project: str) -> str:
    if 'value' in entry:
        return str(entry['value'])
    reference = (
        entry.get('valueFrom', {}).get('secretKeyRef')
        or entry.get('valueSource', {}).get('secretKeyRef')
    )
    if not isinstance(reference, dict):
        raise ProvisionError('A required Cloud Run environment value cannot be resolved.')
    secret = reference.get('name') or reference.get('secret')
    version = reference.get('key') or reference.get('version')
    if not isinstance(secret, str) or not isinstance(version, str):
        raise ProvisionError('A required Cloud Run secret reference is incomplete.')
    annotations = {
        **service.get('spec', {}).get('template', {}).get('metadata', {}).get('annotations', {}),
        **service.get('metadata', {}).get('annotations', {}),
    }
    aliases = annotations.get('run.googleapis.com/secrets', '')
    for alias in aliases.split(','):
        key, separator, value = alias.partition(':')
        if separator and key.strip() == secret:
            secret = value.strip()
            break
    secret_project = project
    if secret.startswith('projects/'):
        match = re.fullmatch(r'projects/([A-Za-z0-9_.:-]+)/secrets/([A-Za-z0-9_-]+)', secret)
        if not match:
            raise ProvisionError('A required Cloud Run secret reference is invalid.')
        secret_project, secret = match.groups()
    if not re.fullmatch(r'[A-Za-z0-9_-]+', secret) or not re.fullmatch(r'[A-Za-z0-9_-]+', version):
        raise ProvisionError('A required Cloud Run secret reference is invalid.')
    return gcloud_output(['secrets', 'versions', 'access', version, '--secret', secret, '--project', secret_project])


def true_setting(value: str) -> bool:
    return value.lower().strip() in {'true', '1', 'yes', 'on', 't', 'y'}


def service_target(project: str, region: str, service_name: str) -> tuple[str, str]:
    service = read_json(gcloud_output([
        'run', 'services', 'describe', service_name, '--project', project,
        '--region', region, '--format=json',
    ]), 'Cloud Run')
    template = service.get('spec', {}).get('template', {})
    containers = template.get('spec', {}).get('containers') or service.get('template', {}).get('containers')
    if not isinstance(containers, list) or not containers:
        raise ProvisionError('Cloud Run service has no application container configuration.')
    environment = {entry.get('name'): entry for entry in containers[0].get('env', [])}
    def value(name: str, default: str = '') -> str:
        return resolve_env(environment[name], service, project) if name in environment else default
    if not true_setting(value('CLOUD_TASKS_ENABLED')):
        raise ProvisionError('CLOUD_TASKS_ENABLED must be true on the deployed service.')
    if not true_setting(value('NOTIFICATIONS_WORKER_ENABLED', 'true')):
        raise ProvisionError('NOTIFICATIONS_WORKER_ENABLED must be true or unset on the deployed service.')
    secret = value('CLOUD_TASKS_SECRET')
    if not secret.strip() or '\r' in secret or '\n' in secret:
        raise ProvisionError('The deployed CLOUD_TASKS_SECRET must contain a valid nonempty header value.')
    uri = service.get('status', {}).get('url') or service.get('uri')
    if not isinstance(uri, str):
        raise ProvisionError('Cloud Run service URL is unavailable.')
    parts = parse.urlsplit(uri)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise ProvisionError('Cloud Run service URL must be an HTTPS origin.')
    return uri.rstrip('/') + '/api/v1/internal/notifications/process', secret


def scheduler_request(method: str, url: str, token: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = json.dumps(payload, separators=(',', ':')).encode() if payload is not None else None
    req = request.Request(url, data=body, method=method, headers={
        'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
    })
    try:
        with request.urlopen(req, timeout=90) as response:
            raw = response.read().decode('utf-8')
    except error.HTTPError as exc:
        raise ApiError(exc.code) from None
    except (error.URLError, OSError, UnicodeError):
        raise ProvisionError('Cloud Scheduler request failed due to a transport error.') from None
    return read_json(raw, 'Cloud Scheduler') if raw else {}


def desired_job(name: str, uri: str, secret: str) -> dict[str, Any]:
    return {
        'name': name, 'schedule': '* * * * *', 'timeZone': 'Etc/UTC',
        'attemptDeadline': '60s',
        'retryConfig': {'retryCount': 3, 'minBackoffDuration': '5s', 'maxBackoffDuration': '60s', 'maxDoublings': 3, 'maxRetryDuration': '0s'},
        'httpTarget': {
            'uri': uri, 'httpMethod': 'POST',
            'headers': {'Content-Type': 'application/json', 'X-Task-Dispatch-Secret': secret},
            'body': base64.b64encode(b'{"limit":100}').decode('ascii'),
        },
    }


def matches(existing: dict[str, Any], desired: dict[str, Any]) -> bool:
    for field in UPDATE_FIELDS:
        actual, wanted = existing.get(field), desired[field]
        if field == 'httpTarget' and isinstance(actual, dict):
            actual = {**actual, 'headers': {k.lower(): v for k, v in actual.get('headers', {}).items()}}
            wanted = {**wanted, 'headers': {k.lower(): v for k, v in wanted['headers'].items()}}
            # Scheduler persists this default even when the caller omits it.
            # Ignore only that exact provider value; all other extra headers
            # (particularly Authorization) remain configuration drift.
            if 'user-agent' not in wanted['headers'] and actual['headers'].get('user-agent') == 'Google-Cloud-Scheduler':
                actual['headers'].pop('user-agent')
        if actual != wanted:
            return False
    return True


def configure(args: argparse.Namespace) -> None:
    uri, secret = service_target(args.project, args.region, args.service)
    token = gcloud_output(['auth', 'print-access-token'])
    if not token:
        raise ProvisionError('Google Cloud access token is unavailable.')
    name = f'projects/{args.project}/locations/{args.region}/jobs/{args.job}'
    endpoint = API_ROOT + '/' + name
    desired = desired_job(name, uri, secret)
    try:
        existing = scheduler_request('GET', endpoint, token)
    except ApiError as exc:
        if exc.status != 404:
            raise
        existing = None
    action = 'create' if existing is None else (
        'unchanged' if existing.get('state') != 'UPDATE_FAILED' and matches(existing, desired) else 'update'
    )
    # Never print a Scheduler resource: it includes the shared secret.
    print(json.dumps({
        'mode': 'execute' if args.execute else 'dry-run', 'action': action,
        'job': name, 'target': uri, 'schedule': desired['schedule'], 'time_zone': desired['timeZone'],
        'attempt_deadline': '60s', 'retry_count': 3, 'retry_backoff': '5s–60s',
        'limit': 100, 'dispatch_secret': 'present (redacted)', 'run_now': args.run_now,
        'existing_state': existing.get('state', 'unknown') if existing else 'absent',
    }, ensure_ascii=True))
    if not args.execute:
        return
    if existing and existing.get('state') == 'PAUSED':
        raise ProvisionError('The existing job is paused; resume it explicitly before provisioning an active sweep.')
    if existing and existing.get('state') == 'DISABLED':
        raise ProvisionError('The existing job is disabled; resolve its disabled state before provisioning an active sweep.')
    if existing is not None and existing.get('state') not in {'ENABLED', 'UPDATE_FAILED'}:
        raise ProvisionError('The existing job has an unknown or unsupported state; an active sweep cannot be verified.')
    if action == 'create':
        scheduler_request('POST', API_ROOT + f'/projects/{args.project}/locations/{args.region}/jobs', token, desired)
    elif action == 'update':
        scheduler_request('PATCH', endpoint + '?updateMask=' + ','.join(UPDATE_FIELDS), token, desired)
    if action != 'unchanged':
        persisted = scheduler_request('GET', endpoint, token)
        if not matches(persisted, desired):
            raise ProvisionError('Persisted Scheduler configuration did not match the requested sweep.')
        if persisted.get('state') != 'ENABLED':
            raise ProvisionError('Persisted Scheduler job is not ENABLED; an active sweep cannot be verified.')
    print('Cloud Scheduler configuration verified.')
    if args.run_now:
        scheduler_request('POST', endpoint + ':run', token, {})
        print('Immediate Scheduler run requested; inspect execution logs to confirm endpoint completion.')


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--region', required=True)
    parser.add_argument('--service', required=True)
    parser.add_argument('--job', default='picspeak-notification-sweep')
    parser.add_argument('--execute', action='store_true', help='Create or update the Cloud Scheduler job.')
    parser.add_argument('--run-now', action='store_true', help='Request an immediate run after --execute.')
    args = parser.parse_args(argv)
    for name in ('project', 'region', 'service', 'job'):
        pattern = r'[A-Za-z0-9_.:-]+' if name == 'project' else r'[A-Za-z0-9_-]+'
        if not re.fullmatch(pattern, getattr(args, name)):
            parser.error(f'--{name} must be a Google Cloud resource identifier.')
    if args.run_now and not args.execute:
        parser.error('--run-now requires --execute.')
    try:
        configure(args)
    except ProvisionError as exc:
        print(f'Error: {exc}', file=sys.stderr)
        return 1
    except Exception:
        # Unexpected provider data must not produce a traceback containing secrets.
        print('Error: Unexpected provisioning failure; provider details suppressed.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
