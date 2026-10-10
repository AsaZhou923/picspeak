from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_db, get_optional_actor
from app.core.errors import api_error
from app.db.models import UserPlan
from app.schemas import ProductAnalyticsTrackRequest, ProductAnalyticsTrackResponse
from app.services.notification_analytics import (
    NOTIFICATION_ANALYTICS_EVENTS,
    NOTIFICATION_ANALYTICS_SOURCE,
    NotificationAnalyticsValidationError,
    normalize_notification_analytics_event,
)
from app.services.product_analytics import normalize_stage_a_event_name, record_product_event
from app.services.practice_events import PRACTICE_CLIENT_EVENTS, PRACTICE_SERVER_EVENTS, record_client_practice_event

router = APIRouter(prefix='/analytics', tags=['analytics'])
SERVER_OWNED_ANALYTICS_EVENTS = frozenset(
    {'generation_requested', 'generation_succeeded', 'generation_failed', 'paid_success'} | PRACTICE_SERVER_EVENTS
)


def _normalized_optional_header(value: str | None, *, max_length: int = 128) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    return normalized[:max_length]


def _normalize_client_metadata(payload: ProductAnalyticsTrackRequest, db: Session, actor: CurrentActor | None, event_name: str) -> tuple[str | None, dict[str, Any]]:
    if event_name not in NOTIFICATION_ANALYTICS_EVENTS:
        return payload.page_path, dict(payload.metadata or {})

    if actor is None or actor.user.plan == UserPlan.guest:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'AUTH_LOGIN_REQUIRED', 'Sign in to continue')
    if payload.source != NOTIFICATION_ANALYTICS_SOURCE:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'ANALYTICS_SOURCE_INVALID', 'Invalid analytics source')
    try:
        return normalize_notification_analytics_event(
            db,
            user_id=actor.user.id,
            event_name=event_name,
            page_path=payload.page_path,
            metadata=payload.metadata,
        )
    except NotificationAnalyticsValidationError as exc:
        status_code = status.HTTP_404_NOT_FOUND if exc.code == 'NOTIFICATION_NOT_FOUND' else status.HTTP_400_BAD_REQUEST
        raise api_error(status_code, exc.code, exc.message) from exc


@router.post('/events', response_model=ProductAnalyticsTrackResponse, status_code=status.HTTP_202_ACCEPTED)
def track_product_analytics_event(
    payload: ProductAnalyticsTrackRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor | None = Depends(get_optional_actor),
    device_id: str | None = Header(default=None, alias='X-Device-Id'),
):
    try:
        event_name = normalize_stage_a_event_name(payload.event_name)
    except ValueError as exc:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'ANALYTICS_EVENT_UNSUPPORTED',
            'Unsupported analytics event',
        ) from exc
    if event_name in SERVER_OWNED_ANALYTICS_EVENTS:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            'ANALYTICS_EVENT_SERVER_OWNED',
            'This analytics event is recorded by the server',
        )
    if event_name in PRACTICE_CLIENT_EVENTS:
        record_client_practice_event(db, actor=actor, event_name=event_name, metadata=payload.metadata or {}, locale=payload.locale)
        db.commit()
        return ProductAnalyticsTrackResponse(status='accepted', event_name=event_name)
    page_path, metadata = _normalize_client_metadata(payload, db, actor, event_name)
    record_product_event(
        db,
        event_name=event_name,
        user_public_id=None if actor is None else actor.user.public_id,
        plan='guest' if actor is None else actor.plan.value,
        device_id=_normalized_optional_header(device_id),
        session_id=_normalized_optional_header(payload.session_id),
        source=payload.source,
        page_path=page_path or request.url.path,
        locale=payload.locale,
        metadata=metadata,
    )
    db.commit()
    return ProductAnalyticsTrackResponse(status='accepted', event_name=event_name)
