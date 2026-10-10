"""Restricted operator maintenance for existing notification events.

This module requeues failed events only. It never creates a new event and never
changes payload, dedupe key, recipient, or announcement cursor progress.
"""
from __future__ import annotations

from datetime import datetime, timedelta
import re

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.db.models import Announcement, GeneratedImage, ImageGenerationTask, NotificationEvent, Review, ReviewStatus, ReviewTask, TaskStatus, User
from app.services.announcements import validate_announcement_content, validate_announcement_target
from app.services.notification_events import EVENT_CATEGORIES, PARAM_FIELDS, active_account, database_now, lock_notification_recipient_user, utc

PUBLIC_ID_RE = re.compile(r'[A-Za-z0-9_-]{1,100}')
RETRY_AUDIT_LIMIT = 5


def _database_operator(db: Session) -> str:
    if db.get_bind().dialect.name == 'postgresql':
        value = db.scalar(text('SELECT current_user'))
        return str(value)
    return 'sqlite'


def _safe_public_id(value: str | None, field: str) -> str:
    if not value or not isinstance(value, str) or not PUBLIC_ID_RE.fullmatch(value):
        raise ValueError(f'Invalid {field}')
    return value


def _validate_payload(event: NotificationEvent) -> dict:
    params = event.payload_json or {}
    allowed = PARAM_FIELDS.get(event.event_type)
    if event.event_type not in EVENT_CATEGORIES or allowed is None:
        raise ValueError('Unsupported notification event type')
    if set(params) - allowed or any(not isinstance(value, str) or not PUBLIC_ID_RE.fullmatch(value) for value in params.values()):
        raise ValueError('Invalid notification parameters')
    return params


def _announcement_content(announcement: Announcement) -> dict:
    return {
        locale: {
            'title': (announcement.title_json or {}).get(locale),
            'summary': (announcement.summary_json or {}).get(locale),
            'body': (announcement.body_json or {}).get(locale),
        }
        for locale in ('en', 'zh', 'ja')
    }


def _validate_frozen_facts(db: Session, event: NotificationEvent, now: datetime) -> None:
    params = _validate_payload(event)
    if event.schema_version != 1 or utc(event.occurred_at) < now - timedelta(days=7):
        raise ValueError('Notification event is too old to retry')

    if event.event_type == 'announcement.published':
        cursor = event.cursor_json or {}
        announcement_id = cursor.get('announcement_id')
        announcement = db.query(Announcement).filter_by(id=announcement_id).with_for_update().populate_existing().first()
        if (
            announcement is None
            or announcement.public_id != params.get('announcement_id')
            or announcement.status != 'published'
            or announcement.cancelled_at is not None
            or (announcement.expires_at is not None and utc(announcement.expires_at) <= now)
        ):
            raise ValueError('Announcement event is no longer retryable')
        validate_announcement_content(_announcement_content(announcement))
        cta = announcement.cta_json or {}
        validate_announcement_target(cta.get('type'), cta.get('public_id'))
        return

    skip_locked = db.get_bind().dialect.name == 'postgresql'
    user = lock_notification_recipient_user(db, event.recipient_user_id, skip_locked=skip_locked)
    if user is None and skip_locked:
        if db.query(User.id).filter_by(id=event.recipient_user_id).first() is not None:
            raise ValueError('Notification recipient is busy')
        raise ValueError('Notification recipient is inactive')
    if not active_account(user):
        raise ValueError('Notification recipient is inactive')

    if event.event_type == 'gallery.review_liked':
        review = db.query(Review).filter(
            Review.public_id == params.get('review_id'),
            Review.owner_user_id == user.id,
            Review.deleted_at.is_(None),
            Review.status == ReviewStatus.SUCCEEDED,
        ).first()
        if review is None:
            raise ValueError('Gallery like facts are no longer retryable')
    elif event.event_type == 'review.completed':
        task = db.query(ReviewTask).filter(
            ReviewTask.public_id == params.get('task_id'),
            ReviewTask.owner_user_id == user.id,
            ReviewTask.status == TaskStatus.SUCCEEDED,
        ).first()
        review = db.query(Review).filter(
            Review.public_id == params.get('review_id'),
            Review.owner_user_id == user.id,
            Review.deleted_at.is_(None),
        ).first()
        if task is None or review is None or review.task_id != task.id:
            raise ValueError('Review completion facts are no longer retryable')
    elif event.event_type == 'review.failed':
        task = db.query(ReviewTask).filter(
            ReviewTask.public_id == params.get('task_id'),
            ReviewTask.owner_user_id == user.id,
            ReviewTask.status.in_((TaskStatus.FAILED, TaskStatus.EXPIRED, TaskStatus.DEAD_LETTER)),
        ).first()
        if task is None:
            raise ValueError('Review failure facts are no longer retryable')
    elif event.event_type == 'generation.completed':
        task = db.query(ImageGenerationTask).filter(
            ImageGenerationTask.public_id == params.get('task_id'),
            ImageGenerationTask.owner_user_id == user.id,
            ImageGenerationTask.status == TaskStatus.SUCCEEDED,
        ).first()
        image = db.query(GeneratedImage).filter(
            GeneratedImage.public_id == params.get('generation_id'),
            GeneratedImage.owner_user_id == user.id,
            GeneratedImage.deleted_at.is_(None),
        ).first()
        if task is None or image is None or image.task_id != task.id:
            raise ValueError('Generation completion facts are no longer retryable')
    elif event.event_type == 'generation.failed':
        task = db.query(ImageGenerationTask).filter(
            ImageGenerationTask.public_id == params.get('task_id'),
            ImageGenerationTask.owner_user_id == user.id,
            ImageGenerationTask.status.in_((TaskStatus.FAILED, TaskStatus.EXPIRED, TaskStatus.DEAD_LETTER)),
        ).first()
        if task is None:
            raise ValueError('Generation failure facts are no longer retryable')


def _append_retry_audit(cursor: dict, *, actor: str, reason: str, now: datetime, previous_attempts: int, previous_error: str | None) -> dict:
    audit = list((cursor or {}).get('manual_retry_audit') or [])
    audit.append({
        'at': now.isoformat(),
        'by': actor,
        'reason': reason[:300],
        'previous_attempts': int(previous_attempts),
        'previous_error_code': previous_error,
    })
    scrubbed = dict(cursor or {})
    scrubbed['manual_retry_audit'] = audit[-RETRY_AUDIT_LIMIT:]
    return scrubbed


def retry_failed_notification_event(db: Session, public_id: str, *, audit_reason: str, execute: bool = False) -> dict:
    _safe_public_id(public_id, 'notification event ID')
    if not audit_reason or not audit_reason.strip():
        raise ValueError('Retry audit reason is required')
    if db.get_bind().dialect.name == 'postgresql':
        db.execute(text("SET LOCAL lock_timeout = '2000ms'"))
    event = db.query(NotificationEvent).filter_by(public_id=public_id).with_for_update().populate_existing().one()
    now = database_now(db)
    if event.status != 'failed':
        raise ValueError('Only failed notification events can be retried')
    _validate_frozen_facts(db, event, now)
    actor = _database_operator(db)
    result = {
        'dry_run': not execute,
        'event_id': event.public_id,
        'event_type': event.event_type,
        'from_status': event.status,
        'to_status': 'pending',
        'attempts_before': event.attempts,
        'actor': actor,
        'consumer_should_be_paused': True,
    }
    if not execute:
        return result
    event.cursor_json = _append_retry_audit(
        event.cursor_json or {},
        actor=actor,
        reason=audit_reason.strip(),
        now=now,
        previous_attempts=event.attempts,
        previous_error=event.last_error_code,
    )
    event.status = 'pending'
    event.attempts = 0
    event.last_error_code = None
    event.processed_at = None
    event.available_at = now
    db.flush()
    return {**result, 'dry_run': False}


def notification_event_status(db: Session, public_id: str | None = None) -> dict:
    status_rows = db.query(NotificationEvent.status, func.count(NotificationEvent.id)).group_by(NotificationEvent.status).all()
    type_rows = db.query(NotificationEvent.event_type, func.count(NotificationEvent.id)).group_by(NotificationEvent.event_type).all()
    result = {
        'counts_by_status': {status: int(count) for status, count in status_rows},
        'counts_by_event_type': {event_type: int(count) for event_type, count in type_rows},
    }
    if public_id is None:
        return result
    _safe_public_id(public_id, 'notification event ID')
    event = db.query(NotificationEvent).filter_by(public_id=public_id).one()
    cursor = event.cursor_json or {}
    audit = list(cursor.get('manual_retry_audit') or [])
    result['event'] = {
        'event_id': event.public_id,
        'event_type': event.event_type,
        'status': event.status,
        'attempts': event.attempts,
        'schema_version': event.schema_version,
        'occurred_at': utc(event.occurred_at).isoformat(),
        'available_at': utc(event.available_at).isoformat(),
        'processed_at': utc(event.processed_at).isoformat() if event.processed_at else None,
        'last_error_code': event.last_error_code,
        'has_recipient': event.recipient_user_id is not None,
        'cursor_audit_count': len(audit),
        'last_retry_at': audit[-1].get('at') if audit else None,
        'last_retry_error_code': audit[-1].get('previous_error_code') if audit else None,
    }
    return result
