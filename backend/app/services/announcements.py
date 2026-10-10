"""Operator-only announcement publication helpers.

These functions do not commit. Public API routes should not call them directly.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
from pathlib import Path
from uuid import uuid4

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Announcement, User, UserPlan, UserStatus
from app.services.notification_events import database_now, insert_once, record_announcement_published, utc

LOCALES = ('en', 'zh', 'ja')
TITLE_LIMIT = 80
SUMMARY_LIMIT = 160
BODY_LIMIT = 3000
SPECIFIC_USER_LIMIT = 100
WEEKLY_PUBLISH_LIMIT = 2
PUBLIC_ID_RE = re.compile(r'[A-Za-z0-9_-]{1,100}')

INTERNAL_TARGETS = {
    'workspace': '/workspace',
    'generate': '/generate',
    'gallery': '/gallery',
    'retake': '/retake',
    'account': '/account',
    'notifications': '/account/notifications',
}
CONTENT_TARGETS = {'updates', 'blog'}
TARGET_TYPES = set(INTERNAL_TARGETS) | CONTENT_TARGETS


@dataclass(frozen=True)
class AnnouncementDraft:
    content: dict
    cta_json: dict
    audience_type: str
    audience_public_ids: tuple[str, ...] | None
    update_id: str | None
    expires_at: datetime | None
    correction_of: str | None
    audit_reason: str
    deployment_verified: bool


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _content_ids(kind: str) -> set[str]:
    root = _repo_root()
    if kind == 'updates':
        ids: set[str] = set()
        for path in (root / 'frontend' / 'src' / 'content' / 'updates').glob('*.json'):
            data = json.loads(path.read_text(encoding='utf-8'))
            ids.update(item.get('id') for item in data if isinstance(item, dict) and isinstance(item.get('id'), str))
        return ids
    if kind == 'blog':
        ids = set()
        for path in (root / 'frontend' / 'src' / 'content' / 'blog').glob('*.json'):
            data = json.loads(path.read_text(encoding='utf-8'))
            posts = data.get('posts', []) if isinstance(data, dict) else []
            ids.update(item.get('slug') for item in posts if isinstance(item, dict) and isinstance(item.get('slug'), str))
        return ids
    return set()


def validate_announcement_content(content: dict) -> dict:
    if not isinstance(content, dict) or set(content) != set(LOCALES):
        raise ValueError('Announcement requires en, zh and ja content')
    normalized: dict[str, dict[str, str]] = {}
    for locale in LOCALES:
        localized = content[locale]
        if not isinstance(localized, dict) or set(localized) != {'title', 'summary', 'body'}:
            raise ValueError('Invalid announcement content')
        normalized[locale] = {}
        for key, limit in [('title', TITLE_LIMIT), ('summary', SUMMARY_LIMIT), ('body', BODY_LIMIT)]:
            value = localized[key]
            if not isinstance(value, str):
                raise ValueError('Invalid announcement text')
            value = value.strip()
            if not value or len(value) > limit or '//' in value:
                raise ValueError('Invalid announcement text')
            normalized[locale][key] = value
    return normalized


def validate_announcement_target(target_type: str | None, target_public_id: str | None) -> dict:
    if target_type is None and target_public_id is None:
        return {}
    if target_type not in TARGET_TYPES:
        raise ValueError('Invalid announcement target')
    if target_type in INTERNAL_TARGETS:
        if target_public_id is not None:
            raise ValueError('Unexpected announcement target ID')
        href = INTERNAL_TARGETS[target_type]
        if '//' in href:
            raise ValueError('Invalid announcement target')
        return {'type': target_type, 'public_id': None, 'href': href}
    if not target_public_id or not PUBLIC_ID_RE.fullmatch(target_public_id) or '//' in target_public_id:
        raise ValueError('Invalid announcement content ID')
    if target_public_id not in _content_ids(target_type):
        raise ValueError('Unknown announcement content ID')
    href = f"/{'updates' if target_type == 'updates' else 'blog'}/{target_public_id}"
    return {'type': target_type, 'public_id': target_public_id, 'href': href}


def _validate_public_ids(public_ids: list[str] | tuple[str, ...] | None) -> tuple[str, ...] | None:
    if public_ids is None:
        return None
    if not isinstance(public_ids, (list, tuple)):
        raise ValueError('Specific audience must use public user IDs')
    ids = tuple(sorted(set(public_ids)))
    if not ids or len(ids) > SPECIFIC_USER_LIMIT:
        raise ValueError('Specified audience must contain 1-100 public user IDs')
    if any(not isinstance(value, str) or not PUBLIC_ID_RE.fullmatch(value) for value in ids):
        raise ValueError('Invalid user public ID')
    return ids


def _validate_operation_identity(*, idempotency_key: str | None, audit_reason: str | None) -> None:
    if not idempotency_key or not isinstance(idempotency_key, str) or len(idempotency_key) > 150:
        raise ValueError('Invalid announcement operation identity')
    if not audit_reason or not isinstance(audit_reason, str) or len(audit_reason.strip()) > 500:
        raise ValueError('Announcement audit reason is required')


def build_announcement_draft(
    *,
    content: dict,
    target_type: str | None = None,
    target_public_id: str | None = None,
    recipient_public_ids: list[str] | tuple[str, ...] | None = None,
    expires_at: datetime | None = None,
    update_id: str | None = None,
    correction_of: str | None = None,
    audit_reason: str | None = None,
    deployment_verified: bool = False,
) -> AnnouncementDraft:
    if update_id is not None and (not PUBLIC_ID_RE.fullmatch(update_id) or '//' in update_id):
        raise ValueError('Invalid update bundle ID')
    if correction_of is not None and (not PUBLIC_ID_RE.fullmatch(correction_of) or '//' in correction_of):
        raise ValueError('Invalid correction source')
    if type(deployment_verified) is not bool:
        raise ValueError('Invalid deployment verification flag')
    if not audit_reason or not audit_reason.strip():
        raise ValueError('Announcement audit reason is required')
    audience_public_ids = _validate_public_ids(recipient_public_ids)
    return AnnouncementDraft(
        content=validate_announcement_content(content),
        cta_json=validate_announcement_target(target_type, target_public_id),
        audience_type='specific_users' if audience_public_ids is not None else 'all_existing_users',
        audience_public_ids=audience_public_ids,
        update_id=update_id,
        expires_at=utc(expires_at) if expires_at else None,
        correction_of=correction_of,
        audit_reason=audit_reason.strip(),
        deployment_verified=deployment_verified,
    )


def announcement_fingerprint(draft: AnnouncementDraft) -> str:
    payload = {
        'content': draft.content,
        'cta': draft.cta_json,
        'audience_type': draft.audience_type,
        'audience_public_ids': draft.audience_public_ids,
        'update_id': draft.update_id,
        'expires_at': draft.expires_at.isoformat() if draft.expires_at else None,
        'correction_of': draft.correction_of,
        'audit_reason': draft.audit_reason,
        'deployment_verified': draft.deployment_verified,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def preview_announcement(**kwargs) -> dict:
    idempotency_key = kwargs.pop('idempotency_key', None) or kwargs.pop('publish_key', None)
    _validate_operation_identity(idempotency_key=idempotency_key, audit_reason=kwargs.get('audit_reason'))
    draft = build_announcement_draft(**kwargs)
    return {
        'dry_run': True,
        'idempotency_key': idempotency_key,
        'content_fingerprint': announcement_fingerprint(draft),
        'audience': {
            'type': draft.audience_type,
            'public_user_count': len(draft.audience_public_ids or ()),
            'bounded_at_publish': True,
        },
        'cta': draft.cta_json,
        'update_id': draft.update_id,
        'correction_of': draft.correction_of,
        'deployment_verified': draft.deployment_verified,
    }


def _database_operator(db: Session) -> str:
    if db.get_bind().dialect.name == 'postgresql':
        value = db.scalar(text('SELECT current_user'))
        return str(value)
    return 'sqlite'


def _assert_publish_enabled() -> None:
    if not getattr(settings, 'announcement_publish_enabled', False):
        raise ValueError('Announcement publishing is disabled')
    if not getattr(settings, 'notifications_event_capture_enabled', False):
        raise ValueError('Notification event capture is disabled')


def _lock_weekly_allowance(db: Session, now: datetime) -> tuple[datetime, datetime]:
    start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=7)
    if db.get_bind().dialect.name == 'postgresql':
        db.execute(text('SELECT pg_advisory_xact_lock(hashtext(:key))'), {'key': f'picspeak:announcements:{start.date()}'})
    return start, end


def _published_count_this_week(db: Session, start: datetime, end: datetime) -> int:
    return int(db.query(func.count(Announcement.id)).filter(
        Announcement.published_at >= start,
        Announcement.published_at < end,
    ).scalar() or 0)


def _audience_snapshot(db: Session, draft: AnnouncementDraft, now: datetime) -> dict:
    if draft.audience_public_ids is None:
        return {
            'max_user_id': int(db.query(func.max(User.id)).filter(User.created_at <= now).scalar() or 0),
            'published_bound_at': now.isoformat(),
        }
    rows = db.query(User.id, User.public_id).filter(
        User.public_id.in_(draft.audience_public_ids),
        User.status == UserStatus.active,
        User.plan.in_((UserPlan.free, UserPlan.pro)),
        User.created_at <= now,
    ).order_by(User.public_id).all()
    found = {public_id: user_id for user_id, public_id in rows}
    missing = [public_id for public_id in draft.audience_public_ids if public_id not in found]
    if missing:
        raise ValueError('Specified audience contains unknown or ineligible users')
    return {
        'user_ids': [found[public_id] for public_id in draft.audience_public_ids],
        'user_public_ids': list(draft.audience_public_ids),
        'published_bound_at': now.isoformat(),
    }


def publish_announcement(
    db: Session,
    *,
    idempotency_key: str | None = None,
    publish_key: str | None = None,
    content: dict,
    recipient_public_ids: list[str] | tuple[str, ...] | None = None,
    recipient_ids: list[int] | None = None,
    target_type: str | None = None,
    target_public_id: str | None = None,
    expires_at: datetime | None = None,
    update_id: str | None = None,
    correction_of: str | None = None,
    audit_reason: str | None = None,
    deployment_verified: bool = False,
) -> Announcement:
    """Publish an announcement idempotently using a frozen content fingerprint."""
    _assert_publish_enabled()
    key = idempotency_key or publish_key
    if recipient_ids is not None:
        raise ValueError('Specific announcements require public user IDs')
    _validate_operation_identity(idempotency_key=key, audit_reason=audit_reason)
    draft = build_announcement_draft(
        content=content,
        target_type=target_type,
        target_public_id=target_public_id,
        recipient_public_ids=recipient_public_ids,
        expires_at=expires_at,
        update_id=update_id,
        correction_of=correction_of,
        audit_reason=audit_reason,
        deployment_verified=deployment_verified,
    )
    fingerprint = announcement_fingerprint(draft)
    existing = db.query(Announcement).filter_by(idempotency_key=key).with_for_update().populate_existing().first()
    if existing is not None:
        if existing.content_fingerprint != fingerprint or existing.status != 'published':
            raise ValueError('Publish key belongs to a different or cancelled announcement')
        return existing
    now = database_now(db)
    if draft.expires_at is not None and draft.expires_at <= now:
        raise ValueError('Announcement has expired')
    week_start, week_end = _lock_weekly_allowance(db, now)
    if _published_count_this_week(db, week_start, week_end) >= WEEKLY_PUBLISH_LIMIT:
        raise ValueError('Weekly announcement allowance exhausted')
    if draft.correction_of:
        source = db.query(Announcement).filter_by(public_id=draft.correction_of).with_for_update().populate_existing().first()
        if source is None or source.status != 'cancelled':
            raise ValueError('Correction source must be a cancelled announcement')
    audience = _audience_snapshot(db, draft, now)
    operator = _database_operator(db)
    inserted = insert_once(db, Announcement, {
        'public_id': f'ann_{uuid4().hex}',
        'title_json': {locale: item['title'] for locale, item in draft.content.items()},
        'summary_json': {locale: item['summary'] for locale, item in draft.content.items()},
        'body_json': {locale: item['body'] for locale, item in draft.content.items()},
        'audience_type': draft.audience_type,
        'audience_json': audience,
        'cta_json': draft.cta_json,
        'created_by': operator,
        'idempotency_key': key,
        'content_fingerprint': fingerprint,
        'status': 'published',
        'published_at': now,
        'expires_at': draft.expires_at,
        'update_id': draft.update_id,
        'operation_log_json': [{
            'action': 'published',
            'at': now.isoformat(),
            'by': operator,
            'audit_reason': draft.audit_reason,
            'deployment_verified': draft.deployment_verified,
            'correction_of': draft.correction_of,
        }],
    }, ['idempotency_key'])
    announcement = db.query(Announcement).filter_by(idempotency_key=key).with_for_update().populate_existing().one()
    if announcement.content_fingerprint != fingerprint or announcement.status != 'published':
        raise ValueError('Publish key belongs to a different or cancelled announcement')
    if inserted:
        record_announcement_published(db, announcement)
    return announcement


def cancel_announcement(db: Session, public_id: str, *, audit_reason: str, operator: str | None = None) -> Announcement:
    if not public_id or not PUBLIC_ID_RE.fullmatch(public_id):
        raise ValueError('Invalid announcement ID')
    if not audit_reason or not audit_reason.strip():
        raise ValueError('Announcement audit reason is required')
    announcement = db.query(Announcement).filter_by(public_id=public_id).with_for_update().populate_existing().one()
    if announcement.status != 'cancelled':
        now = database_now(db)
        actor = _database_operator(db)
        announcement.status = 'cancelled'
        announcement.cancelled_at = now
        announcement.operation_log_json = [
            *(announcement.operation_log_json or []),
            {'action': 'cancelled', 'at': now.isoformat(), 'by': actor, 'audit_reason': audit_reason.strip()},
        ]
        db.flush()
    return announcement


def announcement_status(db: Session, public_id: str) -> dict:
    if not public_id or not PUBLIC_ID_RE.fullmatch(public_id):
        raise ValueError('Invalid announcement ID')
    announcement = db.query(Announcement).filter_by(public_id=public_id).one()
    return {
        'announcement_id': announcement.public_id,
        'status': announcement.status,
        'published_at': announcement.published_at.isoformat() if announcement.published_at else None,
        'cancelled_at': announcement.cancelled_at.isoformat() if announcement.cancelled_at else None,
        'expires_at': announcement.expires_at.isoformat() if announcement.expires_at else None,
        'audience_type': announcement.audience_type,
        'content_fingerprint': announcement.content_fingerprint,
        'update_id': announcement.update_id,
        'operation_log': announcement.operation_log_json or [],
    }


def draft_from_update_bundle(update_id: str, *, audit_reason: str) -> dict:
    if not PUBLIC_ID_RE.fullmatch(update_id):
        raise ValueError('Invalid update bundle ID')
    def clipped(value: str, limit: int) -> str:
        value = value.strip()
        return value if len(value) <= limit else value[:limit].rstrip()

    content: dict[str, dict[str, str]] = {}
    for locale in LOCALES:
        path = _repo_root() / 'frontend' / 'src' / 'content' / 'updates' / f'{locale}.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        match = next((item for item in data if isinstance(item, dict) and item.get('id') == update_id), None)
        if match is None:
            raise ValueError('Update bundle is missing a locale')
        summary = str(match.get('summary', ''))
        content[locale] = {
            'title': clipped(str(match.get('title', '')), TITLE_LIMIT),
            'summary': clipped(summary, SUMMARY_LIMIT),
            'body': clipped(summary, BODY_LIMIT),
        }
    validate_announcement_content(content)
    return {
        'content': content,
        'target_type': 'updates',
        'target_public_id': update_id,
        'update_id': update_id,
        'audit_reason': audit_reason,
        'deployment_verified': False,
    }
