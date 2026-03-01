from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import User, UserPlan, UserStatus
from app.db.session import get_db


def new_public_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


def _extract_dev_user_public_id(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing Authorization header')
    if not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid Authorization scheme')
    token = authorization[7:].strip()
    if not token.startswith('dev-'):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Only dev- token is supported in this build')
    return token[4:]


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    public_id = _extract_dev_user_public_id(authorization)

    user = db.query(User).filter(User.public_id == public_id).first()
    if user:
        return user

    user = User(
        public_id=public_id,
        email=f'{public_id}@dev.local',
        username=public_id,
        password_hash=None,
        plan=UserPlan.free,
        daily_quota_total=settings.default_daily_quota,
        daily_quota_used=0,
        status=UserStatus.active,
        last_login_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
