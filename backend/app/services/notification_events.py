"""Capture events inside the caller's business transaction; never commit here."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import re
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Announcement, GeneratedImage, NotificationEvent, NotificationPreference, Review, TaskStatus, User, UserPlan, UserStatus


EVENT_CATEGORIES = {'review.completed': 'system', 'review.failed': 'system',
                    'generation.completed': 'system', 'generation.failed': 'system',
                    'credits.confirmed': 'system', 'subscription.changed': 'system',
                    'gallery.review_liked': 'interaction', 'announcement.published': 'announcement'}
PARAM_FIELDS = {'review.completed': {'task_id', 'review_id'}, 'review.failed': {'task_id'},
                'generation.completed': {'task_id', 'generation_id'}, 'generation.failed': {'task_id'},
                'credits.confirmed': {'grant_id', 'credits'}, 'subscription.changed': {'subscription_id', 'status', 'version'},
                'gallery.review_liked': {'review_id'}, 'announcement.published': {'announcement_id'}}


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def database_now(db: Session) -> datetime:
    dialect = db.get_bind().dialect.name
    # Existing route unit tests use a non-executing Session double. Real database
    # sessions must always use their database clock and propagate failures.
    if not isinstance(dialect, str):
        return datetime.now(timezone.utc)
    clock = func.clock_timestamp() if dialect == 'postgresql' else func.current_timestamp()
    return utc(db.scalar(select(clock)))


def insert_once(db: Session, model, values: dict, keys: list[str]) -> bool:
    dialect = db.get_bind().dialect.name
    if isinstance(dialect, str) and dialect not in {'postgresql', 'sqlite'}:
        raise ValueError('Unsupported notification database')
    # A Session double can still capture the PostgreSQL statement without SQL
    # execution; real SQLite uses its own atomic ON CONFLICT implementation.
    statement = (sqlite_insert if dialect == 'sqlite' else pg_insert)(model).values(**values)
    return db.execute(statement.on_conflict_do_nothing(index_elements=keys)).rowcount == 1


def _insert_event_once(db: Session, values: dict) -> bool:
    return insert_once(db, NotificationEvent, values, ['dedupe_key'])


def active_account(user: User | None) -> bool:
    return user is not None and user.status == UserStatus.active and user.plan in {UserPlan.free, UserPlan.pro}


def lock_notification_recipient_user(db: Session, user_id: int, *, skip_locked: bool = False) -> User | None:
    return (
        db.query(User)
        .filter_by(id=user_id)
        .with_for_update(key_share=True, skip_locked=skip_locked)
        .populate_existing()
        .first()
    )


def lock_active_notification_recipient(db: Session, user_id: int) -> User | None:
    db.flush()
    user = lock_notification_recipient_user(db, user_id)
    return user if active_account(user) else None


def read_preferences(db: Session, user_id: int) -> dict:
    pref = db.get(NotificationPreference, user_id)
    return {'likes_enabled': bool(pref and pref.likes_enabled),
            'announcements_enabled': bool(pref and pref.announcements_enabled),
            'likes_enabled_at': utc(pref.likes_enabled_at) if pref and pref.likes_enabled_at else None,
            'announcements_enabled_at': utc(pref.announcements_enabled_at) if pref and pref.announcements_enabled_at else None,
            'updated_at': utc(pref.updated_at) if pref and pref.updated_at else None}


def update_preferences(db: Session, user_id: int, changes: dict) -> dict:
    user = db.query(User).filter_by(id=user_id).with_for_update().populate_existing().one()
    if not active_account(user):
        raise ValueError('Inactive notification recipient')
    pref = db.query(NotificationPreference).filter_by(user_id=user_id).populate_existing().first()
    if pref is None:
        pref = NotificationPreference(user_id=user_id, likes_enabled=False, announcements_enabled=False)
        db.add(pref)
    now = database_now(db)
    for name in ('likes_enabled', 'announcements_enabled'):
        if name not in changes:
            continue
        enabled = changes[name]
        if type(enabled) is not bool:
            raise ValueError('Invalid preference value')
        if enabled != getattr(pref, name):
            setattr(pref, f'{name}_at', now if enabled else None)
        setattr(pref, name, enabled)
    pref.updated_at = now
    db.flush()
    return read_preferences(db, user_id)


def capture_event(db: Session, *, event_type: str, dedupe_key: str, recipient_user_id: int | None,
                  params: dict, optional_eligible: bool = False, occurred_at: datetime | None = None,
                  announcement_id: int | None = None) -> bool:
    if not settings.notifications_event_capture_enabled:
        return False
    if event_type not in PARAM_FIELDS or set(params) - PARAM_FIELDS[event_type] or any(
        not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value) for value in params.values()
    ):
        raise ValueError('Invalid notification parameters')
    if recipient_user_id is not None:
        recipient = lock_active_notification_recipient(db, recipient_user_id)
        if recipient is None:
            return False
        recipient_user_id = recipient.id
    now = occurred_at or database_now(db)
    return insert_once(db, NotificationEvent, {
        'public_id': f'nev_{uuid4().hex}', 'event_type': event_type, 'dedupe_key': dedupe_key,
        'recipient_user_id': recipient_user_id, 'payload_json': params,
        'optional_preference_eligible': optional_eligible,
        'cursor_json': {'announcement_id': announcement_id, 'last_user_id': 0},
        'occurred_at': now, 'available_at': now,
    }, ['dedupe_key'])


def record_review_terminal(db: Session, task, review=None, *, cached: bool = False) -> bool:
    return _record_terminal(db, task, review, family='review', cached=cached)


def record_generation_terminal(db: Session, task, image=None, *, cached: bool = False) -> bool:
    return _record_terminal(db, task, image, family='generation', cached=cached)


def record_credit_confirmed(db: Session, user: User, *, grant_id: str, credits: int) -> bool:
    confirmed_credits = int(credits)
    if confirmed_credits <= 0:
        return False
    amount = str(confirmed_credits)
    return capture_event(
        db,
        event_type='credits.confirmed',
        dedupe_key=f'credits:{user.id}:{grant_id}',
        recipient_user_id=user.id,
        params={'grant_id': grant_id, 'credits': amount},
    )


def record_subscription_changed(db: Session, user: User, *, subscription_id: str, status: str, version: str) -> bool:
    normalized_status = str(status or 'unknown').strip().lower()[:40] or 'unknown'
    state_version = hashlib.sha256(str(version or normalized_status).encode()).hexdigest()[:24]
    return capture_event(
        db,
        event_type='subscription.changed',
        dedupe_key=f'subscription:{user.id}:{subscription_id}:{state_version}',
        recipient_user_id=user.id,
        params={'subscription_id': subscription_id, 'status': normalized_status, 'version': state_version},
    )


def _record_terminal(db: Session, task, result, *, family: str, cached: bool) -> bool:
    if cached or task.status not in {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.EXPIRED, TaskStatus.DEAD_LETTER}:
        return False
    completed = task.status == TaskStatus.SUCCEEDED
    params = {'task_id': task.public_id}
    if completed:
        result_model = Review if family == 'review' else GeneratedImage
        if result is None:
            result = db.query(result_model).filter_by(task_id=task.id).first()
        if result is None or result.owner_user_id != task.owner_user_id:
            return False
        params['review_id' if family == 'review' else 'generation_id'] = result.public_id
    return capture_event(db, event_type=f'{family}.{"completed" if completed else "failed"}',
                         dedupe_key=f'{family}:{task.public_id}:{"completed" if completed else "terminal_failure"}',
                         recipient_user_id=task.owner_user_id, params=params)


def record_gallery_like(db: Session, review: Review, liker_user_id: int) -> bool:
    if review.owner_user_id == liker_user_id:
        return False
    owner = lock_active_notification_recipient(db, review.owner_user_id)
    if not active_account(owner):
        return False
    now = database_now(db)
    pref = db.query(NotificationPreference).filter_by(user_id=owner.id).populate_existing().first()
    eligible = bool(pref and pref.likes_enabled and pref.likes_enabled_at and utc(pref.likes_enabled_at) <= now)
    # Save the dedupe key even when optional delivery was disabled at this like.
    # Otherwise enabling preferences and unlike/re-like would replay old likes.
    return capture_event(db, event_type='gallery.review_liked', dedupe_key=f'gallery_like:{review.public_id}:{liker_user_id}',
                         recipient_user_id=owner.id, params={'review_id': review.public_id},
                         optional_eligible=eligible, occurred_at=now)


def validate_announcement_content(content: dict) -> dict:
    from app.services.announcements import validate_announcement_content as validate

    return validate(content)


def validate_announcement_target(target_type: str | None, target_public_id: str | None) -> dict:
    from app.services.announcements import validate_announcement_target as validate

    return validate(target_type, target_public_id)


def record_announcement_published(db: Session, announcement: Announcement) -> bool:
    if announcement.status != 'published' or announcement.published_at is None:
        return False
    return capture_event(db, event_type='announcement.published', dedupe_key=f'announcement:{announcement.public_id}:published',
                         recipient_user_id=None, params={'announcement_id': announcement.public_id},
                         announcement_id=announcement.id, occurred_at=announcement.published_at)


def publish_announcement(db: Session, *, publish_key: str, created_by: str, content: dict,
                         recipient_ids: list[int] | None = None, target_type: str | None = None,
                         target_public_id: str | None = None, expires_at: datetime | None = None,
                         update_id: str | None = None) -> Announcement:
    from app.services.announcements import publish_announcement as publish

    if recipient_ids is not None:
        raise ValueError('Specific announcements require public user IDs')
    return publish(
        db,
        publish_key=publish_key,
        content=content,
        target_type=target_type,
        target_public_id=target_public_id,
        expires_at=expires_at,
        update_id=update_id,
        audit_reason=f'legacy notification_events caller: {created_by}',
        deployment_verified=False,
    )


def cancel_announcement(db: Session, public_id: str, *, operator: str) -> Announcement:
    from app.services.announcements import cancel_announcement as cancel

    return cancel(db, public_id, audit_reason=f'legacy notification_events caller: {operator}')
