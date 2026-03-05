from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Cookie, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import JWTValidationError, create_access_token, validate_access_token
from app.db.models import User, UserPlan, UserStatus
from app.db.session import get_db

GUEST_TOKEN_COOKIE = 'ps_guest_token'


class CurrentActor:
    def __init__(self, user: User):
        self.user = user
        self.plan = user.plan


def new_public_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


def quota_for_plan(plan: UserPlan) -> int:
    base = settings.default_daily_quota
    if plan == UserPlan.guest:
        return max(base // 2, 1)
    if plan == UserPlan.pro:
        return base * 2
    return base


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing Authorization header')
    if not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid Authorization scheme')
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing bearer token')
    return token


def _touch_user_login(user: User, db: Session) -> None:
    user.last_login_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)


def _fetch_user_by_token(token: str, db: Session) -> User:
    try:
        claims = validate_access_token(token)
    except JWTValidationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f'Invalid access token: {exc}') from exc

    subject = claims.get('sub')
    if not isinstance(subject, str) or not subject.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid access token: missing sub claim')
    subject = subject.strip()

    user = db.query(User).filter(User.public_id == subject).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid access token: user not found')
    return user


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
    db.commit()
    db.refresh(user)
    return user


def issue_guest_token(user: User) -> str:
    return create_access_token({'sub': user.public_id, 'plan': user.plan.value, 'role': 'guest'})


def bind_guest_token(response: Response, token: str) -> None:
    response.set_cookie(
        key=GUEST_TOKEN_COOKIE,
        value=token,
        httponly=True,
        secure=False,
        samesite='lax',
        max_age=30 * 24 * 3600,
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
    token: str | None = None
    if authorization:
        token = _extract_bearer_token(authorization)
    elif guest_cookie_token:
        token = guest_cookie_token

    if token:
        user = _fetch_user_by_token(token, db)
        request.state.current_user_public_id = user.public_id
        _touch_user_login(user, db)
        return CurrentActor(user)

    user = create_guest_user(db)
    request.state.current_user_public_id = user.public_id
    token = issue_guest_token(user)
    bind_guest_token(response, token)
    return CurrentActor(user)
