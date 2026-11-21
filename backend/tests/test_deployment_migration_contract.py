from __future__ import annotations

import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / 'deploy' / 'cloud-run-env.yaml'
ENV_RENDERER = REPO_ROOT / 'deploy' / 'render-cloud-run-env.py'

# Exact production --update-env-vars fixture preserved across the single-source refactor.
EXPECTED_PRODUCTION_UPDATE_ENV_VARS = (
    'OPENAI_SCORE_MODEL=gpt-6-sol,OPENAI_REVIEW_MODEL=gpt-6-sol,RETAKE_ANALYSIS_MODEL=gpt-6.1-sol,'
    'OPENAI_SCORE_REASONING_EFFORT=low,OPENAI_REVIEW_REASONING_EFFORT=low,'
    'RETAKE_ANALYSIS_REASONING_EFFORT=high,OPENAI_PRO_MODEL=gpt-6.1-sol,'
    'OPENAI_PRO_REASONING_EFFORT=high,NOTIFICATIONS_READ_ENABLED=true,NOTIFICATIONS_EVENT_CAPTURE_ENABLED=true,NOTIFICATIONS_WORKER_ENABLED=true,'
    'LEMONSQUEEZY_CHECKOUT_TEST_MODE=false,LEMONSQUEEZY_WEBHOOK_TEST_MODE=false,'
    'LEMONSQUEEZY_PRO_ONE_TIME_CHECKOUT_URL=https://picspeak.lemonsqueezy.com/checkout/buy/c2fbdd32-49e0-4dd6-9924-4d85d5e27522,'
    'LEMONSQUEEZY_PRO_ONE_TIME_VARIANT_ID=1445229,'
    'GUEST_REVIEW_LIMIT_PER_DAY=1,PRO_REVIEW_SOFT_LIMIT_PER_MONTH=150,PRO_REVIEW_SOFT_LIMIT_RATE_PER_MINUTE=2'
)


def _cloud_build_steps(config: str) -> dict[str, list[str] | None]:
    """Return step ids in order with their waitFor lists (None when omitted)."""
    steps: dict[str, list[str] | None] = {}
    current: str | None = None
    in_wait_for = False
    for line in config[config.index('\nsteps:\n') : config.index('\nimages:\n')].splitlines():
        step_match = re.fullmatch(r'  - id: (\S+)', line)
        if step_match:
            current = step_match.group(1)
            steps[current] = None
            in_wait_for = False
        elif current is not None and line == '    waitFor:':
            steps[current] = []
            in_wait_for = True
        elif in_wait_for and (item := re.fullmatch(r"      - '?([^']+)'?", line)):
            steps[current].append(item.group(1))
        else:
            in_wait_for = False
    return steps


def _cloud_build_substitute(text: str, values: dict[str, str]) -> str:
    """Apply one Cloud Build substitution pass: $$ escapes, $VAR and ${VAR} expand."""

    def replace(match: re.Match[str]) -> str:
        if match.group(0) == '$$':
            return '$'
        name = match.group(1) or match.group(2)
        return values.get(name, match.group(0))

    return re.sub(r'\$\$|\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)', replace, text)


def _load_env_renderer_module():
    spec = importlib.util.spec_from_file_location('render_cloud_run_env', ENV_RENDERER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DeploymentMigrationContractTests(unittest.TestCase):
    def test_backend_image_contains_runtime_migrations_scripts_and_non_root_user(self) -> None:
        dockerfile = (REPO_ROOT / 'backend' / 'Dockerfile').read_text(encoding='utf-8')

        self.assertIn('COPY alembic ./alembic', dockerfile)
        self.assertIn('COPY alembic.ini ./alembic.ini', dockerfile)
        self.assertIn('COPY scripts ./scripts', dockerfile)
        self.assertNotIn('ensure_runtime_schema.py && uvicorn', dockerfile)
        self.assertIn('--uid 10001', dockerfile)
        self.assertIn('USER 10001:10001', dockerfile)
        self.assertIn('PORT=8080', dockerfile)
        self.assertIn('EXPOSE 8080', dockerfile)

        for script_name in (
            'ensure_runtime_schema.py',
            'purge_expired_objects.py',
            'purge_expired_review_history.py',
            'reconcile_billing.py',
            'manage_announcements.py',
            'reconcile_guest_migrations.py',
        ):
            self.assertTrue((REPO_ROOT / 'backend' / 'scripts' / script_name).is_file(), script_name)

    def test_cloud_build_blocks_deploy_until_migration_succeeds(self) -> None:
        config = (REPO_ROOT / 'cloudbuild.yaml').read_text(encoding='utf-8')

        ordered_steps = [
            config.index('id: BranchGuard'),
            config.index('id: Pull'),
            config.index('id: Build'),
            config.index('id: Push'),
            config.index('id: Migrate'),
            config.index('id: RenderEnv'),
            config.index('id: Deploy'),
        ]
        self.assertEqual(ordered_steps, sorted(ordered_steps))
        self.assertIn('--args=scripts/ensure_runtime_schema.py', config)
        self.assertIn('--set-secrets=DATABASE_URL=$_DATABASE_SECRET:latest', config)
        self.assertNotIn('APP_SECRET', config)
        self.assertRegex(config, re.compile(r'id: Migrate.*?jobs\s+- deploy', re.DOTALL))
        self.assertRegex(config, re.compile(r'id: Migrate.*?--execute-now.*?--wait', re.DOTALL))
        self.assertRegex(config, re.compile(r'id: Migrate.*?--wait', re.DOTALL))
        self.assertRegex(
            config,
            re.compile(r'id: Deploy.*?waitFor:\s+- Migrate\s+- RenderEnv', re.DOTALL),
        )

    def test_cloud_build_branch_guard_runs_first_and_gates_every_step(self) -> None:
        config = (REPO_ROOT / 'cloudbuild.yaml').read_text(encoding='utf-8')
        steps = _cloud_build_steps(config)

        self.assertEqual(
            list(steps),
            ['BranchGuard', 'Pull', 'Build', 'Push', 'Migrate', 'RenderEnv', 'Deploy'],
        )
        self.assertIsNone(steps['BranchGuard'])
        self.assertEqual(steps['Pull'], ['BranchGuard'])
        self.assertEqual(steps['RenderEnv'], ['BranchGuard'])
        self.assertNotIn("- '-'", config)
        self.assertIn("_ALLOW_NON_MAIN_DEPLOY: 'false'", config)

        # A step without waitFor waits on every earlier step; '-' would start immediately.
        ids = list(steps)
        for index, step_id in enumerate(ids[1:], start=1):
            with self.subTest(step=step_id):
                seen: set[str] = set()
                pending = [step_id]
                while pending:
                    name = pending.pop()
                    deps = steps[name]
                    deps = ids[: ids.index(name)] if deps is None else deps
                    self.assertNotIn('-', deps)
                    for dep in deps:
                        self.assertIn(dep, steps)
                        if dep not in seen:
                            seen.add(dep)
                            pending.append(dep)
                self.assertIn('BranchGuard', seen)

    def test_cloud_build_branch_guard_refuses_non_main_builds(self) -> None:
        bash = shutil.which('bash')
        if bash is None:
            self.skipTest('bash is not available')
        config = (REPO_ROOT / 'cloudbuild.yaml').read_text(encoding='utf-8')
        guard = config[config.index('id: BranchGuard') : config.index('  - id: Pull')]
        block = guard[guard.index('- |\n') + len('- |\n') :].rstrip()
        script = '\n'.join(line.removeprefix(' ' * 8) for line in block.splitlines()) + '\n'

        # Substituted values must reach bash only through env, never as script source.
        env_section = guard[guard.index('    env:\n') : guard.index('    args:\n')]
        env_entries = re.findall(r'      - (\S+)', env_section)
        self.assertEqual(
            env_entries,
            ['GUARD_BRANCH=$BRANCH_NAME', 'GUARD_ALLOW=$_ALLOW_NON_MAIN_DEPLOY'],
        )
        self.assertIn('"$$GUARD_BRANCH"', script)
        self.assertIn('"$$GUARD_ALLOW"', script)
        self.assertNotRegex(script, r'(?<!\$)\$\{?(BRANCH_NAME|_ALLOW_NON_MAIN_DEPLOY)\b')
        self.assertNotRegex(script, r'(?<!\$)\$\{?GUARD_')

        cases = (
            ('main', 'false', 0),
            ('test/e2e-main-flow', 'false', 1),
            ('test/e2e-main-flow', 'true', 1),
            ('main-hotfix', 'false', 1),
            ('', 'false', 1),
            ('', 'true', 0),
            ('x";exit 0;"', 'false', 1),
            ('x";exit 0;"', 'true', 1),
            ("x';exit 0;'", 'false', 1),
            ('$(true)', 'false', 1),
            ('`true`', 'false', 1),
            ('main$(false)', 'false', 1),
            ('main`false`', 'false', 1),
            ('main;exit 0', 'false', 1),
            ('${GUARD_ALLOW}', 'true', 1),
        )
        for branch, allow, expected in cases:
            with self.subTest(branch=branch, allow=allow):
                values = {'BRANCH_NAME': branch, '_ALLOW_NON_MAIN_DEPLOY': allow}
                rendered = _cloud_build_substitute(script, values)
                self.assertEqual(rendered, _cloud_build_substitute(script, {}))
                env = dict(os.environ)
                for entry in env_entries:
                    key, _, value = _cloud_build_substitute(entry, values).partition('=')
                    env[key] = value
                completed = subprocess.run(
                    [bash, '-ceu', rendered],
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    env=env,
                    check=False,
                )
                self.assertEqual(completed.returncode, expected, completed.stderr)
                if expected:
                    self.assertIn('BranchGuard: refusing to deploy', completed.stderr)

    def test_manual_backend_deploy_uses_the_same_migration_gate_and_relative_path(self) -> None:
        script = (REPO_ROOT / 'deploy' / 'deploy-backend.bat').read_text(encoding='utf-8')

        migrate_at = script.index('gcloud run jobs deploy %MIGRATION_JOB%')
        deploy_at = script.index('gcloud run deploy %SERVICE_NAME%')
        self.assertLess(migrate_at, deploy_at)
        self.assertIn('--execute-now ^', script)
        self.assertIn('--wait ^', script)
        self.assertIn('Service deployment was blocked', script)
        self.assertIn('Refusing to deploy from a dirty working tree', script)
        self.assertIn('cd /d "%~dp0..\\backend"', script)
        self.assertNotIn('E:\\Project Code', script)
        self.assertNotIn('ENV_RENDER_TMP', script)
        self.assertNotIn('%RANDOM%', script)

    def test_deploy_paths_activate_review_profiles_live_payments_and_usage_policy(self) -> None:
        config = (REPO_ROOT / 'cloudbuild.yaml').read_text(encoding='utf-8')
        script = (REPO_ROOT / 'deploy' / 'deploy-backend.bat').read_text(encoding='utf-8')
        renderer = _load_env_renderer_module()

        self.assertTrue(ENV_FILE.is_file())
        self.assertTrue(ENV_RENDERER.is_file())

        # Both deployment paths must read the single env file through the shared renderer
        # and keep --update-env-vars semantics (never --env-vars-file, which replaces all vars).
        self.assertNotIn('--env-vars-file', config)
        self.assertNotIn('--env-vars-file', script)

        render_section = config[config.index('id: RenderEnv') : config.index('id: Deploy')]
        deploy_section = config[config.index('id: Deploy') : config.index('images:')]

        self.assertIn('name: python:3.11-slim', render_section)
        self.assertIn(
            'python deploy/render-cloud-run-env.py deploy/cloud-run-env.yaml > /workspace/cloud-run-env.rendered',
            render_section,
        )
        self.assertIn('name: gcr.io/google.com/cloudsdktool/cloud-sdk:slim', deploy_section)
        self.assertIn('UPDATE_ENV_VARS="$$(cat /workspace/cloud-run-env.rendered)"', deploy_section)
        self.assertIn('test -n "$$UPDATE_ENV_VARS"', deploy_section)
        self.assertIn('"--update-env-vars=$$UPDATE_ENV_VARS"', deploy_section)
        self.assertNotIn('python', deploy_section)

        self.assertIn('render-cloud-run-env.py', script)
        self.assertIn('cloud-run-env.yaml', script)
        self.assertIn('"--update-env-vars=%UPDATE_ENV_VARS%" ^', script)
        self.assertNotIn('OPENAI_SCORE_MODEL=', config)
        self.assertNotIn('OPENAI_SCORE_MODEL=', script)

        # Verify both in-process parsing and CLI output match the exact deployed fixture
        # without any trailing/embedded newline or CR issues.
        rendered = renderer.load_and_render(ENV_FILE)
        self.assertEqual(rendered, EXPECTED_PRODUCTION_UPDATE_ENV_VARS)
        self.assertNotIn('\n', rendered)
        self.assertNotIn('\r', rendered)
        completed = subprocess.run(
            [sys.executable, str(ENV_RENDERER), str(ENV_FILE)],
            capture_output=True,
            text=True,
            encoding='utf-8',
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stdout.rstrip('\n'), EXPECTED_PRODUCTION_UPDATE_ENV_VARS)
        self.assertNotIn('\r', completed.stdout)
        self.assertNotIn('\n', completed.stdout.rstrip('\n'))

    def test_env_renderer_handles_special_values_and_rejects_malformed_input(self) -> None:
        renderer = _load_env_renderer_module()

        entries_with_equals = renderer.parse_env_yaml('A: "x=1"\nB: "y"\n')
        self.assertEqual(renderer.render_update_env_vars(entries_with_equals), 'A=x=1,B=y')

        entries_with_comma = renderer.parse_env_yaml('CORS: "https://a.example,https://b.example"\nMODE: "prod"\n')
        self.assertEqual(
            renderer.render_update_env_vars(entries_with_comma),
            '^@^CORS=https://a.example,https://b.example@MODE=prod',
        )

        entries_with_comma_and_at = renderer.parse_env_yaml('LIST: "a@b,c@d"\nFLAG: "true"\n')
        self.assertEqual(
            renderer.render_update_env_vars(entries_with_comma_and_at),
            '^|^LIST=a@b,c@d|FLAG=true',
        )

        for invalid in (
            '',
            '# comment only\n',
            'KEY: "1"\nKEY: "2"\n',
            'nested:\n  CHILD: "1"\n',
            'lower_key: "1"\n',
            'MISSING_VALUE:\n',
            'QUOTED_SINGLE: \'say "hi there"\'\n',
            'QUOTED_DOUBLE: "say \\"hi there\\""\n',
        ):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    renderer.parse_env_yaml(invalid)

        with self.assertRaises(ValueError):
            renderer.render_update_env_vars([('A', 'say "hi"')])

        with tempfile.TemporaryDirectory() as tmpdir:
            bad_yaml = Path(tmpdir) / 'bad.yaml'
            bad_yaml.write_text('A: \'say "hi there"\'\n', encoding='utf-8')
            completed = subprocess.run(
                [sys.executable, str(ENV_RENDERER), str(bad_yaml)],
                capture_output=True,
                text=True,
                encoding='utf-8',
                check=False,
            )
            self.assertEqual(completed.returncode, 1)
            self.assertIn('double quotes', completed.stderr.lower())

    def test_cloud_run_jobs_doc_covers_operator_scripts_with_safety_gates(self) -> None:
        doc = (REPO_ROOT / 'deploy' / 'cloud-run-jobs.md').read_text(encoding='utf-8')

        self.assertIn('picspeak-supabase-database-url', doc)
        self.assertIn('gcloud run jobs deploy', doc)
        self.assertIn('gcloud run jobs execute', doc)
        self.assertIn('gcloud run jobs update', doc)
        self.assertIn('--update-secrets="/secrets/announcement/spec.json=', doc)
        self.assertNotIn('--set-secrets="/secrets/announcement/spec.json=', doc)
        for token in (
            'APP_ENV=production',
            'APP_SECRET=',
            'OAUTH_JWT_SECRET=',
            'NOTIFICATIONS_READ_ENABLED=true',
            'NOTIFICATIONS_EVENT_CAPTURE_ENABLED=true',
            'NOTIFICATIONS_WORKER_ENABLED=true',
            'ANNOUNCEMENT_PUBLISH_ENABLED=true',
            'import-update',
            'purge_expired_objects.py',
            'PICSPEAK_RETENTION_EXECUTE=1',
            'purge_expired_review_history.py',
            'PICSPEAK_HISTORY_NOTICE_EXECUTE=1',
            'PICSPEAK_HISTORY_PURGE_EXECUTE=1',
            'reconcile_billing.py',
            'manage_announcements.py',
            'PICSPEAK_ANNOUNCEMENT_EXECUTE=1',
            'reconcile_guest_migrations.py',
            'PICSPEAK_GUEST_RECONCILE_EXECUTE=1',
        ):
            self.assertIn(token, doc)

    def test_ci_runs_real_postgres_migration_cycles(self) -> None:
        workflow = (REPO_ROOT / '.github' / 'workflows' / 'ci.yml').read_text(encoding='utf-8')
        self.assertFalse((REPO_ROOT / '.github' / 'workflows' / 'pr-ci.yml').exists())
        self.assertIn('image: postgres:17-alpine', workflow)
        self.assertIn('python scripts/ensure_runtime_schema.py', workflow)
        self.assertIn('python -m alembic downgrade 20260523_0003', workflow)
        self.assertIn('python -m alembic upgrade head', workflow)


if __name__ == '__main__':
    unittest.main()
