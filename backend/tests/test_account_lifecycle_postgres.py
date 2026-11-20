from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import and_, create_engine, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session, sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import CurrentActor, get_current_actor, get_db, issue_guest_token  # noqa: E402
from app.api.routers import gallery, photos, profiles, review_queries  # noqa: E402
from app.api.routers.auth_support import (  # noqa: E402
    _cleanup_deleted_user_feature_state,
    _handle_clerk_user_deleted,
    _migrate_guest_records,
)
from app.api.routers.gallery_support import _public_gallery_filters  # noqa: E402
from app.db.models import (  # noqa: E402
    Base,
    Photo,
    PhotoStatus,
    PracticeAttempt,
    PracticeFeedback,
    PracticeSceneGroup,
    PracticeSession,
    Review,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
)
from app.schemas import AuthClerkExchangeRequest, GuestReviewMigrateRequest  # noqa: E402
from app.services.gallery_scoreboard import _owner_profile_url  # noqa: E402
from app.services.object_retention import collect_photo_facts, decide_photo  # noqa: E402

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


class _FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        raise AssertionError('migration must not apply .limit() to guest records')

    def all(self):
        return self.rows


class AccountLifecycleUnitTests(unittest.TestCase):
    def test_guest_migration_schemas_keep_recent_limit_for_compatibility(self) -> None:
        self.assertEqual(GuestReviewMigrateRequest(recent_limit=5).recent_limit, 5)
        self.assertEqual(AuthClerkExchangeRequest(recent_limit=10).recent_limit, 10)

    def test_migrate_guest_records_moves_all_photos_reviews_and_tasks_beyond_recent_limit(self) -> None:
        guest = SimpleNamespace(id=10, plan=UserPlan.guest, status=UserStatus.active)
        target = SimpleNamespace(id=20)
        photos_list = [SimpleNamespace(id=1000 + i, owner_user_id=10) for i in range(30)]
        tasks_list = [SimpleNamespace(id=2000 + i, owner_user_id=10, idempotency_key=None) for i in range(25)]
        reviews_list = [
            SimpleNamespace(id=3000 + i, owner_user_id=10, photo_id=photos_list[i].id, task_id=tasks_list[i].id)
            for i in range(25)
        ]

        rows = {
            Review: reviews_list,
            Photo: photos_list,
            ReviewTask: tasks_list,
            PracticeSession: [],
            PracticeSceneGroup: [],
            PracticeAttempt: [],
            PracticeFeedback: [],
        }
        db = MagicMock()
        db.query.side_effect = lambda *models: _FakeQuery(rows.get(models[0], []))

        with patch('app.api.routers.auth_support.get_user_from_token', return_value=guest):
            migrated_reviews, migrated_photos = _migrate_guest_records(
                db=db,
                target_user=target,
                guest_token='guest-token',
                recent_limit=20,
                strict=True,
            )

        self.assertEqual((migrated_reviews, migrated_photos), (25, 30))
        self.assertTrue(all(review.owner_user_id == target.id for review in reviews_list))
        self.assertTrue(all(photo.owner_user_id == target.id for photo in photos_list))
        self.assertTrue(all(task.owner_user_id == target.id for task in tasks_list))
        self.assertEqual(guest.status, UserStatus.deleted)

    def test_public_gallery_filters_require_active_author(self) -> None:
        sql = str(and_(*_public_gallery_filters()).compile(dialect=postgresql.dialect()))
        self.assertIn('users.status', sql)

    def test_active_review_author_filter_checks_review_owner_status(self) -> None:
        sql = str(review_queries._active_review_author_filter().compile(dialect=postgresql.dialect()))
        self.assertIn('reviews.owner_user_id', sql)
        self.assertIn('.status', sql)

    def test_collect_photo_facts_ignores_stale_public_review_when_owner_is_deleted(self) -> None:
        now = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)
        photo = SimpleNamespace(
            id=1,
            owner_user_id=10,
            status=PhotoStatus.READY,
            created_at=now - timedelta(days=20),
        )
        stale_public_review = SimpleNamespace(
            photo_id=1,
            deleted_at=None,
            share_token='stale-share-token',
            gallery_visible=True,
            gallery_audit_status='approved',
            created_at=now - timedelta(days=20),
            result_json={},
        )
        deleted_owner = SimpleNamespace(
            id=10,
            plan=UserPlan.free,
            status=UserStatus.deleted,
            updated_at=now - timedelta(days=10),
        )
        db = MagicMock()
        reviews_q = MagicMock()
        reviews_q.filter.return_value.all.return_value = [stale_public_review]
        live_rev_q = MagicMock()
        live_rev_q.filter.return_value.all.return_value = []
        live_gen_q = MagicMock()
        live_gen_q.filter.return_value.all.return_value = []
        subs_q = MagicMock()
        subs_q.filter.return_value.all.return_value = []
        users_q = MagicMock()
        users_q.filter.return_value.all.return_value = [deleted_owner]
        db.query.side_effect = [reviews_q, live_rev_q, live_gen_q, subs_q, users_q]

        facts = collect_photo_facts(db, [photo], now=now)[photo.id]
        self.assertFalse(facts.has_public_review)
        decision = decide_photo(facts, now=now)
        self.assertEqual((decision.purge, decision.reason), (True, 'account_deleted'))

    def test_owner_profile_url_omits_inactive_owner(self) -> None:
        deleted_owner = SimpleNamespace(
            status=UserStatus.deleted,
            public_profile_enabled=True,
            public_profile_id='upp_deleted',
        )
        self.assertIsNone(_owner_profile_url(deleted_owner))

    def test_cleanup_deleted_user_withdraws_owned_review_public_channels(self) -> None:
        user = SimpleNamespace(id=77)
        db = MagicMock()
        review_id_query = MagicMock()
        review_id_query.filter.return_value = review_id_query
        review_id_query.order_by.return_value = review_id_query
        review_id_query.with_for_update.return_value = review_id_query
        review_id_query.all.return_value = [(101,), (102,)]

        review_update_query = MagicMock()
        review_update_query.filter.return_value = review_update_query

        snapshot_id_query = MagicMock()
        snapshot_id_query.filter.return_value = snapshot_id_query
        snapshot_id_query.order_by.return_value = snapshot_id_query
        snapshot_id_query.with_for_update.return_value = snapshot_id_query
        snapshot_id_query.all.return_value = []

        generic_query = MagicMock()
        generic_query.filter.return_value = generic_query

        db.query.side_effect = [
            review_id_query,
            review_update_query,
            snapshot_id_query,
            generic_query,
            generic_query,
            generic_query,
            generic_query,
        ]

        _cleanup_deleted_user_feature_state(db, user)

        review_update_query.update.assert_called_once()
        updated_fields = review_update_query.update.call_args.args[0]
        self.assertEqual(updated_fields[Review.is_public], False)
        self.assertIsNone(updated_fields[Review.share_token])
        self.assertEqual(updated_fields[Review.gallery_visible], False)
        self.assertEqual(updated_fields[Review.gallery_audit_status], 'none')
        self.assertIsNone(updated_fields[Review.gallery_added_at])
        self.assertIsNone(updated_fields[Review.gallery_rejected_reason])


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class AccountLifecyclePostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        self.connection = self.engine.connect()
        self.transaction = self.connection.begin()
        self.schema = 'lifecycle_' + uuid4().hex
        self.connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.connection.execute(text(f'SET LOCAL search_path TO "{self.schema}", public'))
        Base.metadata.create_all(self.connection)
        self.Session = sessionmaker(
            bind=self.connection,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            join_transaction_mode='create_savepoint',
        )

    def tearDown(self) -> None:
        self.transaction.rollback()
        self.connection.close()
        self.engine.dispose()

    def _build_client(self, actor_user_id: int) -> TestClient:
        app = FastAPI()
        api_router = APIRouter(prefix='/api/v1')
        api_router.include_router(gallery.router)
        api_router.include_router(profiles.router)
        api_router.include_router(review_queries.router)
        api_router.include_router(photos.router)
        app.include_router(api_router)

        def override_db():
            with self.Session() as db:
                yield db

        def override_actor(db: Session = Depends(get_db)):
            return CurrentActor(db.get(User, actor_user_id))

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_actor] = override_actor
        app.dependency_overrides[gallery.get_registered_actor] = override_actor
        return TestClient(app)

    def _make_user(
        self,
        db: Session,
        *,
        plan: UserPlan = UserPlan.free,
        status: UserStatus = UserStatus.active,
        clerk_user_id: str | None = None,
        public_profile_enabled: bool = False,
        updated_at: datetime | None = None,
    ) -> User:
        suffix = uuid4().hex[:10]
        user = User(
            public_id=f'usr_lc_{suffix}',
            clerk_user_id=clerk_user_id,
            email=f'lc_{suffix}@example.test',
            username=f'lc_{suffix}',
            plan=plan,
            daily_quota_total=5,
            daily_quota_used=0,
            status=status,
            public_profile_id=f'upp_{suffix}' if public_profile_enabled else None,
            public_profile_enabled=public_profile_enabled,
            updated_at=updated_at or datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()
        return user

    def _seed_public_review(self, db: Session, owner: User, *, published_at: datetime) -> tuple[Photo, Review]:
        suffix = uuid4().hex[:10]
        photo = Photo(
            public_id=f'pho_lc_{suffix}',
            owner_user_id=owner.id,
            upload_id=f'upl_lc_{suffix}',
            bucket='test-bucket',
            object_key=f'user_{owner.public_id}/2026/11/obj_{suffix}.jpg',
            content_type='image/jpeg',
            size_bytes=1024,
            status=PhotoStatus.READY,
            exif_data={},
            client_meta={},
            created_at=published_at,
        )
        db.add(photo)
        db.flush()
        review = Review(
            public_id=f'rev_lc_{suffix}',
            photo_id=photo.id,
            owner_user_id=owner.id,
            mode=ReviewMode.pro,
            status=ReviewStatus.SUCCEEDED,
            image_type='street',
            schema_version='2.0',
            result_json={
                'score_version': 'score-v8-style-relative',
                'scores': {'composition': 8, 'lighting': 8, 'color': 8, 'impact': 8, 'technical': 8},
                'advantage': 'Strong frame.',
                'critique': 'Minor distractions.',
                'suggestions': 'Tighten the edge.',
            },
            final_score=Decimal('8.00'),
            is_public=True,
            share_token=f'share_{suffix}',
            gallery_visible=True,
            gallery_audit_status='approved',
            gallery_added_at=published_at,
            tags_json=[],
            created_at=published_at,
        )
        db.add(review)
        db.flush()
        return photo, review

    def test_guest_migration_transfers_all_25_reviews_30_photos_and_tasks_without_mismatch(self) -> None:
        base_time = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        with self.Session() as db:
            guest = self._make_user(db, plan=UserPlan.guest)
            target = self._make_user(db, plan=UserPlan.free)

            photo_ids: list[int] = []
            task_ids: list[int] = []
            review_ids: list[int] = []

            for idx in range(30):
                created_at = base_time + timedelta(minutes=idx)
                photo = Photo(
                    public_id=f'pho_mig_{idx}_{uuid4().hex[:6]}',
                    owner_user_id=guest.id,
                    upload_id=f'upl_mig_{idx}',
                    bucket='test-bucket',
                    object_key=f'user_{guest.public_id}/2026/11/obj_{idx}.jpg',
                    content_type='image/jpeg',
                    size_bytes=512,
                    status=PhotoStatus.READY,
                    exif_data={},
                    client_meta={},
                    created_at=created_at,
                )
                db.add(photo)
                db.flush()
                photo_ids.append(photo.id)

                # First 25 photos have tasks + reviews; last 5 photos have no reviews.
                if idx < 25:
                    task = ReviewTask(
                        public_id=f'tsk_mig_{idx}_{uuid4().hex[:6]}',
                        photo_id=photo.id,
                        owner_user_id=guest.id,
                        mode=ReviewMode.flash,
                        status=TaskStatus.SUCCEEDED,
                        request_payload={},
                        created_at=created_at,
                    )
                    db.add(task)
                    db.flush()
                    task_ids.append(task.id)

                    review = Review(
                        public_id=f'rev_mig_{idx}_{uuid4().hex[:6]}',
                        task_id=task.id,
                        photo_id=photo.id,
                        owner_user_id=guest.id,
                        mode=ReviewMode.flash,
                        status=ReviewStatus.SUCCEEDED,
                        image_type='default',
                        schema_version='2.0',
                        result_json={'scores': {}},
                        final_score=Decimal('7.50'),
                        created_at=created_at,
                    )
                    db.add(review)
                    db.flush()
                    review_ids.append(review.id)

            db.commit()
            token = issue_guest_token(guest)

            migrated_reviews, migrated_photos = _migrate_guest_records(
                db=db,
                target_user=target,
                guest_token=token,
                recent_limit=20,
                strict=True,
            )
            db.commit()

            self.assertEqual(migrated_reviews, 25)
            self.assertEqual(migrated_photos, 30)

            # Idempotent repeat with strict=False returns (0, 0).
            self.assertEqual(
                _migrate_guest_records(
                    db=db,
                    target_user=target,
                    guest_token=token,
                    recent_limit=20,
                    strict=False,
                ),
                (0, 0),
            )

        with self.Session() as db:
            self.assertEqual(db.get(User, guest.id).status, UserStatus.deleted)
            self.assertEqual(db.query(Photo).filter(Photo.owner_user_id == guest.id).count(), 0)
            self.assertEqual(db.query(Review).filter(Review.owner_user_id == guest.id).count(), 0)
            self.assertEqual(db.query(ReviewTask).filter(ReviewTask.owner_user_id == guest.id).count(), 0)
            self.assertEqual(db.query(Photo).filter(Photo.owner_user_id == target.id).count(), 30)
            self.assertEqual(db.query(Review).filter(Review.owner_user_id == target.id).count(), 25)
            self.assertEqual(db.query(ReviewTask).filter(ReviewTask.owner_user_id == target.id).count(), 25)

            # No review/photo or review/task ownership mismatch.
            mismatched_photos = (
                db.query(Review.id)
                .join(Photo, Photo.id == Review.photo_id)
                .filter(Review.id.in_(review_ids), Review.owner_user_id != Photo.owner_user_id)
                .count()
            )
            mismatched_tasks = (
                db.query(Review.id)
                .join(ReviewTask, ReviewTask.id == Review.task_id)
                .filter(Review.id.in_(review_ids), Review.owner_user_id != ReviewTask.owner_user_id)
                .count()
            )
            self.assertEqual(mismatched_photos, 0)
            self.assertEqual(mismatched_tasks, 0)

    def _assert_all_public_paths_hide_review(
        self,
        client: TestClient,
        *,
        owner_public_profile_id: str,
        review_public_id: str,
        share_token: str,
        public_photo_url: str,
    ) -> None:
        gallery_list = client.get('/api/v1/gallery')
        self.assertEqual(gallery_list.status_code, 200)
        self.assertEqual(gallery_list.json()['total_count'], 0)
        self.assertEqual(gallery_list.json()['items'], [])

        scoreboard = client.get('/api/v1/gallery/scoreboard', params={'window_days': 30})
        self.assertEqual(scoreboard.status_code, 200)
        self.assertEqual(scoreboard.json()['items'], [])

        neighbors = client.get(f'/api/v1/gallery/{review_public_id}/neighbors')
        self.assertEqual(neighbors.status_code, 200)
        self.assertIsNone(neighbors.json()['previous'])
        self.assertIsNone(neighbors.json()['next'])

        sitemap = client.get('/api/v1/gallery/sitemap-entries')
        self.assertEqual(sitemap.status_code, 200)
        self.assertEqual(sitemap.json()['items'], [])

        self.assertEqual(client.get(f'/api/v1/gallery/{review_public_id}').status_code, 404)
        self.assertEqual(client.post(f'/api/v1/gallery/{review_public_id}/likes').status_code, 404)
        self.assertEqual(client.get(f'/api/v1/profiles/{owner_public_profile_id}').status_code, 404)
        self.assertEqual(client.get(f'/api/v1/reviews/{review_public_id}').status_code, 404)
        self.assertEqual(client.get(f'/api/v1/public/reviews/{share_token}').status_code, 404)
        self.assertEqual(client.get(f'/api/v1/photos/gallery/{review_public_id}/thumbnail').status_code, 404)
        self.assertEqual(client.get(public_photo_url).status_code, 404)

    def test_clerk_delete_webhook_withdraws_public_channels_and_releases_retention_protection(self) -> None:
        now = datetime.now(timezone.utc)
        published_at = now - timedelta(days=2)
        with self.Session() as db:
            owner = self._make_user(
                db,
                clerk_user_id=f'clerk_del_{uuid4().hex[:8]}',
                public_profile_enabled=True,
            )
            viewer = self._make_user(db)
            photo, review = self._seed_public_review(db, owner, published_at=published_at)
            share_token = review.share_token
            assert share_token is not None
            owner_public_profile_id = owner.public_profile_id
            assert owner_public_profile_id is not None
            review_public_id = review.public_id
            viewer_id = viewer.id
            request_stub = SimpleNamespace(
                base_url='http://testserver/',
                headers={'host': 'testserver'},
                url_for=lambda _route, photo_id: f'http://testserver/api/v1/photos/{photo_id}/image',
            )
            public_photo_url = photos._build_photo_proxy_url(
                request_stub, photo.public_id, owner.public_id, public_review=review, public_channel='share',
            ).replace('http://testserver', '')
            db.commit()

            outcome, public_id = _handle_clerk_user_deleted(db, {'id': owner.clerk_user_id})
            db.commit()
            db.expire_all()

            self.assertEqual(outcome, 'deleted')
            self.assertEqual(public_id, owner.public_id)

            refreshed_review = db.get(Review, review.id)
            self.assertFalse(refreshed_review.is_public)
            self.assertIsNone(refreshed_review.share_token)
            self.assertFalse(refreshed_review.gallery_visible)
            self.assertEqual(refreshed_review.gallery_audit_status, 'none')
            self.assertIsNone(refreshed_review.gallery_added_at)
            self.assertIsNone(refreshed_review.gallery_rejected_reason)
            refreshed_owner = db.get(User, owner.id)
            self.assertEqual(refreshed_owner.status, UserStatus.deleted)
            self.assertFalse(refreshed_owner.public_profile_enabled)

            # Object retention no longer treats the photo as public; it expires under account_deleted.
            facts = collect_photo_facts(db, [db.get(Photo, photo.id)], now=now + timedelta(days=8))[photo.id]
            self.assertFalse(facts.has_public_review)
            decision = decide_photo(facts, now=now + timedelta(days=8))
            self.assertEqual((decision.purge, decision.reason), (True, 'account_deleted'))

        with self._build_client(viewer_id) as client:
            self._assert_all_public_paths_hide_review(
                client,
                owner_public_profile_id=owner_public_profile_id,
                review_public_id=review_public_id,
                share_token=share_token,
                public_photo_url=public_photo_url,
            )

    def test_stale_public_rows_for_deleted_author_are_blocked_by_every_public_read_path(self) -> None:
        now = datetime.now(timezone.utc)
        published_at = now - timedelta(days=2)
        with self.Session() as db:
            owner = self._make_user(db, public_profile_enabled=True)
            viewer = self._make_user(db)
            photo, review = self._seed_public_review(db, owner, published_at=published_at)
            share_token = review.share_token
            assert share_token is not None
            owner_public_profile_id = owner.public_profile_id
            assert owner_public_profile_id is not None
            review_public_id = review.public_id
            viewer_id = viewer.id
            request_stub = SimpleNamespace(
                base_url='http://testserver/',
                headers={'host': 'testserver'},
                url_for=lambda _route, photo_id: f'http://testserver/api/v1/photos/{photo_id}/image',
            )
            public_photo_url = photos._build_photo_proxy_url(
                request_stub, photo.public_id, owner.public_id, public_review=review, public_channel='gallery',
            ).replace('http://testserver', '')
            # Simulate a pre-fix deleted account whose review public flags were never cleared.
            owner.status = UserStatus.deleted
            db.add(owner)
            db.commit()

            # Defensive retention check: stale public flags on a deleted account do not protect the photo.
            facts = collect_photo_facts(db, [db.get(Photo, photo.id)], now=now + timedelta(days=8))[photo.id]
            self.assertFalse(facts.has_public_review)

        with self._build_client(viewer_id) as client:
            self._assert_all_public_paths_hide_review(
                client,
                owner_public_profile_id=owner_public_profile_id,
                review_public_id=review_public_id,
                share_token=share_token,
                public_photo_url=public_photo_url,
            )


if __name__ == '__main__':
    unittest.main()
