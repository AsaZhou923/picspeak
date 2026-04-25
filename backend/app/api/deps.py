from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import Cookie, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import api_error
from app.core.security import JWTValidationError, create_access_token, validate_access_token
from app.db.models import User, UserPlan, UserStatus
from app.db.session import get_db
from app.services.billing_access import sync_user_billing_plan
from app.services.guard import daily_quota_for_plan, enforce_guest_api_rate_limit, guest_rate_limit_scope_key

GUEST_TOKEN_COOKIE = 'ps_guest_token'
GUEST_TOKEN_TTL_SECONDS = 30 * 24 * 3600


class CurrentActor:
    def __init__(self, user: User):
        self.user = user
        self.plan = user.plan


def new_public_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


def quota_for_plan(plan: UserPlan) -> int:
    return daily_quota_for_plan(plan) or 0


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'AUTH_MISSING', 'Missing Authorization header')
    if not authorization.lower().startswith('bearer '):
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'AUTH_SCHEME_INVALID', 'Invalid Authorization scheme')
    token = authorization[7:].strip()
    if not token:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'AUTH_TOKEN_MISSING', 'Missing bearer token')
    return token


def _touch_user_login(user: User, db: Session) -> None:
    user.last_login_at = datetime.now(timezone.utc)
    db.add(user)
    # Defer transaction commit to the endpoint flow to avoid commit during dependency resolution.
    db.flush()


def _fetch_user_by_token(token: str, db: Session) -> User:
    try:
        claims = validate_access_token(token)
    except JWTValidationError as exc:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'AUTH_TOKEN_INVALID', f'Invalid access token: {exc}') from exc

    subject = claims.get('sub')
    if not isinstance(subject, str) or not subject.strip():
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'AUTH_SUB_MISSING', 'Invalid access token: missing sub claim')
    subject = subject.strip()

    user = db.query(User).filter(User.public_id == subject).first()
    if user is None:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'AUTH_USER_NOT_FOUND', 'Invalid access token: user not found')
    if user.status != UserStatus.active:
        raise api_error(status.HTTP_403_FORBIDDEN, 'AUTH_USER_INACTIVE', 'User is not active')
    return user


def get_user_from_token(token: str, db: Session) -> User:
    return _fetch_user_by_token(token, db)


def create_guest_user(db: Session) -> User:
    guest_id = new_public_id('gst')
    user = User(
        public_id=guest_id,
        email=f'{guest_id}@guest.local',
        username=guest_id,
        password_hash=None,
        plan=UserPlan.guest,
        daily_quota_total=quota_for_plan(UserPlan.guest),
        daily_quota_used=0,
        status=UserStatus.active,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()
    return user


def issue_guest_token(user: User) -> str:
    return create_access_token(
        {'sub': user.public_id, 'plan': user.plan.value, 'role': 'guest'},
        ttl_seconds=GUEST_TOKEN_TTL_SECONDS,
    )


def bind_guest_token(response: Response, token: str) -> None:
    is_dev = settings.app_env.strip().lower() == 'dev'
    # SameSite policy is configurable via COOKIE_SAMESITE setting (default: 'lax').
    # Set COOKIE_SAMESITE=none only when frontend and backend are on different domains;
    # that also requires secure=True (enforced automatically in non-dev mode).
    samesite = settings.cookie_samesite.strip().lower() if not is_dev else 'lax'
    if samesite not in {'strict', 'lax', 'none'}:
        samesite = 'lax'
    # SameSite=none requires Secure; fall back to lax in dev to avoid accidentally
    # setting an insecure SameSite=none cookie.
    secure = not is_dev
    if samesite == 'none' and not secure:
        samesite = 'lax'
    response.set_cookie(
        key=GUEST_TOKEN_COOKIE,
        value=token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=GUEST_TOKEN_TTL_SECONDS,
        path='/',
    )
    response.headers['X-Guest-Access-Token'] = token


def get_current_actor(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    guest_cookie_token: str | None = Cookie(default=None, alias=GUEST_TOKEN_COOKIE),
) -> CurrentActor:
    endpoint = request.url.path
    token: str | None = None
    if authorization:
        token = _extract_bearer_token(authorization)
    elif guest_cookie_token:
        token = guest_cookie_token

    if token:
        user = _fetch_user_by_token(token, db)
        sync_user_billing_plan(db, user)
        request.state.current_user_public_id = user.public_id
        actor = CurrentActor(user)
        enforce_guest_api_rate_limit(db, actor, endpoint, guest_rate_limit_scope_key(request, user))
        _touch_user_login(user, db)
        return actor

    user = create_guest_user(db)
    request.state.current_user_public_id = user.public_id
    token = issue_guest_token(user)
    bind_guest_token(response, token)
    actor = CurrentActor(user)
    enforce_guest_api_rate_limit(db, actor, endpoint, guest_rate_limit_scope_key(request, user))
    return actor


def get_optional_actor(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    guest_cookie_token: str | None = Cookie(default=None, alias=GUEST_TOKEN_COOKIE),
) -> CurrentActor | None:
    token: str | None = None
    if authorization:
        token = _extract_bearer_token(authorization)
    elif guest_cookie_token:
        token = guest_cookie_token

    if not token:
        return None

    user = _fetch_user_by_token(token, db)
    sync_user_billing_plan(db, user)
    request.state.current_user_public_id = user.public_id
    return CurrentActor(user)
