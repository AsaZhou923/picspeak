"""Operator-controlled removal of expired private critique content."""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterator

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    IdempotencyKey, Notification, Photo, PhotoStatus, Review, ReviewScoreSnapshot,
    ReviewQuotaReservation, ReviewStatus, ReviewTask, ReviewTaskEvent, TaskStatus, User, UserPlan, UserStatus,
)
from app.services.notification_events import capture_event
from app.services.object_retention import (
    FREE_ORIGINAL_DAYS, PRO_LAPSED_GRACE_DAYS, STUCK_PURGING_AGE,
    collect_photo_facts, purge_photo_original,
)
from app.services.review_visibility import public_review_filter, review_is_public

POLICY_VERSION = 'free-private-history-v1'
NOTICE_TYPE = 'history.retention_notice'
NOTICE_GRACE_DAYS = 7
MARKER_KEY = '_history_retention'


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def notice_key(user_id: int) -> str:
    return f'history-retention:{POLICY_VERSION}:{user_id}'


def content_was_purged(review: Review) -> bool:
    marker = (review.result_json or {}).get(MARKER_KEY)
    return bool(review.deleted_at and isinstance(marker, dict) and marker.get('policy_version') == POLICY_VERSION)


def delivered_notice(db: Session, user_id: int) -> Notification | None:
    return db.query(Notification).filter(
        Notification.recipient_user_id == user_id,
        Notification.category == 'system', Notification.notification_type == NOTICE_TYPE,
        Notification.dedupe_key == notice_key(user_id), Notification.revoked_at.is_(None),
    ).first()


def queue_retention_notice(db: Session, user: User) -> bool:
    """Queue a mandatory system notice through the existing delivery worker."""
    if not (settings.notifications_read_enabled and settings.notifications_event_capture_enabled
            and settings.notifications_worker_enabled):
        raise ValueError('Notification reading, capture and delivery must be enabled before notifying')
    from app.services.billing_access import active_subscription_for_user

    if user.plan == UserPlan.guest or user.status != UserStatus.active or active_subscription_for_user(db, user) is not None:
        return False
    return capture_event(
        db, event_type=NOTICE_TYPE, dedupe_key=notice_key(user.id), recipient_user_id=user.id,
        params={'policy_version': POLICY_VERSION, 'grace_days': str(NOTICE_GRACE_DAYS)},
    )


@dataclass(frozen=True)
class HistoryDecision:
    purge: bool
    reason: str
    eligible_at: datetime | None = None


def decide_review_content(db: Session, review: Review, photo: Photo, *, now: datetime) -> HistoryDecision:
    now = utc(now)
    if not (settings.notifications_read_enabled and settings.notifications_event_capture_enabled
            and settings.notifications_worker_enabled):
        return HistoryDecision(False, 'notification_rollout_disabled')
    if review.owner_user_id != photo.owner_user_id:
        return HistoryDecision(False, 'owner_mismatch')
    if photo.status == PhotoStatus.PURGING and utc(photo.updated_at) > now - STUCK_PURGING_AGE:
        return HistoryDecision(False, 'photo_purge_in_progress')
    if review.deleted_at is not None and not content_was_purged(review):
        return HistoryDecision(False, 'owner_deleted')
    facts = collect_photo_facts(db, [photo], now=now)[photo.id]
    if facts.owner.plan == UserPlan.guest or facts.owner.status != UserStatus.active:
        return HistoryDecision(False, 'inactive_or_guest')
    if facts.owner.pro_active:
        return HistoryDecision(False, 'pro_active')
    if review_is_public(review):
        return HistoryDecision(False, 'public')
    if facts.has_live_task:
        return HistoryDecision(False, 'live_task')
    synchronous_work = db.query(ReviewQuotaReservation.id).filter(
        ReviewQuotaReservation.user_id == review.owner_user_id,
        ReviewQuotaReservation.task_id.is_(None), ReviewQuotaReservation.status == 'held',
        ReviewQuotaReservation.expires_at > now,
    ).first()
    if synchronous_work is not None:
        return HistoryDecision(False, 'sync_review_in_progress')
    if review.status != ReviewStatus.SUCCEEDED:
        return HistoryDecision(False, 'not_completed')
    eligible_at = utc(review.created_at) + timedelta(days=FREE_ORIGINAL_DAYS)
    if facts.owner.pro_ended_at:
        eligible_at = max(eligible_at, utc(facts.owner.pro_ended_at) + timedelta(days=PRO_LAPSED_GRACE_DAYS))
    notice = delivered_notice(db, review.owner_user_id)
    if notice is None or (notice.template_params_json or {}).get('policy_version') != POLICY_VERSION:
        return HistoryDecision(False, 'notice_not_delivered')
    eligible_at = max(eligible_at, utc(notice.delivered_at) + timedelta(days=NOTICE_GRACE_DAYS))
    if eligible_at > now:
        return HistoryDecision(False, 'within_retention_or_notice_grace', eligible_at)
    return HistoryDecision(True, 'already_content_purged' if content_was_purged(review) else 'expired_private', eligible_at)


def iter_history_candidates(db: Session, *, now: datetime, max_items: int, after_id: int = 0) -> Iterator[tuple[Review, Photo, HistoryDecision]]:
    rows = db.query(Review, Photo).join(Photo, Photo.id == Review.photo_id).join(User, User.id == Review.owner_user_id).filter(
        User.plan.in_((UserPlan.free, UserPlan.pro)), User.status == UserStatus.active,
        Review.created_at <= utc(now) - timedelta(days=FREE_ORIGINAL_DAYS),
        Review.status == ReviewStatus.SUCCEEDED,
        Review.id > after_id,
    ).order_by(Review.id).yield_per(100)
    emitted = 0
    for review, photo in rows:
        if review.deleted_at is not None and not content_was_purged(review):
            continue
        if content_was_purged(review) and photo.status == PhotoStatus.PURGED:
            continue
        yield review, photo, decide_review_content(db, review, photo, now=now)
        emitted += 1
        if emitted >= max_items:
            break


def notice_candidates(db: Session, *, max_items: int) -> list[User]:
    from app.services.billing_access import active_subscription_for_user

    users = db.query(User).filter(User.plan.in_((UserPlan.free, UserPlan.pro)), User.status == UserStatus.active).order_by(User.id)
    result = []
    for user in users:
        if active_subscription_for_user(db, user) is not None or delivered_notice(db, user.id) is not None:
            continue
        exists = db.query(Review.id).filter(
            Review.owner_user_id == user.id, Review.deleted_at.is_(None),
            Review.status == ReviewStatus.SUCCEEDED, ~public_review_filter(),
        ).first()
        if exists is not None:
            result.append(user)
        if len(result) >= max_items:
            break
    return result


@contextmanager
def _owner_cleanup_lease(db: Session, owner_user_id: int):
    """Keep entitlement changes serialized across the object purge's commits."""
    bind = db.get_bind()
    if bind.dialect.name != 'postgresql':
        raise ValueError('History cleanup requires PostgreSQL')
    db.rollback()
    with bind.engine.connect() as connection, connection.begin():
        owner_id = connection.execute(select(User.id).where(User.id == owner_user_id).with_for_update()).scalar_one_or_none()
        yield owner_id is not None


def _clear_task_content(task: ReviewTask) -> None:
    task.request_payload = {key: value for key, value in (task.request_payload or {}).items()
                            if key not in {'_canonical_score_checkpoint', 'review_result', 'result'}}
    task.error_message = None


def _clear_content_copies(db: Session, review: Review, *, now: datetime) -> None:
    review.result_json = {MARKER_KEY: {'policy_version': POLICY_VERSION, 'purged_at': utc(now).isoformat()}}
    review.note = None
    review.tags_json = []
    review.favorite = False
    review.deleted_at = review.deleted_at or now
    review.is_public = False
    review.share_token = None
    review.gallery_visible = False
    review.gallery_audit_status = 'none'
    review.gallery_added_at = None
    review.gallery_rejected_reason = None
    db.add(review)
    db.query(ReviewScoreSnapshot).filter(ReviewScoreSnapshot.review_id == review.id).delete(synchronize_session=False)
    records = db.query(IdempotencyKey).filter(
        IdempotencyKey.user_id == review.owner_user_id, IdempotencyKey.endpoint == '/reviews',
        IdempotencyKey.response_json['review_id'].as_string() == review.public_id,
    ).all()
    for record in records:
        record.response_json = {key: value for key, value in (record.response_json or {}).items() if key != 'result'}
    if review.task_id is not None:
        task = db.get(ReviewTask, review.task_id)
        if task is not None:
            _clear_task_content(task)
        for event in db.query(ReviewTaskEvent).filter(ReviewTaskEvent.task_id == review.task_id).all():
            event.message = None
            event.payload_json = {}


def purge_review_history(db: Session, storage, review_id: int, *, now: datetime) -> dict:
    """Clear one critique after notice and protection checks under locks."""
    identity = db.query(Review.owner_user_id, Review.photo_id).filter(Review.id == review_id).first()
    if identity is None:
        db.rollback()
        return {'status': 'skipped', 'reason': 'review_missing'}
    owner_id, photo_id = identity
    with _owner_cleanup_lease(db, owner_id) as owner_exists:
        if not owner_exists:
            return {'status': 'skipped', 'reason': 'owner_missing'}
        photo = db.query(Photo).filter(Photo.id == photo_id).with_for_update(skip_locked=True).populate_existing().first()
        if photo is None:
            db.rollback()
            return {'status': 'skipped', 'reason': 'photo_busy_or_missing'}
        review = db.query(Review).filter(Review.id == review_id).with_for_update().populate_existing().first()
        if review is None:
            db.rollback()
            return {'status': 'skipped', 'reason': 'review_missing'}
        decision = decide_review_content(db, review, photo, now=now)
        if not decision.purge:
            db.rollback()
            return {'status': 'skipped', 'reason': decision.reason}
        # Keep this critique active until the existing original policy has made
        # its decision. A storage failure leaves its content available for retry.
        if photo.status != PhotoStatus.PURGED:
            outcome = purge_photo_original(db, storage, photo_id, now=now)
            if outcome.status == 'failed':
                return {'status': 'failed', 'reason': 'original_removal_failed'}
        photo = db.query(Photo).filter(Photo.id == photo_id).with_for_update(skip_locked=True).populate_existing().first()
        if photo is None:
            db.rollback()
            return {'status': 'skipped', 'reason': 'photo_busy_or_missing'}
        review = db.query(Review).filter(Review.id == review_id).with_for_update().populate_existing().one()
        decision = decide_review_content(db, review, photo, now=now)
        if not decision.purge:
            db.rollback()
            return {'status': 'skipped', 'reason': decision.reason}
        _clear_content_copies(db, review, now=now)
        if photo.status == PhotoStatus.PURGED:
            photo.exif_data = {}
            photo.client_meta = {}
            for task in db.query(ReviewTask).filter(
                ReviewTask.photo_id == photo_id,
                ReviewTask.status.notin_((TaskStatus.PENDING, TaskStatus.RUNNING)),
            ).all():
                _clear_task_content(task)
        db.commit()
        return {'status': 'purged', 'reason': decision.reason, 'original_purged': photo.status == PhotoStatus.PURGED}
