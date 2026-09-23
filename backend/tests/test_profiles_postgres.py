from __future__ import annotations

import os
import subprocess
import sys
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_db
from app.api.routers import photos, profiles
from app.core.security import create_access_token
from app.db.models import Photo, PhotoStatus, Review, ReviewLike, ReviewMode, ReviewStatus, User, UserPlan, UserStatus

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class PublicProfilesPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.connection = self.engine.connect()
        self.transaction = self.connection.begin()
        self.Session = sessionmaker(bind=self.connection, autoflush=False, autocommit=False)
        self.app = FastAPI()
        api_router = APIRouter(prefix='/api/v1')
        api_router.include_router(photos.router)
        api_router.include_router(profiles.router)
        self.app.include_router(api_router)

        def override_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[get_db] = override_db
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.app.dependency_overrides.clear()
        self.transaction.rollback()
        self.connection.close()
        self.engine.dispose()

    def _token(self, user: User) -> str:
        return create_access_token({'sub': user.public_id, 'plan': user.plan.value, 'role': 'user'})

    def _user(self, suffix: str, *, enabled: bool = False, active: bool = True) -> User:
        db = self.Session()
        try:
            user = User(
                public_id=f'usr_prof_{suffix}',
                email=f'profile_{suffix}@example.test',
                username=f'profile_{suffix}',
                plan=UserPlan.free,
                daily_quota_total=5,
                daily_quota_used=0,
                status=UserStatus.active if active else UserStatus.suspended,
                public_profile_id=f'upp_{suffix}' if enabled else None,
                public_profile_enabled=enabled,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
        finally:
            db.close()

    def _review(
        self,
        user: User,
        suffix: str,
        *,
        visible: bool = True,
        approved: bool = True,
        deleted: bool = False,
        review_status: ReviewStatus = ReviewStatus.SUCCEEDED,
        photo_status: PhotoStatus = PhotoStatus.READY,
        owner_mismatch: bool = False,
        added_at: datetime | None = None,
    ) -> Review:
        db = self.Session()
        try:
            owner_id = user.id
            if owner_mismatch:
                other = self._user(f'{suffix}_other')
                owner_id = other.id
            photo = Photo(
                public_id=f'pho_prof_{suffix}',
                owner_user_id=owner_id,
                upload_id=f'upl_prof_{suffix}',
                bucket='test',
                object_key=f'test/profile/{suffix}.jpg',
                content_type='image/jpeg',
                size_bytes=1234,
                status=photo_status,
                exif_data={'camera': 'private'},
                client_meta={},
            )
            db.add(photo)
            db.flush()
            published_at = added_at or datetime(2036, 1, 1, 12, 0, tzinfo=timezone.utc)
            review = Review(
                public_id=f'rev_prof_{suffix}',
                photo_id=photo.id,
                owner_user_id=user.id,
                mode=ReviewMode.pro,
                status=review_status,
                image_type='portrait',
                schema_version='1.0',
                result_json={'score_version': 'score-v5', 'advantage': 'private result body'},
                final_score=Decimal('8.40'),
                is_public=True,
                share_token=f'share_{suffix}',
                gallery_visible=visible,
                gallery_audit_status='approved' if approved else 'rejected',
                gallery_added_at=published_at,
                gallery_rejected_reason=None if approved else 'quality',
                tags_json=['private-tag'],
                note='private note',
                deleted_at=published_at if deleted else None,
                created_at=published_at,
            )
            db.add(review)
            db.commit()
            db.refresh(review)
            return review
        finally:
            db.close()

    def test_owner_enable_disable_keeps_stable_id_and_public_page_fails_closed(self) -> None:
        user = self._user(uuid4().hex[:10])
        token = self._token(user)

        enabled = self.client.patch(
            '/api/v1/profiles/me',
            headers={'Authorization': f'Bearer {token}'},
            json={'public_profile_enabled': True},
        )
        self.assertEqual(enabled.status_code, 200)
        public_profile_id = enabled.json()['public_profile_id']
        self.assertTrue(public_profile_id.startswith('upp_'))

        disabled = self.client.patch(
            '/api/v1/profiles/me',
            headers={'Authorization': f'Bearer {token}'},
            json={'public_profile_enabled': False},
        )
        self.assertEqual(disabled.status_code, 200)
        self.assertIsNone(disabled.json()['public_profile_id'])

        reenabled = self.client.patch(
            '/api/v1/profiles/me',
            headers={'Authorization': f'Bearer {token}'},
            json={'public_profile_enabled': True},
        )
        self.assertEqual(reenabled.status_code, 200)
        self.assertEqual(reenabled.json()['public_profile_id'], public_profile_id)

        self.client.patch(
            '/api/v1/profiles/me',
            headers={'Authorization': f'Bearer {token}'},
            json={'public_profile_enabled': False},
        )
        hidden = self.client.get(f'/api/v1/profiles/{public_profile_id}')
        self.assertEqual(hidden.status_code, 404)

    def test_public_profile_paginates_same_visibility_contract_as_count_and_likes(self) -> None:
        suffix = uuid4().hex[:10]
        user = self._user(suffix, enabled=True)
        liker = self._user(f'{suffix}_liker')
        newest_at = datetime(2037, 1, 1, 12, 0, tzinfo=timezone.utc)
        visible_ids: list[str] = []
        for index in range(26):
            review = self._review(user, f'{suffix}_{index}', added_at=newest_at - timedelta(seconds=index))
            visible_ids.append(review.public_id)
            if index in {0, 25}:
                db = self.Session()
                try:
                    db.add(ReviewLike(review_id=review.id, user_id=liker.id))
                    db.commit()
                finally:
                    db.close()

        self._review(user, f'{suffix}_shareonly', visible=False)
        self._review(user, f'{suffix}_rejected', approved=False)
        self._review(user, f'{suffix}_deleted', deleted=True)
        self._review(user, f'{suffix}_failed', review_status=ReviewStatus.FAILED)
        self._review(user, f'{suffix}_photo_rejected', photo_status=PhotoStatus.REJECTED)
        self._review(user, f'{suffix}_owner_mismatch', owner_mismatch=True)

        first = self.client.get(f'/api/v1/profiles/{user.public_profile_id}', params={'limit': 10})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.headers.get('cache-control'), 'no-store')
        body = first.json()
        self.assertEqual(body['gallery_review_count'], 26)
        self.assertEqual(body['total_like_count'], 2)
        self.assertEqual(len(body['items']), 10)
        self.assertEqual([item['review_id'] for item in body['items']], visible_ids[:10])
        self.assertTrue(body['next_cursor'])
        serialized = str(body)
        self.assertNotIn('private note', serialized)
        self.assertNotIn('private-tag', serialized)
        self.assertNotIn('camera', serialized)
        self.assertNotIn('share_', serialized)

        second = self.client.get(
            f'/api/v1/profiles/{user.public_profile_id}',
            params={'limit': 20, 'cursor': body['next_cursor']},
        )
        self.assertEqual(second.status_code, 200)
        second_body = second.json()
        self.assertEqual([item['review_id'] for item in second_body['items']], visible_ids[10:])
        self.assertIsNone(second_body['next_cursor'])
        self.assertEqual(len({*(item['review_id'] for item in body['items']), *(item['review_id'] for item in second_body['items'])}), 26)

    def test_other_user_patch_updates_only_actor_profile(self) -> None:
        suffix = uuid4().hex[:10]
        owner = self._user(f'{suffix}_owner', enabled=True)
        other = self._user(f'{suffix}_other', enabled=False)
        original_owner_profile = owner.public_profile_id

        response = self.client.patch(
            '/api/v1/profiles/me',
            headers={'Authorization': f'Bearer {self._token(other)}'},
            json={'public_profile_enabled': True},
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.json()['public_profile_id'], original_owner_profile)

        db = self.Session()
        try:
            refreshed_owner = db.query(User).filter(User.id == owner.id).one()
            self.assertTrue(refreshed_owner.public_profile_enabled)
            self.assertEqual(refreshed_owner.public_profile_id, original_owner_profile)
        finally:
            db.close()

    def test_inactive_account_public_profile_404s(self) -> None:
        user = self._user(uuid4().hex[:10], enabled=True, active=False)

        response = self.client.get(f'/api/v1/profiles/{user.public_profile_id}')

        self.assertEqual(response.status_code, 404)


@unittest.skipUnless(TEST_DATABASE_URL, 'requires PostgreSQL admin access from PICSPEAK_TEST_DATABASE_URL')
class PublicProfilesMigrationPostgresTests(unittest.TestCase):
    def test_public_profile_migration_round_trip_preserves_existing_rows(self) -> None:
        base_url = make_url(TEST_DATABASE_URL)
        admin_url = base_url.set(database='postgres')
        test_db = f'picspeak_profiles_migration_{uuid4().hex[:10]}'
        test_url = base_url.set(database=test_db)
        admin = create_engine(admin_url, isolation_level='AUTOCOMMIT')

        def run_alembic(*args: str) -> None:
            env = os.environ.copy()
            env['DATABASE_URL'] = test_url.render_as_string(hide_password=False)
            env['PICSPEAK_TEST_DATABASE_URL'] = env['DATABASE_URL']
            subprocess.run(
                [sys.executable, '-m', 'alembic', '-c', 'backend/alembic.ini', *args],
                cwd=REPO_ROOT,
                env=env,
                check=True,
                stdout=subprocess.DEVNULL,
            )

        try:
            with admin.connect() as connection:
                connection.execute(text(f'CREATE DATABASE {test_db}'))
            run_alembic('upgrade', '20260919_0008')
            engine = create_engine(test_url)
            with engine.begin() as connection:
                connection.execute(
                    text(
                        """
                        INSERT INTO users (
                            id, public_id, email, username, plan, daily_quota_total,
                            daily_quota_used, status
                        )
                        VALUES (
                            9001, 'usr_legacy_profile', 'legacy_profile@example.test',
                            'legacy_profile', 'free', 5, 0, 'active'
                        )
                        """
                    )
                )
            engine.dispose()

            run_alembic('upgrade', '20260922_0009')
            engine = create_engine(test_url)
            with engine.connect() as connection:
                row = connection.execute(
                    text('select public_id, public_profile_id, public_profile_enabled from users where id=9001')
                ).one()
                self.assertEqual(row.public_id, 'usr_legacy_profile')
                self.assertIsNone(row.public_profile_id)
                self.assertFalse(row.public_profile_enabled)
            engine.dispose()

            run_alembic('downgrade', '20260919_0008')
            run_alembic('upgrade', '20260922_0009')
            engine = create_engine(test_url)
            with engine.connect() as connection:
                count = connection.execute(text('select count(*) from users where id=9001')).scalar()
                self.assertEqual(count, 1)
            engine.dispose()
        finally:
            with admin.connect() as connection:
                connection.execute(
                    text('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :database'),
                    {'database': test_db},
                )
                connection.execute(text(f'DROP DATABASE IF EXISTS {test_db}'))
            admin.dispose()


if __name__ == '__main__':
    unittest.main()
