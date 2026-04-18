from __future__ import annotations

import json
import re
import secrets
from datetime import datetime, timezone
from typing import Any
from urllib import error as urllib_error
from urllib import parse, request as urllib_request

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentActor,
    bind_guest_token,
    create_guest_user,
    get_current_actor,
    get_user_from_token,
    GUEST_TOKEN_COOKIE,
    issue_guest_token,
    new_public_id,
    quota_for_plan,
)
from app.core.config import settings
from app.core.errors import api_error
from app.core.security import create_access_token
from app.db.models import Photo, Review, ReviewTask, User, UserPlan, UserStatus
from app.db.session import get_db
from app.schemas import (
    AuthClerkExchangeRequest,
    AuthGuestResponse,
    AuthGoogleLoginRequest,
    AuthTokenResponse,
    GuestReviewMigrateRequest,
    GuestReviewMigrateResponse,
)
from app.services.clerk_auth import ClerkIdentity, verify_clerk_session_token
from app.services.clerk_webhooks import ClerkWebhookEvent, verify_clerk_webhook

router = APIRouter(prefix='/auth', tags=['auth'])
webhooks_router = APIRouter(prefix='/webhooks', tags=['auth-webhooks'])

GOOGLE_OAUTH_STATE_COOKIE = 'ps_google_oauth_state'
GOOGLE_OAUTH_STATE_TTL_SECONDS = 600
USERNAME_SANITIZE_RE = re.compile(r'[^a-z0-9_]+')


def _http_exception_message(exc: HTTPException) -> str:
    detail = exc.detail
    if isinstance(detail, dict):
        return str(detail.get('message') or detail.get('detail') or 'Request failed')
    return str(detail)


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'AUTH_MISSING', 'Missing Authorization header')
    if not authorization.lower().startswith('bearer '):
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'AUTH_SCHEME_INVALID', 'Invalid Authorization scheme')
    token = authorization[7:].strip()
    if not token:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'AUTH_TOKEN_MISSING', 'Missing bearer token')
    return token


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _username_seed(identity: ClerkIdentity) -> str:
    candidates = [
        identity.username,
        ' '.join(part for part in [identity.first_name, identity.last_name] if part),
        identity.email.split('@', 1)[0] if '@' in identity.email else identity.email,
        f'user_{identity.user_id[-8:]}',
    ]
    for raw in candidates:
        if not raw:
            continue
        normalized = USERNAME_SANITIZE_RE.sub('_', raw.strip().lower()).strip('_')
        normalized = re.sub(r'_+', '_', normalized)
        if normalized:
            return normalized[:40]
    return f'user_{identity.user_id[-8:]}'


def _build_unique_username(db: Session, identity: ClerkIdentity, current_user_id: int | None = None) -> str:
    base = _username_seed(identity)
    candidate = base
    suffix = 2
    while True:
        existing = db.query(User).filter(User.username == candidate).first()
        if existing is None or existing.id == current_user_id:
            return candidate
        suffix_text = str(suffix)
        trimmed_base = base[: max(1, 40 - len(suffix_text) - 1)]
        candidate = f'{trimmed_base}_{suffix_text}'
        suffix += 1


def _serialize_auth_response(
    user: User,
    *,
    provider: str,
    clerk_user_id: str | None = None,
    migrated_reviews: int = 0,
    migrated_photos: int = 0,
) -> AuthTokenResponse:
    token_payload: dict[str, Any] = {
        'sub': user.public_id,
        'email': user.email,
        'plan': user.plan.value,
        'provider': provider,
    }
    if clerk_user_id:
        token_payload['clerk_user_id'] = clerk_user_id

    token = create_access_token(token_payload)
    return AuthTokenResponse(
        access_token=token,
        token_type='bearer',
        user_id=user.public_id,
        plan=user.plan.value,
        auth_provider=provider,
        clerk_user_id=clerk_user_id,
        migrated_reviews=migrated_reviews,
        migrated_photos=migrated_photos,
    )


def _find_user_by_email(db: Session, email: str) -> User | None:
    normalized_email = _normalize_email(email)
    return db.query(User).filter(func.lower(User.email) == normalized_email).first()


def _extract_primary_clerk_email(user_payload: dict[str, Any]) -> tuple[str, bool] | None:
    primary_email_id = user_payload.get('primary_email_address_id')
    email_addresses = user_payload.get('email_addresses')
    if not isinstance(email_addresses, list) or not email_addresses:
        return None

    selected: dict[str, Any] | None = None
    for item in email_addresses:
        if not isinstance(item, dict):
            continue
        if primary_email_id and item.get('id') == primary_email_id:
            selected = item
            break
        if selected is None:
            selected = item

    if selected is None:
        return None

    email = selected.get('email_address')
    if not isinstance(email, str) or not email.strip():
        return None

    verification = selected.get('verification')
    email_verified = False
    if isinstance(verification, dict):
        email_verified = verification.get('status') == 'verified'
    return email.strip(), email_verified


def _clerk_identity_from_webhook_user(user_payload: dict[str, Any]) -> ClerkIdentity | None:
    user_id = user_payload.get('id')
    if not isinstance(user_id, str) or not user_id.strip():
        return None

    primary_email = _extract_primary_clerk_email(user_payload)
    if primary_email is None:
        return None
    email, email_verified = primary_email

    first_name = user_payload.get('first_name')
    last_name = user_payload.get('last_name')
    username = user_payload.get('username')
    image_url = user_payload.get('image_url')
    return ClerkIdentity(
        session_id='webhook',
        user_id=user_id.strip(),
        email=email,
        email_verified=email_verified,
        first_name=first_name.strip() if isinstance(first_name, str) and first_name.strip() else None,
        last_name=last_name.strip() if isinstance(last_name, str) and last_name.strip() else None,
        username=username.strip() if isinstance(username, str) and username.strip() else None,
        avatar_url=image_url.strip() if isinstance(image_url, str) and image_url.strip() else None,
    )


def _sync_clerk_user(db: Session, identity: ClerkIdentity) -> User:
    if not identity.email_verified:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'CLERK_EMAIL_UNVERIFIED', 'Clerk account email is not verified')

    by_clerk_id = db.query(User).filter(User.clerk_user_id == identity.user_id).first()
    by_email = _find_user_by_email(db, identity.email)

    if by_clerk_id and by_email and by_clerk_id.id != by_email.id:
        raise api_error(
            status.HTTP_409_CONFLICT,
            'CLERK_ACCOUNT_CONFLICT',
            'This Clerk account conflicts with an existing PicSpeak account',
        )

    user = by_clerk_id or by_email
    now = datetime.now(timezone.utc)

    if user is None:
        user = User(
            public_id=new_public_id('usr'),
            clerk_user_id=identity.user_id,
            avatar_url=identity.avatar_url,
            email=identity.email,
            username=_build_unique_username(db, identity),
            password_hash=None,
            plan=UserPlan.free,
            daily_quota_total=quota_for_plan(UserPlan.free),
            daily_quota_used=0,
            status=UserStatus.active,
            last_login_at=now,
        )
        db.add(user)
        db.flush()
        return user

    if user.status != UserStatus.active:
        raise api_error(status.HTTP_403_FORBIDDEN, 'AUTH_USER_INACTIVE', 'User is not active')

    if user.clerk_user_id and user.clerk_user_id != identity.user_id:
        raise api_error(
            status.HTTP_409_CONFLICT,
            'CLERK_ALREADY_BOUND',
            'This PicSpeak account is already linked to a different Clerk user',
        )

    user.clerk_user_id = identity.user_id
    user.avatar_url = identity.avatar_url
    user.email = identity.email
    if not user.username or user.username.startswith('google_') or user.username.startswith('gst_'):
        user.username = _build_unique_username(db, identity, current_user_id=user.id)
    if user.plan == UserPlan.guest:
        user.plan = UserPlan.free
    user.daily_quota_total = quota_for_plan(user.plan)
    user.last_login_at = now
    db.add(user)
    db.flush()
    return user


def _sync_clerk_user_from_webhook(db: Session, user_payload: dict[str, Any]) -> tuple[str, str | None]:
    identity = _clerk_identity_from_webhook_user(user_payload)
    if identity is None:
        return 'ignored_missing_email', None
    if not identity.email_verified:
        return 'ignored_unverified_email', identity.user_id

    user = _sync_clerk_user(db, identity)
    return 'upserted', user.public_id


def _handle_clerk_user_deleted(db: Session, user_payload: dict[str, Any]) -> tuple[str, str | None]:
    clerk_user_id = user_payload.get('id')
    if not isinstance(clerk_user_id, str) or not clerk_user_id.strip():
        return 'ignored_missing_user_id', None

    user = db.query(User).filter(User.clerk_user_id == clerk_user_id.strip()).first()
    if user is None:
        return 'ignored_not_found', None

    user.status = UserStatus.deleted
    db.add(user)
    db.flush()
    return 'deleted', user.public_id


def _process_clerk_webhook_event(db: Session, event: ClerkWebhookEvent) -> tuple[str, str | None]:
    if event.type in {'user.created', 'user.updated'}:
        return _sync_clerk_user_from_webhook(db, event.data)
    if event.type == 'user.deleted':
        return _handle_clerk_user_deleted(db, event.data)
    return 'ignored_event_type', None


def _migrate_guest_records(
    *,
    db: Session,
    target_user: User,
    guest_token: str | None,
    recent_limit: int,
    strict: bool,
) -> tuple[int, int]:
    if not guest_token:
        if strict:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'GUEST_TOKEN_MISSING', 'Guest token is required')
        return 0, 0

    try:
        guest_user = get_user_from_token(guest_token, db)
    except HTTPException:
        if strict:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'GUEST_TOKEN_INVALID', 'Provided token is invalid')
        return 0, 0

    if guest_user.plan != UserPlan.guest:
        if strict:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'GUEST_TOKEN_INVALID', 'Provided token does not belong to a guest account')
        return 0, 0

    if guest_user.id == target_user.id:
        return 0, 0

    guest_reviews = (
        db.query(Review)
        .filter(Review.owner_user_id == guest_user.id)
        .order_by(Review.created_at.desc(), Review.id.desc())
        .limit(recent_limit)
        .all()
    )
    if not guest_reviews:
        return 0, 0

    review_ids = [item.id for item in guest_reviews]
    photo_ids = sorted({item.photo_id for item in guest_reviews})

    migrated_reviews = (
        db.query(Review)
        .filter(Review.id.in_(review_ids), Review.owner_user_id == guest_user.id)
        .update({Review.owner_user_id: target_user.id}, synchronize_session=False)
    )

    migrated_photos = 0
    if photo_ids:
        migrated_photos = (
            db.query(Photo)
            .filter(Photo.id.in_(photo_ids), Photo.owner_user_id == guest_user.id)
            .update({Photo.owner_user_id: target_user.id}, synchronize_session=False)
        )
        db.query(ReviewTask).filter(
            ReviewTask.owner_user_id == guest_user.id,
            ReviewTask.photo_id.in_(photo_ids),
        ).update({ReviewTask.owner_user_id: target_user.id, ReviewTask.idempotency_key: None}, synchronize_session=False)

    return int(migrated_reviews or 0), int(migrated_photos or 0)


def _google_token_info(id_token: str) -> dict:
    query = parse.urlencode({'id_token': id_token})
    url = f'https://oauth2.googleapis.com/tokeninfo?{query}'
    with urllib_request.urlopen(url, timeout=8) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _google_exchange_code(code: str) -> dict:
    if not settings.google_oauth_client_id.strip() or not settings.google_oauth_client_secret.strip() or not settings.google_oauth_redirect_uri.strip():
        raise api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, 'GOOGLE_OAUTH_NOT_CONFIGURED', 'Google OAuth callback is not configured')

    data = parse.urlencode(
        {
            'code': code,
            'client_id': settings.google_oauth_client_id,
            'client_secret': settings.google_oauth_client_secret,
            'redirect_uri': settings.google_oauth_redirect_uri,
            'grant_type': 'authorization_code',
        }
    ).encode('utf-8')
    req = urllib_request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urllib_request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _bind_google_oauth_state(response: Response, state: str) -> None:
    is_dev = settings.app_env.strip().lower() == 'dev'
    response.set_cookie(
        key=GOOGLE_OAUTH_STATE_COOKIE,
        value=state,
        httponly=True,
        secure=not is_dev,
        samesite='lax',
        max_age=GOOGLE_OAUTH_STATE_TTL_SECONDS,
        path='/',
    )


def _clear_google_oauth_state(response: Response) -> None:
    response.delete_cookie(
        key=GOOGLE_OAUTH_STATE_COOKIE,
        path='/',
        samesite='lax',
    )


def _login_from_google_claims(claims: dict, db: Session) -> AuthTokenResponse:
    if claims.get('email_verified') not in ('true', True):
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'GOOGLE_EMAIL_UNVERIFIED', 'Google account email is not verified')

    expected_client_id = settings.google_oauth_client_id.strip()
    if expected_client_id and claims.get('aud') != expected_client_id:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'GOOGLE_AUDIENCE_INVALID', 'Invalid Google token audience')

    google_sub = claims.get('sub')
    if not isinstance(google_sub, str) or not google_sub.strip():
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'GOOGLE_SUB_MISSING', 'Invalid Google token: missing sub')
    google_sub = google_sub.strip()

    email = claims.get('email') or f'{google_sub}@google.local'
    name = claims.get('name') or claims.get('given_name') or f'google_{google_sub}'

    user = db.query(User).filter(User.public_id == google_sub).first()
    if user is None:
        user = User(
            public_id=google_sub,
            email=email,
            username=name,
            password_hash=None,
            plan=UserPlan.free,
            daily_quota_total=quota_for_plan(UserPlan.free),
            daily_quota_used=0,
            status=UserStatus.active,
            last_login_at=datetime.now(timezone.utc),
        )
        db.add(user)
    else:
        user.email = email
        user.username = name
        user.last_login_at = datetime.now(timezone.utc)
        if user.plan == UserPlan.guest:
            user.plan = UserPlan.free
        user.daily_quota_total = quota_for_plan(user.plan)
        db.add(user)

    db.commit()
    db.refresh(user)
    return _serialize_auth_response(user, provider='google')


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

    return _login_from_google_claims(claims, db)


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

    params = parse.urlencode({
        'access_token': auth_data.access_token,
        'token_type': auth_data.token_type,
        'user_id': auth_data.user_id,
        'plan': auth_data.plan,
        'auth_provider': auth_data.auth_provider,
    })
    # Use URL fragment to avoid leaking tokens through server logs and Referer headers.
    response = RedirectResponse(f'{frontend_callback}#{params}', status_code=302)
    _clear_google_oauth_state(response)
    return response


@webhooks_router.post('/clerk')
async def clerk_webhook(request: Request, db: Session = Depends(get_db)):
    import logging
    _logger = logging.getLogger(__name__)
    event = await verify_clerk_webhook(request)
    try:
        outcome, user_public_id = _process_clerk_webhook_event(db, event)
        db.commit()
    except HTTPException as exc:
        db.rollback()
        if exc.status_code in {
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_409_CONFLICT,
        }:
            _logger.warning('Clerk webhook %s ignored: %s', event.type, exc.detail)
            return {'ok': True, 'event_type': event.type, 'outcome': 'ignored_conflict'}
        raise
    except Exception:
        db.rollback()
        raise

    if user_public_id:
        request.state.current_user_public_id = user_public_id
    return {'ok': True, 'event_type': event.type, 'outcome': outcome}
