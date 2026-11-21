import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import REPO_ROOT, Settings, is_local_database_url, settings
from app.core.env_files import settings_env_files
from app.db.models import RateLimitCounter, UserPlan
from app.services.ai import (
    _run_canonical_scoring,
    _run_openai_review,
    _validate_canonical_score_contract,
    openai_review_profile_for_mode,
    run_ai_review,
)
from app.testing.fakes import (
    E2E_FAKE_FINAL_SCORE,
    E2E_FAKE_SCORES,
    FakeImageGenerationClient,
    assert_e2e_fake_ai_allowed,
)
from app.testing.seed_e2e import _issue_e2e_registered_jwt, _reset_guest_rate_limits, seed_e2e_fixtures


class E2EFakeGuardTestCase(unittest.TestCase):
    def _settings(self, **overrides) -> Settings:
        kwargs = {
            'database_url': 'sqlite:///:memory:',
            'app_secret': 'a' * 64,
            'oauth_jwt_secret': 'b' * 64,
            **overrides,
        }
        return Settings(_env_file=None, **kwargs)

    def test_e2e_fake_ai_disabled_by_default(self) -> None:
        cfg = self._settings()
        self.assertFalse(cfg.e2e_fake_ai_enabled)

    def test_settings_refuses_e2e_fake_ai_in_production(self) -> None:
        for env_name in ('production', 'PRODUCTION', ' prod '):
            with self.subTest(app_env=env_name), self.assertRaises(ValueError):
                self._settings(app_env=env_name, e2e_fake_ai_enabled=True)

    def test_settings_allows_e2e_fake_ai_in_dev(self) -> None:
        for db_url in (
            'sqlite:///:memory:',
            'sqlite:///picspeak-test.db',
            'postgresql+psycopg2://postgres:postgres@localhost:5432/picspeak_e2e',
            'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak_e2e',
            'postgresql+psycopg2://postgres:postgres@[::1]:5432/picspeak_e2e',
        ):
            with self.subTest(database_url=db_url):
                cfg = self._settings(app_env='dev', database_url=db_url, e2e_fake_ai_enabled=True)
                self.assertTrue(cfg.e2e_fake_ai_enabled)

    def test_settings_refuses_e2e_fake_ai_with_remote_database_even_in_dev(self) -> None:
        for db_url in (
            'postgresql+psycopg2://postgres:postgres@prod-db.internal:5432/picspeak',
            'postgresql+psycopg2://postgres:postgres@10.0.0.12:5432/picspeak',
            'postgresql+psycopg2://postgres:postgres@localhost.evil.example:5432/picspeak',
            'postgresql+psycopg2://localhost:secret@prod-db.example.com:5432/picspeak',
            'postgresql+psycopg2://postgres:postgres@/picspeak',
            'postgresql+psycopg2://postgres:postgres@/picspeak?host=/cloudsql/proj:region:inst',
            'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak?host=prod-db.internal',
            'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak?host=127.0.0.1,prod-db.internal',
            'postgresql+psycopg2://postgres:postgres@localhost:5432/picspeak?hostaddr=10.0.0.5',
            'postgresql+psycopg2://postgres:postgres@localhost:5432/picspeak?hostaddr=127.0.0.1,10.0.0.5',
            'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak?service=prod',
            'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak?servicefile=/etc/pg_service.conf',
            '',
        ):
            with self.subTest(database_url=db_url), self.assertRaises(ValueError):
                self._settings(app_env='dev', database_url=db_url, e2e_fake_ai_enabled=True)

    def test_locality_guard_rejects_non_loopback_pg_env_overrides(self) -> None:
        local_pg = 'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak_e2e'
        self.assertTrue(is_local_database_url(local_pg, environ={}))
        self.assertTrue(is_local_database_url(local_pg, environ={'PGHOST': '127.0.0.1', 'PGHOSTADDR': '127.0.0.1'}))
        self.assertTrue(
            is_local_database_url(
                'postgresql+psycopg2://postgres:postgres@localhost:5432/picspeak_e2e?hostaddr=127.0.0.1',
                environ={},
            )
        )

        for bad_env in (
            {'PGHOST': 'prod-db.internal'},
            {'PGHOST': '127.0.0.1,prod-db.internal'},
            {'PGHOST': '/cloudsql/proj:region:inst'},
            {'PGHOSTADDR': '10.0.0.5'},
            {'PGHOSTADDR': '127.0.0.1,10.0.0.5'},
            {'PGSERVICE': 'prod'},
            {'PGSERVICEFILE': '/tmp/pg_service.conf'},
        ):
            with self.subTest(env=bad_env):
                self.assertFalse(is_local_database_url(local_pg, environ=bad_env))
                with patch.dict(os.environ, bad_env, clear=False):
                    with self.assertRaises(ValueError):
                        self._settings(app_env='dev', database_url=local_pg, e2e_fake_ai_enabled=True)
                    with (
                        patch.object(settings, 'app_env', 'dev'),
                        patch.object(settings, 'e2e_fake_ai_enabled', True),
                        patch.object(settings, 'database_url', local_pg),
                    ):
                        with self.assertRaises(RuntimeError):
                            assert_e2e_fake_ai_allowed()
                        with self.assertRaises(RuntimeError):
                            _issue_e2e_registered_jwt(SimpleNamespace(public_id='usr_test', plan=UserPlan.free))

    def test_seed_e2e_refuses_without_disposable_database_marker(self) -> None:
        memory_engine = create_engine('sqlite:///:memory:')
        memory_session = sessionmaker(bind=memory_engine, autoflush=False, autocommit=False)
        with (
            patch.object(settings, 'app_env', 'dev'),
            patch.object(settings, 'e2e_fake_ai_enabled', True),
            patch.object(settings, 'database_url', 'sqlite:///:memory:'),
            patch('app.testing.seed_e2e.SessionLocal', memory_session),
            patch('app.testing.seed_e2e.ensure_storage_bucket', MagicMock()) as ensure_bucket,
        ):
            with self.assertRaisesRegex(RuntimeError, '_picspeak_e2e_disposable_marker'):
                seed_e2e_fixtures(reset_guest_limits=True)
            ensure_bucket.assert_not_called()

    def test_reset_guest_rate_limits_only_removes_literal_guest_prefix(self) -> None:
        memory_engine = create_engine('sqlite:///:memory:')
        RateLimitCounter.__table__.create(memory_engine)
        memory_session = sessionmaker(bind=memory_engine, autoflush=False, autocommit=False)
        window_start = datetime(2026, 11, 21, tzinfo=timezone.utc)
        scopes = [
            'guest_review_daily',
            'guest_api_minute',
            'guestbook',
            'guestbook_entry_minute',
            'guestXreview_daily',
            'registered_api_minute',
        ]
        db = memory_session()
        try:
            for index, scope in enumerate(scopes, start=1):
                db.add(RateLimitCounter(
                    id=index,
                    scope=scope,
                    scope_key='key',
                    endpoint=None,
                    window_start=window_start,
                    window_seconds=60,
                    hit_count=1,
                ))
            db.commit()

            deleted = _reset_guest_rate_limits(db)
            db.commit()

            remaining = sorted(scope for (scope,) in db.query(RateLimitCounter.scope).all())
        finally:
            db.close()
        self.assertEqual(deleted, 2)
        self.assertEqual(
            remaining,
            ['guestXreview_daily', 'guestbook', 'guestbook_entry_minute', 'registered_api_minute'],
        )

    def test_runtime_guard_refuses_when_app_env_is_production(self) -> None:
        with (
            patch.object(settings, 'app_env', 'production'),
            patch.object(settings, 'e2e_fake_ai_enabled', True),
            patch.object(settings, 'database_url', 'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak_e2e'),
        ):
            with self.assertRaises(RuntimeError):
                assert_e2e_fake_ai_allowed()
            with self.assertRaises(RuntimeError):
                run_ai_review('flash', image_url='http://127.0.0.1:9000/test.jpg', review_model='gpt-6-sol')
            with self.assertRaises(RuntimeError):
                FakeImageGenerationClient()

    def test_runtime_guard_refuses_remote_database_even_when_app_env_is_dev(self) -> None:
        for db_url in (
            'postgresql+psycopg2://postgres:postgres@prod-db.internal:5432/picspeak',
            'postgresql+psycopg2://postgres:postgres@/picspeak?host=/cloudsql/proj:region:inst',
            'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak?host=prod-db.internal',
            'postgresql+psycopg2://postgres:postgres@localhost:5432/picspeak?hostaddr=10.0.0.5',
            'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak?service=prod',
        ):
            with (
                self.subTest(database_url=db_url),
                patch.object(settings, 'app_env', 'dev'),
                patch.object(settings, 'e2e_fake_ai_enabled', True),
                patch.object(settings, 'database_url', db_url),
            ):
                with self.assertRaises(RuntimeError):
                    assert_e2e_fake_ai_allowed()
                with self.assertRaises(RuntimeError):
                    run_ai_review('flash', image_url='http://127.0.0.1:9000/test.jpg', review_model='gpt-6-sol')
                with self.assertRaises(RuntimeError):
                    FakeImageGenerationClient()
                with self.assertRaises(RuntimeError):
                    seed_e2e_fixtures()
                with self.assertRaises(RuntimeError):
                    _issue_e2e_registered_jwt(SimpleNamespace(public_id='usr_test', plan=UserPlan.free))

    def test_runtime_guard_refuses_when_flag_is_false(self) -> None:
        with (
            patch.object(settings, 'app_env', 'dev'),
            patch.object(settings, 'e2e_fake_ai_enabled', False),
        ):
            with self.assertRaises(RuntimeError):
                assert_e2e_fake_ai_allowed()
            with self.assertRaises(RuntimeError):
                FakeImageGenerationClient()

    def test_fake_ai_review_entry_points_return_valid_contract(self) -> None:
        checkpointed = []
        with (
            patch.object(settings, 'app_env', 'dev'),
            patch.object(settings, 'e2e_fake_ai_enabled', True),
            patch.object(settings, 'database_url', 'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak_e2e'),
        ):
            profile = openai_review_profile_for_mode('flash')
            score = _run_canonical_scoring(
                image_url='http://127.0.0.1:9000/test.jpg',
                exif_data=None,
                image_type='default',
                profile=profile,
            )
            _validate_canonical_score_contract(
                score,
                expected_model_name=profile.scorer_model_name,
                expected_scorer_reasoning_effort=profile.scorer_reasoning_effort,
            )
            self.assertEqual(score.final_score, E2E_FAKE_FINAL_SCORE)
            self.assertEqual(score.scores, E2E_FAKE_SCORES)

            response = run_ai_review(
                'flash',
                image_url='http://127.0.0.1:9000/test.jpg',
                locale='en',
                image_type='default',
                review_model='gpt-6-sol',
                on_canonical_score=checkpointed.append,
            )
            self.assertEqual(len(checkpointed), 1)
            self.assertEqual(response.result.final_score, E2E_FAKE_FINAL_SCORE)
            self.assertEqual(response.result.scores, E2E_FAKE_SCORES)
            self.assertTrue(response.result.advantage)
            self.assertTrue(response.result.critique)
            self.assertTrue(response.result.suggestions)

            openai_response = _run_openai_review(
                mode='flash',
                image_url='http://127.0.0.1:9000/test.jpg',
                locale='en',
                exif_data=None,
                image_type='default',
                enforce_suggestion_structure=True,
                canonical_score=score,
                on_canonical_score=None,
            )
            self.assertEqual(openai_response.result.final_score, E2E_FAKE_FINAL_SCORE)

    def test_fake_image_generation_client_returns_valid_image_bytes(self) -> None:
        with (
            patch.object(settings, 'app_env', 'dev'),
            patch.object(settings, 'e2e_fake_ai_enabled', True),
            patch.object(settings, 'database_url', 'sqlite:///:memory:'),
        ):
            client = FakeImageGenerationClient()
            result = client.generate(
                prompt='Early morning street photography reference',
                quality='low',
                size='1024x1536',
                output_format='webp',
            )
            self.assertEqual(result.content_type, 'image/webp')
            self.assertGreater(len(result.image_bytes), 100)
            with Image.open(BytesIO(result.image_bytes)) as img:
                self.assertEqual(img.format, 'WEBP')
                self.assertEqual(img.size, (256, 384))


# A complete, valid configuration, so a leak shows up as values rather than a crash.
_POISONED_DOTENV = (
    'APP_SECRET=poisoned-app-secret-0123456789abcdef0123456789abcdef\n'
    'OAUTH_JWT_SECRET=poisoned-jwt-secret-0123456789abcdef0123456789abcdef\n'
    'CLOUD_TASKS_ENABLED=true\n'
    'CLOUD_TASKS_PROJECT_ID=poisoned\n'
    'CLOUD_TASKS_LOCATION=poisoned\n'
    'CLOUD_TASKS_QUEUE=poisoned\n'
    'CLOUD_TASKS_TARGET_URL=https://poisoned.example.invalid/tasks\n'
    'CLOUD_TASKS_SECRET=poisoned-cloud-tasks-secret-0123456789abcdef\n'
    'REVIEW_WORKER_NAME=poisoned-dotenv\n'
    'GUEST_REVIEW_LIMIT_PER_DAY=99\n'
    'DATABASE_URL=postgresql+psycopg2://u:p@db.example.com:5432/prod\n'
)
_PROBE = (
    'import json\n'
    'from app.core.config import settings\n'
    'from app.db import bootstrap\n'
    'print(json.dumps({"cloud_tasks_enabled": settings.cloud_tasks_enabled, '
    '"review_worker_name": settings.review_worker_name, '
    '"guest_review_limit_per_day": settings.guest_review_limit_per_day, '
    '"migration_database_url": bootstrap._database_url()}))\n'
)


class DotenvIsolationTestCase(unittest.TestCase):
    def test_settings_env_files_honours_disable_flag(self) -> None:
        paths = ('.env', 'backend/.env')
        self.assertEqual(settings_env_files(paths, {}), paths)
        self.assertEqual(settings_env_files(paths, {'PICSPEAK_DISABLE_DOTENV': '0'}), paths)
        for value in ('1', 'true', 'YES'):
            self.assertIsNone(settings_env_files(paths, {'PICSPEAK_DISABLE_DOTENV': value}))

    def _probe(self, cwd: str, *, disable_dotenv: bool) -> dict:
        env = {key: value for key, value in os.environ.items() if key.upper() in {'PATH', 'SYSTEMROOT', 'TEMP', 'TMP'}}
        env['PYTHONPATH'] = str(BACKEND_ROOT)
        if disable_dotenv:
            env['PICSPEAK_DISABLE_DOTENV'] = '1'
        completed = subprocess.run(
            [sys.executable, '-c', _PROBE],
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
            check=True,
        )
        return json.loads(completed.stdout.strip().splitlines()[-1])

    def test_disable_flag_ignores_poisoned_dotenv_for_app_and_migration_settings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, '.env').write_text(_POISONED_DOTENV, encoding='utf-8')
            values = self._probe(tmp, disable_dotenv=True)
        self.assertEqual(
            values,
            {
                'cloud_tasks_enabled': False,
                'review_worker_name': 'embedded-worker',
                'guest_review_limit_per_day': 1,
                'migration_database_url': 'postgresql+psycopg2://postgres:postgres@localhost:5432/aipingtubackend',
            },
        )

    def test_poisoned_dotenv_is_loaded_without_disable_flag(self) -> None:
        # Control: proves the probe would detect a leak. Skipped when a real
        # developer dotenv (loaded with higher priority) could mask the result.
        if (REPO_ROOT / '.env').exists() or (BACKEND_ROOT / '.env').exists():
            self.skipTest('a developer dotenv file overrides the temporary one')
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, '.env').write_text(_POISONED_DOTENV, encoding='utf-8')
            values = self._probe(tmp, disable_dotenv=False)
        self.assertTrue(values['cloud_tasks_enabled'])
        self.assertEqual(values['review_worker_name'], 'poisoned-dotenv')
        self.assertIn('db.example.com', values['migration_database_url'])


if __name__ == '__main__':
    unittest.main()
