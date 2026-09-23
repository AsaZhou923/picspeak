from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_current_actor, get_db
from app.api.routers.review_support import _review_history_item, _review_source_public_ids_from_maps
from app.core.config import settings
from app.db.models import Photo, Review
from app.practice_schemas import (
    PracticeConfigResponse,
    PracticeFeedbackRequest,
    PracticeFeedbackResponse,
    PracticeGuidanceProfileResponse,
    PracticeRecommendationsResponse,
    PracticeSceneGroupRequest,
    PracticeSceneGroupResponse,
    PracticeJournalListResponse,
    PracticeJournalSummaryResponse,
    PracticeSessionCreateRequest,
    PracticeSessionPatchRequest,
    PracticeSessionResponse,
)
from app.schemas import ReviewHistoryResponse
from app.services.practice import (
    create_practice_feedback,
    create_practice_session,
    get_practice_session_owned,
    patch_practice_session_lifecycle,
    serialize_practice_feedback,
    serialize_practice_session,
)
from app.services.practice_legacy import list_legacy_retake_comparisons
from app.services.guard import review_history_cutoff
from app.services.practice_guidance import (
    get_practice_guidance_profile,
    get_practice_recommendations,
    upsert_practice_scene_group,
)
from app.services.practice_queries import get_practice_journal_summary, list_practice_journal_sessions

router = APIRouter(prefix='/practice', tags=['practice'])


@router.get('/config', response_model=PracticeConfigResponse)
def get_practice_config():
    return PracticeConfigResponse(practice_enabled=bool(settings.practice_enabled))


@router.post('/sessions', response_model=PracticeSessionResponse)
def create_session(
    payload: PracticeSessionCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
    idempotency_key_header: str | None = Header(default=None, alias='Idempotency-Key'),
):
    idempotency_key = payload.idempotency_key or idempotency_key_header
    session = create_practice_session(db, actor, payload, idempotency_key=idempotency_key)
    response = serialize_practice_session(db, session, actor)
    db.commit()
    return response


@router.get('/summary', response_model=PracticeJournalSummaryResponse)
def get_summary(
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    return get_practice_journal_summary(db, actor)


@router.get('/profile', response_model=PracticeGuidanceProfileResponse)
def get_guidance_profile(
    locale: str = Query(default='en', pattern='^(zh|en|ja)$'),
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    response = get_practice_guidance_profile(db, actor, locale=locale)
    db.commit()
    return response


@router.get('/recommendations', response_model=PracticeRecommendationsResponse)
def get_guidance_recommendations(
    locale: str = Query(default='en', pattern='^(zh|en|ja)$'),
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    response = get_practice_recommendations(db, actor, locale=locale)
    db.commit()
    return response


@router.get('/sessions', response_model=PracticeJournalListResponse)
def list_sessions(
    lifecycle: str | None = Query(default=None, pattern='^(active|completed|archived)$'),
    dimension: str | None = Query(default=None, pattern='^(composition|lighting|color|impact|technical)$'),
    practice_kind: str | None = Query(default=None, pattern='^(capture_retake|edit_revision|same_image_recheck)$'),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    return list_practice_journal_sessions(
        db,
        actor,
        lifecycle=lifecycle,
        dimension=dimension,
        practice_kind=practice_kind,
        limit=limit,
        cursor=cursor,
    )


@router.get('/legacy-comparisons', response_model=ReviewHistoryResponse)
def list_legacy_comparisons(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    page = list_legacy_retake_comparisons(db, actor, limit=limit, cursor=cursor)
    source_review_ids = {review.source_review_id for review, _photo in page.rows if review.source_review_id}
    source_reviews_by_id = {
        review.id: review
        for review in db.query(Review).filter(Review.id.in_(source_review_ids), Review.owner_user_id == actor.user.id).all()
    } if source_review_ids else {}
    source_photo_ids = {review.photo_id for review in source_reviews_by_id.values()}
    source_photos_by_id = {
        photo.id: photo
        for photo in db.query(Photo).filter(Photo.id.in_(source_photo_ids), Photo.owner_user_id == actor.user.id).all()
    } if source_photo_ids else {}
    source_review_map = _review_source_public_ids_from_maps(
        [review for review, _photo in page.rows],
        source_reviews_by_id=source_reviews_by_id,
        source_photos_by_id=source_photos_by_id,
        owner_user_id=actor.user.id,
        cutoff=review_history_cutoff(actor.plan),
    )
    items = [
        _review_history_item(
            request,
            review,
            photo,
            actor.user.public_id,
            source_review_map.get(review.id),
            practice_context_override=None,
        )
        for review, photo in page.rows
    ]
    db.commit()
    return ReviewHistoryResponse(items=items, next_cursor=page.next_cursor)


@router.get('/sessions/{session_id}', response_model=PracticeSessionResponse)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    session = get_practice_session_owned(db, actor, session_id)
    response = serialize_practice_session(db, session, actor)
    db.commit()
    return response


@router.patch('/sessions/{session_id}', response_model=PracticeSessionResponse)
def patch_session(
    session_id: str,
    payload: PracticeSessionPatchRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    session = patch_practice_session_lifecycle(db, actor, session_id, payload.lifecycle)
    response = serialize_practice_session(db, session, actor)
    db.commit()
    return response


@router.put('/sessions/{session_id}/scene-group', response_model=PracticeSceneGroupResponse)
def put_session_scene_group(
    session_id: str,
    payload: PracticeSceneGroupRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    response = upsert_practice_scene_group(db, actor, session_id, payload)
    db.commit()
    return response


@router.post('/attempts/{attempt_id}/feedback', response_model=PracticeFeedbackResponse)
def create_attempt_feedback(
    attempt_id: str,
    payload: PracticeFeedbackRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    feedback = create_practice_feedback(db, actor, attempt_id=attempt_id, payload=payload)
    response = serialize_practice_feedback(feedback)
    db.commit()
    return response
