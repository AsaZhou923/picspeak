from __future__ import annotations

import logging
import secrets
from urllib import error as urllib_error
from urllib import parse

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
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
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import UserPlan
from app.db.session import get_db
from app.schemas import (
    AuthClerkExchangeRequest,
    AuthGuestResponse,
    AuthGoogleLoginRequest,
    AuthTokenResponse,
    GuestReviewMigrateRequest,
    GuestReviewMigrateResponse,
)
from app.services.clerk_auth import verify_clerk_session_token
from app.services.clerk_webhooks import verify_clerk_webhook
from .auth_support import (
    GOOGLE_OAUTH_STATE_COOKIE,
    _bind_google_oauth_state,
    _clear_google_oauth_state,
    _extract_bearer_token,
    _google_exchange_code,
    _google_token_info,
    _http_exception_message,
    _login_from_google_claims,
    _migrate_guest_records,
    _process_clerk_webhook_event,
    _serialize_auth_response,
    _sync_clerk_user,
    _clerk_identity_from_webhook_user,
)

router = APIRouter(prefix='/auth', tags=['auth'])
webhooks_router = APIRouter(prefix='/webhooks', tags=['auth-webhooks'])
_logger = logging.getLogger(__name__)


@router.get('/google/start')
def auth_google_start():
    client_id = settings.google_oauth_client_id.strip()
    redirect_uri = settings.google_oauth_redirect_uri.strip()
    if not client_id or not redirect_uri:
        raise api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, 'GOOGLE_OAUTH_NOT_CONFIGURED', 'Google OAuth is not configured')

    state = secrets.token_urlsafe(32)
    params = parse.urlencode({
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': 'openid email profile',
        'access_type': 'offline',
        'prompt': 'select_account',
        'state': state,
    })
    response = RedirectResponse(f'https://accounts.google.com/o/oauth2/v2/auth?{params}', status_code=302)
    _bind_google_oauth_state(response, state)
    return response


@router.post('/guest', response_model=AuthGuestResponse)
def auth_guest(
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


@router.post('/google/login', response_model=AuthTokenResponse)
def auth_google_login(payload: AuthGoogleLoginRequest, db: Session = Depends(get_db)):
    try:
        claims = _google_token_info(payload.id_token)
    except urllib_error.URLError as exc:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'GOOGLE_TOKEN_VERIFY_FAILED', 'Google token verification failed') from exc

    auth_data = _login_from_google_claims(claims, db)
    db.commit()
    return auth_data


@router.post('/clerk/exchange', response_model=AuthTokenResponse)
def auth_clerk_exchange(
    request: Request,
    response: Response,
    payload: AuthClerkExchangeRequest | None = None,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    session_token = _extract_bearer_token(authorization)
    identity = verify_clerk_session_token(session_token)
    user = _sync_clerk_user(db, identity)
    request.state.current_user_public_id = user.public_id

    guest_token = (payload.guest_token if payload else None) or request.cookies.get(GUEST_TOKEN_COOKIE)
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
        guest_token=payload.guest_token or request.cookies.get(GUEST_TOKEN_COOKIE),
        recent_limit=payload.recent_limit,
        strict=True,
    )
    db.commit()
    return GuestReviewMigrateResponse(migrated_reviews=migrated_reviews, migrated_photos=migrated_photos)


@router.get('/google/callback')
def auth_google_callback(
    code: str = Query(..., min_length=1),
    state: str = Query(..., min_length=1),
    oauth_state_cookie: str | None = Cookie(default=None, alias=GOOGLE_OAUTH_STATE_COOKIE),
    db: Session = Depends(get_db),
):
    frontend_callback = f'{settings.frontend_origin.rstrip("/")}/auth/callback/google'
    if not oauth_state_cookie or not secrets.compare_digest(state, oauth_state_cookie):
        response = RedirectResponse(f'{frontend_callback}?error=invalid_oauth_state', status_code=302)
        _clear_google_oauth_state(response)
        return response

    try:
        token_resp = _google_exchange_code(code)
    except urllib_error.URLError as exc:
        error_msg = parse.quote(f'Google code exchange failed: {exc}')
        response = RedirectResponse(f'{frontend_callback}?error={error_msg}', status_code=302)
        _clear_google_oauth_state(response)
        return response

    id_token = token_resp.get('id_token')
    if not isinstance(id_token, str) or not id_token.strip():
        response = RedirectResponse(f'{frontend_callback}?error=missing_id_token', status_code=302)
        _clear_google_oauth_state(response)
        return response

    try:
        claims = _google_token_info(id_token)
    except urllib_error.URLError as exc:
        error_msg = parse.quote(f'Token verification failed: {exc}')
        response = RedirectResponse(f'{frontend_callback}?error={error_msg}', status_code=302)
        _clear_google_oauth_state(response)
        return response

    try:
        auth_data = _login_from_google_claims(claims, db)
    except HTTPException as exc:
        error_msg = parse.quote(_http_exception_message(exc))
        response = RedirectResponse(f'{frontend_callback}?error={error_msg}', status_code=302)
        _clear_google_oauth_state(response)
        return response
    db.commit()

    params = parse.urlencode({
        'access_token': auth_data.access_token,
        'token_type': auth_data.token_type,
        'user_id': auth_data.user_id,
        'plan': auth_data.plan,
        'auth_provider': auth_data.auth_provider,
    })
    response = RedirectResponse(f'{frontend_callback}#{params}', status_code=302)
    _clear_google_oauth_state(response)
    return response


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
        request.state.current_user_public_id = user_public_id
    return {'ok': True, 'event_type': event.type, 'outcome': outcome}
