from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from typing import Any

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.db.models import Announcement, Notification
from app.services.notification_access import TEMPLATE_EVENT_TYPES
from app.services.notification_events import database_now

NOTIFICATION_ANALYTICS_EVENTS = frozenset(
    {
        'notification_center_opened',
        'notification_opened',
        'notification_target_clicked',
        'notification_preferences_changed',
    }
)

NOTIFICATION_ANALYTICS_SOURCE = 'notifications'

_CENTER_PAGE_PATH = '/account/notifications'
_SETTINGS_PAGE_PATH = '/account/notifications/settings'
_DETAIL_PAGE_RE = re.compile(r'^/account/notifications/([^/]+)$')
_CATEGORIES = frozenset({'all', 'system', 'announcement', 'interaction'})
_PREFERENCE_KEYS = frozenset({'likes_enabled', 'announcements_enabled'})


class NotificationAnalyticsValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _coerce_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _require_bool(metadata: dict[str, Any], key: str) -> bool:
    value = metadata.get(key)
    if type(value) is not bool:
        raise NotificationAnalyticsValidationError('ANALYTICS_METADATA_INVALID', 'Invalid analytics metadata')
    return value


def _require_text(metadata: dict[str, Any], key: str, allowed: frozenset[str]) -> str:
    value = metadata.get(key)
    if not isinstance(value, str):
        raise NotificationAnalyticsValidationError('ANALYTICS_METADATA_INVALID', 'Invalid analytics metadata')
    normalized = value.strip()
    if normalized not in allowed:
        raise NotificationAnalyticsValidationError('ANALYTICS_METADATA_INVALID', 'Invalid analytics metadata')
    return normalized


def _visible_notification(db: Session, user_id: int, notification_id: str) -> Notification | None:
    now = database_now(db)
    current = _coerce_aware(now) or now
    return (
        db.query(Notification)
        .outerjoin(Announcement, Announcement.id == Notification.announcement_id)
        .filter(
            Notification.public_id == notification_id,
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
        .first()
    )


def _notification_type(notification: Notification) -> str:
    return TEMPLATE_EVENT_TYPES.get(notification.template_key, notification.notification_type)


def normalize_notification_analytics_event(
    db: Session,
    *,
    user_id: int,
    event_name: str,
    page_path: str | None,
    metadata: dict[str, Any] | None,
) -> tuple[str, dict[str, Any]]:
    payload = dict(metadata or {})

    if event_name == 'notification_center_opened':
        if page_path != _CENTER_PAGE_PATH:
            raise NotificationAnalyticsValidationError('ANALYTICS_PAGE_INVALID', 'Invalid analytics page')
        return page_path, {
            'category': _require_text(payload, 'category', _CATEGORIES),
            'archived': _require_bool(payload, 'archived'),
            'unread_only': _require_bool(payload, 'unread_only'),
        }

    if event_name == 'notification_preferences_changed':
        if page_path != _SETTINGS_PAGE_PATH:
            raise NotificationAnalyticsValidationError('ANALYTICS_PAGE_INVALID', 'Invalid analytics page')
        return page_path, {
            'key': _require_text(payload, 'key', _PREFERENCE_KEYS),
            'enabled': _require_bool(payload, 'enabled'),
        }

    if event_name in {'notification_opened', 'notification_target_clicked'}:
        match = _DETAIL_PAGE_RE.fullmatch(str(page_path or ''))
        if match is None:
            raise NotificationAnalyticsValidationError('ANALYTICS_PAGE_INVALID', 'Invalid analytics page')
        notification = _visible_notification(db, user_id, match.group(1))
        if notification is None:
            raise NotificationAnalyticsValidationError('NOTIFICATION_NOT_FOUND', 'Notification not found')
        return str(page_path), {
            'category': notification.category,
            'type': _notification_type(notification),
        }

    raise NotificationAnalyticsValidationError('ANALYTICS_EVENT_UNSUPPORTED', 'Unsupported analytics event')
