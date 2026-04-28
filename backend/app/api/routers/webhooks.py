from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.request_state import set_current_user_public_id
from app.db.models import User
from app.services.lemonsqueezy_webhooks import (
    process_lemonsqueezy_webhook_event,
    record_lemonsqueezy_webhook_event,
    verify_lemonsqueezy_webhook,
)

router = APIRouter(prefix='/webhooks', tags=['webhooks'])
legacy_router = APIRouter(prefix='/webhook', tags=['webhooks'])


async def _handle_lemonsqueezy_webhook(request: Request, db: Session) -> dict[str, Any]:
    event = await verify_lemonsqueezy_webhook(request)
    event_record, duplicate = record_lemonsqueezy_webhook_event(db, event)
    if duplicate:
        db.commit()
        return {'ok': True, 'event_name': event.event_name, 'outcome': 'duplicate'}

    try:
        outcome, user_public_id = process_lemonsqueezy_webhook_event(db, event)
        event_record.outcome = outcome
        event_record.processed_at = datetime.now(timezone.utc)
        if user_public_id:
            user = db.query(User).filter(User.public_id == user_public_id).first()
            if user is not None:
                event_record.user_id = user.id
                set_current_user_public_id(request, user_public_id)
        db.add(event_record)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {'ok': True, 'event_name': event.event_name, 'outcome': event_record.outcome}


@legacy_router.post('/lemonsqueezy')
async def lemonsqueezy_webhook(request: Request, db: Session = Depends(get_db)):
    return await _handle_lemonsqueezy_webhook(request, db)


@router.post('/lemonsqueezy')
async def lemonsqueezy_webhook_v1(request: Request, db: Session = Depends(get_db)):
    return await _handle_lemonsqueezy_webhook(request, db)
