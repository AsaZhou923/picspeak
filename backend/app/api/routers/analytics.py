from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_db, get_optional_actor
from app.schemas import ProductAnalyticsTrackRequest, ProductAnalyticsTrackResponse
from app.services.product_analytics import record_product_event

router = APIRouter(prefix='/analytics', tags=['analytics'])


def _normalized_optional_header(value: str | None, *, max_length: int = 128) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    return normalized[:max_length]


@router.post('/events', response_model=ProductAnalyticsTrackResponse, status_code=status.HTTP_202_ACCEPTED)
def track_product_analytics_event(
    payload: ProductAnalyticsTrackRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor | None = Depends(get_optional_actor),
    device_id: str | None = Header(default=None, alias='X-Device-Id'),
):
    record_product_event(
        db,
        event_name=payload.event_name,
        user_public_id=None if actor is None else actor.user.public_id,
        plan='guest' if actor is None else actor.plan.value,
        device_id=_normalized_optional_header(device_id),
        session_id=_normalized_optional_header(payload.session_id),
        source=payload.source,
        page_path=payload.page_path or request.url.path,
        locale=payload.locale,
        metadata=payload.metadata,
    )
    db.commit()
    return ProductAnalyticsTrackResponse(status='accepted', event_name=payload.event_name)
