import sys
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import Settings, settings
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
            'postgresql+psycopg2://postgres:postgres@/picspeak?host=/cloudsql/proj:region:inst',
            'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak?host=prod-db.internal',
            'postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/picspeak?host=127.0.0.1,prod-db.internal',
            '',
        ):
            with self.subTest(database_url=db_url), self.assertRaises(ValueError):
                self._settings(app_env='dev', database_url=db_url, e2e_fake_ai_enabled=True)

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


if __name__ == '__main__':
    unittest.main()
