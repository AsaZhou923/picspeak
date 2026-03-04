from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import JWTValidationError, validate_access_token
from app.db.models import User, UserPlan, UserStatus
from app.db.session import get_db


def new_public_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing Authorization header')
    if not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid Authorization scheme')
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing bearer token')
    return token


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    token = _extract_bearer_token(authorization)
    try:
        claims = validate_access_token(token)
    except JWTValidationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f'Invalid access token: {exc}') from exc

    subject = claims.get('sub')
    if not isinstance(subject, str) or not subject.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid access token: missing sub claim')
    subject = subject.strip()

    user = db.query(User).filter(User.public_id == subject).first()
    if user:
        request.state.current_user_public_id = user.public_id
        user.last_login_at = datetime.now(timezone.utc)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    email_claim = claims.get('email')
    email = email_claim if isinstance(email_claim, str) and email_claim else f'{subject}@oauth.local'

    username_claim = claims.get('preferred_username')
    username = username_claim if isinstance(username_claim, str) and username_claim else subject

    user = User(
        public_id=subject,
        email=email,
        username=username,
        password_hash=None,
        plan=UserPlan.free,
        daily_quota_total=settings.default_daily_quota,
        daily_quota_used=0,
        status=UserStatus.active,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    request.state.current_user_public_id = user.public_id
    return user
