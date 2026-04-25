from __future__ import annotations

import sys
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_current_actor  # noqa: E402
from app.api.routers.generations import _generation_item_payload  # noqa: E402
from app.db.models import User, UserPlan, UserStatus  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402


class ImageGenerationRoutesTests(unittest.TestCase):
    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    @contextmanager
    def _client(self):
        with patch('app.main.worker.start'), patch('app.main.worker.stop'):
            with TestClient(app) as client:
                yield client

    def _install_actor(self, plan: UserPlan) -> tuple[MagicMock, User]:
        db = MagicMock()
        user = User(
            id=7,
            public_id='usr_generation',
            email='generation@example.com',
            username='generation_user',
            plan=plan,
            daily_quota_total=0,
            daily_quota_used=0,
            status=UserStatus.active,
        )

        def override_db():
            yield db

        def override_actor():
            return SimpleNamespace(user=user, plan=plan)

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor
        return db, user

    def test_guest_can_view_templates_but_cannot_create_generation(self) -> None:
        self._install_actor(UserPlan.guest)

        with self._client() as client:
            templates = client.get('/api/v1/generations/templates')
            response = client.post(
                '/api/v1/generations',
                json={
                    'generation_mode': 'general',
                    'intent': 'social_visual',
                    'prompt': 'cinematic rainy street portrait',
                    'template_key': 'social_visual',
                    'quality': 'low',
                    'size': '1024x1024',
                    'output_format': 'webp',
                    'async': True,
                },
            )

        self.assertEqual(templates.status_code, 200)
        self.assertGreaterEqual(len(templates.json()['items']), 5)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['error']['code'], 'GENERATION_LOGIN_REQUIRED')

    def test_free_users_are_limited_to_low_quality(self) -> None:
        self._install_actor(UserPlan.free)

        with self._client() as client:
            response = client.post(
                '/api/v1/generations',
                json={
                    'generation_mode': 'general',
                    'intent': 'photo_inspiration',
                    'prompt': 'golden hour street photo inspiration',
                    'template_key': 'photo_inspiration',
                    'quality': 'medium',
                    'size': '1024x1024',
                    'output_format': 'webp',
                    'async': True,
                },
            )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['error']['code'], 'GENERATION_QUALITY_FORBIDDEN')

    def test_pro_user_creates_general_generation_task(self) -> None:
        db, _user = self._install_actor(UserPlan.pro)
        db.query.return_value.filter.return_value.first.return_value = None

        with self._client() as client:
            response = client.post(
                '/api/v1/generations',
                json={
                    'generation_mode': 'general',
                    'intent': 'social_visual',
                    'prompt': 'cinematic rainy street portrait with neon reflections',
                    'template_key': 'social_visual',
                    'quality': 'medium',
                    'size': '1024x1536',
                    'output_format': 'webp',
                    'async': True,
                    'idempotency_key': 'gen-idempotency-1',
                },
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['status'], 'PENDING')
        self.assertTrue(body['task_id'].startswith('igt_'))
        self.assertEqual(body['credits_reserved'], 8)
        db.add.assert_called()
        db.commit.assert_called()

    def test_generation_payload_exposes_source_photo_and_review_public_ids(self) -> None:
        db = MagicMock()
        photo_query = MagicMock()
        photo_query.filter.return_value.first.return_value = ('pho_source',)
        review_query = MagicMock()
        review_query.filter.return_value.first.return_value = ('rev_source',)
        db.query.side_effect = [photo_query, review_query]
        image = SimpleNamespace(
            public_id='gen_source',
            task=None,
            object_key='generated/user_usr/2026/04/gen_source.webp',
            generation_mode='review_linked',
            intent='retake_reference',
            prompt='final structured prompt',
            revised_prompt=None,
            model_name='gpt-image-2',
            model_snapshot='gpt-image-2-2026-04-21',
            quality='medium',
            size='1024x1536',
            output_format='webp',
            credits_charged=8,
            template_key=None,
            source_photo_id=11,
            source_review_id=22,
            created_at=datetime.now(timezone.utc),
            metadata_json={'user_prompt': 'next shoot reference'},
        )

        payload = _generation_item_payload(db, image)

        self.assertEqual(payload.source_photo_id, 'pho_source')
        self.assertEqual(payload.source_review_id, 'rev_source')
        self.assertEqual(payload.prompt, 'next shoot reference')


if __name__ == '__main__':
    unittest.main()
