from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_current_actor, get_db
from app.profile_schemas import (
    ProfileSettingsResponse,
    ProfileSettingsUpdateRequest,
    PublicProfileResponse,
)
from app.services.profiles import (
    get_my_profile_settings,
    get_public_profile,
    update_my_profile_settings,
)

router = APIRouter(prefix='/profiles', tags=['profiles'])


@router.get('/me', response_model=ProfileSettingsResponse)
def read_my_profile_settings(
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    return get_my_profile_settings(db, actor.user)


@router.patch('/me', response_model=ProfileSettingsResponse)
def patch_my_profile_settings(
    payload: ProfileSettingsUpdateRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    return update_my_profile_settings(
        db,
        actor.user,
        public_profile_enabled=payload.public_profile_enabled,
    )


@router.get('/{public_profile_id}', response_model=PublicProfileResponse)
def read_public_profile(
    public_profile_id: str,
    request: Request,
    response: Response,
    limit: int = Query(default=24, ge=1, le=60),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    response.headers['Cache-Control'] = 'no-store'
    return get_public_profile(db, request, public_profile_id, limit=limit, cursor=cursor)
