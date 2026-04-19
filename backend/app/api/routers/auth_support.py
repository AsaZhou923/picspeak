from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib import error as urllib_error
from urllib import parse, request as urllib_request

from fastapi import HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_user_from_token, new_public_id, quota_for_plan
from app.core.config import settings
from app.core.errors import api_error
from app.core.security import create_access_token
from app.db.models import Photo, Review, ReviewTask, User, UserPlan, UserStatus
from app.schemas import AuthTokenResponse
from app.services.clerk_auth import ClerkIdentity
from app.services.clerk_webhooks import ClerkWebhookEvent

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
    guest_photos = (
        db.query(Photo)
        .filter(Photo.owner_user_id == guest_user.id)
        .order_by(Photo.created_at.desc(), Photo.id.desc())
        .limit(recent_limit)
        .all()
    )
    guest_tasks = db.query(ReviewTask).filter(ReviewTask.owner_user_id == guest_user.id).all()

    migrated_reviews = 0
    for review in guest_reviews:
        if review.owner_user_id != target_user.id:
            review.owner_user_id = target_user.id
            db.add(review)
            migrated_reviews += 1

    migrated_photos = 0
    for photo in guest_photos:
        if photo.owner_user_id != target_user.id:
            photo.owner_user_id = target_user.id
            db.add(photo)
            migrated_photos += 1

    for task in guest_tasks:
        if task.owner_user_id != target_user.id:
            task.owner_user_id = target_user.id
            db.add(task)

    if migrated_reviews or migrated_photos:
        guest_user.status = UserStatus.deleted
        db.add(guest_user)
        db.flush()

    return migrated_reviews, migrated_photos


def _google_token_info(id_token: str) -> dict:
    with urllib_request.urlopen(f'https://oauth2.googleapis.com/tokeninfo?id_token={parse.quote(id_token)}', timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _google_exchange_code(code: str) -> dict:
    redirect_uri = settings.google_oauth_redirect_uri.strip()
    payload = parse.urlencode({
        'code': code,
        'client_id': settings.google_oauth_client_id,
        'client_secret': settings.google_oauth_client_secret,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code',
    }).encode('utf-8')
    req = urllib_request.Request(
        'https://oauth2.googleapis.com/token',
        data=payload,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    with urllib_request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _bind_google_oauth_state(response: Response, state: str) -> None:
    response.set_cookie(
        key=GOOGLE_OAUTH_STATE_COOKIE,
        value=state,
        max_age=GOOGLE_OAUTH_STATE_TTL_SECONDS,
        httponly=True,
        secure=settings.cookie_secure,
        samesite='lax',
        path='/',
    )


def _clear_google_oauth_state(response: Response) -> None:
    response.delete_cookie(
        key=GOOGLE_OAUTH_STATE_COOKIE,
        path='/',
    )


def _login_from_google_claims(claims: dict, db: Session) -> AuthTokenResponse:
    email = claims.get('email')
    if not isinstance(email, str) or not email:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'GOOGLE_EMAIL_MISSING', 'Google token missing email')

    email_verified = claims.get('email_verified')
    if not email_verified:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'GOOGLE_EMAIL_UNVERIFIED', 'Google email is not verified')

    user = _find_user_by_email(db, email)
    if user is None:
        user = User(
            public_id=new_public_id('usr'),
            email=email,
            username=f"google_{re.sub(r'[^a-z0-9_]+', '_', email.split('@', 1)[0].lower()).strip('_') or 'user'}",
            password_hash=None,
            plan=UserPlan.free,
            daily_quota_total=quota_for_plan(UserPlan.free),
            daily_quota_used=0,
            status=UserStatus.active,
            last_login_at=datetime.now(timezone.utc),
        )
        db.add(user)
    else:
        if user.status != UserStatus.active:
            raise api_error(status.HTTP_403_FORBIDDEN, 'AUTH_USER_INACTIVE', 'User is not active')
        user.last_login_at = datetime.now(timezone.utc)
        if user.plan == UserPlan.guest:
            user.plan = UserPlan.free
        user.daily_quota_total = quota_for_plan(user.plan)
        db.add(user)

    db.flush()
    return _serialize_auth_response(user, provider='google')
