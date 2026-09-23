from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, new_public_id
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import (
    Photo,
    PhotoStatus,
    PracticeAttempt,
    PracticeFeedback,
    PracticeSession,
    Review,
    ReviewStatus,
    ReviewTask,
    User,
)
from app.practice_schemas import (
    PracticeAttemptSummary,
    PracticeContext,
    PracticeFeedbackRequest,
    PracticeFeedbackResponse,
    PracticeSessionCreateRequest,
    PracticeSessionResponse,
)
from app.schemas import ReviewCreateRequest
from app.services.guard import hash_request, review_history_cutoff
from app.services.practice_access import (
    attempt_access_summary,
    load_photos_by_id,
    load_reviews_by_id,
    load_tasks_by_id,
    owner_history_cutoff,
    source_access_summary,
)
from app.services.practice_events import record_practice_event

PRACTICE_SESSION_ENDPOINT = '/practice/sessions'
PRACTICE_KINDS = {'capture_retake', 'edit_revision', 'same_image_recheck'}
PRACTICE_RETAKE_KINDS = {'capture_retake', 'edit_revision'}


@dataclass(frozen=True)
class PracticeTaskContext:
    session: PracticeSession
    attempt: PracticeAttempt
    source_review: Review
    source_photo: Photo

    @property
    def goal_context(self) -> Any | None:
        if self.session.practice_kind == 'same_image_recheck':
            return None
        from app.goal_assessment import GoalAssessmentContext

        goal_snapshot = dict(self.session.goal_snapshot or {})
        return GoalAssessmentContext(
            goal_version=str(goal_snapshot.get('goal_version') or ''),
            goal=str(goal_snapshot.get('goal') or ''),
            success_criteria=[
                str(item.get('label') or '')
                for item in list(self.session.success_criteria or [])
                if isinstance(item, dict) and str(item.get('label') or '').strip()
            ],
            practice_kind=self.session.practice_kind,
        )


def canonical_practice_request_hash(payload: dict[str, Any]) -> str:
    dumped = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hash_request(dumped)


def _practice_session_payload(payload: PracticeSessionCreateRequest) -> dict[str, Any]:
    return {
        'source_review_id': payload.source_review_id,
        'practice_kind': payload.practice_kind,
        'goal_snapshot': payload.goal_snapshot.model_dump(),
        'success_criteria': [item.model_dump() for item in payload.success_criteria],
        'locale': payload.locale,
    }


def _review_practice_payload(payload: ReviewCreateRequest) -> dict[str, Any]:
    return {
        'photo_id': payload.photo_id,
        'mode': payload.mode,
        'review_model': payload.review_model,
        'image_type': payload.image_type,
        'source_review_id': payload.source_review_id,
        'practice_session_id': payload.practice_session_id,
        'analysis_type': payload.analysis_type,
        'locale': payload.locale,
    }


def _review_access_status(review: Review | None, actor: CurrentActor) -> str:
    if review is None or review.deleted_at is not None:
        return 'deleted'
    cutoff = review_history_cutoff(actor.plan)
    if cutoff is not None and review.created_at < cutoff:
        return 'expired'
    return 'available'


def _find_source_review_for_session(db: Session, actor: CurrentActor, source_review_id: str) -> tuple[Review, Photo]:
    row = (
        db.query(Review, Photo)
        .join(Photo, Photo.id == Review.photo_id)
        .filter(
            Review.public_id == source_review_id,
            Review.owner_user_id == actor.user.id,
            Photo.owner_user_id == actor.user.id,
            Review.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    review, photo = row
    if review.status != ReviewStatus.SUCCEEDED or photo.status != PhotoStatus.READY:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PRACTICE_SOURCE_NOT_READY', 'Practice source review is not ready')
    if _review_access_status(review, actor) != 'available':
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    return review, photo


def _attempt_summary(
    attempt: PracticeAttempt,
    *,
    session: PracticeSession,
    source_access,
    tasks_by_id: dict[int, ReviewTask],
    reviews_by_id: dict[int, Review],
    photos_by_id: dict[int, Photo],
    actor: CurrentActor,
) -> PracticeAttemptSummary:
    task = tasks_by_id.get(attempt.task_id)
    review = reviews_by_id.get(attempt.review_id) if attempt.review_id else None
    target_photo = photos_by_id.get(attempt.photo_id)
    access = attempt_access_summary(
        attempt,
        source_access=source_access,
        target_photo=target_photo,
        task=task,
        review=review,
        owner_user_id=actor.user.id,
        cutoff=owner_history_cutoff(actor.plan),
    )
    task_error = None
    if task and task.error_code:
        task_error = {'code': task.error_code, 'message': task.error_message}
    return PracticeAttemptSummary(
        attempt_id=attempt.public_id,
        task_id=access.task_public_id,
        review_id=access.review_public_id,
        review_access=access.review_access,
        task_status=task.status.value if task else None,
        progress=task.progress if task else None,
        error=task_error,
        sequence=attempt.sequence,
        photo_id=access.photo_public_id,
        kind=attempt.attempt_kind,
        created_at=attempt.created_at,
    )


def serialize_practice_session(db: Session, session: PracticeSession, actor: CurrentActor | None = None) -> PracticeSessionResponse:
    if actor is None:
        owner = db.query(User).filter(User.id == session.owner_user_id).first()
        actor = CurrentActor(owner) if owner is not None else None
    if actor is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'PRACTICE_SESSION_NOT_FOUND', 'Practice session not found')
    reviews_by_id = load_reviews_by_id(db, [session.source_review_id], actor.user.id)
    photos_by_id = load_photos_by_id(db, [session.source_photo_id], actor.user.id)
    source_access = source_access_summary(
        session,
        source_review=reviews_by_id.get(session.source_review_id),
        source_photo=photos_by_id.get(session.source_photo_id),
        owner_user_id=actor.user.id,
        cutoff=owner_history_cutoff(actor.plan),
    )
    attempts = (
        db.query(PracticeAttempt)
        .filter(PracticeAttempt.session_id == session.id, PracticeAttempt.owner_user_id == actor.user.id)
        .order_by(PracticeAttempt.sequence.asc(), PracticeAttempt.id.asc())
        .all()
    )
    tasks_by_id = load_tasks_by_id(db, [attempt.task_id for attempt in attempts], actor.user.id)
    attempt_reviews_by_id = load_reviews_by_id(db, [attempt.review_id for attempt in attempts], actor.user.id)
    target_photos_by_id = load_photos_by_id(db, [attempt.photo_id for attempt in attempts], actor.user.id)
    return PracticeSessionResponse(
        session_id=session.public_id,
        source_review_id=source_access.review_public_id,
        source_photo_id=source_access.photo_public_id,
        source_access=source_access.access,
        practice_kind=session.practice_kind,
        lifecycle=session.lifecycle,
        goal_snapshot=dict(session.goal_snapshot or {}),
        success_criteria=list(session.success_criteria or []),
        locale=session.locale,
        attempts=[
            _attempt_summary(
                attempt,
                session=session,
                source_access=source_access,
                tasks_by_id=tasks_by_id,
                reviews_by_id=attempt_reviews_by_id,
                photos_by_id=target_photos_by_id,
                actor=actor,
            )
            for attempt in attempts
        ],
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def create_practice_session(
    db: Session,
    actor: CurrentActor,
    payload: PracticeSessionCreateRequest,
    *,
    idempotency_key: str | None,
) -> PracticeSession:
    request_hash = canonical_practice_request_hash(_practice_session_payload(payload))
    if idempotency_key:
        existing = (
            db.query(PracticeSession)
            .filter(PracticeSession.owner_user_id == actor.user.id, PracticeSession.idempotency_key == idempotency_key)
            .first()
        )
        if existing is not None:
            if existing.request_hash != request_hash:
                raise api_error(status.HTTP_409_CONFLICT, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with different practice session content')
            return existing

    if not settings.practice_enabled:
        raise api_error(status.HTTP_403_FORBIDDEN, 'PRACTICE_DISABLED', 'Practice is currently disabled')

    source_review, source_photo = _find_source_review_for_session(db, actor, payload.source_review_id)
    session = PracticeSession(
        public_id=new_public_id('prs'),
        owner_user_id=actor.user.id,
        source_review_id=source_review.id,
        source_photo_id=source_photo.id,
        practice_kind=payload.practice_kind,
        lifecycle='active',
        goal_snapshot=payload.goal_snapshot.model_dump(),
        success_criteria=[item.model_dump() for item in payload.success_criteria],
        locale=payload.locale,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
    )
    db.add(session)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if idempotency_key:
            existing = (
                db.query(PracticeSession)
                .filter(PracticeSession.owner_user_id == actor.user.id, PracticeSession.idempotency_key == idempotency_key)
                .first()
            )
            if existing is not None and existing.request_hash == request_hash:
                return existing
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_SESSION_DUPLICATE', 'Duplicate practice session') from exc
    record_practice_event(db, event_name='practice_goal_accepted', session=session, created_at=session.created_at)
    return session


def get_practice_session_owned(db: Session, actor: CurrentActor, session_id: str) -> PracticeSession:
    session = (
        db.query(PracticeSession)
        .filter(PracticeSession.public_id == session_id, PracticeSession.owner_user_id == actor.user.id)
        .first()
    )
    if session is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'PRACTICE_SESSION_NOT_FOUND', 'Practice session not found')
    return session


def patch_practice_session_lifecycle(db: Session, actor: CurrentActor, session_id: str, lifecycle: str) -> PracticeSession:
    session = get_practice_session_owned(db, actor, session_id)
    session.lifecycle = lifecycle
    db.add(session)
    db.flush()
    return session


def _practice_review_context(session: PracticeSession, attempt: PracticeAttempt, *, source_access) -> dict[str, Any]:
    return PracticeContext(
        session_id=session.public_id,
        attempt_id=attempt.public_id,
        kind=session.practice_kind,
        lifecycle=session.lifecycle,
        source_review_id=source_access.review_public_id,
        source_photo_id=source_access.photo_public_id,
        source_access=source_access.access,
        continue_available=source_access.continue_available,
        sequence=attempt.sequence,
    ).model_dump()


def owner_practice_context_for_review(db: Session, review: Review) -> dict[str, Any] | None:
    review_id = getattr(review, 'id', None)
    if review_id is None:
        return None
    row = (
        db.query(PracticeAttempt, PracticeSession, User)
        .join(PracticeSession, PracticeSession.id == PracticeAttempt.session_id)
        .join(User, User.id == PracticeSession.owner_user_id)
        .filter(PracticeAttempt.review_id == review_id, PracticeAttempt.owner_user_id == review.owner_user_id)
        .first()
    )
    if row is None:
        return None
    attempt, session, owner = row
    source_reviews_by_id = load_reviews_by_id(db, [session.source_review_id], session.owner_user_id)
    source_photos_by_id = load_photos_by_id(db, [session.source_photo_id], session.owner_user_id)
    source_access = source_access_summary(
        session,
        source_review=source_reviews_by_id.get(session.source_review_id),
        source_photo=source_photos_by_id.get(session.source_photo_id),
        owner_user_id=session.owner_user_id,
        cutoff=owner_history_cutoff(owner.plan),
    )
    return _practice_review_context(session, attempt, source_access=source_access)


def prepare_practice_attempt_for_task(
    db: Session,
    actor: CurrentActor,
    *,
    payload: ReviewCreateRequest,
    photo: Photo,
    task: ReviewTask,
) -> PracticeAttempt | None:
    if not payload.practice_session_id:
        return None
    if not settings.practice_enabled:
        raise api_error(status.HTTP_403_FORBIDDEN, 'PRACTICE_DISABLED', 'Practice is currently disabled')

    session = get_practice_session_owned(db, actor, payload.practice_session_id)
    source = db.query(Review).filter(Review.id == session.source_review_id).first()
    if source is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    _source_review, source_photo = _find_source_review_for_session(db, actor, source.public_id)
    if source_photo.id != session.source_photo_id:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_SOURCE_CONFLICT', 'Practice source photo does not match')
    if session.lifecycle != 'active':
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PRACTICE_SESSION_INACTIVE', 'Practice session is not active')
    if session.locale != payload.locale:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_LOCALE_CONFLICT', 'Practice locale does not match the session')
    expected_analysis_type = 'single' if session.practice_kind == 'same_image_recheck' else 'retake_compare'
    if payload.analysis_type != expected_analysis_type:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PRACTICE_KIND_ANALYSIS_MISMATCH', 'Practice kind does not match analysis type')
    if payload.source_review_id:
        source_public_id = db.query(Review.public_id).filter(Review.id == session.source_review_id).scalar()
        if payload.source_review_id != source_public_id:
            raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_SOURCE_CONFLICT', 'Practice source review does not match the session')
    if session.practice_kind == 'same_image_recheck':
        if photo.id != session.source_photo_id:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'REANALYZE_PHOTO_MISMATCH', 'Same-image practice must use the source photo')
    elif photo.id == session.source_photo_id:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'RETAKE_PHOTO_DUPLICATE', 'Retake practice requires a newly uploaded photo')

    request_hash = canonical_practice_request_hash(_review_practice_payload(payload))
    db.query(PracticeSession).filter(PracticeSession.id == session.id).with_for_update().one()
    sequence = (
        db.query(func.coalesce(func.max(PracticeAttempt.sequence), 0))
        .filter(PracticeAttempt.session_id == session.id)
        .scalar()
        or 0
    ) + 1
    attempt = PracticeAttempt(
        public_id=new_public_id('pra'),
        session_id=session.id,
        owner_user_id=actor.user.id,
        task_id=task.id,
        review_id=None,
        sequence=sequence,
        photo_id=photo.id,
        source_review_id=session.source_review_id,
        attempt_kind=session.practice_kind,
        request_hash=request_hash,
    )
    db.add(attempt)
    db.flush()
    task.request_payload = dict(task.request_payload or {})
    task.request_payload['practice_session_internal_id'] = session.id
    task.request_payload['practice_attempt_internal_id'] = attempt.id
    task.request_payload['practice_kind'] = session.practice_kind
    task.request_payload['source_review_internal_id'] = session.source_review_id
    db.add(task)
    record_practice_event(db, event_name='practice_attempt_submitted', session=session, attempt=attempt, created_at=attempt.created_at)
    return attempt


def resolve_task_practice(db: Session, task: ReviewTask) -> PracticeTaskContext | None:
    payload = dict(task.request_payload or {})
    attempt_id = payload.get('practice_attempt_internal_id')
    if not attempt_id:
        if payload.get('practice_session_id') or payload.get('practice_session_internal_id'):
            raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_ATTEMPT_MISSING', 'Practice task is missing its attempt')
        return None
    row = (
        db.query(PracticeAttempt, PracticeSession, Review, Photo)
        .join(PracticeSession, PracticeSession.id == PracticeAttempt.session_id)
        .join(Review, Review.id == PracticeSession.source_review_id)
        .join(Photo, Photo.id == PracticeSession.source_photo_id)
        .filter(PracticeAttempt.id == attempt_id, PracticeAttempt.task_id == task.id)
        .first()
    )
    if row is None:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_ATTEMPT_MISSING', 'Practice attempt is missing for this task')
    attempt, session, source_review, source_photo = row
    if session.owner_user_id != task.owner_user_id or attempt.owner_user_id != task.owner_user_id:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_OWNER_CONFLICT', 'Practice task owner does not match')
    if source_review.owner_user_id != task.owner_user_id or source_photo.owner_user_id != task.owner_user_id:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_OWNER_CONFLICT', 'Practice source owner does not match')
    if source_review.deleted_at is not None:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PRACTICE_SOURCE_NOT_READY', 'Practice source review is deleted')
    owner = db.query(User).filter(User.id == task.owner_user_id).first()
    if owner is None or _review_access_status(source_review, CurrentActor(owner)) != 'available':
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    target_photo = db.query(Photo).filter(Photo.id == task.photo_id, Photo.owner_user_id == task.owner_user_id).first()
    if target_photo is None:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_PHOTO_MISSING', 'Practice target photo is missing')
    if target_photo.status != PhotoStatus.READY:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PHOTO_NOT_READY', 'Practice target photo is not ready')
    if attempt.photo_id != task.photo_id:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_PHOTO_CONFLICT', 'Practice attempt photo does not match')
    if attempt.source_review_id != session.source_review_id:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_SOURCE_CONFLICT', 'Practice attempt source does not match')
    if source_review.photo_id != source_photo.id or attempt.attempt_kind != session.practice_kind:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_SOURCE_CONFLICT', 'Practice source or kind does not match')
    if source_review.status != ReviewStatus.SUCCEEDED or source_photo.status != PhotoStatus.READY:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PRACTICE_SOURCE_NOT_READY', 'Practice source is not ready')
    if payload.get('practice_kind') != session.practice_kind:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_KIND_CONFLICT', 'Practice kind does not match')
    expected_analysis_type = 'single' if session.practice_kind == 'same_image_recheck' else 'retake_compare'
    if payload.get('analysis_type') != expected_analysis_type:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_KIND_ANALYSIS_MISMATCH', 'Practice kind does not match analysis type')
    if payload.get('locale') and payload.get('locale') != session.locale:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_LOCALE_CONFLICT', 'Practice locale does not match')
    if session.practice_kind == 'same_image_recheck':
        if target_photo.id != source_photo.id:
            raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_PHOTO_CONFLICT', 'Same-image practice target does not match source')
    elif target_photo.id == source_photo.id:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'RETAKE_PHOTO_DUPLICATE', 'Retake practice requires a newly uploaded photo')
    return PracticeTaskContext(session=session, attempt=attempt, source_review=source_review, source_photo=source_photo)


def attach_practice_review(db: Session, task: ReviewTask, review: Review) -> dict[str, Any] | None:
    context = resolve_task_practice(db, task)
    if context is None:
        return None
    context.attempt.review_id = review.id
    db.add(context.attempt)
    payload = dict(review.result_json or {})
    owner = db.get(User, task.owner_user_id)
    source_access = source_access_summary(
        context.session,
        source_review=context.source_review,
        source_photo=context.source_photo,
        owner_user_id=task.owner_user_id,
        cutoff=owner_history_cutoff(owner.plan) if owner is not None else None,
    )
    practice_payload = owner_practice_context_for_review(db, review) or _practice_review_context(context.session, context.attempt, source_access=source_access)
    payload['practice'] = practice_payload
    review.result_json = payload
    db.add(review)
    return practice_payload


def create_practice_feedback(
    db: Session,
    actor: CurrentActor,
    *,
    attempt_id: str,
    payload: PracticeFeedbackRequest,
) -> PracticeFeedback:
    row = (
        db.query(PracticeAttempt, PracticeSession)
        .join(PracticeSession, PracticeSession.id == PracticeAttempt.session_id)
        .filter(PracticeAttempt.public_id == attempt_id, PracticeAttempt.owner_user_id == actor.user.id)
        .first()
    )
    if row is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'PRACTICE_ATTEMPT_NOT_FOUND', 'Practice attempt not found')
    attempt, session = row
    if session.owner_user_id != actor.user.id or not attempt.review_id:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_RESULT_REQUIRED', 'Feedback requires a completed practice result')
    review = db.query(Review).filter(Review.id == attempt.review_id, Review.owner_user_id == actor.user.id).first()
    if _review_access_status(review, actor) != 'available':
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    if review.status != ReviewStatus.SUCCEEDED:
        raise api_error(status.HTTP_409_CONFLICT, 'PRACTICE_RESULT_REQUIRED', 'Feedback requires a completed practice result')
    feedback = PracticeFeedback(
        public_id=new_public_id('pfb'),
        session_id=session.id,
        attempt_id=attempt.id,
        review_id=attempt.review_id,
        owner_user_id=actor.user.id,
        verdict=payload.verdict,
        reason=payload.reason.strip() if payload.reason else None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(feedback)
    db.flush()
    record_practice_event(
        db, event_name='practice_feedback_submitted', session=session, attempt=attempt,
        review=review, feedback_id=feedback.public_id, created_at=feedback.created_at,
    )
    return feedback


def serialize_practice_feedback(feedback: PracticeFeedback) -> PracticeFeedbackResponse:
    return PracticeFeedbackResponse(
        feedback_id=feedback.public_id,
        verdict=feedback.verdict,
        reason=feedback.reason,
        created_at=feedback.created_at,
    )
