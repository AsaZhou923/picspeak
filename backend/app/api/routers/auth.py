from __future__ import annotations

import logging

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentActor,
    bind_guest_token,
    create_guest_user,
    get_current_actor,
    get_user_from_token,
    GUEST_TOKEN_COOKIE,
    issue_guest_token,
)
from app.api.request_state import set_current_user_public_id
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import UserPlan
from app.db.session import get_db
from app.schemas import (
    AuthClerkExchangeRequest,
    AuthGuestResponse,
    AuthTokenResponse,
    GuestReviewMigrateRequest,
    GuestReviewMigrateResponse,
)
from app.services.clerk_auth import verify_clerk_session_token
from app.services.clerk_webhooks import verify_clerk_webhook
from app.services.guard import (
    enforce_guest_creation_rate_limit,
    enforce_minute_rate_limit,
    guest_network_scope_key,
    guest_rate_limit_scope_key,
)
from .auth_support import (
    _extract_bearer_token,
    _migrate_guest_records,
    _process_clerk_webhook_event,
    _serialize_auth_response,
    _sync_clerk_user,
    _clerk_identity_from_webhook_user,  # noqa: F401
)

router = APIRouter(prefix='/auth', tags=['auth'])
webhooks_router = APIRouter(prefix='/webhooks', tags=['auth-webhooks'])
_logger = logging.getLogger(__name__)


@router.post('/guest', response_model=AuthGuestResponse)
def auth_guest(
    request: Request,
    response: Response,
    guest_cookie_token: str | None = Cookie(default=None, alias=GUEST_TOKEN_COOKIE),
    db: Session = Depends(get_db),
):
    user = None
    if guest_cookie_token:
        try:
            existing_user = get_user_from_token(guest_cookie_token, db)
            if existing_user.plan == UserPlan.guest:
                user = existing_user
        except HTTPException:
            user = None

    if user is None:
        enforce_guest_creation_rate_limit(db, guest_rate_limit_scope_key(request), guest_network_scope_key(request))
        user = create_guest_user(db)

    db.commit()
    token = issue_guest_token(user)
    bind_guest_token(response, token)
    return AuthGuestResponse(
        access_token=token,
        token_type='bearer',
        user_id=user.public_id,
        plan=user.plan.value,
        auth_provider='guest',
    )


@router.post('/clerk/exchange', response_model=AuthTokenResponse)
def auth_clerk_exchange(
    request: Request,
    response: Response,
    payload: AuthClerkExchangeRequest | None = None,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    session_token = _extract_bearer_token(authorization)
    network_scope_key = guest_network_scope_key(request)
    if network_scope_key:
        enforce_minute_rate_limit(
            db,
            scope='auth_exchange_minute',
            scope_key=network_scope_key,
            endpoint='clerk_exchange',
            limit=settings.auth_exchange_rate_limit_per_minute,
        )
        # Commit now: a rejected token rolls back the request, and failed
        # attempts must still count toward the limit.
        db.commit()
    identity = verify_clerk_session_token(session_token)
    user = _sync_clerk_user(db, identity)
    set_current_user_public_id(request, user.public_id)

    guest_token = payload.guest_token if payload and payload.guest_token is not None else request.cookies.get(GUEST_TOKEN_COOKIE)
    recent_limit = payload.recent_limit if payload else 20
    migrated_reviews, migrated_photos = _migrate_guest_records(
        db=db,
        target_user=user,
        guest_token=guest_token,
        recent_limit=recent_limit,
        strict=False,
    )

    db.commit()
    db.refresh(user)
    response.delete_cookie(key=GUEST_TOKEN_COOKIE, path='/')
    return _serialize_auth_response(
        user,
        provider='clerk',
        clerk_user_id=identity.user_id,
        migrated_reviews=migrated_reviews,
        migrated_photos=migrated_photos,
    )


@router.post('/guest/migrate', response_model=GuestReviewMigrateResponse)
def migrate_guest_reviews(
    payload: GuestReviewMigrateRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'GUEST_MIGRATE_TARGET_INVALID', 'Please sign in before migrating guest records')

    migrated_reviews, migrated_photos = _migrate_guest_records(
        db=db,
        target_user=actor.user,
        guest_token=payload.guest_token if payload.guest_token is not None else request.cookies.get(GUEST_TOKEN_COOKIE),
        recent_limit=payload.recent_limit,
        strict=True,
    )
    db.commit()
    return GuestReviewMigrateResponse(migrated_reviews=migrated_reviews, migrated_photos=migrated_photos)


@webhooks_router.post('/clerk')
async def clerk_webhook(request: Request, db: Session = Depends(get_db)):
    event = await verify_clerk_webhook(request)
    try:
        outcome, user_public_id = _process_clerk_webhook_event(db, event)
        db.commit()
    except HTTPException as exc:
        db.rollback()
        if exc.status_code == status.HTTP_409_CONFLICT:
            # Truly idempotent: this event was already processed (e.g. duplicate user creation).
            # Return 200 so Clerk does not retry an event we've already handled correctly.
            _logger.warning('Clerk webhook %s skipped (duplicate): %s', event.type, exc.detail)
            return {'ok': True, 'event_type': event.type, 'outcome': 'ignored_duplicate'}
        if exc.status_code in {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}:
            # Unexpected auth/permission failure processing the event — log and return 400 so
            # Clerk marks the delivery as failed (and can retry or alert), not silently succeeds.
            _logger.error(
                'Clerk webhook %s processing error (status=%s): %s',
                event.type, exc.status_code, exc.detail,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={'code': 'WEBHOOK_PROCESSING_ERROR', 'message': 'Event could not be processed'},
            ) from exc
        raise
    except Exception:
        db.rollback()
        raise

    if user_public_id:
        set_current_user_public_id(request, user_public_id)
    return {'ok': True, 'event_type': event.type, 'outcome': outcome}
