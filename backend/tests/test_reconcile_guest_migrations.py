from __future__ import annotations

import os
import sys
from argparse import Namespace
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(BACKEND_ROOT / 'scripts'))

import reconcile_guest_migrations  # noqa: E402
from app.db.models import (  # noqa: E402
    Base,
    Photo,
    PhotoStatus,
    Review,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    UsageLedger,
    User,
    UserPlan,
    UserStatus,
)
from app.services.object_retention import collect_photo_facts, decide_photo  # noqa: E402

DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()
NOW = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)


def _args(**overrides):
    values = {
        'database_url': 'postgresql://postgres:postgres@127.0.0.1:5432/picspeak_test',
        'max_guests': 200,
        'after_guest_id': 0,
        'execute': False,
    }
    values.update(overrides)
    return Namespace(**values)


def test_cli_validation_requires_explicit_postgres_url_and_execute_env_gate(monkeypatch):
    monkeypatch.delenv(reconcile_guest_migrations.EXECUTE_ENV_FLAG, raising=False)
    with pytest.raises(SystemExit):
        reconcile_guest_migrations.build_parser().parse_args([])
    with pytest.raises(ValueError, match='PostgreSQL'):
        reconcile_guest_migrations.validate(_args(database_url='sqlite:///tmp.db'))
    with pytest.raises(ValueError, match='max-guests'):
        reconcile_guest_migrations.validate(_args(max_guests=0))
    with pytest.raises(ValueError):
        reconcile_guest_migrations.validate(_args(after_guest_id=-1))
    reconcile_guest_migrations.validate(_args(execute=False))
    with pytest.raises(ValueError, match=reconcile_guest_migrations.EXECUTE_ENV_FLAG):
        reconcile_guest_migrations.validate(_args(execute=True))
    monkeypatch.setenv(reconcile_guest_migrations.EXECUTE_ENV_FLAG, '1')
    reconcile_guest_migrations.validate(_args(execute=True))


@pytest.fixture
def pg_engine():
    if not DATABASE_URL:
        pytest.skip('requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
    schema = 'recguest_' + uuid4().hex
    admin = create_engine(DATABASE_URL, pool_pre_ping=True)
    with admin.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        connect_args={'options': f'-csearch_path={schema},public'},
    )
    Base.metadata.create_all(engine, checkfirst=False)
    try:
        yield engine
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def _seed_user(db: Session, *, plan: UserPlan, status: UserStatus = UserStatus.active, suffix: str) -> User:
    user = User(
        public_id=f'{"gst" if plan == UserPlan.guest else "usr"}_rec_{suffix}',
        email=f'rec_{suffix}@example.test',
        username=f'rec_{suffix}',
        plan=plan,
        daily_quota_total=5,
        daily_quota_used=0,
        status=status,
        created_at=NOW - timedelta(days=30),
        updated_at=NOW - timedelta(days=10),
    )
    db.add(user)
    db.flush()
    return user


def _seed_legacy_20_limit_migration(db: Session) -> tuple[User, User, list[int]]:
    """Simulate a guest migrated by the pre-#55 20-limit code:
    30 photos (oldest 10 stranded on deleted guest, newest 20 on target),
    25 reviews (oldest 5 stranded on deleted guest, newest 20 on target — 5 of those
    20 target reviews reference guest-owned photos 5..9),
    all 25 tasks moved to target, and 25 historical UsageLedger rows on guest.
    """
    suffix = uuid4().hex[:8]
    guest = _seed_user(db, plan=UserPlan.guest, status=UserStatus.deleted, suffix=f'g_{suffix}')
    target = _seed_user(db, plan=UserPlan.free, status=UserStatus.active, suffix=f't_{suffix}')

    stranded_photo_ids: list[int] = []
    photos: list[Photo] = []
    for idx in range(30):
        created_at = NOW - timedelta(days=20) + timedelta(minutes=idx)
        photo_owner = guest if idx < 10 else target
        photo = Photo(
            public_id=f'pho_leg_{suffix}_{idx}',
            owner_user_id=photo_owner.id,
            upload_id=f'upl_leg_{suffix}_{idx}',
            bucket='bucket',
            object_key=f'user_{guest.public_id}/2026/11/obj_{idx}.jpg',
            content_type='image/jpeg',
            size_bytes=1024,
            status=PhotoStatus.READY,
            exif_data={},
            client_meta={},
            created_at=created_at,
        )
        db.add(photo)
        db.flush()
        photos.append(photo)
        if idx < 10:
            stranded_photo_ids.append(photo.id)

    for idx in range(25):
        created_at = NOW - timedelta(days=20) + timedelta(minutes=idx)
        task = ReviewTask(
            public_id=f'tsk_leg_{suffix}_{idx}',
            photo_id=photos[idx].id,
            owner_user_id=target.id,  # Old code moved all tasks.
            mode=ReviewMode.flash,
            status=TaskStatus.SUCCEEDED,
            request_payload={},
            created_at=created_at,
        )
        db.add(task)
        db.flush()

        review_owner = guest if idx < 5 else target
        review = Review(
            public_id=f'rev_leg_{suffix}_{idx}',
            task_id=task.id,
            photo_id=photos[idx].id,
            owner_user_id=review_owner.id,
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

        db.add(UsageLedger(
            user_id=guest.id,
            review_id=review.id,
            task_id=task.id,
            usage_type='review_request',
            amount=1,
            unit='count',
            bill_date=created_at.date(),
            metadata_json={'mode': 'flash'},
            created_at=created_at,
        ))
    db.commit()
    return guest, target, stranded_photo_ids


def test_legacy_deleted_guest_is_held_by_retention_and_reconciled_by_script(pg_engine):
    SessionLocal = sessionmaker(bind=pg_engine, expire_on_commit=False)
    with SessionLocal() as db:
        guest, target, stranded_photo_ids = _seed_legacy_20_limit_migration(db)

        # 1. Retention must hold all 10 legacy stranded originals (not purge as account_deleted).
        stranded_photos = db.query(Photo).filter(Photo.id.in_(stranded_photo_ids)).all()
        facts = collect_photo_facts(db, stranded_photos, now=NOW)
        assert len(stranded_photos) == 10
        for photo in stranded_photos:
            decision = decide_photo(facts[photo.id], now=NOW)
            assert (decision.purge, decision.reason) == (False, 'guest_migration_pending')

    # 2. Dry run uses read-only snapshot, reports exact evidence, and writes nothing.
    dry_report = reconcile_guest_migrations.run(_args(execute=False), engine=pg_engine)
    assert dry_report['mode'] == 'dry-run'
    assert dry_report['transaction_read_only'] == 'on'
    assert dry_report['scanned_guests'] == 1
    assert dry_report['status_counts'] == {'reconcilable': 1}
    guest_entry = dry_report['guests'][0]
    assert guest_entry['guest_public_id'] == guest.public_id
    assert guest_entry['target_public_id'] == target.public_id
    assert guest_entry['stranded_counts']['photos'] == 10
    assert guest_entry['stranded_counts']['reviews'] == 5
    for signal in ('review_photo_fk', 'review_task_fk', 'usage_ledger_review', 'usage_ledger_task', 'migrated_photo_prefix'):
        assert signal in guest_entry['evidence_counts']

    with SessionLocal() as db:
        assert db.query(Photo).filter(Photo.owner_user_id == guest.id).count() == 10
        assert db.query(Review).filter(Review.owner_user_id == guest.id).count() == 5

    # 3. Execute moves every stranded record to the uniquely identified target account.
    exec_report = reconcile_guest_migrations.run(_args(execute=True), engine=pg_engine)
    assert exec_report['mode'] == 'execute'
    assert exec_report['executed']['outcomes'] == {'reconciled': 1}
    assert exec_report['executed']['transferred']['photos'] == 10
    assert exec_report['executed']['transferred']['reviews'] == 5

    with SessionLocal() as db:
        assert db.query(Photo).filter(Photo.owner_user_id == guest.id).count() == 0
        assert db.query(Review).filter(Review.owner_user_id == guest.id).count() == 0
        assert db.query(Photo).filter(Photo.owner_user_id == target.id).count() == 30
        assert db.query(Review).filter(Review.owner_user_id == target.id).count() == 25
        mismatched = (
            db.query(Review.id)
            .join(Photo, Photo.id == Review.photo_id)
            .filter(Review.owner_user_id != Photo.owner_user_id)
            .count()
        )
        assert mismatched == 0
        # Usage stays with the guest whose quota admitted each request.
        assert db.query(UsageLedger).filter(UsageLedger.user_id == guest.id).count() == 25
        assert db.query(UsageLedger).filter(UsageLedger.user_id == target.id).count() == 0
    assert 'usage_ledger' not in exec_report['executed']['transferred']

    # 4. Idempotent repeat finds nothing left to reconcile.
    repeat_report = reconcile_guest_migrations.run(_args(execute=True), engine=pg_engine)
    assert repeat_report['scanned_guests'] == 0


def test_reconcile_leaves_ambiguous_no_evidence_and_ineligible_targets_untouched(pg_engine):
    SessionLocal = sessionmaker(bind=pg_engine, expire_on_commit=False)
    with SessionLocal() as db:
        # Case A: Ambiguous evidence pointing to two different registered accounts.
        amb_guest = _seed_user(db, plan=UserPlan.guest, status=UserStatus.deleted, suffix='amb_g')
        target_a = _seed_user(db, plan=UserPlan.free, status=UserStatus.active, suffix='amb_a')
        target_b = _seed_user(db, plan=UserPlan.free, status=UserStatus.active, suffix='amb_b')
        amb_photo = Photo(
            public_id='pho_amb_1', owner_user_id=amb_guest.id, upload_id='upl_amb_1',
            bucket='bucket', object_key=f'user_{amb_guest.public_id}/2026/11/a.jpg',
            content_type='image/jpeg', size_bytes=100, status=PhotoStatus.READY,
        )
        # Prefix evidence for target_a, plus a migrated photo on target_b with the same guest prefix.
        migrated_a = Photo(
            public_id='pho_amb_a', owner_user_id=target_a.id, upload_id='upl_amb_a',
            bucket='bucket', object_key=f'user_{amb_guest.public_id}/2026/11/ma.jpg',
            content_type='image/jpeg', size_bytes=100, status=PhotoStatus.READY,
        )
        migrated_b = Photo(
            public_id='pho_amb_b', owner_user_id=target_b.id, upload_id='upl_amb_b',
            bucket='bucket', object_key=f'user_{amb_guest.public_id}/2026/11/mb.jpg',
            content_type='image/jpeg', size_bytes=100, status=PhotoStatus.READY,
        )
        db.add_all([amb_photo, migrated_a, migrated_b])

        # Case B: Deleted guest with stranded photo and no evidence.
        orphan_guest = _seed_user(db, plan=UserPlan.guest, status=UserStatus.deleted, suffix='orp_g')
        orphan_photo = Photo(
            public_id='pho_orp_1', owner_user_id=orphan_guest.id, upload_id='upl_orp_1',
            bucket='bucket', object_key=f'user_{orphan_guest.public_id}/2026/11/o.jpg',
            content_type='image/jpeg', size_bytes=100, status=PhotoStatus.READY,
        )
        db.add(orphan_photo)

        # Case C: Evidence points to an inactive (deleted) target account.
        inelig_guest = _seed_user(db, plan=UserPlan.guest, status=UserStatus.deleted, suffix='inl_g')
        deleted_target = _seed_user(db, plan=UserPlan.free, status=UserStatus.deleted, suffix='inl_t')
        inelig_photo = Photo(
            public_id='pho_inl_1', owner_user_id=inelig_guest.id, upload_id='upl_inl_1',
            bucket='bucket', object_key=f'user_{inelig_guest.public_id}/2026/11/i1.jpg',
            content_type='image/jpeg', size_bytes=100, status=PhotoStatus.READY,
        )
        inelig_migrated = Photo(
            public_id='pho_inl_2', owner_user_id=deleted_target.id, upload_id='upl_inl_2',
            bucket='bucket', object_key=f'user_{inelig_guest.public_id}/2026/11/i2.jpg',
            content_type='image/jpeg', size_bytes=100, status=PhotoStatus.READY,
        )
        db.add_all([inelig_photo, inelig_migrated])
        db.commit()

    report = reconcile_guest_migrations.run(_args(execute=True), engine=pg_engine)
    assert report['status_counts'] == {'ambiguous': 1, 'no_evidence': 1, 'ineligible_target': 1}
    assert report['executed']['outcomes'] == {
        'skipped_ambiguous': 1,
        'skipped_no_evidence': 1,
        'skipped_ineligible_target': 1,
    }
    assert report['executed']['transferred'] == {}

    with SessionLocal() as db:
        assert db.get(Photo, amb_photo.id).owner_user_id == amb_guest.id
        assert db.get(Photo, orphan_photo.id).owner_user_id == orphan_guest.id
        assert db.get(Photo, inelig_photo.id).owner_user_id == inelig_guest.id


def test_after_guest_id_cursor_moves_past_unresolved_guests(pg_engine):
    SessionLocal = sessionmaker(bind=pg_engine, expire_on_commit=False)
    with SessionLocal() as db:
        # The first guest in id order has no evidence and can never be resolved.
        orphan_guest = _seed_user(db, plan=UserPlan.guest, status=UserStatus.deleted, suffix='cur_o')
        db.add(Photo(
            public_id='pho_cur_o', owner_user_id=orphan_guest.id, upload_id='upl_cur_o',
            bucket='bucket', object_key=f'user_{orphan_guest.public_id}/2026/11/o.jpg',
            content_type='image/jpeg', size_bytes=100, status=PhotoStatus.READY,
        ))
        later_guest = _seed_user(db, plan=UserPlan.guest, status=UserStatus.deleted, suffix='cur_g')
        target = _seed_user(db, plan=UserPlan.free, status=UserStatus.active, suffix='cur_t')
        stranded = Photo(
            public_id='pho_cur_g', owner_user_id=later_guest.id, upload_id='upl_cur_g',
            bucket='bucket', object_key=f'user_{later_guest.public_id}/2026/11/g.jpg',
            content_type='image/jpeg', size_bytes=100, status=PhotoStatus.READY,
        )
        migrated = Photo(
            public_id='pho_cur_m', owner_user_id=target.id, upload_id='upl_cur_m',
            bucket='bucket', object_key=f'user_{later_guest.public_id}/2026/11/m.jpg',
            content_type='image/jpeg', size_bytes=100, status=PhotoStatus.READY,
        )
        db.add_all([stranded, migrated])
        db.commit()
        assert orphan_guest.id < later_guest.id

    # Without the cursor, a batch of one keeps returning the unresolved guest.
    for _ in range(2):
        report = reconcile_guest_migrations.run(_args(execute=True, max_guests=1), engine=pg_engine)
        assert [entry['guest_public_id'] for entry in report['guests']] == [orphan_guest.public_id]
        assert report['executed']['outcomes'] == {'skipped_no_evidence': 1}
        assert report['last_scanned_guest_id'] == orphan_guest.id

    report = reconcile_guest_migrations.run(
        _args(execute=True, max_guests=1, after_guest_id=report['last_scanned_guest_id']),
        engine=pg_engine,
    )
    assert report['after_guest_id'] == orphan_guest.id
    assert [entry['guest_public_id'] for entry in report['guests']] == [later_guest.public_id]
    assert report['executed']['outcomes'] == {'reconciled': 1}
    assert report['last_scanned_guest_id'] == later_guest.id

    with SessionLocal() as db:
        assert db.get(Photo, stranded.id).owner_user_id == target.id

    report = reconcile_guest_migrations.run(
        _args(max_guests=1, after_guest_id=report['last_scanned_guest_id']),
        engine=pg_engine,
    )
    assert report['scanned_guests'] == 0
    assert report['last_scanned_guest_id'] is None
