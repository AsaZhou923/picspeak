from __future__ import annotations

import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class DeploymentMigrationContractTests(unittest.TestCase):
    def test_backend_image_contains_runtime_migrations(self) -> None:
        dockerfile = (REPO_ROOT / 'backend' / 'Dockerfile').read_text(encoding='utf-8')

        self.assertIn('COPY alembic ./alembic', dockerfile)
        self.assertIn('COPY alembic.ini ./alembic.ini', dockerfile)
        self.assertIn('COPY scripts/ensure_runtime_schema.py ./scripts/ensure_runtime_schema.py', dockerfile)
        self.assertNotIn('ensure_runtime_schema.py && uvicorn', dockerfile)

    def test_cloud_build_blocks_deploy_until_migration_succeeds(self) -> None:
        config = (REPO_ROOT / 'cloudbuild.yaml').read_text(encoding='utf-8')

        ordered_steps = [
            config.index('id: Build'),
            config.index('id: Push'),
            config.index('id: Migrate'),
            config.index('id: Deploy'),
        ]
        self.assertEqual(ordered_steps, sorted(ordered_steps))
        self.assertIn('--args=scripts/ensure_runtime_schema.py', config)
        self.assertIn('--set-secrets=DATABASE_URL=$_DATABASE_SECRET:latest', config)
        self.assertNotIn('APP_SECRET', config)
        self.assertRegex(config, re.compile(r'id: Migrate.*?jobs\s+- deploy', re.DOTALL))
        self.assertRegex(config, re.compile(r'id: Migrate.*?--execute-now.*?--wait', re.DOTALL))
        self.assertRegex(config, re.compile(r'id: Migrate.*?--wait', re.DOTALL))
        self.assertRegex(config, re.compile(r'id: Deploy.*?waitFor:\s+- Migrate', re.DOTALL))

    def test_manual_backend_deploy_uses_the_same_migration_gate(self) -> None:
        script = (REPO_ROOT / 'deploy' / 'deploy-backend.bat').read_text(encoding='utf-8')

        migrate_at = script.index('gcloud run jobs deploy %MIGRATION_JOB%')
        deploy_at = script.index('gcloud run deploy %SERVICE_NAME%')
        self.assertLess(migrate_at, deploy_at)
        self.assertIn('--execute-now ^', script)
        self.assertIn('--wait ^', script)
        self.assertIn('Service deployment was blocked', script)
        self.assertIn('Refusing to deploy from a dirty working tree', script)

    def test_ci_runs_real_postgres_migration_cycles(self) -> None:
        for workflow_name in ('ci.yml', 'pr-ci.yml'):
            workflow = (REPO_ROOT / '.github' / 'workflows' / workflow_name).read_text(encoding='utf-8')
            self.assertIn('image: postgres:17-alpine', workflow)
            self.assertIn('python scripts/ensure_runtime_schema.py', workflow)
            self.assertIn('python -m alembic downgrade 20260523_0003', workflow)
            self.assertIn('python -m alembic upgrade head', workflow)


if __name__ == '__main__':
    unittest.main()
