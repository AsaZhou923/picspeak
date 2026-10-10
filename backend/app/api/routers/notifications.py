from __future__ import annotations

from datetime import datetime, timedelta, timezone
import secrets
from typing import Literal

from fastapi import APIRouter, Body, Depends, Query, Request, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_registered_actor
from app.core.config import settings
from app.core.errors import api_error
from app.core.security import sign_payload, verify_payload
from app.db.models import Announcement, Notification
from app.db.session import get_db
from app.schemas import (
    InternalNotificationProcessRequest,
    NotificationArchiveRequest,
    NotificationArchiveResponse,
    NotificationDetailResponse,
    NotificationListResponse,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdateRequest,
    NotificationReadAllRequest,
    NotificationReadAllResponse,
    NotificationReadResponse,
    NotificationUnreadCountResponse,
)
from app.services.notification_access import render_notification
from app.services.notification_events import database_now, read_preferences, update_preferences
from app.services.notification_processor import (
    cleanup_expired_notifications,
    process_pending_notifications,
)

router = APIRouter(tags=['notifications'])

NOTIFICATION_CURSOR_PURPOSE = 'notification-list-cursor'
NOTIFICATION_CURSOR_TTL_SECONDS = 7 * 24 * 3600
DEFAULT_LOCALE = 'en'


def _coerce_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _coerce_payload_datetimes(payload: dict) -> dict:
    normalized = payload.copy()
    for key in ('occurred_at', 'delivered_at', 'read_at', 'archived_at', 'expires_at', 'as_of'):
        if isinstance(normalized.get(key), datetime):
            normalized[key] = _coerce_aware(normalized[key])
    return normalized


def _set_no_store(response: Response) -> None:
    response.headers['Cache-Control'] = 'private, no-store'


def _registered_user(actor: CurrentActor = Depends(get_registered_actor)):
    return actor.user


def _require_read_enabled(response: Response, user=Depends(_registered_user)):
    _set_no_store(response)
    if not getattr(settings, 'notifications_read_enabled', True):
        raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, 'NOTIFICATIONS_DISABLED', 'Notifications are disabled')
    return user


def _visible_query(db: Session, user_id: int, *, include_archived: bool, now: datetime | None = None):
    current = now or database_now(db)
    query = (
        db.query(Notification)
        .outerjoin(Announcement, Announcement.id == Notification.announcement_id)
        .filter(
            Notification.recipient_user_id == user_id,
            Notification.revoked_at.is_(None),
            or_(
                Notification.expires_at > current,
                and_(Notification.expires_at.is_(None), Notification.delivered_at > current - timedelta(days=90)),
            ),
            or_(
                Notification.announcement_id.is_(None),
                and_(
                    Announcement.status == 'published',
                    Announcement.cancelled_at.is_(None),
                    or_(Announcement.expires_at.is_(None), Announcement.expires_at > current),
                ),
            ),
        )
    )
    return query if include_archived else query.filter(Notification.archived_at.is_(None))


def _serialize_notification(db: Session, notification: Notification, *, locale: str = DEFAULT_LOCALE, detail: bool = False) -> dict:
    payload = render_notification(db, notification, locale=locale, detail=detail)
    return _coerce_payload_datetimes(payload)


def _encode_cursor(user_public_id: str, row: Notification, *, category: str, unread_only: bool, archived: bool) -> str:
    return sign_payload(
        {
            'user_id': user_public_id,
            'category': category,
            'unread_only': unread_only,
            'archived': archived,
            'delivered_at': _coerce_aware(row.delivered_at).isoformat() if row.delivered_at else '',
            'id': row.id,
        },
        ttl_seconds=NOTIFICATION_CURSOR_TTL_SECONDS,
        purpose=NOTIFICATION_CURSOR_PURPOSE,
    )


def _decode_cursor(cursor: str, user_public_id: str, *, category: str, unread_only: bool, archived: bool) -> tuple[datetime, int]:
    payload = verify_payload(cursor, expected_purpose=NOTIFICATION_CURSOR_PURPOSE)
    if (
        payload.get('user_id') != user_public_id
        or payload.get('category') != category
        or payload.get('unread_only') != unread_only
        or payload.get('archived') != archived
    ):
        raise api_error(status.HTTP_400_BAD_REQUEST, 'NOTIFICATION_CURSOR_INVALID', 'Invalid notification cursor')
    try:
        delivered_at = datetime.fromisoformat(str(payload['delivered_at']))
        row_id = int(payload['id'])
    except (KeyError, TypeError, ValueError) as exc:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'NOTIFICATION_CURSOR_INVALID', 'Invalid notification cursor') from exc
    if row_id <= 0:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'NOTIFICATION_CURSOR_INVALID', 'Invalid notification cursor')
    return _coerce_aware(delivered_at) or delivered_at, row_id


def _apply_list_filters(query, *, category: str, unread_only: bool, archived: bool, cursor_boundary: tuple[datetime, int] | None):
    if category != 'all':
        query = query.filter(Notification.category == category)
    if unread_only:
        query = query.filter(Notification.read_at.is_(None))
    query = query.filter(Notification.archived_at.isnot(None) if archived else Notification.archived_at.is_(None))
    if cursor_boundary is not None:
        delivered_at, row_id = cursor_boundary
        query = query.filter(
            (Notification.delivered_at < delivered_at)
            | and_(Notification.delivered_at == delivered_at, Notification.id < row_id)
        )
    return query.order_by(Notification.delivered_at.desc(), Notification.id.desc())


def _unread_counts(db: Session, user_id: int, *, now: datetime) -> NotificationUnreadCountResponse:
    rows = (
        _visible_query(db, user_id, now=now, include_archived=False)
        .filter(Notification.read_at.is_(None))
        .with_entities(Notification.category, func.count(Notification.id))
        .group_by(Notification.category)
        .all()
    )
    categories = {'system': 0, 'interaction': 0, 'announcement': 0}
    categories.update({category: int(count) for category, count in rows})
    return NotificationUnreadCountResponse(total=sum(categories.values()), by_category=categories, as_of=now)


def _preferences_response(payload: dict) -> NotificationPreferencesResponse:
    return NotificationPreferencesResponse(**_coerce_payload_datetimes(payload))


def _load_visible_notification(db: Session, user_id: int, notification_id: str, *, now: datetime) -> Notification | None:
    return (
        _visible_query(db, user_id, now=now, include_archived=True)
        .filter(Notification.public_id == notification_id)
        .first()
    )


def _raise_not_visible_detail(db: Session, user_id: int, notification_id: str, *, now: datetime) -> None:
    row = db.query(Notification).filter(
        Notification.public_id == notification_id,
        Notification.recipient_user_id == user_id,
    ).first()
    if row is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'NOTIFICATION_NOT_FOUND', 'Notification not found')
    expires_at = _coerce_aware(row.expires_at)
    if row.revoked_at is not None or (expires_at is not None and expires_at <= now):
        raise api_error(status.HTTP_410_GONE, 'NOTIFICATION_UNAVAILABLE', 'Notification is no longer available')
    raise api_error(status.HTTP_410_GONE, 'NOTIFICATION_UNAVAILABLE', 'Notification is no longer available')


@router.get('/notifications', response_model=NotificationListResponse)
def list_notifications(
    response: Response,
    category: Literal['all', 'system', 'announcement', 'interaction'] = Query(default='all'),
    unread_only: bool = Query(default=False),
    archived: bool = Query(default=False),
    locale: Literal['en', 'zh', 'ja'] = Query(default=DEFAULT_LOCALE),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    user=Depends(_require_read_enabled),
):
    _set_no_store(response)
    now = database_now(db)
    cursor_boundary = _decode_cursor(cursor, user.public_id, category=category, unread_only=unread_only, archived=archived) if cursor else None
    query = _apply_list_filters(
        _visible_query(db, user.id, now=now, include_archived=archived),
        category=category,
        unread_only=unread_only,
        archived=archived,
        cursor_boundary=cursor_boundary,
    )
    rows = query.limit(limit + 1).all()
    has_next = len(rows) > limit
    rows = rows[:limit]
    unread = _unread_counts(db, user.id, now=now)
    return NotificationListResponse(
        items=[_serialize_notification(db, row, locale=locale) for row in rows],
        next_cursor=_encode_cursor(user.public_id, rows[-1], category=category, unread_only=unread_only, archived=archived) if has_next and rows else None,
        unread_count=unread.total,
        as_of=_coerce_aware(now),
    )


@router.get('/notifications/unread-count', response_model=NotificationUnreadCountResponse)
def notification_unread_count(
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(_require_read_enabled),
):
    _set_no_store(response)
    return _unread_counts(db, user.id, now=database_now(db))


@router.get('/notifications/preferences', response_model=NotificationPreferencesResponse)
def get_notification_preferences(
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(_require_read_enabled),
):
    _set_no_store(response)
    return _preferences_response(read_preferences(db, user.id))


@router.patch('/notifications/preferences', response_model=NotificationPreferencesResponse)
def update_notification_preferences(
    payload: NotificationPreferencesUpdateRequest,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(_require_read_enabled),
):
    _set_no_store(response)
    updated = update_preferences(db, user.id, payload.model_dump(exclude_unset=True))
    db.commit()
    return _preferences_response(updated)


@router.post('/notifications/read-all', response_model=NotificationReadAllResponse)
def mark_all_notifications_read(
    response: Response,
    payload: NotificationReadAllRequest | None = Body(default=None),
    db: Session = Depends(get_db),
    user=Depends(_require_read_enabled),
):
    _set_no_store(response)
    now = database_now(db)
    query = _visible_query(db, user.id, now=now, include_archived=False).filter(
        Notification.archived_at.is_(None),
        Notification.read_at.is_(None),
    )
    if payload is not None and payload.category not in {None, 'all'}:
        query = query.filter(Notification.category == payload.category)
    visible_ids = query.with_entities(Notification.id).subquery()
    changed_count = db.query(Notification).filter(
        Notification.id.in_(select(visible_ids.c.id))
    ).update({'read_at': now}, synchronize_session=False)
    db.commit()
    unread = _unread_counts(db, user.id, now=now)
    return NotificationReadAllResponse(changed_count=changed_count, unread_count=unread.total, as_of=_coerce_aware(now))


@router.get('/notifications/{notification_id}', response_model=NotificationDetailResponse)
def get_notification(
    notification_id: str,
    response: Response,
    locale: Literal['en', 'zh', 'ja'] = Query(default=DEFAULT_LOCALE),
    db: Session = Depends(get_db),
    user=Depends(_require_read_enabled),
):
    _set_no_store(response)
    now = database_now(db)
    notification = _load_visible_notification(db, user.id, notification_id, now=now)
    if notification is None:
        _raise_not_visible_detail(db, user.id, notification_id, now=now)
    return NotificationDetailResponse(**_serialize_notification(db, notification, locale=locale, detail=True))


@router.post('/notifications/{notification_id}/read', response_model=NotificationReadResponse)
def mark_notification_read(
    notification_id: str,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(_require_read_enabled),
):
    _set_no_store(response)
    now = database_now(db)
    visible_ids = (
        _visible_query(db, user.id, now=now, include_archived=True)
        .filter(Notification.public_id == notification_id)
        .with_entities(Notification.id)
        .subquery()
    )
    db.query(Notification).filter(
        Notification.id.in_(select(visible_ids.c.id)),
        Notification.read_at.is_(None),
    ).update({'read_at': now}, synchronize_session=False)
    db.flush()
    notification = _load_visible_notification(db, user.id, notification_id, now=now)
    if notification is None:
        db.rollback()
        _raise_not_visible_detail(db, user.id, notification_id, now=now)
    db.commit()
    db.refresh(notification)
    unread = _unread_counts(db, user.id, now=now)
    return NotificationReadResponse(read_at=_coerce_aware(notification.read_at), unread_count=unread.total, as_of=_coerce_aware(now))


@router.patch('/notifications/{notification_id}', response_model=NotificationArchiveResponse)
def patch_notification(
    notification_id: str,
    payload: NotificationArchiveRequest,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(_require_read_enabled),
):
    _set_no_store(response)
    now = database_now(db)
    visible_ids = (
        _visible_query(db, user.id, now=now, include_archived=True)
        .filter(Notification.public_id == notification_id)
        .with_entities(Notification.id)
        .subquery()
    )
    update_query = db.query(Notification).filter(Notification.id.in_(select(visible_ids.c.id)))
    if payload.archived:
        update_query = update_query.filter(Notification.archived_at.is_(None))
    else:
        update_query = update_query.filter(Notification.archived_at.isnot(None))
    update_query.update({'archived_at': now if payload.archived else None}, synchronize_session=False)
    db.flush()
    notification = _load_visible_notification(db, user.id, notification_id, now=now)
    if notification is None:
        db.rollback()
        _raise_not_visible_detail(db, user.id, notification_id, now=now)
    db.commit()
    db.refresh(notification)
    unread = _unread_counts(db, user.id, now=now)
    return NotificationArchiveResponse(
        notification_id=notification.public_id,
        archived_at=_coerce_aware(notification.archived_at),
        read_at=_coerce_aware(notification.read_at),
        unread_count=unread.total,
        as_of=_coerce_aware(now),
    )


@router.post('/internal/notifications/process')
def process_notifications(
    request: Request,
    response: Response,
    payload: InternalNotificationProcessRequest | None = Body(default=None),
    db: Session = Depends(get_db),
):
    _set_no_store(response)
    if not settings.cloud_tasks_enabled or not settings.cloud_tasks_secret:
        raise api_error(status.HTTP_404_NOT_FOUND, 'TASK_DISPATCH_DISABLED', 'Cloud Tasks execution is not enabled')
    header_secret = request.headers.get('X-Task-Dispatch-Secret', '')
    if not secrets.compare_digest(header_secret, settings.cloud_tasks_secret):
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'TASK_DISPATCH_UNAUTHORIZED', 'Invalid task dispatch secret')
    processed = process_pending_notifications(db, limit=payload.limit if payload else 100)
    expired_deleted = cleanup_expired_notifications(db, limit=100)
    db.commit()
    return {**processed, 'expired_deleted': expired_deleted}
