from __future__ import annotations

import base64
import copy
import importlib.util
import io
import json
import subprocess
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError


SCRIPT = Path(__file__).resolve().parents[2] / 'deploy' / 'configure-notifications.py'
SPEC = importlib.util.spec_from_file_location('configure_notifications', SCRIPT)
assert SPEC and SPEC.loader
provision = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(provision)

SECRET = 'test-dispatch-secret-never-print'
TOKEN = 'test-access-token-never-print'
URI = 'https://picspeak.example.run.app/api/v1/internal/notifications/process'
NAME = 'projects/test-project/locations/asia-east1/jobs/picspeak-notification-sweep'
ARGS = ['--project', 'test-project', '--region', 'asia-east1', '--service', 'picspeak']


def enabled_job() -> dict:
    return {**provision.desired_job(NAME, URI, SECRET), 'state': 'ENABLED'}


def deployed_service() -> dict:
    return {
        'metadata': {'annotations': {}},
        'status': {'url': 'https://picspeak.example.run.app'},
        'spec': {'template': {'spec': {'containers': [{'env': [
            {'name': 'CLOUD_TASKS_ENABLED', 'value': 'true'},
            {'name': 'CLOUD_TASKS_SECRET', 'value': SECRET},
        ]}]}}},
    }


class Response(io.BytesIO):
    def __init__(self, payload: dict):
        super().__init__(json.dumps(payload).encode())


class NotificationSchedulerTests(unittest.TestCase):
    def invoke(self, service=None, replies=None, arguments=None):
        deployed = deployed_service() if service is None else service
        replies = [] if replies is None else list(replies)
        commands, calls = [], []

        def run(command, **kwargs):
            commands.append(command)
            self.assertTrue(kwargs['capture_output'])
            self.assertNotIn(SECRET, command)
            self.assertNotIn(TOKEN, command)
            if command[1:4] == ['run', 'services', 'describe']:
                return subprocess.CompletedProcess(command, 0, json.dumps(deployed), '')
            if command[1:3] == ['auth', 'print-access-token']:
                return subprocess.CompletedProcess(command, 0, TOKEN, '')
            if command[1:4] == ['secrets', 'versions', 'access']:
                return subprocess.CompletedProcess(command, 0, SECRET, '')
            self.fail('Unexpected gcloud invocation')

        def urlopen(req, **kwargs):
            calls.append(req)
            self.assertEqual(req.get_header('Authorization'), 'Bearer ' + TOKEN)
            self.assertEqual(kwargs['timeout'], 90)
            reply = replies.pop(0)
            if isinstance(reply, Exception):
                raise reply
            return Response(reply)

        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(provision.shutil, 'which', return_value='gcloud.cmd'), \
             patch.object(provision.subprocess, 'run', side_effect=run), \
             patch.object(provision.request, 'urlopen', side_effect=urlopen), \
             redirect_stdout(stdout), redirect_stderr(stderr):
            status = provision.main(ARGS + (arguments or []))
        self.assertNotIn(SECRET, stdout.getvalue() + stderr.getvalue())
        self.assertNotIn(TOKEN, stdout.getvalue() + stderr.getvalue())
        self.assertFalse(replies, 'Expected HTTP requests were not made')
        return status, stdout.getvalue(), stderr.getvalue(), commands, calls

    def not_found(self):
        return HTTPError('https://example.invalid', 404, SECRET, {}, io.BytesIO(SECRET.encode()))

    def test_dry_run_performs_reads_only_and_redacts_summary(self):
        status, out, err, _, calls = self.invoke(replies=[self.not_found()])
        self.assertEqual(status, 0)
        self.assertEqual(err, '')
        summary = json.loads(out)
        self.assertEqual(summary['mode'], 'dry-run')
        self.assertEqual(summary['action'], 'create')
        self.assertEqual(summary['limit'], 100)
        self.assertEqual([r.method for r in calls], ['GET'])
        self.assertNotIn('body', summary)

    def test_create_encodes_request_and_verifies_persisted_job(self):
        desired = enabled_job()
        status, _, _, _, calls = self.invoke(replies=[self.not_found(), desired, desired], arguments=['--execute'])
        self.assertEqual(status, 0)
        self.assertEqual([r.method for r in calls], ['GET', 'POST', 'GET'])
        body = json.loads(calls[1].data)
        self.assertEqual(base64.b64decode(body['httpTarget']['body']), b'{"limit":100}')
        self.assertEqual(body['httpTarget']['headers']['X-Task-Dispatch-Secret'], SECRET)
        self.assertEqual(body['schedule'], '* * * * *')
        self.assertEqual(body['attemptDeadline'], '60s')
        self.assertEqual(body['retryConfig']['retryCount'], 3)
        self.assertNotIn('oidcToken', body['httpTarget'])

    def test_update_replaces_target_with_limited_field_mask(self):
        desired = enabled_job()
        old = copy.deepcopy(desired)
        old['schedule'] = '*/5 * * * *'
        old['httpTarget']['oidcToken'] = {'serviceAccountEmail': 'old@example.com'}
        old['description'] = 'preserve operator description'
        status, _, _, _, calls = self.invoke(replies=[old, desired, desired], arguments=['--execute'])
        self.assertEqual(status, 0)
        self.assertEqual([r.method for r in calls], ['GET', 'PATCH', 'GET'])
        self.assertTrue(calls[1].full_url.endswith('?updateMask=httpTarget,schedule,timeZone,attemptDeadline,retryConfig'))
        self.assertNotIn('description', json.loads(calls[1].data))

    def test_identical_config_is_idempotent_and_headers_ignore_case(self):
        desired = enabled_job()
        desired['httpTarget']['headers'] = {k.lower(): v for k, v in desired['httpTarget']['headers'].items()}
        desired['state'] = 'ENABLED'
        status, out, _, _, calls = self.invoke(replies=[desired], arguments=['--execute'])
        self.assertEqual(status, 0)
        self.assertIn('"action": "unchanged"', out)
        self.assertEqual([r.method for r in calls], ['GET'])

    def test_run_now_requests_scheduler_run_without_claiming_endpoint_success(self):
        desired = enabled_job()
        status, out, _, _, calls = self.invoke(replies=[desired, desired], arguments=['--execute', '--run-now'])
        self.assertEqual(status, 0)
        self.assertTrue(calls[-1].full_url.endswith(':run'))
        self.assertIn('inspect execution logs', out)

    def test_create_readback_accepts_scheduler_default_user_agent(self):
        desired = enabled_job()
        persisted = copy.deepcopy(desired)
        persisted['state'] = 'ENABLED'
        persisted['httpTarget']['headers']['User-Agent'] = 'Google-Cloud-Scheduler'
        status, out, _, _, calls = self.invoke(replies=[self.not_found(), persisted, persisted, persisted], arguments=['--execute', '--run-now'])
        self.assertEqual(status, 0)
        self.assertIn('configuration verified', out)
        self.assertEqual([r.method for r in calls], ['GET', 'POST', 'GET', 'POST'])

    def test_provider_default_user_agent_keeps_rerun_idempotent(self):
        persisted = enabled_job()
        persisted['httpTarget']['headers']['user-agent'] = 'Google-Cloud-Scheduler'
        status, out, _, _, calls = self.invoke(replies=[persisted], arguments=['--execute'])
        self.assertEqual(status, 0)
        self.assertIn('"action": "unchanged"', out)
        self.assertEqual([r.method for r in calls], ['GET'])

    def test_other_header_drift_is_still_detected(self):
        desired = provision.desired_job(NAME, URI, SECRET)
        for header, value in [('Authorization', 'Bearer stale-token'), ('X-Other', 'unexpected'), ('User-Agent', 'custom-agent')]:
            with self.subTest(header=header):
                existing = copy.deepcopy(desired)
                existing['httpTarget']['headers'][header] = value
                self.assertFalse(provision.matches(existing, desired))

    def test_missing_or_disabled_cloud_tasks_fails_before_scheduler_read(self):
        for value in ('false', ''):
            with self.subTest(value=value):
                service = deployed_service()
                service['spec']['template']['spec']['containers'][0]['env'][0]['value'] = value
                status, _, err, commands, calls = self.invoke(service=service)
                self.assertEqual(status, 1)
                self.assertIn('CLOUD_TASKS_ENABLED must be true', err)
                self.assertEqual(len(commands), 1)
                self.assertEqual(calls, [])

    def test_missing_secret_fails_before_scheduler_read(self):
        service = deployed_service()
        service['spec']['template']['spec']['containers'][0]['env'].pop()
        status, _, err, _, calls = self.invoke(service=service)
        self.assertEqual(status, 1)
        self.assertIn('nonempty header', err)
        self.assertEqual(calls, [])

    def test_explicitly_disabled_worker_fails(self):
        service = deployed_service()
        service['spec']['template']['spec']['containers'][0]['env'].append({'name': 'NOTIFICATIONS_WORKER_ENABLED', 'value': 'false'})
        status, _, err, _, calls = self.invoke(service=service)
        self.assertEqual(status, 1)
        self.assertIn('NOTIFICATIONS_WORKER_ENABLED must be true or unset', err)
        self.assertEqual(calls, [])

    def test_secret_reference_alias_resolves_correct_project_without_secret_argument(self):
        service = deployed_service()
        service['metadata']['annotations']['run.googleapis.com/secrets'] = 'dispatch:projects/shared-project/secrets/dispatch-secret'
        service['spec']['template']['spec']['containers'][0]['env'][1] = {
            'name': 'CLOUD_TASKS_SECRET', 'valueFrom': {'secretKeyRef': {'name': 'dispatch', 'key': '7'}},
        }
        status, _, _, commands, _ = self.invoke(service=service, replies=[self.not_found()])
        self.assertEqual(status, 0)
        self.assertEqual(commands[1][1:-1], ['secrets', 'versions', 'access', '7', '--secret', 'dispatch-secret', '--project', 'shared-project'])

    def test_v2_secret_reference_resolves(self):
        service = {'uri': 'https://picspeak.example.run.app', 'template': {'containers': [{'env': [
            {'name': 'CLOUD_TASKS_ENABLED', 'value': 'true'},
            {'name': 'CLOUD_TASKS_SECRET', 'valueSource': {'secretKeyRef': {'secret': 'dispatch-secret', 'version': 'latest'}}},
        ]}]}}
        status, _, _, _, _ = self.invoke(service=service, replies=[self.not_found()])
        self.assertEqual(status, 0)

    def test_v1_template_secret_alias_resolves(self):
        service = deployed_service()
        service['spec']['template']['metadata'] = {'annotations': {
            'run.googleapis.com/secrets': 'dispatch:projects/shared-project/secrets/dispatch-secret',
        }}
        service['spec']['template']['spec']['containers'][0]['env'][1] = {
            'name': 'CLOUD_TASKS_SECRET', 'valueFrom': {'secretKeyRef': {'name': 'dispatch', 'key': 'latest'}},
        }
        status, _, _, commands, _ = self.invoke(service=service, replies=[self.not_found()])
        self.assertEqual(status, 0)
        self.assertIn('shared-project', commands[1])

    def test_api_auth_error_suppresses_response_body_and_message(self):
        failure = HTTPError('https://example.invalid', 403, SECRET, {}, io.BytesIO((SECRET + TOKEN).encode()))
        status, _, err, _, calls = self.invoke(replies=[failure], arguments=['--execute'])
        self.assertEqual(status, 1)
        self.assertIn('HTTP 403', err)
        self.assertEqual(len(calls), 1)

    def test_gcloud_auth_error_suppresses_stdout_and_stderr(self):
        out, err = io.StringIO(), io.StringIO()
        with patch.object(provision.shutil, 'which', return_value='gcloud.cmd'), \
             patch.object(provision.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, SECRET, TOKEN)), \
             redirect_stdout(out), redirect_stderr(err):
            self.assertEqual(provision.main(ARGS), 1)
        self.assertNotIn(SECRET, out.getvalue() + err.getvalue())
        self.assertNotIn(TOKEN, out.getvalue() + err.getvalue())
        self.assertIn('authentication and read permissions', err.getvalue())

    def test_failed_readback_is_not_reported_as_success(self):
        desired = enabled_job()
        status, out, err, _, _ = self.invoke(replies=[self.not_found(), desired, {}], arguments=['--execute'])
        self.assertEqual(status, 1)
        self.assertIn('did not match', err)
        self.assertNotIn('configuration verified', out)

    def test_paused_job_does_not_silently_claim_an_active_sweep(self):
        desired = enabled_job()
        desired['state'] = 'PAUSED'
        status, _, err, _, calls = self.invoke(replies=[desired], arguments=['--execute'])
        self.assertEqual(status, 1)
        self.assertIn('paused', err)
        self.assertEqual(len(calls), 1)

    def test_disabled_job_is_rejected_even_with_matching_configuration(self):
        existing = enabled_job()
        existing['state'] = 'DISABLED'
        status, out, err, _, calls = self.invoke(replies=[existing], arguments=['--execute', '--run-now'])
        self.assertEqual(status, 1)
        self.assertIn('disabled', err)
        self.assertNotIn('configuration verified', out)
        self.assertEqual([r.method for r in calls], ['GET'])

    def test_update_failed_job_is_patched_even_with_matching_configuration(self):
        existing = enabled_job()
        existing['state'] = 'UPDATE_FAILED'
        status, out, _, _, calls = self.invoke(replies=[existing, enabled_job(), enabled_job()], arguments=['--execute'])
        self.assertEqual(status, 0)
        self.assertIn('"action": "update"', out)
        self.assertEqual([r.method for r in calls], ['GET', 'PATCH', 'GET'])

    def test_unknown_existing_states_are_rejected_without_writes(self):
        for state in ('STATE_UNSPECIFIED', 'FUTURE_STATE', None):
            with self.subTest(state=state):
                existing = enabled_job()
                if state is None:
                    existing.pop('state')
                else:
                    existing['state'] = state
                status, out, err, _, calls = self.invoke(replies=[existing], arguments=['--execute'])
                self.assertEqual(status, 1)
                self.assertIn('unknown or unsupported state', err)
                self.assertNotIn('configuration verified', out)
                self.assertEqual([r.method for r in calls], ['GET'])

    def test_matching_readback_must_be_enabled_before_run_now(self):
        for state in ('UPDATE_FAILED', 'DISABLED', 'PAUSED', None):
            with self.subTest(state=state):
                persisted = enabled_job()
                if state is None:
                    persisted.pop('state')
                else:
                    persisted['state'] = state
                status, out, err, _, calls = self.invoke(
                    replies=[self.not_found(), persisted, persisted], arguments=['--execute', '--run-now'],
                )
                self.assertEqual(status, 1)
                self.assertIn('not ENABLED', err)
                self.assertNotIn('configuration verified', out)
                self.assertEqual([r.method for r in calls], ['GET', 'POST', 'GET'])

    def test_failed_recovery_readback_does_not_claim_success(self):
        existing = enabled_job()
        existing['state'] = 'UPDATE_FAILED'
        status, out, err, _, calls = self.invoke(replies=[existing, existing, existing], arguments=['--execute'])
        self.assertEqual(status, 1)
        self.assertIn('not ENABLED', err)
        self.assertNotIn('configuration verified', out)
        self.assertEqual([r.method for r in calls], ['GET', 'PATCH', 'GET'])

    def test_run_now_requires_execute_before_any_cloud_call(self):
        with patch.object(provision.subprocess, 'run') as run, redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as failure:
                provision.main(ARGS + ['--run-now'])
            self.assertEqual(failure.exception.code, 2)
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
