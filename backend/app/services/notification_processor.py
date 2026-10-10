"""Database-only notification delivery and shared inbox visibility."""
from __future__ import annotations

from datetime import datetime, timedelta
import logging
import re
import time
from uuid import uuid4

from sqlalchemy import exists, func, or_, select, text
from sqlalchemy.orm import Session

from app.db.models import Announcement, GeneratedImage, ImageGenerationTask, Notification, NotificationEvent, NotificationPreference, Review, ReviewStatus, ReviewTask, TaskStatus, User
from app.db.session import SessionLocal
from app.services.announcements import validate_announcement_content, validate_announcement_target
from app.services.notification_events import EVENT_CATEGORIES, PARAM_FIELDS, active_account, database_now, insert_once, lock_notification_recipient_user, utc

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 10
ANNOUNCEMENT_BATCH_SIZE = 100
RECIPIENT_BUSY = 'recipient_busy'
TEMPLATE_KEYS = {
    'review.completed': 'review_completed',
    'review.failed': 'review_failed',
    'generation.completed': 'generation_completed',
    'generation.failed': 'generation_failed',
    'credits.confirmed': 'credits_confirmed',
    'subscription.changed': 'subscription_changed',
    'gallery.review_liked': 'gallery_review_liked',
    'announcement.published': 'announcement_published',
}


def visible_notifications(db: Session, user_id: int, now: datetime | None = None, include_archived: bool = False):
    now = now or database_now(db)
    announcement_valid = exists(select(Announcement.id).where(
        Announcement.id == Notification.announcement_id, Announcement.status == 'published',
        Announcement.cancelled_at.is_(None),
        or_(Announcement.expires_at.is_(None), Announcement.expires_at > now)))
    query = db.query(Notification).filter(
        Notification.recipient_user_id == user_id, Notification.revoked_at.is_(None),
        or_(Notification.expires_at > now,
            Notification.expires_at.is_(None) & (Notification.delivered_at > now - timedelta(days=90))),
        or_(Notification.announcement_id.is_(None), announcement_valid))
    return query if include_archived else query.filter(Notification.archived_at.is_(None))


def unread_counts(db: Session, user_id: int, now: datetime | None = None) -> dict:
    now = now or database_now(db)
    rows = visible_notifications(db, user_id, now).filter(Notification.read_at.is_(None)).with_entities(
        Notification.category, func.count(Notification.id)).group_by(Notification.category).all()
    categories = {'system': 0, 'interaction': 0, 'announcement': 0}
    categories.update(dict(rows))
    return {'count': sum(categories.values()), 'categories': categories, 'as_of': now}


def _announcement_content(announcement: Announcement) -> dict:
    return {locale: {'title': (announcement.title_json or {}).get(locale),
                     'summary': (announcement.summary_json or {}).get(locale),
                     'body': (announcement.body_json or {}).get(locale)} for locale in ('en', 'zh', 'ja')}


def notification_payload(db: Session, row: Notification, user_id: int) -> dict:
    params = {key: value for key, value in (row.template_params_json or {}).items()
              if key in PARAM_FIELDS.get(row.notification_type, set()) and isinstance(value, str)
              and re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value)}
    target = None
    if row.category == 'announcement':
        announcement = db.get(Announcement, row.announcement_id)
        if announcement is not None:
            validate_announcement_content(_announcement_content(announcement))
            params = {'announcement_id': announcement.public_id}
            cta = announcement.cta_json or {}
            validate_announcement_target(cta.get('type'), cta.get('public_id'))
            if cta.get('type'):
                target = {'type': cta['type'], 'public_id': cta.get('public_id')}
    elif row.notification_type == 'gallery.review_liked':
        review = db.query(Review).filter(
            Review.public_id == params.get('review_id'), Review.owner_user_id == user_id,
            Review.deleted_at.is_(None), Review.status == ReviewStatus.SUCCEEDED).first()
        if review:
            target = {'type': 'review', 'public_id': review.public_id}
    elif row.notification_type.startswith(('review.', 'generation.')):
        is_review = row.notification_type.startswith('review.')
        task_model = ReviewTask if is_review else ImageGenerationTask
        task = db.query(task_model).filter(task_model.public_id == params.get('task_id'),
                                          task_model.owner_user_id == user_id).first()
        if task:
            result_model = Review if is_review else GeneratedImage
            result = None
            if task.status == TaskStatus.SUCCEEDED:
                result = db.query(result_model).filter(result_model.task_id == task.id,
                    result_model.owner_user_id == user_id, result_model.deleted_at.is_(None)).first()
            target = {'type': ('review' if is_review else 'generation') if result else
                      ('review_task' if is_review else 'generation_task'),
                      'public_id': result.public_id if result else task.public_id}
    return {'id': row.public_id, 'category': row.category, 'event_type': row.notification_type,
            'template_key': row.template_key, 'template_version': row.template_version, 'params': params,
            'target': target, 'target_state': 'available' if target else 'unavailable',
            'occurred_at': row.occurred_at, 'delivered_at': row.delivered_at, 'read_at': row.read_at,
            'archived_at': row.archived_at, 'expires_at': row.expires_at}


def render_notification(db: Session, row: Notification, *, locale: str | None = None, detail: bool = False) -> dict:
    payload = notification_payload(db, row, row.recipient_user_id)
    target = payload.get('target')
    if isinstance(target, dict):
        target = {**target, 'state': payload.get('target_state', 'available')}
    return {
        'notification_id': payload['id'],
        'category': payload['category'],
        'type': payload['event_type'],
        'template_key': payload['template_key'],
        'template_version': payload['template_version'],
        'params': payload['params'],
        'target': target,
        'occurred_at': payload['occurred_at'],
        'delivered_at': payload['delivered_at'],
        'read_at': payload['read_at'],
        'archived_at': payload['archived_at'],
        'expires_at': payload['expires_at'],
    }


def _optional_enabled(pref, field: str, occurred_at: datetime) -> bool:
    return bool(pref and getattr(pref, field) and getattr(pref, f'{field}_at') and
                utc(getattr(pref, f'{field}_at')) <= utc(occurred_at))


def _deliver(db: Session, event: NotificationEvent, user_id: int, announcement: Announcement | None = None) -> str:
    skip_locked = db.get_bind().dialect.name == 'postgresql'
    user = lock_notification_recipient_user(db, user_id, skip_locked=skip_locked)
    if user is None and skip_locked:
        if db.query(User.id).filter_by(id=user_id).first() is not None:
            return RECIPIENT_BUSY
        return 'suppressed_inactive'
    if not active_account(user):
        return 'suppressed_inactive'
    now = database_now(db)  # Clock time after obtaining the recipient lock, including across midnight.
    if utc(event.occurred_at) < now - timedelta(days=7):
        return 'expired_delivery'
    category = EVENT_CATEGORIES[event.event_type]
    dedupe_key = f'{event.dedupe_key}:{user_id}' if announcement else event.dedupe_key
    if db.query(Notification.id).filter_by(recipient_user_id=user_id, dedupe_key=dedupe_key).first():
        return 'delivered'
    if category != 'system':
        pref = db.query(NotificationPreference).filter_by(user_id=user_id).populate_existing().first()
        field = 'likes_enabled' if category == 'interaction' else 'announcements_enabled'
        if (not announcement and not event.optional_preference_eligible) or not _optional_enabled(pref, field, event.occurred_at):
            return 'suppressed_preferences'
    if category == 'interaction':
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        count = db.query(func.count(Notification.id)).filter(
            Notification.recipient_user_id == user_id, Notification.notification_type == 'gallery.review_liked',
            Notification.delivered_at >= start, Notification.delivered_at < start + timedelta(days=1)).scalar()
        if count >= 20:
            return 'suppressed_limit'
        review = db.query(Review).filter(Review.public_id == event.payload_json.get('review_id'),
            Review.owner_user_id == user_id, Review.deleted_at.is_(None), Review.status == ReviewStatus.SUCCEEDED).first()
        if review is None:
            return 'expired_delivery'
    params = event.payload_json or {}
    if set(params) - PARAM_FIELDS[event.event_type] or any(
        not isinstance(v, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', v) for v in params.values()
    ):
        raise ValueError('Invalid notification parameters')
    expires_at = now + timedelta(days=90)
    if announcement and announcement.expires_at:
        expires_at = min(expires_at, utc(announcement.expires_at))
    target_type = None
    target_public_id = None
    if event.event_type == 'gallery.review_liked':
        target_type = 'review'
        target_public_id = params.get('review_id')
    elif event.event_type == 'review.completed':
        target_type = 'review'
        target_public_id = params.get('review_id')
    elif event.event_type == 'review.failed':
        target_type = 'review_task'
        target_public_id = params.get('task_id')
    elif event.event_type == 'generation.completed':
        target_type = 'generation'
        target_public_id = params.get('generation_id')
    elif event.event_type == 'generation.failed':
        target_type = 'generation_task'
        target_public_id = params.get('task_id')
    elif event.event_type in {'credits.confirmed', 'subscription.changed'}:
        target_type = 'account_usage'

    insert_once(db, Notification, {
        'public_id': f'not_{uuid4().hex}', 'recipient_user_id': user_id,
        'category': category, 'notification_type': event.event_type, 'dedupe_key': dedupe_key,
        'template_key': TEMPLATE_KEYS.get(event.event_type, event.event_type), 'template_version': 1,
        'template_params_json': params, 'announcement_id': announcement.id if announcement else None,
        'target_type': target_type, 'target_public_id': target_public_id,
        'occurred_at': event.occurred_at, 'delivered_at': now, 'expires_at': expires_at,
    }, ['recipient_user_id', 'dedupe_key'])
    return 'delivered'


def _consume(db: Session, event: NotificationEvent) -> str:
    now = database_now(db)
    if event.schema_version != 1 or event.event_type not in EVENT_CATEGORIES or utc(event.occurred_at) < now - timedelta(days=7):
        return 'expired_delivery'
    if event.event_type != 'announcement.published':
        return _deliver(db, event, event.recipient_user_id) if event.recipient_user_id is not None else 'expired_delivery'
    announcement = db.query(Announcement).filter_by(id=(event.cursor_json or {}).get('announcement_id')).with_for_update().populate_existing().first()
    if not announcement or announcement.status != 'published' or announcement.cancelled_at or (
        announcement.expires_at and utc(announcement.expires_at) <= now):
        return 'expired_delivery'
    validate_announcement_content(_announcement_content(announcement))
    cta = announcement.cta_json or {}
    validate_announcement_target(cta.get('type'), cta.get('public_id'))
    candidates = db.query(User.id).filter(User.id > (event.cursor_json or {}).get('last_user_id', 0),
                                         User.created_at <= event.occurred_at)
    audience = announcement.audience_json or {}
    if announcement.audience_type == 'specific_users':
        candidates = candidates.filter(User.id.in_(audience.get('user_ids', [])))
    elif announcement.audience_type == 'all_existing_users':
        candidates = candidates.filter(User.id <= audience.get('max_user_id', 0))
    else:
        return 'expired_delivery'
    ids = [row[0] for row in candidates.order_by(User.id).limit(ANNOUNCEMENT_BATCH_SIZE + 1).all()]
    for user_id in ids[:ANNOUNCEMENT_BATCH_SIZE]:
        outcome = _deliver(db, event, user_id, announcement)
        if outcome == RECIPIENT_BUSY:
            return RECIPIENT_BUSY
        event.cursor_json = {**event.cursor_json, 'last_user_id': user_id}
    return 'pending' if len(ids) > ANNOUNCEMENT_BATCH_SIZE else 'delivered'


def process_pending_notifications(db: Session | None = None, *, limit: int = 100, max_batches: int = 10,
                                  time_budget_seconds: float = 20) -> dict:
    owned = db is None
    db = db or SessionLocal()
    started = time.monotonic()
    processed, failed = 0, 0
    try:
        for _ in range(min(max(limit, 1), 100) * min(max(max_batches, 1), 10)):
            if time.monotonic() - started >= min(time_budget_seconds, 20):
                break
            if db.get_bind().dialect.name == 'postgresql':
                db.execute(text("SET LOCAL lock_timeout = '2000ms'"))
            event = db.query(NotificationEvent).filter(NotificationEvent.status == 'pending',
                NotificationEvent.available_at <= database_now(db)).order_by(
                    NotificationEvent.available_at, NotificationEvent.id).with_for_update(skip_locked=True).first()
            if event is None:
                db.rollback()
                break
            event_id = event.id
            try:
                with db.begin_nested():
                    outcome = _consume(db, event)
                event.last_error_code = None
                if outcome == RECIPIENT_BUSY:
                    event.status = 'pending'
                    event.available_at = database_now(db) + timedelta(seconds=1)
                elif outcome != 'pending':
                    event.status = outcome
                    event.processed_at = database_now(db)
                else:
                    event.status = outcome
                    event.available_at = database_now(db)
                db.commit()
                if outcome != RECIPIENT_BUSY:
                    processed += 1
            except Exception:
                # Retry the exact failed event, never an unrelated next pending row.
                retry = db.query(NotificationEvent).filter_by(id=event_id, status='pending').with_for_update(skip_locked=True).first()
                if retry is None:
                    continue
                retry.attempts += 1
                retry.last_error_code = 'NOTIFICATION_PROCESSING_FAILED'
                if retry.attempts >= MAX_ATTEMPTS:
                    retry.status = 'failed'
                    retry.processed_at = database_now(db)
                    logger.error('Notification retry budget exhausted: %s', retry.public_id)
                else:
                    retry.available_at = database_now(db) + timedelta(seconds=min(3600, 2 ** retry.attempts))
                db.commit()
                failed += 1
        return {'processed': processed, 'failed': failed}
    finally:
        if owned:
            db.close()


def notification_health_snapshot(db: Session) -> dict:
    now = database_now(db)
    pending_oldest = db.query(func.min(NotificationEvent.available_at)).filter(
        NotificationEvent.status == 'pending',
    ).scalar()
    pending_count = int(db.query(func.count(NotificationEvent.id)).filter(
        NotificationEvent.status == 'pending',
    ).scalar() or 0)
    failed_count = int(db.query(func.count(NotificationEvent.id)).filter(
        NotificationEvent.status == 'failed',
    ).scalar() or 0)
    last_success = db.query(func.max(NotificationEvent.processed_at)).filter(
        NotificationEvent.status.in_(('delivered', 'suppressed_preferences', 'suppressed_limit', 'suppressed_inactive', 'expired_delivery')),
    ).scalar()
    stale_pending = bool(pending_oldest and utc(pending_oldest) < now - timedelta(minutes=5))
    failed_recent = bool(failed_count)
    return {
        'pending_count': pending_count,
        'failed_count': failed_count,
        'pending_oldest_available_at': pending_oldest.isoformat() if pending_oldest else None,
        'last_successful_processed_at': last_success.isoformat() if last_success else None,
        'stale_pending_over_5m': stale_pending,
        'failed_events_present': failed_recent,
        'status': 'failed' if failed_recent else ('stale' if stale_pending else 'ok'),
    }


def cleanup_expired_notifications(db: Session, *, limit: int = 100) -> int:
    """Delete expired inbox rows and scrub old event payloads in bounded chunks."""
    now = database_now(db)
    chunk = min(max(limit, 1), 500)
    ids = select(Notification.id).where(
        or_(
            Notification.expires_at <= now,
            Notification.delivered_at <= now - timedelta(days=90),
        )
    ).order_by(Notification.id).limit(chunk)
    deleted = db.query(Notification).filter(Notification.id.in_(ids)).delete(synchronize_session=False)
    scrub_ids = select(NotificationEvent.id).where(
        NotificationEvent.processed_at <= now - timedelta(days=30),
        NotificationEvent.status != 'pending',
        or_(NotificationEvent.payload_json != {}, NotificationEvent.cursor_json != {}),
    ).order_by(NotificationEvent.processed_at, NotificationEvent.id).limit(chunk)
    db.query(NotificationEvent).filter(NotificationEvent.id.in_(scrub_ids)).update(
        {'payload_json': {}, 'cursor_json': {}},
        synchronize_session=False,
    )
    db.commit()
    return int(deleted or 0)


def process_notification_events(db: Session, *, limit: int = 100) -> dict:
    result = process_pending_notifications(db, limit=limit)
    return {'claimed': int(result.get('processed', 0)), 'failed': int(result.get('failed', 0))}
