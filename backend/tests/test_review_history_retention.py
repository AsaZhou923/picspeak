from __future__ import annotations

from argparse import Namespace
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sys
import threading
from contextlib import contextmanager
from unittest.mock import patch
from uuid import uuid4

from botocore.exceptions import ClientError
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import CurrentActor
from app.api.routers.review_create import _replay_review_response
from app.core.config import settings
from app.core.errors import ApiHTTPException
from app.db.models import (
    Base, BillingSubscription, IdempotencyKey, ImageGenerationTask, Notification, NotificationEvent,
    Photo, PhotoStatus, PracticeSession, Review, ReviewMode, ReviewQuotaReservation, ReviewScoreFeedback,
    ReviewScoreSnapshot, ReviewStatus, ReviewTask, TaskStatus, User, UserPlan, UserStatus,
)
from app.services.notification_processor import _consume, cleanup_expired_notifications, visible_notifications
from app.services.notification_access import render_notification
from app.services.object_retention import collect_photo_facts, decide_photo
from app.services.review_history_retention import (
    MARKER_KEY, NOTICE_TYPE, POLICY_VERSION, decide_review_content, delivered_notice,
    notice_candidates, notice_key, purge_review_history, queue_retention_notice,
)
from app.services import review_history_retention as retention
from scripts.purge_expired_review_history import run, validate

DATABASE_URL = os.getenv('PICSPEAK_TEST_DATABASE_URL', '').strip()
NOW = datetime.now(timezone.utc)


class Storage:
    def __init__(self):
        self.deleted = []
        self.fail_delete = False

    def head_object(self, **kwargs):
        if kwargs['Key'] in self.deleted:
            raise ClientError({'Error': {'Code': 'NoSuchKey'}}, 'HeadObject')
        return {'ContentLength': 100}

    def delete_object(self, **kwargs):
        if self.fail_delete:
            raise RuntimeError('synthetic storage failure')
        self.deleted.append(kwargs['Key'])

    def list_objects_v2(self, **kwargs):
        return {'Contents': [], 'IsTruncated': False}


@pytest.fixture(scope='module')
def engine():
    if not DATABASE_URL:
        pytest.skip('requires disposable PostgreSQL via PICSPEAK_TEST_DATABASE_URL')
    url = make_url(DATABASE_URL)
    name = 'picspeak_history_test_' + uuid4().hex[:12]
    admin = create_engine(url.set(database='postgres'), isolation_level='AUTOCOMMIT')
    with admin.connect() as connection:
        connection.execute(text(f'CREATE DATABASE {name} TEMPLATE template0'))
    database = create_engine(url.set(database=name))
    Base.metadata.create_all(database)
    yield database
    database.dispose()
    with admin.connect() as connection:
        connection.execute(text('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=:name'), {'name': name})
        connection.execute(text(f'DROP DATABASE {name}'))
    admin.dispose()


@pytest.fixture
def db(engine):
    with engine.begin() as connection:
        tables = ', '.join(f'"{table.name}"' for table in reversed(Base.metadata.sorted_tables))
        connection.execute(text(f'TRUNCATE {tables} RESTART IDENTITY CASCADE'))
    with patch.object(settings, 'notifications_read_enabled', True), patch.object(
        settings, 'notifications_event_capture_enabled', True,
    ), patch.object(settings, 'notifications_worker_enabled', True):
        with sessionmaker(bind=engine, expire_on_commit=False)() as session:
            yield session


def seed(db, *, days=30, notice_days=8, public=False, pro=False):
    suffix = uuid4().hex
    user = User(public_id='usr_'+suffix, email=suffix+'@history.test', username=suffix,
                plan=UserPlan.pro if pro else UserPlan.free, status=UserStatus.active)
    db.add(user)
    db.flush()
    photo = Photo(public_id='pho_'+suffix, owner_user_id=user.id, upload_id='upl_'+suffix,
                  bucket='fixture', object_key=suffix+'.jpg', content_type='image/jpeg', size_bytes=100,
                  status=PhotoStatus.READY, exif_data={'GPSLatitude': 35}, created_at=NOW-timedelta(days=days))
    db.add(photo)
    db.flush()
    review = Review(public_id='rev_'+suffix, owner_user_id=user.id, photo_id=photo.id,
                    mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, final_score=7,
                    result_json={'critique': 'private prose', 'scores': {'composition': 7}},
                    note='private note', tags_json=['private tag'], created_at=NOW-timedelta(days=days),
                    share_token='share_'+suffix if public else None)
    db.add(review)
    if notice_days is not None:
        db.add(Notification(public_id='not_'+suffix, recipient_user_id=user.id, category='system',
                            notification_type=NOTICE_TYPE, dedupe_key=notice_key(user.id),
                            template_key='history_retention_notice', template_params_json={'policy_version': POLICY_VERSION, 'grace_days': '7'},
                            occurred_at=NOW-timedelta(days=notice_days), delivered_at=NOW-timedelta(days=notice_days),
                            target_type='account_history', expires_at=None))
    if pro:
        db.add(BillingSubscription(user_id=user.id, provider='activation_code', status='active', ends_at=NOW+timedelta(days=10)))
    db.commit()
    return user, photo, review


@pytest.mark.parametrize('days,notice_days,reason', [
    (14, 8, 'within_retention_or_notice_grace'), (30, None, 'notice_not_delivered'),
    (30, 6, 'within_retention_or_notice_grace'), (30, 8, 'expired_private'),
])
def test_age_and_actual_delivered_notice_are_required(db, days, notice_days, reason):
    _user, photo, review = seed(db, days=days, notice_days=notice_days)
    assert decide_review_content(db, review, photo, now=NOW).reason == reason


@pytest.mark.parametrize('gate', ['notifications_read_enabled', 'notifications_event_capture_enabled', 'notifications_worker_enabled'])
def test_disabled_notice_gate_blocks_content_and_storage_removal(db, gate):
    _user, photo, review = seed(db)
    storage = Storage()
    with patch.object(settings, gate, False):
        assert decide_review_content(db, review, photo, now=NOW).reason == 'notification_rollout_disabled'
        outcome = purge_review_history(db, storage, review.id, now=NOW)
    assert outcome['status'] == 'skipped'
    assert storage.deleted == []
    db.refresh(review)
    assert review.result_json['critique'] == 'private prose'


def test_public_pro_live_and_sync_work_are_protected(db):
    for change, reason in [({'public': True}, 'public'), ({'pro': True}, 'pro_active')]:
        _user, photo, review = seed(db, **change)
        assert decide_review_content(db, review, photo, now=NOW).reason == reason
    user, photo, review = seed(db)
    reservation = ReviewQuotaReservation(user_id=user.id, task_id=None, mode='flash', status='held',
                                         bill_date=NOW.date(), expires_at=NOW+timedelta(minutes=15))
    db.add(reservation)
    db.commit()
    assert decide_review_content(db, review, photo, now=NOW).reason == 'sync_review_in_progress'
    reservation.status = 'released'
    db.add(ReviewTask(public_id='tsk_'+uuid4().hex, owner_user_id=user.id, photo_id=photo.id,
                      mode=ReviewMode.flash, status=TaskStatus.RUNNING, request_payload={}))
    db.commit()
    assert decide_review_content(db, review, photo, now=NOW).reason == 'live_task'


def test_lapsed_pro_grace_is_combined_with_review_and_notice_deadlines(db):
    user, photo, review = seed(db)
    subscription = BillingSubscription(user_id=user.id, provider='activation_code', status='expired',
                                       ends_at=NOW-timedelta(days=10))
    db.add(subscription)
    db.commit()
    decision = decide_review_content(db, review, photo, now=NOW)
    assert decision.reason == 'within_retention_or_notice_grace'
    assert decision.eligible_at == NOW+timedelta(days=5)
    subscription.ends_at = NOW-timedelta(days=16)
    db.commit()
    assert decide_review_content(db, review, photo, now=NOW).purge


def test_effectively_public_gallery_review_is_protected(db):
    _user, photo, review = seed(db)
    review.gallery_visible = True
    review.gallery_audit_status = 'approved'
    review.is_public = False
    db.commit()
    assert decide_review_content(db, review, photo, now=NOW).reason == 'public'


@pytest.mark.parametrize('family', ['retake', 'generation'])
def test_an_active_source_reference_protects_the_source_photo(db, family):
    user, photo, review = seed(db)
    if family == 'generation':
        task = ImageGenerationTask(public_id='igt_'+uuid4().hex, owner_user_id=user.id,
                                   source_photo_id=photo.id, source_review_id=review.id,
                                   generation_mode='review_linked', intent='photo_inspiration',
                                   prompt='fixture', prompt_hash='fixture', status=TaskStatus.RUNNING,
                                   request_payload={})
    else:
        other_photo = Photo(public_id='pho_'+uuid4().hex, owner_user_id=user.id, upload_id='upl_'+uuid4().hex,
                            bucket='fixture', object_key=uuid4().hex+'.jpg', content_type='image/jpeg',
                            size_bytes=100, status=PhotoStatus.READY)
        db.add(other_photo)
        db.flush()
        task = ReviewTask(public_id='tsk_'+uuid4().hex, owner_user_id=user.id, photo_id=other_photo.id,
                          mode=ReviewMode.flash, status=TaskStatus.RUNNING,
                          request_payload={'source_review_internal_id': review.id})
    db.add(task)
    db.commit()
    assert decide_review_content(db, review, photo, now=NOW).reason == 'live_task'


def test_purge_clears_content_copies_but_preserves_ids_and_original_score(db):
    user, photo, review = seed(db)
    task = ReviewTask(public_id='tsk_'+uuid4().hex, owner_user_id=user.id, photo_id=photo.id,
                      mode=ReviewMode.flash, status=TaskStatus.SUCCEEDED,
                      request_payload={'locale':'en','_canonical_score_checkpoint':{'rationale':'private prose'}})
    db.add(task)
    db.flush()
    review.task_id=task.id
    failed_task = ReviewTask(public_id='tsk_'+uuid4().hex, owner_user_id=user.id, photo_id=photo.id,
                             mode=ReviewMode.flash, status=TaskStatus.DEAD_LETTER,
                             request_payload={'_canonical_score_checkpoint': {'rationale':'private prose'}})
    db.add(failed_task)
    practice = PracticeSession(public_id='pss_'+uuid4().hex, owner_user_id=user.id,
                               source_review_id=review.id, source_photo_id=photo.id,
                               practice_kind='capture_retake', lifecycle='active', request_hash='accepted-goal',
                               goal_snapshot={'action':'Leave space'}, success_criteria=['Subject has space'], locale='en')
    db.add(practice)
    db.add(IdempotencyKey(user_id=user.id, endpoint='/reviews', idempotency_key='keep-key', request_hash='keep-hash',
                          response_json={'review_id':review.public_id,'status':'SUCCEEDED','result':{'critique':'private prose'}},
                          expire_at=NOW+timedelta(days=1)))
    snapshot = ReviewScoreSnapshot(public_id='rss_'+uuid4().hex, review_id=review.id, revision_hash='hash',
                                   snapshot_schema_version='v1', analysis_type='single', mode='flash', image_type='default',
                                   final_score=7, scores_json={'composition':7})
    db.add(snapshot)
    db.flush()
    db.add(ReviewScoreFeedback(public_id='rsf_'+uuid4().hex, snapshot_id=snapshot.id, user_id=user.id,
                               role_at_submission='author', verdict='accurate', source_surface='result', state='active'))
    db.commit()
    identifiers = review.id, photo.id, task.id
    storage = Storage()
    outcome = purge_review_history(db, storage, review.id, now=NOW)
    assert outcome['status'] == 'purged' and outcome['original_purged']
    db.refresh(review)
    db.refresh(photo)
    db.refresh(task)
    assert (review.id, photo.id, task.id) == identifiers and review.final_score == 7
    assert review.deleted_at is not None and review.note is None and review.tags_json == []
    assert set(review.result_json) == {MARKER_KEY}
    assert photo.status == PhotoStatus.PURGED and photo.exif_data == {}
    assert '_canonical_score_checkpoint' not in task.request_payload
    db.refresh(failed_task)
    db.refresh(practice)
    assert '_canonical_score_checkpoint' not in failed_task.request_payload
    assert practice.source_review_id == review.id
    assert practice.goal_snapshot == {'action':'Leave space'} and practice.success_criteria == ['Subject has space']
    replay = db.query(IdempotencyKey).one()
    assert replay.idempotency_key == 'keep-key' and replay.request_hash == 'keep-hash' and 'result' not in replay.response_json
    assert db.query(ReviewScoreSnapshot).count() == db.query(ReviewScoreFeedback).count() == 0
    with pytest.raises(ApiHTTPException) as error:
        _replay_review_response(db, CurrentActor(user=user), replay.response_json)
    assert error.value.status_code == 404


def test_shared_newer_review_retains_original_and_its_content(db):
    user, photo, review = seed(db)
    newer = Review(public_id='rev_'+uuid4().hex, owner_user_id=user.id, photo_id=photo.id,
                   mode=ReviewMode.flash, status=ReviewStatus.SUCCEEDED, final_score=8,
                   result_json={'critique':'newer private prose'}, created_at=NOW-timedelta(days=2),
                   source_review_id=review.id)
    db.add(newer)
    db.commit()
    storage=Storage()
    assert purge_review_history(db, storage, review.id, now=NOW)['status']=='purged'
    db.refresh(photo)
    db.refresh(newer)
    assert storage.deleted==[] and photo.status==PhotoStatus.READY
    assert newer.result_json['critique']=='newer private prose' and newer.deleted_at is None
    assert newer.source_review_id == review.id
    facts=collect_photo_facts(db,[photo],now=NOW)[photo.id]
    assert decide_photo(facts,now=NOW).expires_at==utc_value(newer.created_at)+timedelta(days=15)


def utc_value(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def test_storage_failure_keeps_content_and_retry_finishes(db):
    _user, _photo, review=seed(db)
    storage=Storage()
    storage.fail_delete=True
    assert purge_review_history(db,storage,review.id,now=NOW)['status']=='failed'
    db.refresh(review)
    assert review.deleted_at is None and review.result_json['critique']=='private prose'
    storage.fail_delete=False
    assert purge_review_history(db,storage,review.id,now=NOW)['status']=='purged'


def test_photo_share_lock_causes_safe_skip_then_retry(db, engine):
    _user, photo, review = seed(db)
    storage = Storage()
    with engine.connect() as connection, connection.begin():
        connection.execute(text('SELECT id FROM photos WHERE id=:id FOR SHARE'), {'id': photo.id})
        outcome = purge_review_history(db, storage, review.id, now=NOW)
        assert outcome == {'status': 'skipped', 'reason': 'photo_busy_or_missing'}
    assert storage.deleted == []
    assert purge_review_history(db, storage, review.id, now=NOW)['status'] == 'purged'


@pytest.mark.parametrize('protection', ['pro', 'public'])
def test_pro_or_public_change_committing_before_the_owner_lease_is_respected(db, engine, protection):
    user, photo, review = seed(db)
    owner_id, review_id = user.id, review.id
    waiting = threading.Event()
    results, errors = [], []
    original_lease = retention._owner_cleanup_lease

    @contextmanager
    def observed_lease(session, user_id):
        waiting.set()
        with original_lease(session, user_id) as acquired:
            yield acquired

    storage = Storage()
    def cleanup():
        try:
            with Session(engine, expire_on_commit=False) as session:
                results.append(purge_review_history(session, storage, review_id, now=NOW))
        except Exception as exc:
            errors.append(exc)

    with Session(engine) as changing, patch.object(retention, '_owner_cleanup_lease', observed_lease):
        changing.query(User).filter(User.id == owner_id).with_for_update().one()
        worker = threading.Thread(target=cleanup)
        worker.start()
        assert waiting.wait(timeout=5)
        if protection == 'pro':
            changing.add(BillingSubscription(user_id=owner_id, provider='activation_code', status='active',
                                             ends_at=NOW+timedelta(days=30)))
        else:
            changing.get(Review, review_id).share_token = 'share_newly_public'
        changing.commit()
        worker.join(timeout=10)
    assert not worker.is_alive() and errors == []
    assert results[0]['reason'] == ('pro_active' if protection == 'pro' else 'public')
    assert storage.deleted == []


def test_original_removed_before_a_content_commit_failure_can_resume(db):
    _user, photo, review = seed(db)
    storage = Storage()
    with patch.object(retention, '_clear_content_copies', side_effect=RuntimeError('synthetic interruption')):
        with pytest.raises(RuntimeError):
            purge_review_history(db, storage, review.id, now=NOW)
    db.rollback()
    db.refresh(photo)
    db.refresh(review)
    assert photo.status == PhotoStatus.PURGED and review.deleted_at is None
    assert review.result_json['critique'] == 'private prose'
    assert purge_review_history(db, storage, review.id, now=NOW)['status'] == 'purged'


def test_another_original_purge_in_progress_is_not_resumed_early(db):
    _user, photo, review = seed(db)
    photo.status = PhotoStatus.PURGING
    photo.updated_at = NOW
    db.commit()
    storage = Storage()
    assert purge_review_history(db, storage, review.id, now=NOW)['reason'] == 'photo_purge_in_progress'
    assert storage.deleted == []


def test_notice_proof_survives_inbox_visibility_expiry_and_revocation_stops_cleanup(db):
    user, photo, review=seed(db,days=120,notice_days=100)
    notice=delivered_notice(db,user.id)
    assert visible_notifications(db,user.id,NOW).count()==0
    cleanup_expired_notifications(db)
    assert delivered_notice(db,user.id) is not None
    assert decide_review_content(db,review,photo,now=NOW).purge
    notice.revoked_at=NOW
    db.commit()
    assert decide_review_content(db,review,photo,now=NOW).reason=='notice_not_delivered'


def test_notice_is_system_delivered_once_without_preferences_and_only_private_accounts_are_candidates(db):
    user, _photo, _review=seed(db,days=1,notice_days=None)
    public_user, _photo2, _review2=seed(db,days=1,notice_days=None,public=True)
    assert user.id in [item.id for item in notice_candidates(db,max_items=100)]
    assert public_user.id not in [item.id for item in notice_candidates(db,max_items=100)]
    assert queue_retention_notice(db,user)
    assert not queue_retention_notice(db,user)
    db.commit()
    event=db.query(NotificationEvent).filter_by(recipient_user_id=user.id).one()
    assert delivered_notice(db,user.id) is None
    assert _consume(db,event)=='delivered'
    db.commit()
    notice=delivered_notice(db,user.id)
    assert notice.category=='system' and notice.expires_at is None
    for locale in ('en','zh','ja'):
        rendered=render_notification(db,notice,locale=locale,detail=True)
        assert rendered['target']['type']=='account_history'
        assert rendered['target']['href']=='/account/reviews'
        assert 'UTC' in rendered['body'] and '7' in rendered['body']


def test_cli_preview_is_read_only_and_execute_flags_are_independent(db,engine):
    _user, _photo, _review=seed(db)
    args=Namespace(action='preview',execute=False,max_items=200,after_review_id=0)
    report=run(args,engine=engine)
    assert report['transaction_read_only']=='on' and report['eligible_reviews']==1
    assert db.query(Review).filter(Review.deleted_at.is_(None)).count()==1
    for action in ('notify','purge'):
        args=Namespace(action=action,execute=True,max_items=1,after_review_id=0,database_url=DATABASE_URL)
        with pytest.raises(ValueError):
            validate(args)
