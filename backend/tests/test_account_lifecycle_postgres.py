from __future__ import annotations

import os
import sys
import threading
import unittest
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import and_, create_engine, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker
from starlette.requests import Request

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import CurrentActor, get_current_actor, get_db, issue_guest_token  # noqa: E402
from app.api.routers import gallery, generations, photos, profiles, review_actions, review_create, review_queries  # noqa: E402
from app.api.routers.auth_support import (  # noqa: E402
    _cleanup_deleted_user_feature_state,
    _handle_clerk_user_deleted,
    _migrate_guest_records,
)
from app.api.routers.gallery_support import _public_gallery_filters  # noqa: E402
from app.db.models import (  # noqa: E402
    Base,
    RateLimitCounter,
    Photo,
    PhotoStatus,
    PracticeAttempt,
    PracticeFeedback,
    PracticeSceneGroup,
    PracticeSession,
    Review,
    ReviewCallCost,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    UsageLedger,
    User,
    UserPlan,
    UserStatus,
)
from app.schemas import (  # noqa: E402
    AuthClerkExchangeRequest,
    GenerationCreateRequest,
    GuestReviewMigrateRequest,
    ReviewCreateRequest,
    ReviewMetaUpdateRequest,
)
from app.services.ai import AIReviewError, AIReviewResponse, notify_ai_provider_call  # noqa: E402
from app.services.gallery_scoreboard import _owner_profile_url  # noqa: E402
from app.services.object_retention import collect_photo_facts, decide_photo  # noqa: E402
from app.services.review_task_processor import _claim_task, _process_task, process_review_task  # noqa: E402

TEST_DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()


class _FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def with_for_update(self, *args, **kwargs):
        return self

    def populate_existing(self):
        return self

    def limit(self, *args, **kwargs):
        raise AssertionError('migration must not apply .limit() to guest records')

    def first(self):
        return self.rows[0] if self.rows else None

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
            User: [guest],
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
        Base.metadata.create_all(self.connection, checkfirst=False)
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


@unittest.skipUnless(TEST_DATABASE_URL, 'requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
class AccountLifecycleConcurrencyPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = 'lcconc_' + uuid4().hex
        self.admin = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        with self.admin.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.engine = create_engine(
            TEST_DATABASE_URL,
            pool_pre_ping=True,
            connect_args={'options': f'-csearch_path={self.schema},public'},
        )
        Base.metadata.create_all(self.engine, checkfirst=False)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False, expire_on_commit=False)

    def tearDown(self) -> None:
        self.engine.dispose()
        with self.admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        self.admin.dispose()

    def _make_user(self, db: Session, *, plan: UserPlan) -> User:
        suffix = uuid4().hex[:10]
        user = User(
            public_id=f'{"gst" if plan == UserPlan.guest else "usr"}_cc_{suffix}',
            email=f'cc_{suffix}@example.test',
            username=f'cc_{suffix}',
            plan=plan,
            daily_quota_total=5,
            daily_quota_used=0,
            status=UserStatus.active,
        )
        db.add(user)
        db.flush()
        return user

    def _make_photo(self, db: Session, owner: User, suffix: str) -> Photo:
        photo = Photo(
            public_id=f'pho_cc_{suffix}',
            owner_user_id=owner.id,
            upload_id=f'upl_cc_{suffix}',
            bucket='test-bucket',
            object_key=f'user_{owner.public_id}/2026/11/obj_{suffix}.jpg',
            content_type='image/jpeg',
            size_bytes=512,
            status=PhotoStatus.READY,
            exif_data={},
            client_meta={},
        )
        db.add(photo)
        db.flush()
        return photo

    def _fake_ai_response(self) -> AIReviewResponse:
        result = SimpleNamespace(
            final_score=7.6,
            model_dump=lambda: {
                'scores': {'composition': 8, 'lighting': 7, 'color': 8, 'impact': 7, 'technical': 8},
                'advantage': 'Clear framing.',
                'critique': 'Shadows are slightly flat.',
                'suggestions': 'Raise contrast slightly.',
            },
        )
        return AIReviewResponse(
            result=result,
            model_name='gpt-6-sol',
            model_version='gpt-6-sol-test',
            prompt_version='photo-review-v9-gpt6-image-led',
            scorer_model_name='gpt-6-sol',
            scorer_model_version='gpt-6-sol-test',
            writer_model_name='gpt-6-sol',
            writer_model_version='gpt-6-sol-test',
            score_prompt_version='photo-score-v9-applicability',
            input_tokens=120,
            output_tokens=60,
            cost_usd=Decimal('0.002000'),
            cost_rate_version='test-rate-v1',
            latency_ms=100,
        )

    def test_worker_claim_then_migrate_then_finish_lands_all_rows_on_target(self) -> None:
        with self.Session() as db:
            guest = self._make_user(db, plan=UserPlan.guest)
            target = self._make_user(db, plan=UserPlan.free)
            photo = self._make_photo(db, guest, uuid4().hex[:8])
            task = ReviewTask(
                public_id=f'tsk_cc_{uuid4().hex[:8]}',
                photo_id=photo.id,
                owner_user_id=guest.id,
                mode=ReviewMode.flash,
                status=TaskStatus.PENDING,
                request_payload={'locale': 'en', 'image_type': 'default', 'analysis_type': 'single'},
            )
            db.add(task)
            db.commit()
            guest_token = issue_guest_token(guest)
            task_id = task.id
            photo_id = photo.id
            guest_id = guest.id
            target_id = target.id

        claim_token = f'worker-cc:{uuid4().hex}'
        with self.Session() as db:
            self.assertTrue(_claim_task(db, task_id, claim_token))

        ai_entered = threading.Event()
        migration_done = threading.Event()
        worker_error: list[BaseException] = []

        def fake_run_ai_review(*args, **kwargs):
            notify_ai_provider_call(
                stage='writer',
                outcome='succeeded',
                model_name='gpt-6-sol',
                usage={'input_tokens': 120, 'output_tokens': 60},
            )
            ai_entered.set()
            assert migration_done.wait(timeout=10), 'migration did not finish in time'
            return self._fake_ai_response()

        def run_worker():
            with self.Session() as worker_db:
                try:
                    loaded_task = worker_db.get(ReviewTask, task_id)
                    with (
                        patch('app.services.review_task_processor.get_object_read_url', return_value='https://img.test/a.jpg'),
                        patch('app.services.review_task_processor.canonical_score_cache_lease', return_value=nullcontext(None)),
                        patch('app.services.review_task_processor.run_ai_review', side_effect=fake_run_ai_review),
                        patch('app.services.review_task_processor.record_review_terminal'),
                        patch('app.services.review_call_costs.SessionLocal', self.Session),
                    ):
                        _process_task(worker_db, loaded_task, claim_token=claim_token)
                except BaseException as exc:  # pragma: no cover - surfaced below
                    worker_error.append(exc)

        worker_thread = threading.Thread(target=run_worker)
        worker_thread.start()
        self.assertTrue(ai_entered.wait(timeout=10))

        # Run guest sign-in migration in a separate committed transaction while AI call is in flight.
        with self.Session() as migrate_db:
            target_row = migrate_db.get(User, target_id)
            migrated_reviews, migrated_photos = _migrate_guest_records(
                db=migrate_db,
                target_user=target_row,
                guest_token=guest_token,
                recent_limit=20,
                strict=True,
            )
            migrate_db.commit()
        self.assertEqual((migrated_reviews, migrated_photos), (0, 1))
        migration_done.set()

        worker_thread.join(timeout=15)
        self.assertEqual(worker_error, [])

        with self.Session() as db:
            final_task = db.get(ReviewTask, task_id)
            final_photo = db.get(Photo, photo_id)
            final_review = db.query(Review).filter(Review.task_id == task_id).one()
            final_usage = db.query(UsageLedger).filter(UsageLedger.task_id == task_id).one()
            final_costs = db.query(ReviewCallCost).filter(ReviewCallCost.task_id == task_id).all()

            self.assertEqual(final_task.status, TaskStatus.SUCCEEDED)
            self.assertEqual(final_task.owner_user_id, target_id)
            self.assertEqual(final_photo.owner_user_id, target_id)
            self.assertEqual(final_review.owner_user_id, target_id)
            # Usage stays with the guest whose quota admitted the request.
            self.assertEqual(final_usage.user_id, guest_id)
            self.assertGreaterEqual(len(final_costs), 1)
            self.assertTrue(all(row.owner_user_id == target_id for row in final_costs))
            self.assertEqual(db.get(User, guest_id).status, UserStatus.deleted)

    def test_worker_finish_then_waiting_migration_lands_same_rows_on_target(self) -> None:
        with self.Session() as db:
            guest = self._make_user(db, plan=UserPlan.guest)
            target = self._make_user(db, plan=UserPlan.free)
            photo = self._make_photo(db, guest, uuid4().hex[:8])
            task = ReviewTask(
                public_id=f'tsk_cc_{uuid4().hex[:8]}',
                photo_id=photo.id,
                owner_user_id=guest.id,
                mode=ReviewMode.flash,
                status=TaskStatus.PENDING,
                request_payload={'locale': 'en', 'image_type': 'default', 'analysis_type': 'single'},
            )
            db.add(task)
            db.commit()
            guest_token = issue_guest_token(guest)
            task_id = task.id
            photo_id = photo.id
            guest_id = guest.id
            target_id = target.id

        claim_token = f'worker-cc:{uuid4().hex}'
        with self.Session() as db:
            self.assertTrue(_claim_task(db, task_id, claim_token))

        migration_done = threading.Event()
        migration_error: list[BaseException] = []
        blocked_while_worker_held_task: list[bool] = []

        def fake_run_ai_review(*args, **kwargs):
            notify_ai_provider_call(
                stage='writer',
                outcome='succeeded',
                model_name='gpt-6-sol',
                usage={'input_tokens': 120, 'output_tokens': 60},
            )
            return self._fake_ai_response()

        def run_migration():
            try:
                self._migrate_in_new_session(target_id, guest_token)
            except BaseException as exc:  # pragma: no cover - surfaced below
                migration_error.append(exc)
            finally:
                migration_done.set()

        migration_thread = threading.Thread(target=run_migration)

        def start_migration_before_commit(*args, **kwargs):
            # The worker holds the task lock and has written its review, usage and
            # guest quota update; migration must wait for it instead of deadlocking.
            migration_thread.start()
            blocked_while_worker_held_task.append(not migration_done.wait(timeout=1))

        with self.Session() as worker_db:
            loaded_task = worker_db.get(ReviewTask, task_id)
            with (
                patch('app.services.review_task_processor.get_object_read_url', return_value='https://img.test/a.jpg'),
                patch('app.services.review_task_processor.canonical_score_cache_lease', return_value=nullcontext(None)),
                patch('app.services.review_task_processor.run_ai_review', side_effect=fake_run_ai_review),
                patch('app.services.review_task_processor.record_review_terminal', side_effect=start_migration_before_commit),
                patch('app.services.review_call_costs.SessionLocal', self.Session),
            ):
                _process_task(worker_db, loaded_task, claim_token=claim_token)

        migration_thread.join(timeout=15)
        self.assertEqual(migration_error, [])
        self.assertEqual(blocked_while_worker_held_task, [True])

        # Same final rows as the migrate-first order above.
        with self.Session() as db:
            final_task = db.get(ReviewTask, task_id)
            final_review = db.query(Review).filter(Review.task_id == task_id).one()
            final_usage = db.query(UsageLedger).filter(UsageLedger.task_id == task_id).one()
            final_costs = db.query(ReviewCallCost).filter(ReviewCallCost.task_id == task_id).all()
            self.assertEqual(final_task.status, TaskStatus.SUCCEEDED)
            self.assertEqual(final_task.owner_user_id, target_id)
            self.assertEqual(db.get(Photo, photo_id).owner_user_id, target_id)
            self.assertEqual(final_review.owner_user_id, target_id)
            self.assertEqual(final_usage.user_id, guest_id)
            self.assertEqual(len(final_costs), 1)
            self.assertEqual(final_costs[0].owner_user_id, target_id)
            self.assertEqual(db.get(User, guest_id).status, UserStatus.deleted)
            self.assertEqual(db.get(User, target_id).daily_quota_used, 0)

    def _sync_request(self, photo_public_id: str):
        payload = ReviewCreateRequest.model_validate({
            'photo_id': photo_public_id,
            'mode': 'flash',
            'async': False,
            'locale': 'en',
        })
        request = SimpleNamespace(headers={}, client=SimpleNamespace(host='127.0.0.1'))
        return payload, request

    def _migrate_in_new_session(self, target_id: int, guest_token: str) -> None:
        with self.Session() as migrate_db:
            _migrate_guest_records(
                db=migrate_db,
                target_user=migrate_db.get(User, target_id),
                guest_token=guest_token,
                recent_limit=20,
                strict=True,
            )
            migrate_db.commit()

    def test_sync_review_after_committed_migration_fails_closed_before_provider_call(self) -> None:
        with self.Session() as db:
            guest = self._make_user(db, plan=UserPlan.guest)
            target = self._make_user(db, plan=UserPlan.free)
            photo = self._make_photo(db, guest, uuid4().hex[:8])
            db.commit()
            guest_token = issue_guest_token(guest)
            photo_public_id = photo.public_id
            guest_id = guest.id
            target_id = target.id

        def migrate_after_authentication(*args, **kwargs):
            self._migrate_in_new_session(target_id, guest_token)
            return {}

        with self.Session() as sync_db:
            actor = CurrentActor(sync_db.get(User, guest_id))
            payload, request = self._sync_request(photo_public_id)
            with (
                patch('app.api.routers.review_create.enforce_guest_review_limits', side_effect=migrate_after_authentication),
                patch('app.api.routers.review_create.run_ai_review') as provider,
            ):
                with self.assertRaises(HTTPException) as raised:
                    review_create._create_review(payload, request, sync_db, actor)
            provider.assert_not_called()
        self.assertEqual((raised.exception.status_code, raised.exception.detail['code']), (409, 'PHOTO_OWNER_MISMATCH'))

        with self.Session() as db:
            self.assertEqual(db.query(Review).filter(Review.owner_user_id.in_([guest_id, target_id])).count(), 0)
            self.assertEqual(db.query(UsageLedger).filter(UsageLedger.user_id.in_([guest_id, target_id])).count(), 0)

    def test_sync_review_holding_photo_lock_makes_migration_wait_then_moves_review(self) -> None:
        with self.Session() as db:
            guest = self._make_user(db, plan=UserPlan.guest)
            target = self._make_user(db, plan=UserPlan.free)
            photo = self._make_photo(db, guest, uuid4().hex[:8])
            db.commit()
            guest_token = issue_guest_token(guest)
            photo_public_id = photo.public_id
            photo_id = photo.id
            guest_id = guest.id
            target_id = target.id

        migration_done = threading.Event()
        migration_error: list[BaseException] = []
        blocked_during_provider_call: list[bool] = []

        def run_migration():
            try:
                self._migrate_in_new_session(target_id, guest_token)
            except BaseException as exc:  # pragma: no cover - surfaced below
                migration_error.append(exc)
            finally:
                migration_done.set()

        migration_thread = threading.Thread(target=run_migration)

        def provider_call_with_concurrent_migration(*args, **kwargs):
            migration_thread.start()
            blocked_during_provider_call.append(not migration_done.wait(timeout=1))
            return self._fake_ai_response()

        with self.Session() as sync_db:
            actor = CurrentActor(sync_db.get(User, guest_id))
            payload, request = self._sync_request(photo_public_id)
            with (
                patch('app.api.routers.review_create.enforce_guest_review_limits', return_value={}),
                patch('app.api.routers.review_create.get_object_read_url', return_value='https://img.test/s.jpg'),
                patch('app.api.routers.review_create.canonical_score_cache_lease', return_value=nullcontext(None)),
                patch('app.api.routers.review_create.run_ai_review', side_effect=provider_call_with_concurrent_migration),
                patch('app.api.routers.review_create._attach_billing_info'),
            ):
                response = review_create._create_review(payload, request, sync_db, actor)

        migration_thread.join(timeout=15)
        self.assertEqual(migration_error, [])
        self.assertEqual(blocked_during_provider_call, [True])

        with self.Session() as db:
            review = db.query(Review).filter(Review.public_id == response['review_id']).one()
            usage = db.query(UsageLedger).filter(UsageLedger.review_id == review.id).one()
            self.assertEqual(db.get(Photo, photo_id).owner_user_id, target_id)
            self.assertEqual(review.owner_user_id, target_id)
            self.assertEqual(usage.user_id, guest_id)
            self.assertEqual(db.get(User, guest_id).status, UserStatus.deleted)

    def _guest_request(self) -> Request:
        return Request({
            'type': 'http', 'method': 'POST', 'path': '/api/v1/reviews', 'headers': [], 'scheme': 'http',
            'server': ('testserver', 80), 'client': (f'203.0.113.{uuid4().int % 200 + 1}', 4321),
        })

    def _admit_guest_task(self, guest_id: int, photo_public_id: str) -> str:
        """Create an async guest task through real guest admission."""
        with self.Session() as db:
            actor = CurrentActor(db.get(User, guest_id))
            payload = ReviewCreateRequest.model_validate({
                'photo_id': photo_public_id, 'mode': 'flash', 'async': True, 'locale': 'en',
            })
            with patch('app.api.routers.review_create.settings.cloud_tasks_enabled', False):
                response = review_create._create_review(payload, self._guest_request(), db, actor)
        return response['task_id']

    def _run_worker(self, task_public_id: str, provider) -> dict:
        with (
            patch('app.services.review_task_processor.SessionLocal', self.Session),
            patch('app.services.review_call_costs.SessionLocal', self.Session),
            patch('app.services.review_task_processor.settings.cloud_tasks_enabled', False),
            patch('app.services.review_task_processor.get_object_read_url', return_value='https://img.test/q.jpg'),
            patch('app.services.review_task_processor.canonical_score_cache_lease', return_value=nullcontext(None)),
            patch('app.services.review_task_processor.run_ai_review', side_effect=provider),
            patch('app.services.review_task_processor.record_review_terminal'),
        ):
            return process_review_task(task_public_id, worker_name='worker-q')

    def _successful_provider(self, *args, **kwargs):
        notify_ai_provider_call(
            stage='writer', outcome='succeeded', model_name='gpt-6-sol',
            usage={'input_tokens': 120, 'output_tokens': 60},
        )
        return self._fake_ai_response()

    def _guest_and_target(self, *, target_daily_used: int = 0):
        with self.Session() as db:
            guest = self._make_user(db, plan=UserPlan.guest)
            target = self._make_user(db, plan=UserPlan.free)
            target.daily_quota_used = target_daily_used
            target.daily_quota_date = datetime.now(timezone.utc).date()
            photo = self._make_photo(db, guest, uuid4().hex[:8])
            db.commit()
            return guest.id, target.id, photo.public_id, issue_guest_token(guest)

    def _assert_admitted_guest_charged(self, task_public_id: str, guest_id: int, target_id: int, *, target_daily_used: int = 0):
        with self.Session() as db:
            task = db.query(ReviewTask).filter(ReviewTask.public_id == task_public_id).one()
            self.assertEqual(task.status, TaskStatus.SUCCEEDED)
            self.assertEqual(task.owner_user_id, target_id)
            self.assertEqual(task.request_payload['_admitted_user_id'], guest_id)
            review = db.query(Review).filter(Review.task_id == task.id).one()
            self.assertEqual(review.owner_user_id, target_id)
            usage = db.query(UsageLedger).filter(UsageLedger.task_id == task.id).one()
            self.assertEqual(usage.user_id, guest_id)
            costs = db.query(ReviewCallCost).filter(ReviewCallCost.task_id == task.id).all()
            self.assertTrue(costs)
            self.assertTrue(all(row.owner_user_id == target_id for row in costs))
            self.assertEqual(db.get(User, guest_id).status, UserStatus.deleted)
            self.assertEqual(db.get(User, guest_id).daily_quota_used, 1)
            self.assertEqual(db.get(User, target_id).daily_quota_used, target_daily_used)
            self.assertEqual(db.query(UsageLedger).filter(UsageLedger.user_id == target_id).count(), 0)
            return task

    def test_task_migrated_while_pending_charges_admitting_guest(self) -> None:
        guest_id, target_id, photo_public_id, guest_token = self._guest_and_target()
        task_public_id = self._admit_guest_task(guest_id, photo_public_id)
        self._migrate_in_new_session(target_id, guest_token)

        self.assertEqual(self._run_worker(task_public_id, self._successful_provider)['result'], 'processed')
        self._assert_admitted_guest_charged(task_public_id, guest_id, target_id)

    def test_task_migrated_between_retries_charges_admitting_guest(self) -> None:
        guest_id, target_id, photo_public_id, guest_token = self._guest_and_target()
        task_public_id = self._admit_guest_task(guest_id, photo_public_id)
        attempts: list[int] = []

        def provider(*args, **kwargs):
            attempts.append(1)
            if len(attempts) == 1:
                notify_ai_provider_call(stage='writer', outcome='failed', model_name='gpt-6-sol')
                raise AIReviewError('writer timed out', stage='writing')
            return self._successful_provider()

        self._run_worker(task_public_id, provider)
        with self.Session() as db:
            task = db.query(ReviewTask).filter(ReviewTask.public_id == task_public_id).one()
            self.assertEqual(task.status, TaskStatus.PENDING)
        self._migrate_in_new_session(target_id, guest_token)
        with self.Session() as db:
            db.query(ReviewTask).filter(ReviewTask.public_id == task_public_id).update({'next_attempt_at': None})
            db.commit()

        self.assertEqual(self._run_worker(task_public_id, provider)['result'], 'processed')
        self.assertEqual(len(attempts), 2)
        task = self._assert_admitted_guest_charged(task_public_id, guest_id, target_id)
        with self.Session() as db:
            call_keys = sorted(row.call_key for row in db.query(ReviewCallCost).filter(ReviewCallCost.task_id == task.id))
        self.assertEqual(call_keys, ['attempt:1:writer', 'attempt:2:writer'])

    def test_pending_task_moved_to_target_at_daily_limit_still_completes(self) -> None:
        full = review_create.settings.free_review_limit_per_day
        guest_id, target_id, photo_public_id, guest_token = self._guest_and_target(target_daily_used=full)
        task_public_id = self._admit_guest_task(guest_id, photo_public_id)
        self._migrate_in_new_session(target_id, guest_token)

        self.assertEqual(self._run_worker(task_public_id, self._successful_provider)['result'], 'processed')
        self._assert_admitted_guest_charged(task_public_id, guest_id, target_id, target_daily_used=full)

    def test_sync_owner_mismatch_returns_personal_guest_counters(self) -> None:
        guest_id, target_id, photo_public_id, guest_token = self._guest_and_target()
        real_admission = review_create.enforce_guest_review_limits

        def admit_then_migrate(*args, **kwargs):
            limits = real_admission(*args, **kwargs)
            self._migrate_in_new_session(target_id, guest_token)
            return limits

        request = self._guest_request()
        with self.Session() as sync_db:
            actor = CurrentActor(sync_db.get(User, guest_id))
            payload, _ = self._sync_request(photo_public_id)
            with (
                patch('app.api.routers.review_create.enforce_guest_review_limits', side_effect=admit_then_migrate),
                patch('app.api.routers.review_create.run_ai_review') as provider,
            ):
                with self.assertRaises(HTTPException) as raised:
                    review_create._create_review(payload, request, sync_db, actor)
            provider.assert_not_called()
        self.assertEqual((raised.exception.status_code, raised.exception.detail['code']), (409, 'PHOTO_OWNER_MISMATCH'))

        with self.Session() as db:
            guest = db.get(User, guest_id)
            quota_key = review_create.guest_quota_scope_key(request, guest)
            network_key = review_create.guest_network_scope_key(request)
            counters = {
                (row.scope, row.scope_key): row.hit_count
                for row in db.query(RateLimitCounter).filter(RateLimitCounter.scope_key.in_([quota_key, network_key]))
            }
        self.assertEqual(counters[('guest_review_daily', quota_key)], 0)
        self.assertEqual(counters[('guest_review_monthly', quota_key)], 0)
        # Network admission budgets stay spent.
        self.assertEqual(counters[('guest_review_network_daily', network_key)], 1)

    def _wait_for_lock_waiter(self) -> None:
        for _ in range(100):
            with self.engine.connect() as connection:
                waiting = connection.execute(text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE datname = current_database() AND wait_event_type = 'Lock'"
                )).scalar_one()
            if waiting:
                return
            threading.Event().wait(0.05)
        self.fail('request never waited on the held row lock')

    def _row_is_unlocked(self, table: str, row_id: int) -> bool:
        with self.engine.connect() as connection:
            try:
                connection.execute(text(f'SELECT id FROM {table} WHERE id = :id FOR NO KEY UPDATE NOWAIT'), {'id': row_id})
            except OperationalError:
                return False
            finally:
                connection.rollback()
        return True

    def test_paired_retake_admission_locks_photos_in_ascending_id_order(self) -> None:
        with self.Session() as db:
            user = self._make_user(db, plan=UserPlan.free)
            source_photo = self._make_photo(db, user, uuid4().hex[:8])
            new_photo = self._make_photo(db, user, uuid4().hex[:8])
            source_review = Review(
                public_id=f'rev_src_{uuid4().hex[:8]}', photo_id=source_photo.id, owner_user_id=user.id,
                mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, image_type='default',
                schema_version='2.0', result_json={'scores': {}}, final_score=Decimal('7.00'),
            )
            db.add(source_review)
            db.commit()
            user_id, source_photo_id, new_photo_id = user.id, source_photo.id, new_photo.id
            new_photo_public_id, source_review_public_id = new_photo.public_id, source_review.public_id
        self.assertLess(source_photo_id, new_photo_id)

        outcome: list[object] = []

        def create_paired_task():
            try:
                with self.Session() as db:
                    actor = CurrentActor(db.get(User, user_id))
                    payload = ReviewCreateRequest.model_validate({
                        'photo_id': new_photo_public_id, 'mode': 'flash', 'async': True, 'locale': 'en',
                        'analysis_type': 'retake_compare', 'source_review_id': source_review_public_id,
                    })
                    with patch('app.api.routers.review_create.settings.cloud_tasks_enabled', False):
                        outcome.append(review_create._create_review(payload, self._guest_request(), db, actor))
            except BaseException as exc:  # pragma: no cover - surfaced below
                outcome.append(exc)

        # Hold the lower-id source photo the way a guest sign-in migration does.
        with self.engine.connect() as blocker:
            blocker.execute(text('SELECT id FROM photos WHERE id = :id FOR NO KEY UPDATE'), {'id': source_photo_id})
            thread = threading.Thread(target=create_paired_task)
            thread.start()
            self._wait_for_lock_waiter()
            # Waiting on the source photo, the request must not hold the higher-id photo yet.
            self.assertTrue(self._row_is_unlocked('photos', new_photo_id))
            blocker.rollback()
        thread.join(timeout=15)

        self.assertEqual(len(outcome), 1)
        self.assertIsInstance(outcome[0], dict)
        self.assertIn('task_id', outcome[0])

    def test_share_enable_locks_photo_before_owner_and_rechecks_migrated_owner(self) -> None:
        with self.Session() as db:
            guest = self._make_user(db, plan=UserPlan.guest)
            target = self._make_user(db, plan=UserPlan.free)
            photo = self._make_photo(db, guest, uuid4().hex[:8])
            review = Review(
                public_id=f'rev_shr_{uuid4().hex[:8]}', photo_id=photo.id, owner_user_id=guest.id,
                mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, image_type='default',
                schema_version='2.0', result_json={'scores': {}}, final_score=Decimal('7.00'),
            )
            db.add(review)
            db.commit()
            guest_id, target_id, photo_id = guest.id, target.id, photo.id
            review_id, review_public_id = review.id, review.public_id

        outcome: list[object] = []

        def enable_share():
            try:
                with self.Session() as db:
                    actor = CurrentActor(db.get(User, guest_id))
                    outcome.append(review_actions.enable_review_share(review_public_id, SimpleNamespace(), db, actor))
            except BaseException as exc:
                outcome.append(exc)

        with self.engine.connect() as migration:
            migration.execute(text('SELECT id FROM photos WHERE id = :id FOR NO KEY UPDATE'), {'id': photo_id})
            thread = threading.Thread(target=enable_share)
            thread.start()
            self._wait_for_lock_waiter()
            # Waiting on the photo, the handler must not hold the guest row migration locks next.
            self.assertTrue(self._row_is_unlocked('users', guest_id))
            migration.execute(text('SELECT id FROM users WHERE id = :id FOR NO KEY UPDATE'), {'id': guest_id})
            migration.execute(text('UPDATE photos SET owner_user_id = :t WHERE id = :id'), {'t': target_id, 'id': photo_id})
            migration.execute(text('UPDATE reviews SET owner_user_id = :t WHERE id = :id'), {'t': target_id, 'id': review_id})
            migration.execute(text("UPDATE users SET status = 'deleted' WHERE id = :id"), {'id': guest_id})
            migration.commit()
        thread.join(timeout=15)

        self.assertEqual(len(outcome), 1)
        self.assertIsInstance(outcome[0], HTTPException)
        self.assertEqual((outcome[0].status_code, outcome[0].detail['code']), (404, 'REVIEW_NOT_FOUND'))
        with self.Session() as db:
            self.assertIsNone(db.get(Review, review_id).share_token)

    def test_gallery_publish_locks_photo_before_owner_and_rechecks_deleted_review(self) -> None:
        with self.Session() as db:
            user = self._make_user(db, plan=UserPlan.free)
            photo = self._make_photo(db, user, uuid4().hex[:8])
            review = Review(
                public_id=f'rev_gal_{uuid4().hex[:8]}', photo_id=photo.id, owner_user_id=user.id,
                mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, image_type='default',
                schema_version='2.0', result_json={'scores': {}}, final_score=Decimal('7.00'),
            )
            db.add(review)
            db.commit()
            user_id, photo_id, review_id = user.id, photo.id, review.id
            review_public_id = review.public_id

        outcome: list[object] = []

        def publish():
            try:
                with self.Session() as db:
                    actor = CurrentActor(db.get(User, user_id))
                    outcome.append(review_actions.update_review_meta(
                        review_public_id, ReviewMetaUpdateRequest(gallery_visible=True), db, actor,
                    ))
            except BaseException as exc:
                outcome.append(exc)

        with patch('app.api.routers.review_actions.run_content_audit', side_effect=RuntimeError('unexpected audit')) as audit:
            with self.engine.connect() as blocker:
                blocker.execute(text('SELECT id FROM photos WHERE id = :id FOR NO KEY UPDATE'), {'id': photo_id})
                thread = threading.Thread(target=publish)
                thread.start()
                try:
                    self._wait_for_lock_waiter()
                    self.assertTrue(self._row_is_unlocked('users', user_id))
                    blocker.execute(text('UPDATE reviews SET deleted_at = now() WHERE id = :id'), {'id': review_id})
                    blocker.commit()
                finally:
                    blocker.rollback()
                    thread.join(timeout=15)
            audit.assert_not_called()
        self.assertFalse(thread.is_alive())
        self.assertEqual(len(outcome), 1)
        self.assertIsInstance(outcome[0], HTTPException)
        self.assertEqual((outcome[0].status_code, outcome[0].detail['code']), (404, 'REVIEW_NOT_FOUND'))
        with self.Session() as db:
            self.assertFalse(db.get(Review, review_id).gallery_visible)

    def test_gallery_publish_takes_photo_write_lock_before_waiting_on_owner(self) -> None:
        with self.Session() as db:
            user = self._make_user(db, plan=UserPlan.free)
            photo = self._make_photo(db, user, uuid4().hex[:8])
            review = Review(
                public_id=f'rev_gal_{uuid4().hex[:8]}', photo_id=photo.id, owner_user_id=user.id,
                mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, image_type='default',
                schema_version='2.0', result_json={'scores': {}}, final_score=Decimal('7.00'),
            )
            db.add(review)
            db.commit()
            user_id, photo_id, review_id = user.id, photo.id, review.id
            review_public_id = review.public_id

        outcome: list[object] = []

        def publish():
            try:
                with self.Session() as db:
                    actor = CurrentActor(db.get(User, user_id))
                    outcome.append(review_actions.update_review_meta(
                        review_public_id, ReviewMetaUpdateRequest(gallery_visible=True), db, actor,
                    ))
            except BaseException as exc:
                outcome.append(exc)

        def thumbnail(photo):
            photo.client_meta = {'gallery_thumbnail_key': 'gallery-thumbnails/test.webp'}

        with (
            patch('app.api.routers.review_actions.run_content_audit', return_value=SimpleNamespace(safe=True)),
            patch('app.api.routers.review_actions.get_object_read_url', return_value='https://storage.test/photo'),
            patch('app.api.routers.review_actions._ensure_gallery_thumbnail', side_effect=thumbnail),
        ):
            with self.engine.connect() as blocker:
                blocker.execute(text('SELECT id FROM users WHERE id = :id FOR UPDATE'), {'id': user_id})
                thread = threading.Thread(target=publish)
                thread.start()
                try:
                    self._wait_for_lock_waiter()
                    # A concurrent share request must wait at the photo, before it can
                    # hold the owner lock needed by publication's thumbnail write.
                    with self.engine.connect() as probe:
                        with self.assertRaises(OperationalError) as raised:
                            probe.execute(text('SELECT id FROM photos WHERE id = :id FOR SHARE NOWAIT'), {'id': photo_id})
                        self.assertEqual(raised.exception.orig.pgcode, '55P03')
                        probe.rollback()
                finally:
                    blocker.rollback()
                    thread.join(timeout=15)
        self.assertFalse(thread.is_alive())
        self.assertEqual(len(outcome), 1)
        self.assertNotIsInstance(outcome[0], BaseException)
        with self.Session() as db:
            self.assertTrue(db.get(Review, review_id).gallery_visible)
            self.assertEqual(db.get(Photo, photo_id).client_meta['gallery_thumbnail_key'], 'gallery-thumbnails/test.webp')

    def test_generation_reference_locks_photo_before_owner(self) -> None:
        with self.Session() as db:
            user = self._make_user(db, plan=UserPlan.free)
            photo = self._make_photo(db, user, uuid4().hex[:8])
            db.commit()
            user_id, photo_id, photo_public_id = user.id, photo.id, photo.public_id

        outcome: list[object] = []

        def generate():
            try:
                with self.Session() as db:
                    actor = CurrentActor(db.get(User, user_id))
                    outcome.append(generations.create_generation(
                        GenerationCreateRequest(prompt='A landscape photo', quality='low', source_photo_id=photo_public_id),
                        self._guest_request(), db, actor,
                    ))
            except BaseException as exc:
                outcome.append(exc)

        with self.engine.connect() as blocker:
            blocker.execute(text('SELECT id FROM photos WHERE id = :id FOR NO KEY UPDATE'), {'id': photo_id})
            thread = threading.Thread(target=generate)
            thread.start()
            try:
                self._wait_for_lock_waiter()
                self.assertTrue(self._row_is_unlocked('users', user_id))
                blocker.execute(text("UPDATE photos SET status = 'PURGED' WHERE id = :id"), {'id': photo_id})
                blocker.commit()
            finally:
                blocker.rollback()
                thread.join(timeout=15)
        self.assertFalse(thread.is_alive())
        self.assertEqual(len(outcome), 1)
        self.assertIsInstance(outcome[0], HTTPException)
        self.assertEqual((outcome[0].status_code, outcome[0].detail['code']), (410, 'PHOTO_ORIGINAL_EXPIRED'))

    def test_concurrent_duplicate_migrations_serialize_and_never_double_report(self) -> None:
        for strict in (True, False):
            with self.subTest(strict=strict):
                with self.Session() as db:
                    guest = self._make_user(db, plan=UserPlan.guest)
                    target = self._make_user(db, plan=UserPlan.free)
                    for idx in range(5):
                        photo = self._make_photo(db, guest, f'{strict}_{idx}_{uuid4().hex[:6]}')
                        db.add(Review(
                            public_id=f'rev_dup_{idx}_{uuid4().hex[:6]}',
                            photo_id=photo.id,
                            owner_user_id=guest.id,
                            mode=ReviewMode.flash,
                            status=ReviewStatus.SUCCEEDED,
                            image_type='default',
                            schema_version='2.0',
                            result_json={'scores': {}},
                            final_score=Decimal('7.00'),
                        ))
                    db.commit()
                    guest_token = issue_guest_token(guest)
                    target_id = target.id

                barrier = threading.Barrier(2)
                outcomes: list[tuple[str, object]] = []
                lock = threading.Lock()

                def worker():
                    with self.Session() as session:
                        target_row = session.get(User, target_id)
                        barrier.wait(timeout=10)
                        try:
                            counts = _migrate_guest_records(
                                db=session,
                                target_user=target_row,
                                guest_token=guest_token,
                                recent_limit=20,
                                strict=strict,
                            )
                            session.commit()
                            entry = ('ok', counts)
                        except HTTPException as exc:
                            session.rollback()
                            entry = ('http_error', (exc.status_code, exc.detail['code']))
                        with lock:
                            outcomes.append(entry)

                threads = [threading.Thread(target=worker) for _ in range(2)]
                for t in threads:
                    t.start()
                for t in threads:
                    t.join(timeout=15)

                self.assertEqual(len(outcomes), 2)
                if strict:
                    self.assertCountEqual(
                        outcomes,
                        [('ok', (5, 5)), ('http_error', (400, 'GUEST_TOKEN_INVALID'))],
                    )
                else:
                    self.assertCountEqual(
                        outcomes,
                        [('ok', (5, 5)), ('ok', (0, 0))],
                    )


if __name__ == '__main__':
    unittest.main()
