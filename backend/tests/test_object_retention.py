from __future__ import annotations

import os
import sys
import threading
from argparse import Namespace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(BACKEND_ROOT / 'scripts'))

import configure_r2_lifecycle  # noqa: E402
import purge_expired_objects  # noqa: E402
from app.api.deps import CurrentActor, get_current_actor, get_db  # noqa: E402
from app.api.routers import photos, review_queries  # noqa: E402
from app.core.errors import ApiHTTPException  # noqa: E402
from app.db.models import (  # noqa: E402
    Base,
    BillingSubscription,
    GeneratedImage,
    ImageGenerationTask,
    Photo,
    PhotoStatus,
    Review,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
)
from app.services import guest_cleanup  # noqa: E402
from app.services.object_retention import OwnerFacts, PhotoFacts, admit_photo_use, decide_photo, purge_photo_original  # noqa: E402

DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()
NOW = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)
FREE = OwnerFacts(plan=UserPlan.free, status=UserStatus.active, updated_at=None, pro_active=False, pro_ended_at=None)


def facts(**overrides):
    values = {
        'status': PhotoStatus.READY, 'created_at': NOW - timedelta(days=40), 'owner': FREE,
        'review_count': 1, 'active_review_count': 1, 'latest_active_review_at': NOW - timedelta(days=40),
    }
    values.update(overrides)
    return PhotoFacts(**values)


def owner(**overrides):
    values = {'plan': UserPlan.free, 'status': UserStatus.active, 'updated_at': None, 'pro_active': False, 'pro_ended_at': None}
    values.update(overrides)
    return OwnerFacts(**values)


@pytest.mark.parametrize('days,purge', [(14, False), (16, True)])
def test_free_original_expires_fifteen_days_after_its_latest_critique(days, purge):
    decision = decide_photo(facts(latest_active_review_at=NOW - timedelta(days=days)), now=NOW)
    assert decision.purge is purge
    assert decision.reason == ('free_expired' if purge else 'within_retention')


def test_a_newer_critique_of_the_same_photo_extends_retention():
    decision = decide_photo(facts(created_at=NOW - timedelta(days=90), latest_active_review_at=NOW - timedelta(days=3)), now=NOW)
    assert decision == decision.__class__(False, 'within_retention', NOW + timedelta(days=12))


@pytest.mark.parametrize('field,reason', [('has_live_task', 'live_task'), ('has_public_review', 'public')])
def test_running_tasks_and_public_channels_always_protect(field, reason):
    for plan in (UserPlan.guest, UserPlan.free):
        decision = decide_photo(facts(owner=owner(plan=plan), **{field: True}), now=NOW)
        assert (decision.purge, decision.reason) == (False, reason)


def test_active_pro_keeps_originals_and_lapsed_pro_gets_a_grace_period():
    assert decide_photo(facts(owner=owner(pro_active=True)), now=NOW).reason == 'pro_active'
    lapsed = decide_photo(facts(owner=owner(pro_ended_at=NOW - timedelta(days=10))), now=NOW)
    assert (lapsed.purge, lapsed.reason, lapsed.expires_at) == (False, 'within_retention', NOW + timedelta(days=5))
    expired = decide_photo(facts(owner=owner(pro_ended_at=NOW - timedelta(days=20))), now=NOW)
    assert (expired.purge, expired.reason) == (True, 'pro_lapsed')


@pytest.mark.parametrize('days,purge', [(6, False), (8, True)])
def test_guest_originals_expire_after_seven_days(days, purge):
    decision = decide_photo(
        facts(owner=owner(plan=UserPlan.guest), created_at=NOW - timedelta(days=days), latest_active_review_at=None, review_count=0, active_review_count=0),
        now=NOW,
    )
    assert decision.purge is purge


def test_migrated_guest_records_wait_for_the_migration_fix():
    decision = decide_photo(facts(owner=owner(plan=UserPlan.guest, status=UserStatus.deleted)), now=NOW)
    assert (decision.purge, decision.reason) == (False, 'guest_migration_pending')


def test_deleted_critiques_release_the_original_after_a_day_even_for_pro():
    deleted = facts(owner=owner(pro_active=True), active_review_count=0, latest_deleted_review_at=NOW - timedelta(hours=25))
    assert (decide_photo(deleted, now=NOW).purge, decide_photo(deleted, now=NOW).reason) == (True, 'reviews_deleted')
    recent = facts(active_review_count=0, latest_deleted_review_at=NOW - timedelta(hours=2))
    assert decide_photo(recent, now=NOW).purge is False


def test_deleted_accounts_and_unconfirmed_uploads():
    account = decide_photo(facts(owner=owner(status=UserStatus.deleted, updated_at=NOW - timedelta(days=8))), now=NOW)
    assert (account.purge, account.reason) == (True, 'account_deleted')
    upload = decide_photo(facts(status=PhotoStatus.UPLOADING, created_at=NOW - timedelta(hours=30)), now=NOW)
    assert (upload.purge, upload.reason) == (True, 'unconfirmed_upload')
    assert decide_photo(facts(status=PhotoStatus.PURGED), now=NOW).reason == 'not_purgeable_status'


def test_grace_until_defers_policy_removals_but_not_unconfirmed_uploads():
    grace = NOW + timedelta(days=7)
    assert decide_photo(facts(), now=NOW, grace_until=grace).expires_at == grace
    upload = decide_photo(facts(status=PhotoStatus.UPLOADING, created_at=NOW - timedelta(hours=30)), now=NOW, grace_until=grace)
    assert upload.purge is True


def _args(**overrides):
    values = {'database_url': 'postgresql://x', 'category': None, 'grace_until': None, 'max_delete': 200, 'manifest': None, 'execute': False}
    values.update(overrides)
    return Namespace(**values)


def test_execute_requires_categories_and_the_environment_flag(monkeypatch):
    monkeypatch.delenv(purge_expired_objects.EXECUTE_ENV_FLAG, raising=False)
    purge_expired_objects._validate(_args())
    with pytest.raises(ValueError, match='category'):
        purge_expired_objects._validate(_args(execute=True))
    with pytest.raises(ValueError, match=purge_expired_objects.EXECUTE_ENV_FLAG):
        purge_expired_objects._validate(_args(execute=True, category=['photo_original']))
    monkeypatch.setenv(purge_expired_objects.EXECUTE_ENV_FLAG, '1')
    purge_expired_objects._validate(_args(execute=True, category=['photo_original']))


def test_database_url_is_always_explicit_and_manifests_stay_outside_the_repo():
    with pytest.raises(SystemExit):
        purge_expired_objects.build_parser().parse_args([])
    with pytest.raises(ValueError, match='outside'):
        purge_expired_objects._validate(_args(manifest=BACKEND_ROOT / 'retention.jsonl'))


def test_lifecycle_merge_keeps_foreign_rules_and_replaces_managed_ones():
    foreign = {'ID': 'Default Multipart Abort Rule', 'Status': 'Enabled', 'AbortIncompleteMultipartUpload': {'DaysAfterInitiation': 7}}
    stale = {'ID': 'picspeak-generation-reference-inputs', 'Status': 'Enabled', 'Filter': {'Prefix': 'x/'}, 'Expiration': {'Days': 1}}
    merged = configure_r2_lifecycle.merged_rules([foreign, stale])
    assert merged[0] == foreign
    assert merged[1:] == list(configure_r2_lifecycle.MANAGED_RULES)
    assert not any(rule.get('Filter', {}).get('Prefix', '').startswith('user_') for rule in merged)


class MissingObject(Exception):
    def __init__(self):
        super().__init__('missing')
        self.response = {'Error': {'Code': 'NoSuchKey'}}


class FakeStorage:
    def __init__(self, now):
        self.objects: dict[str, dict] = {}
        self.now = now
        self.fail_deletes = False
        self.fail_lists = False
        self.deleted: list[str] = []

    def put(self, key, size=100, age=timedelta(days=30)):
        self.objects[key] = {'Size': size, 'ETag': f'"{uuid4().hex}"', 'LastModified': self.now - age}

    def head_object(self, Bucket, Key):  # noqa: N803 - boto3 signature
        if Key not in self.objects:
            raise MissingObject()
        item = self.objects[Key]
        return {'ContentLength': item['Size'], 'ETag': item['ETag']}

    def delete_object(self, Bucket, Key):  # noqa: N803
        if self.fail_deletes:
            raise RuntimeError('storage unavailable')
        self.objects.pop(Key, None)
        self.deleted.append(Key)

    def list_objects_v2(self, Bucket, Prefix='', ContinuationToken=None):  # noqa: N803
        if self.fail_lists:
            raise RuntimeError('storage unavailable')
        contents = [{'Key': key, **item} for key, item in sorted(self.objects.items()) if key.startswith(Prefix)]
        return {'Contents': contents, 'IsTruncated': False}


class Harness:
    def __init__(self, sessions, storage):
        self.Session = sessions
        self.storage = storage

    def user(self, *, plan=UserPlan.free, status=UserStatus.active, last_login_days=1):
        suffix = uuid4().hex[:12]
        with self.Session() as db:
            user = User(
                public_id='usr_' + suffix, email=suffix + '@retention.test', username='u_' + suffix,
                plan=plan, status=status, last_login_at=NOW - timedelta(days=last_login_days),
                created_at=NOW - timedelta(days=60),
            )
            db.add(user)
            db.commit()
            return user

    def photo(self, user, *, days=40, status=PhotoStatus.READY):
        suffix = uuid4().hex[:12]
        key = f'user_{user.public_id}/2026/09/obj_{suffix}.jpg'
        self.storage.put(key)
        with self.Session() as db:
            photo = Photo(
                public_id='pho_' + suffix, owner_user_id=user.id, upload_id='upl_' + suffix, bucket='bucket',
                object_key=key, content_type='image/jpeg', size_bytes=100, status=status,
                created_at=NOW - timedelta(days=days), updated_at=NOW - timedelta(days=days),
            )
            db.add(photo)
            db.commit()
            return photo

    def review(self, photo, *, days=40, share=False, deleted_days=None):
        suffix = uuid4().hex[:12]
        with self.Session() as db:
            review = Review(
                public_id='rev_' + suffix, owner_user_id=photo.owner_user_id, photo_id=photo.id,
                mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, image_type='default', schema_version='2.0',
                final_score=6.0, model_name='fixture', result_json={'scores': {}},
                created_at=NOW - timedelta(days=days), share_token='share_' + suffix if share else None,
                deleted_at=NOW - timedelta(days=deleted_days) if deleted_days is not None else None,
            )
            db.add(review)
            db.commit()
            return review

    def live_task(self, photo):
        with self.Session() as db:
            db.add(ReviewTask(
                public_id='tsk_' + uuid4().hex[:12], photo_id=photo.id, owner_user_id=photo.owner_user_id,
                mode=ReviewMode.flash, status=TaskStatus.PENDING, request_payload={},
            ))
            db.commit()

    def status(self, photo):
        with self.Session() as db:
            return db.get(Photo, photo.id).status

    def run(self, **overrides):
        args = _args(**overrides)
        return purge_expired_objects.run(args, session_factory=self.Session, storage=self.storage, bucket='bucket', now=NOW)


@pytest.fixture
def harness(monkeypatch):
    if not DATABASE_URL:
        pytest.skip('requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
    engine = create_engine(DATABASE_URL)
    connection = engine.connect()
    transaction = connection.begin()
    schema = 'objret_' + uuid4().hex
    connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
    Base.metadata.create_all(connection)
    sessions = sessionmaker(bind=connection, expire_on_commit=False, join_transaction_mode='create_savepoint')
    try:
        yield Harness(sessions, FakeStorage(NOW))
    finally:
        transaction.rollback()
        connection.close()
        engine.dispose()


def test_dry_run_reports_without_changing_anything(harness):
    free = harness.user()
    expired = harness.photo(free)
    harness.review(expired)
    report = harness.run()
    assert report['mode'] == 'dry-run'
    assert report['photo_original']['purge_by_reason'] == {'free_expired': 1}
    assert harness.status(expired) == PhotoStatus.READY
    assert expired.object_key in harness.storage.objects


def test_execute_purges_only_unprotected_originals(harness):
    free, pro, guest = harness.user(), harness.user(), harness.user(plan=UserPlan.guest)
    with harness.Session() as db:
        db.add(BillingSubscription(user_id=pro.id, provider='lemonsqueezy', status='active', renews_at=NOW + timedelta(days=20)))
        db.commit()
    expired, recent, public, busy, pro_photo, guest_photo = (
        harness.photo(free), harness.photo(free), harness.photo(free), harness.photo(free),
        harness.photo(pro), harness.photo(guest, days=10),
    )
    harness.review(expired)
    harness.review(recent, days=3)
    harness.review(public, share=True)
    harness.review(busy)
    harness.live_task(busy)
    harness.review(pro_photo)
    thumbnail = f'gallery-thumbnails/{expired.public_id}/512.webp'
    harness.storage.put(thumbnail)

    report = harness.run(execute=True, category=['photo_original'])

    assert report['executed']['photo_original']['purged'] == 2
    assert harness.status(expired) == PhotoStatus.PURGED
    assert harness.status(guest_photo) == PhotoStatus.PURGED
    for photo in (recent, public, busy, pro_photo):
        assert harness.status(photo) == PhotoStatus.READY
        assert photo.object_key in harness.storage.objects
    assert expired.object_key not in harness.storage.objects
    assert thumbnail not in harness.storage.objects
    with harness.Session() as db:
        purged = db.get(Photo, expired.id)
        assert purged.original_purge_reason == 'free_expired'
        assert purged.original_purged_at == NOW
        assert db.query(Review).filter(Review.photo_id == expired.id).count() == 1


def test_storage_failure_returns_the_photo_to_ready(harness):
    photo = harness.photo(harness.user())
    harness.review(photo)
    harness.storage.fail_deletes = True
    report = harness.run(execute=True, category=['photo_original'])
    assert report['executed']['photo_original']['failed'] == 1
    assert harness.status(photo) == PhotoStatus.READY


def _mark_purging(harness, photo):
    with harness.Session() as db:
        stored = db.get(Photo, photo.id)
        stored.status = PhotoStatus.PURGING
        stored.original_purge_reason = 'free_expired'
        db.commit()


def test_stalled_purge_rechecks_protections_before_deleting(harness):
    photo = harness.photo(harness.user())
    harness.review(photo, share=True)  # became public after the stalled run marked it
    _mark_purging(harness, photo)
    with harness.Session() as db:
        outcome = purge_photo_original(db, harness.storage, photo.id, now=NOW)
    assert (outcome.status, outcome.reason) == ('skipped', 'public')
    assert harness.status(photo) == PhotoStatus.READY
    assert photo.object_key in harness.storage.objects


def test_stalled_purge_respects_the_current_grace_period(harness):
    photo = harness.photo(harness.user())
    harness.review(photo)
    _mark_purging(harness, photo)
    with harness.Session() as db:
        outcome = purge_photo_original(db, harness.storage, photo.id, now=NOW, grace_until=NOW + timedelta(days=7))
    assert (outcome.status, outcome.reason) == ('skipped', 'within_retention')
    assert harness.status(photo) == PhotoStatus.READY


def test_stalled_purge_completes_when_the_original_is_already_gone(harness):
    photo = harness.photo(harness.user())
    harness.review(photo, share=True)
    _mark_purging(harness, photo)
    del harness.storage.objects[photo.object_key]
    with harness.Session() as db:
        outcome = purge_photo_original(db, harness.storage, photo.id, now=NOW)
    assert outcome.status == 'already_missing'
    assert harness.status(photo) == PhotoStatus.PURGED


def test_thumbnail_failure_after_the_original_is_deleted_keeps_purged(harness):
    photo = harness.photo(harness.user())
    harness.review(photo)
    harness.storage.put(f'gallery-thumbnails/{photo.public_id}/512.webp')
    harness.storage.fail_lists = True
    with harness.Session() as db:
        outcome = purge_photo_original(db, harness.storage, photo.id, now=NOW)
    assert outcome.status == 'purged'
    assert harness.status(photo) == PhotoStatus.PURGED
    assert photo.object_key not in harness.storage.objects
    harness.storage.fail_lists = False
    harness.run(execute=True, category=['orphan_thumbnail'])
    assert f'gallery-thumbnails/{photo.public_id}/512.webp' not in harness.storage.objects


def test_admission_rejects_photos_leaving_ready(harness):
    photo = harness.photo(harness.user())
    _mark_purging(harness, photo)
    with harness.Session() as db, pytest.raises(ApiHTTPException) as exc:
        admit_photo_use(db, photo.id)
    assert exc.value.status_code == 410
    assert exc.value.detail['code'] == 'PHOTO_ORIGINAL_EXPIRED'
    with harness.Session() as db:
        assert admit_photo_use(db, photo.id, require_ready=False).id == photo.id


@pytest.fixture
def committed_db():
    if not DATABASE_URL:
        pytest.skip('requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
    schema = 'objlock_' + uuid4().hex
    admin = create_engine(DATABASE_URL)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(DATABASE_URL, connect_args={'options': f'-csearch_path={schema},public'})
    Base.metadata.create_all(engine)
    try:
        yield sessionmaker(bind=engine, expire_on_commit=False)
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def test_purge_waits_for_an_admitted_task_and_then_keeps_the_original(committed_db):
    storage = FakeStorage(NOW)
    harness = Harness(committed_db, storage)
    photo = harness.photo(harness.user())
    harness.review(photo)

    admitted, release = threading.Event(), threading.Event()

    def admit_and_create_task():
        with committed_db() as db:
            admit_photo_use(db, photo.id)
            admitted.set()
            release.wait(5)
            db.add(ReviewTask(
                public_id='tsk_' + uuid4().hex[:12], photo_id=photo.id, owner_user_id=photo.owner_user_id,
                mode=ReviewMode.flash, status=TaskStatus.PENDING, request_payload={},
            ))
            db.commit()

    creator = threading.Thread(target=admit_and_create_task)
    creator.start()
    assert admitted.wait(5)
    result = {}

    def purge():
        with committed_db() as db:
            result['outcome'] = purge_photo_original(db, storage, photo.id, now=NOW)

    purger = threading.Thread(target=purge)
    purger.start()
    purger.join(0.5)
    assert purger.is_alive(), 'purge must wait for the admitted task to commit'
    release.set()
    creator.join(5)
    purger.join(5)
    assert (result['outcome'].status, result['outcome'].reason) == ('skipped', 'live_task')
    assert harness.status(photo) == PhotoStatus.READY
    assert photo.object_key in storage.objects


def test_admission_after_purge_starts_sees_the_photo_leaving_ready(committed_db):
    storage = FakeStorage(NOW)
    harness = Harness(committed_db, storage)
    photo = harness.photo(harness.user())
    harness.review(photo)
    with committed_db() as db:
        purge_photo_original(db, storage, photo.id, now=NOW)
    with committed_db() as db, pytest.raises(ApiHTTPException) as exc:
        admit_photo_use(db, photo.id)
    assert exc.value.status_code == 410


def test_max_delete_and_grace_until_bound_each_run(harness):
    user = harness.user()
    for _ in range(3):
        harness.review(harness.photo(user))
    deferred = harness.run(execute=True, category=['photo_original'], grace_until=NOW + timedelta(days=7))
    assert deferred['photo_original']['purge_count'] == 0
    bounded = harness.run(execute=True, category=['photo_original'], max_delete=2)
    assert bounded['executed']['photo_original']['purged'] == 2
    assert bounded['max_delete_reached'] is True


def test_inventory_removes_only_old_unreferenced_objects(harness):
    user = harness.user()
    live = harness.photo(user, days=2)
    harness.storage.put(f'user_{user.public_id}/2026/09/obj_orphan.jpg')
    harness.storage.put(f'user_{user.public_id}/2026/10/obj_fresh.jpg', age=timedelta(hours=2))
    harness.storage.put('gallery-thumbnails/pho_missing/512.webp')
    harness.storage.put(f'gallery-thumbnails/{live.public_id}/512.webp')
    harness.storage.put('generated/reference-inputs/gen_gone/pho_x.jpg')
    harness.storage.put('generated/user_x/2026/09/gim_orphan.webp')
    harness.storage.put('backups/keep-me.sql')

    dry = harness.run(category=['orphan_upload', 'orphan_thumbnail', 'reference_input', 'orphan_generated'])
    assert {name: value['count'] for name, value in dry['inventory']['candidates'].items()} == {
        'orphan_generated': 1, 'orphan_thumbnail': 1, 'orphan_upload': 1, 'reference_input': 1,
    }
    assert dry['inventory']['unknown_prefixes'] == {'backups': 1}

    harness.run(execute=True, category=['orphan_upload', 'orphan_thumbnail', 'reference_input', 'orphan_generated'])
    assert set(harness.storage.objects) == {
        live.object_key, f'user_{user.public_id}/2026/10/obj_fresh.jpg',
        f'gallery-thumbnails/{live.public_id}/512.webp', 'backups/keep-me.sql',
    }


def test_reference_inputs_of_running_generation_tasks_are_kept(harness):
    user = harness.user()
    with harness.Session() as db:
        db.add(ImageGenerationTask(
            public_id='gen_running', owner_user_id=user.id, status=TaskStatus.RUNNING, intent='general',
            prompt='p', prompt_hash='h',
        ))
        db.commit()
    harness.storage.put('generated/reference-inputs/gen_running/pho_x.jpg')
    harness.run(execute=True, category=['reference_input'])
    assert 'generated/reference-inputs/gen_running/pho_x.jpg' in harness.storage.objects


def test_deleted_generated_images_are_removed_after_a_day(harness):
    user = harness.user()
    keys = {}
    with harness.Session() as db:
        for name, deleted in (('old', NOW - timedelta(hours=30)), ('new', NOW - timedelta(hours=2)), ('kept', None)):
            key = f'generated/user_{user.public_id}/2026/10/gim_{name}.webp'
            keys[name] = key
            harness.storage.put(key)
            db.add(GeneratedImage(
                public_id='gim_' + name, owner_user_id=user.id, object_bucket='bucket', object_key=key,
                intent='general', prompt='p', model_name='m', quality='low', size='1024x1024',
                output_format='webp', credits_charged=1, deleted_at=deleted,
            ))
        db.commit()
    harness.run(execute=True, category=['deleted_generation'])
    assert keys['old'] not in harness.storage.objects
    assert {keys['new'], keys['kept']} <= set(harness.storage.objects)
    with harness.Session() as db:
        assert db.query(GeneratedImage).filter(GeneratedImage.public_id == 'gim_old').one().object_purged_at == NOW


def test_guest_cleanup_waits_until_originals_are_purged(harness, monkeypatch):
    guest = harness.user(plan=UserPlan.guest, last_login_days=30)
    photo = harness.photo(guest, days=30)
    with harness.Session() as db:
        assert guest_cleanup.cleanup_stale_guest_users(db) == 0
        assert db.get(User, guest.id) is not None
    harness.run(execute=True, category=['photo_original'])
    assert harness.status(photo) == PhotoStatus.PURGED
    with harness.Session() as db:
        assert guest_cleanup.cleanup_stale_guest_users(db) == 1


def test_purged_originals_have_no_image_link_and_a_stable_error(harness):
    user = harness.user()
    photo = harness.photo(user)
    review = harness.review(photo, days=2)
    with harness.Session() as db:
        stored = db.get(Photo, photo.id)
        stored.status = PhotoStatus.PURGED
        db.commit()

    def db_dependency():
        with harness.Session() as db:
            yield db

    def actor_dependency(db: Session = Depends(get_db)):
        return CurrentActor(db.get(User, user.id))

    app = FastAPI()
    app.include_router(review_queries.router, prefix='/api/v1')
    app.include_router(photos.router, prefix='/api/v1')
    app.dependency_overrides[get_db] = db_dependency
    app.dependency_overrides[get_current_actor] = actor_dependency
    with TestClient(app) as client:
        detail = client.get('/api/v1/reviews/' + review.public_id).json()
        assert detail['photo_url'] is None
        history = client.get('/api/v1/me/reviews').json()['items']
        assert history[0]['photo_url'] is None and history[0]['photo_thumbnail_url'] is None
        request = SimpleNamespace(
            base_url='http://testserver/', headers={},
            url_for=lambda _route, photo_id: f'http://testserver/api/v1/photos/{photo_id}/image',
        )
        url = photos._build_photo_proxy_url(request, photo.public_id, user.public_id)
        response = client.get(url.replace('http://testserver', ''))
        assert response.status_code == 410
        body = response.json()
        assert (body.get('error') or body.get('detail'))['code'] == 'PHOTO_ORIGINAL_EXPIRED'
