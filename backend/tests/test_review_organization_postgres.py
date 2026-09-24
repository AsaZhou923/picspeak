from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_current_actor  # noqa: E402
from app.db.models import Photo, PhotoStatus, Review, ReviewMode, ReviewStatus, User, UserPlan, UserStatus  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402


TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class ReviewOrganizationPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.connection = self.engine.connect()
        self.Session = sessionmaker(bind=self.connection, autoflush=False, autocommit=False)
        self.suffix = uuid4().hex[:10]
        self.owner_id, self.other_id = self._insert_fixture()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.connection.close()
        self.engine.dispose()

    def _client(self, owner_id: int | None = None):
        actor_owner_id = self.owner_id if owner_id is None else owner_id

        def override_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        def override_actor():
            return SimpleNamespace(
                user=SimpleNamespace(id=actor_owner_id, public_id=f'usr_actor_{self.suffix}'),
                plan=UserPlan.free,
            )

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor
        return TestClient(app)

    def _insert_fixture(self) -> tuple[int, int]:
        now = datetime(2036, 1, 1, 12, 0, tzinfo=timezone.utc) + timedelta(minutes=int(self.suffix[:4], 16))
        db = self.Session()
        try:
            owner = User(
                public_id=f'usr_org_{self.suffix}',
                email=f'org_{self.suffix}@example.test',
                username=f'org_{self.suffix}',
                plan=UserPlan.free,
                daily_quota_total=5,
                daily_quota_used=0,
                status=UserStatus.active,
            )
            other = User(
                public_id=f'usr_org_other_{self.suffix}',
                email=f'org_other_{self.suffix}@example.test',
                username=f'org_other_{self.suffix}',
                plan=UserPlan.free,
                daily_quota_total=5,
                daily_quota_used=0,
                status=UserStatus.active,
            )
            db.add_all([owner, other])
            db.flush()
            for index, user in enumerate([owner, other]):
                photo = Photo(
                    public_id=f'pho_org_{self.suffix}_{index}',
                    owner_user_id=user.id,
                    upload_id=f'upl_org_{self.suffix}_{index}',
                    bucket='test',
                    object_key=f'test/{self.suffix}/{index}.jpg',
                    content_type='image/jpeg',
                    size_bytes=1200,
                    status=PhotoStatus.READY,
                    exif_data={},
                    client_meta={},
                    created_at=now + timedelta(seconds=index),
                )
                db.add(photo)
                db.flush()
                review = Review(
                    public_id=f'rev_org_{self.suffix}_{index}',
                    photo_id=photo.id,
                    owner_user_id=user.id,
                    mode=ReviewMode.flash,
                    status=ReviewStatus.SUCCEEDED,
                    image_type='street',
                    schema_version='1.0',
                    result_json={'scores': {'composition': 7, 'lighting': 7, 'color': 7, 'impact': 7, 'technical': 7}},
                    final_score=7.0 + index,
                    is_public=False,
                    share_token=f'share-org-{self.suffix}-{index}',
                    gallery_visible=index == 0,
                    gallery_audit_status='approved' if index == 0 else 'none',
                    gallery_added_at=now if index == 0 else None,
                    tags_json=['Street', 'Night%_Literal'],
                    note='literal 100%_match owner' if index == 0 else 'literal 100%_match other',
                    created_at=now + timedelta(seconds=index),
                )
                db.add(review)
            db.commit()
            return owner.id, other.id
        finally:
            db.close()

    def test_private_history_q_and_tag_filters_stay_owner_scoped_and_literal(self) -> None:
        with self._client() as client:
            response = client.get('/api/v1/me/reviews', params={'q': '100%_match', 'tag': 'Street', 'limit': 10})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual([item['review_id'] for item in body['items']], [f'rev_org_{self.suffix}_0'])
        self.assertEqual(body['items'][0]['tags'], ['Street', 'Night%_Literal'])
        self.assertEqual(body['items'][0]['note'], 'literal 100%_match owner')

    def test_share_revoke_is_idempotent_preserves_gallery_and_invalidates_old_token(self) -> None:
        review_id = f'rev_org_{self.suffix}_0'
        old_token = f'share-org-{self.suffix}-0'
        with patch('app.api.routers.review_support.settings.frontend_origin', 'https://www.picspeak.art'), self._client() as client:
            public_before = client.get(f'/api/v1/public/reviews/{old_token}')
            first = client.delete(f'/api/v1/reviews/{review_id}/share')
            second = client.delete(f'/api/v1/reviews/{review_id}/share')
            public_response = client.get(f'/api/v1/public/reviews/{old_token}')

        self.assertEqual(public_before.status_code, 200)
        self.assertEqual(
            public_before.json()['result']['share_info']['share_url'],
            f'https://www.picspeak.art/share/{old_token}',
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(first.json()['gallery_visible'])
        self.assertTrue(first.json()['is_public'])
        self.assertFalse(first.json()['share_enabled'])
        self.assertIsNone(first.json()['share_token'])
        self.assertEqual(public_response.status_code, 404)

    def test_public_review_api_redirects_browser_navigation_but_preserves_json_contract(self) -> None:
        token = f'share-org-{self.suffix}-0'
        with patch('app.api.routers.review_support.settings.frontend_origin', 'https://www.picspeak.art'), self._client() as client:
            browser_response = client.get(
                f'/api/v1/public/reviews/{token}',
                headers={'accept': 'text/html,application/xhtml+xml'},
                follow_redirects=False,
            )
            json_response = client.get(
                f'/api/v1/public/reviews/{token}',
                headers={'accept': 'application/json'},
            )

        self.assertEqual(browser_response.status_code, 307)
        self.assertEqual(browser_response.headers['location'], f'https://www.picspeak.art/share/{token}')
        self.assertEqual(json_response.status_code, 200)
        self.assertEqual(json_response.json()['review_id'], f'rev_org_{self.suffix}_0')
        self.assertEqual(json_response.json()['result']['share_info']['share_url'], f'https://www.picspeak.art/share/{token}')

    def test_recreate_share_uses_new_token_and_stop_all_closes_both_channels_atomically(self) -> None:
        review_id = f'rev_org_{self.suffix}_0'
        old_token = f'share-org-{self.suffix}-0'
        with patch('app.api.routers.review_support.settings.frontend_origin', 'https://www.picspeak.art'), self._client() as client:
            client.delete(f'/api/v1/reviews/{review_id}/share')
            created = client.post(f'/api/v1/reviews/{review_id}/share')
            stopped = client.delete(f'/api/v1/reviews/{review_id}/visibility')

        self.assertEqual(created.status_code, 200)
        self.assertNotEqual(created.json()['share_token'], old_token)
        self.assertTrue(created.json()['share_url'].startswith('https://www.picspeak.art/share/'))
        self.assertNotIn('/api/v1/public/reviews/', created.json()['share_url'])
        self.assertEqual(stopped.status_code, 200)
        self.assertFalse(stopped.json()['is_public'])
        self.assertFalse(stopped.json()['gallery_visible'])
        self.assertFalse(stopped.json()['share_enabled'])

    def _add_photo(self, db, owner: User, label: str, *, status: PhotoStatus = PhotoStatus.READY) -> Photo:
        photo = Photo(
            public_id=f'pho_src_{self.suffix}_{label}',
            owner_user_id=owner.id,
            upload_id=f'upl_src_{self.suffix}_{label}',
            bucket='test',
            object_key=f'test/{self.suffix}/{label}.jpg',
            content_type='image/jpeg',
            size_bytes=1200,
            status=status,
            exif_data={},
            client_meta={},
            created_at=datetime.now(timezone.utc),
        )
        db.add(photo)
        db.flush()
        return photo

    def _add_review(
        self,
        db,
        owner: User,
        photo: Photo,
        label: str,
        *,
        status: ReviewStatus = ReviewStatus.SUCCEEDED,
        source_review_id: int | None = None,
        created_at: datetime | None = None,
    ) -> Review:
        review = Review(
            public_id=f'rev_src_{self.suffix}_{label}',
            photo_id=photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.flash,
            status=status,
            image_type='street',
            schema_version='1.0',
            result_json={'scores': {'composition': 7, 'lighting': 7, 'color': 7, 'impact': 7, 'technical': 7}},
            final_score=7.0,
            source_review_id=source_review_id,
            tags_json=[],
            note=None,
            created_at=created_at or datetime.now(timezone.utc),
        )
        db.add(review)
        db.flush()
        return review

    def test_owner_detail_and_export_hide_unavailable_source_review_ids(self) -> None:
        db = self.Session()
        try:
            owner = db.query(User).filter(User.id == self.owner_id).one()
            other = db.query(User).filter(User.id == self.other_id).one()
            now = datetime.now(timezone.utc)
            cases = [
                ('valid', {}, True),
                ('deleted', {'deleted_at': now}, False),
                ('expired', {'created_at': datetime(2000, 1, 1, tzinfo=timezone.utc)}, False),
                ('failed', {'status': ReviewStatus.FAILED}, False),
                ('photo_rejected', {'photo_status': PhotoStatus.REJECTED}, False),
                ('owner_mismatch', {'source_owner': other}, False),
            ]
            targets: list[tuple[str, str, bool]] = []
            for label, mutation, expect_source in cases:
                source_owner = mutation.get('source_owner', owner)
                source_photo = self._add_photo(db, source_owner, f'{label}_source', status=mutation.get('photo_status', PhotoStatus.READY))
                source = self._add_review(
                    db,
                    source_owner,
                    source_photo,
                    f'{label}_source',
                    status=mutation.get('status', ReviewStatus.SUCCEEDED),
                    created_at=mutation.get('created_at'),
                )
                if mutation.get('deleted_at') is not None:
                    source.deleted_at = mutation['deleted_at']
                target_photo = self._add_photo(db, owner, f'{label}_target')
                target = self._add_review(db, owner, target_photo, f'{label}_target', source_review_id=source.id)
                targets.append((target.public_id, source.public_id, expect_source))
            db.commit()
        finally:
            db.close()

        with self._client() as client:
            for target_id, source_id, expect_source in targets:
                detail = client.get(f'/api/v1/reviews/{target_id}')
                exported = client.get(f'/api/v1/reviews/{target_id}/export')

                self.assertEqual(detail.status_code, 200)
                self.assertEqual(exported.status_code, 200)
                expected = source_id if expect_source else None
                self.assertEqual(detail.json()['source_review_id'], expected)
                self.assertEqual(exported.json()['review']['source_review_id'], expected)


if __name__ == '__main__':
    unittest.main()
