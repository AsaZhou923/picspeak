from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import Photo, PhotoStatus, Review, ReviewLike, ReviewMode, ReviewStatus, User, UserPlan, UserStatus
from app.db.session import get_db
from app.main import app
from app.services.gallery_scoreboard import build_gallery_scoreboard

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


def _request_stub():
    return SimpleNamespace(
        base_url='http://testserver/',
        headers={'host': 'testserver'},
        url_for=lambda _route_name, **kwargs: f"http://testserver/api/v1/photos/{kwargs['photo_id']}/image",
    )


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class GalleryScoreboardPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.connection = self.engine.connect()
        self._clean_scoreboard_fixtures()
        self.Session = sessionmaker(bind=self.connection, autoflush=False, autocommit=False)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.connection.close()
        self.engine.dispose()

    def _client(self):
        def override_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_db
        return TestClient(app)

    def _clean_scoreboard_fixtures(self) -> None:
        self.connection.execute(text(
            "DELETE FROM review_likes WHERE review_id IN (SELECT id FROM reviews WHERE public_id LIKE 'rev_score_%')"
        ))
        self.connection.execute(text("DELETE FROM reviews WHERE public_id LIKE 'rev_score_%'"))
        self.connection.execute(text("DELETE FROM photos WHERE public_id LIKE 'pho_score_%'"))
        self.connection.execute(text("DELETE FROM users WHERE public_id LIKE 'usr_score_%'"))
        self.connection.commit()

    def _user(self, db, suffix: str, index: int) -> User:
        user = User(
            public_id=f'usr_score_{suffix}_{index}',
            email=f'score_{suffix}_{index}@example.test',
            username=f'score_{suffix}_{index}',
            plan=UserPlan.free,
            daily_quota_total=5,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        db.add(user)
        db.flush()
        return user

    def _photo(self, db, suffix: str, owner: User, index: int, created_at: datetime) -> Photo:
        photo = Photo(
            public_id=f'pho_score_{suffix}_{index}',
            owner_user_id=owner.id,
            upload_id=f'upl_score_{suffix}_{index}',
            bucket='test',
            object_key=f'test/score/{suffix}/{index}.jpg',
            content_type='image/jpeg',
            size_bytes=1234,
            status=PhotoStatus.READY,
            exif_data={},
            client_meta={},
            created_at=created_at,
        )
        db.add(photo)
        db.flush()
        return photo

    def _review(
        self,
        db,
        suffix: str,
        owner: User,
        photo: Photo,
        index: int,
        added_at: datetime,
        *,
        visible: bool = True,
        audit_status: str = 'approved',
        image_type: str = 'street',
        share_token: str | None = None,
        final_score: Decimal = Decimal('8.00'),
    ) -> Review:
        review = Review(
            public_id=f'rev_score_{suffix}_{index}',
            photo_id=photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.pro,
            status=ReviewStatus.SUCCEEDED,
            image_type=image_type,
            schema_version='1.0',
            result_json={'score_version': 'scoreboard-test'},
            final_score=final_score,
            is_public=bool(visible or share_token),
            share_token=share_token,
            gallery_visible=visible,
            gallery_audit_status=audit_status,
            gallery_added_at=added_at if visible else None,
            tags_json=[],
            created_at=added_at,
        )
        db.add(review)
        db.flush()
        return review

    def _likes(self, db, review: Review, users: list[User], count: int) -> None:
        for user in users[:count]:
            db.add(ReviewLike(review_id=review.id, user_id=user.id))

    def test_scoreboard_uses_half_open_window_representatives_likes_and_author_cap(self) -> None:
        suffix = uuid4().hex[:8]
        as_of = datetime(2035, 5, 1, 12, 0, tzinfo=timezone.utc)
        db = self.Session()
        try:
            owners = [self._user(db, suffix, index) for index in range(6)]
            likers = [self._user(db, f'{suffix}_like', index) for index in range(9)]
            reviews: list[Review] = []
            for index in range(12):
                owner = owners[index % len(owners)]
                photo = self._photo(db, suffix, owner, index, as_of - timedelta(days=1, minutes=index))
                review = self._review(db, suffix, owner, photo, index, as_of - timedelta(days=1, minutes=index))
                reviews.append(review)

            duplicate_photo = self._photo(db, suffix, owners[0], 50, as_of - timedelta(days=2))
            older_duplicate = self._review(db, suffix, owners[0], duplicate_photo, 50, as_of - timedelta(days=2))
            newer_duplicate = self._review(db, suffix, owners[0], duplicate_photo, 51, as_of - timedelta(hours=2))
            boundary_in = self._review(
                db,
                suffix,
                owners[5],
                self._photo(db, suffix, owners[5], 52, as_of - timedelta(days=7)),
                52,
                as_of - timedelta(days=7),
            )
            boundary_out = self._review(
                db,
                suffix,
                owners[5],
                self._photo(db, suffix, owners[5], 53, as_of),
                53,
                as_of,
            )
            rejected = self._review(
                db,
                suffix,
                owners[4],
                self._photo(db, suffix, owners[4], 54, as_of - timedelta(hours=3)),
                54,
                as_of - timedelta(hours=3),
                audit_status='rejected',
            )
            share_only = self._review(
                db,
                suffix,
                owners[3],
                self._photo(db, suffix, owners[3], 55, as_of - timedelta(hours=4)),
                55,
                as_of - timedelta(hours=4),
                visible=False,
                share_token=f'share_{suffix}',
            )

            self._likes(db, reviews[0], likers, 8)
            self._likes(db, newer_duplicate, likers, 7)
            self._likes(db, older_duplicate, likers, 9)
            self._likes(db, reviews[1], likers, 6)
            self._likes(db, reviews[6], likers, 5)
            self._likes(db, boundary_in, likers, 4)
            db.commit()

            payload = build_gallery_scoreboard(db, _request_stub(), window_days=7, image_type='street', as_of=as_of)
            ids = [item.review_id for item in payload.items]

            self.assertEqual(payload.ranking_mode, 'popular')
            self.assertEqual(payload.window_start, as_of - timedelta(days=7))
            self.assertEqual(payload.window_end, as_of)
            self.assertIn(reviews[0].public_id, ids)
            self.assertIn(newer_duplicate.public_id, ids)
            self.assertNotIn(older_duplicate.public_id, ids)
            self.assertIn(boundary_in.public_id, ids)
            self.assertNotIn(boundary_out.public_id, ids)
            self.assertNotIn(rejected.public_id, ids)
            self.assertNotIn(share_only.public_id, ids)
            self.assertLess(ids.index(reviews[0].public_id), ids.index(newer_duplicate.public_id))
            owner0_count = sum(1 for item in payload.items if item.owner_username == owners[0].username)
            self.assertEqual(owner0_count, 2)

            newer_duplicate.gallery_visible = False
            newer_duplicate.gallery_added_at = None
            newer_duplicate.is_public = bool(newer_duplicate.share_token)
            db.commit()

            after_remove = build_gallery_scoreboard(db, _request_stub(), window_days=7, image_type='street', as_of=as_of)
            self.assertNotIn(newer_duplicate.public_id, [item.review_id for item in after_remove.items])
        finally:
            db.close()

    def test_scoreboard_downgrades_to_collection_for_cold_start(self) -> None:
        suffix = uuid4().hex[:8]
        as_of = datetime(2035, 6, 1, 12, 0, tzinfo=timezone.utc)
        db = self.Session()
        try:
            owner = self._user(db, suffix, 0)
            newest_ids: list[str] = []
            for index in range(4):
                review = self._review(
                    db,
                    suffix,
                    owner,
                    self._photo(db, suffix, owner, index, as_of - timedelta(hours=index + 1)),
                    index,
                    as_of - timedelta(hours=index + 1),
                    image_type='still_life',
                )
                newest_ids.append(review.public_id)
            db.commit()

            payload = build_gallery_scoreboard(db, _request_stub(), window_days=30, image_type='still_life', as_of=as_of)

            self.assertEqual(payload.ranking_mode, 'collection')
            self.assertIn('not_enough_photos', payload.cold_start_reasons)
            self.assertIn('not_enough_authors', payload.cold_start_reasons)
            self.assertIn('all_zero_likes', payload.cold_start_reasons)
            self.assertEqual([item.review_id for item in payload.items], newest_ids[:2])
        finally:
            db.close()

    def test_scoreboard_route_returns_explainable_counts_sort_and_profile_links(self) -> None:
        suffix = uuid4().hex[:8]
        as_of = datetime.now(timezone.utc) - timedelta(minutes=5)
        top_id = ''
        top_profile_url = f'/u/upp_{suffix}'
        db = self.Session()
        try:
            owners = [self._user(db, suffix, index) for index in range(6)]
            owners[0].public_profile_enabled = True
            owners[0].public_profile_id = f'upp_{suffix}'
            likers = [self._user(db, f'{suffix}_route_like', index) for index in range(6)]
            top = self._review(
                db,
                suffix,
                owners[0],
                self._photo(db, suffix, owners[0], 80, as_of - timedelta(hours=1)),
                80,
                as_of - timedelta(hours=1),
                image_type='architecture',
            )
            top_id = top.public_id
            self._likes(db, top, likers, 5)
            for index in range(11):
                owner = owners[index % len(owners)]
                self._review(
                    db,
                    suffix,
                    owner,
                    self._photo(db, suffix, owner, index, as_of - timedelta(hours=2, minutes=index)),
                    index,
                    as_of - timedelta(hours=2, minutes=index),
                    image_type='architecture',
                )
            db.commit()
        finally:
            db.close()

        with patch('app.main.worker.start'), patch('app.main.worker.stop'), self._client() as client:
            response = client.get('/api/v1/gallery/scoreboard', params={'window_days': 7, 'image_type': 'architecture'})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['ranking_rule_version'], 'gallery-scoreboard-v1')
        self.assertEqual(body['ranking_sort'], ['like_count_desc', 'gallery_added_at_desc', 'review_id_desc'])
        self.assertGreaterEqual(body['eligible_photo_count'], 10)
        self.assertGreaterEqual(body['eligible_author_count'], 5)
        self.assertEqual(body['items'][0]['review_id'], top_id)
        self.assertEqual(body['items'][0]['owner_profile_url'], top_profile_url)
        self.assertEqual(response.headers.get('cache-control'), 'private, no-store')

    def test_gallery_list_route_adds_profile_url_without_changing_old_fields(self) -> None:
        suffix = uuid4().hex[:8]
        added_at = datetime.now(timezone.utc) - timedelta(minutes=4)
        review_id = ''
        profile_url = f'/u/upp_gallery_{suffix}'
        db = self.Session()
        try:
            owner = self._user(db, suffix, 20)
            owner.public_profile_enabled = True
            owner.public_profile_id = profile_url.removeprefix('/u/')
            review = self._review(
                db,
                suffix,
                owner,
                self._photo(db, suffix, owner, 90, added_at),
                90,
                added_at,
                image_type='still_life',
            )
            review_id = review.public_id
            db.commit()
        finally:
            db.close()

        with patch('app.main.worker.start'), patch('app.main.worker.stop'), self._client() as client:
            response = client.get(
                '/api/v1/gallery',
                params={
                    'sort': 'latest',
                    'image_type': 'still_life',
                    'created_from': (added_at - timedelta(minutes=1)).isoformat(),
                    'created_to': (added_at + timedelta(minutes=1)).isoformat(),
                },
            )

        self.assertEqual(response.status_code, 200)
        item = response.json()['items'][0]
        self.assertEqual(item['review_id'], review_id)
        self.assertEqual(item['owner_profile_url'], profile_url)
        self.assertIn('owner_username', item)

    def test_neighbors_route_preserves_filtered_context_and_sanitizes_back_href(self) -> None:
        suffix = uuid4().hex[:8]
        newest_at = datetime.now(timezone.utc) - timedelta(minutes=3)
        review_ids: list[str] = []
        db = self.Session()
        try:
            owner = self._user(db, suffix, 30)
            reviews = []
            for index in range(3):
                reviews.append(
                    self._review(
                        db,
                        suffix,
                        owner,
                        self._photo(db, suffix, owner, 100 + index, newest_at - timedelta(minutes=index)),
                        100 + index,
                        newest_at - timedelta(minutes=index),
                        image_type='landscape',
                        final_score=Decimal('7.77'),
                    )
                )
            review_ids = [review.public_id for review in reviews]
            self._review(
                db,
                suffix,
                owner,
                self._photo(db, suffix, owner, 120, newest_at - timedelta(minutes=1)),
                120,
                newest_at - timedelta(minutes=1),
                image_type='portrait',
            )
            db.commit()
        finally:
            db.close()

        params = {
            'sort': 'latest',
            'image_type': 'landscape',
            'min_score': '7.77',
            'max_score': '7.77',
            'created_from': (newest_at - timedelta(minutes=5)).isoformat(),
            'created_to': (newest_at + timedelta(minutes=1)).isoformat(),
            'back_href': 'https://evil.example/gallery?restore=1',
        }
        with patch('app.main.worker.start'), patch('app.main.worker.stop'), self._client() as client:
            first = client.get(f'/api/v1/gallery/{review_ids[0]}/neighbors', params=params)
            middle = client.get(f'/api/v1/gallery/{review_ids[1]}/neighbors', params=params)
            last = client.get(f'/api/v1/gallery/{review_ids[2]}/neighbors', params=params)

        self.assertEqual(first.status_code, 200)
        self.assertIsNone(first.json()['previous'])
        self.assertEqual(first.json()['next']['review_id'], review_ids[1])
        self.assertEqual(first.json()['back_href'], '/gallery')
        self.assertEqual(middle.status_code, 200)
        self.assertEqual(middle.json()['previous']['review_id'], review_ids[0])
        self.assertEqual(middle.json()['next']['review_id'], review_ids[2])
        self.assertEqual(last.status_code, 200)
        self.assertEqual(last.json()['previous']['review_id'], review_ids[1])
        self.assertIsNone(last.json()['next'])

    def test_neighbors_route_hides_removed_gallery_item_and_accepts_rank_reference_at(self) -> None:
        suffix = uuid4().hex[:8]
        newest_at = datetime.now(timezone.utc) - timedelta(minutes=2)
        first_id = ''
        removed_id = ''
        third_id = ''
        db = self.Session()
        try:
            owner = self._user(db, suffix, 40)
            first = self._review(
                db,
                suffix,
                owner,
                self._photo(db, suffix, owner, 130, newest_at),
                130,
                newest_at,
                image_type='default',
                final_score=Decimal('7.66'),
            )
            first_id = first.public_id
            removed = self._review(
                db,
                suffix,
                owner,
                self._photo(db, suffix, owner, 131, newest_at - timedelta(minutes=1)),
                131,
                newest_at - timedelta(minutes=1),
                image_type='default',
                final_score=Decimal('7.66'),
            )
            removed_id = removed.public_id
            third = self._review(
                db,
                suffix,
                owner,
                self._photo(db, suffix, owner, 132, newest_at - timedelta(minutes=2)),
                132,
                newest_at - timedelta(minutes=2),
                image_type='default',
                final_score=Decimal('7.66'),
            )
            third_id = third.public_id
            removed.gallery_visible = False
            removed.gallery_added_at = None
            removed.is_public = bool(removed.share_token)
            db.commit()
        finally:
            db.close()

        with patch('app.main.worker.start'), patch('app.main.worker.stop'), self._client() as client:
            response = client.get(
                f'/api/v1/gallery/{first_id}/neighbors',
                params={
                    'sort': 'default',
                    'rank_reference_at': newest_at.isoformat(),
                    'min_score': '7.66',
                    'max_score': '7.66',
                    'created_from': (newest_at - timedelta(minutes=5)).isoformat(),
                    'created_to': (newest_at + timedelta(minutes=1)).isoformat(),
                    'back_href': '/gallery?sort=default&cursor=bad&restore=1',
                },
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        neighbor_ids = {item['review_id'] for item in [body['previous'], body['next']] if item}
        self.assertNotIn(removed_id, neighbor_ids)
        self.assertIn(third_id, neighbor_ids)


if __name__ == '__main__':
    unittest.main()
