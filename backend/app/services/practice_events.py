"""Authoritative, transaction-bound practice analytics with private-data allowlists."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert

from app.core.errors import api_error
from app.db.models import (
    PracticeAttempt, PracticeSession, ProductAnalyticsEvent, Review, ReviewStatus, ReviewTask, User,
)
from app.goal_assessment import GOAL_ASSESSMENT_VERSION


PRACTICE_CLIENT_EVENTS = frozenset({'practice_goal_shown', 'practice_result_viewed'})
PRACTICE_SERVER_EVENTS = frozenset({
    'practice_goal_accepted', 'practice_attempt_submitted', 'practice_analysis_completed',
    'practice_feedback_submitted',
})


def _insert_event(db, *, event_name: str, dedupe_key: str, owner: User, metadata: dict,
                  locale: str, page_path: str | None = None, created_at: datetime | None = None) -> bool:
    statement = (
        insert(ProductAnalyticsEvent)
        .values(
            event_name=event_name, dedupe_key=dedupe_key, user_public_id=owner.public_id,
            plan=owner.plan.value, source='retake_coach', locale=locale,
            page_path=page_path, metadata_json=metadata,
            created_at=created_at or datetime.now(timezone.utc),
        )
        .on_conflict_do_nothing(index_elements=['dedupe_key'])
        .returning(ProductAnalyticsEvent.id)
    )
    return db.execute(statement).scalar_one_or_none() is not None


def record_practice_event(db, *, event_name: str, session: PracticeSession,
                          attempt: PracticeAttempt | None = None, review: Review | None = None,
                          feedback_id: str | None = None, created_at: datetime | None = None) -> bool:
    if event_name not in PRACTICE_SERVER_EVENTS | {'practice_result_viewed'}:
        raise ValueError('Unsupported authoritative practice event')
    owner = db.query(User).filter(User.id == session.owner_user_id).one()
    source = db.query(Review).filter(Review.id == session.source_review_id).one()
    task = db.query(ReviewTask).filter(ReviewTask.id == attempt.task_id).one() if attempt else None
    metadata = {
        'goal_id': session.public_id,
        'goal_version': session.goal_snapshot.get('goal_version', GOAL_ASSESSMENT_VERSION),
        'session_id': session.public_id,
        'attempt_id': attempt.public_id if attempt else None,
        'task_id': task.public_id if task else None,
        'review_id': review.public_id if review else None,
        'source_review_id': source.public_id,
        'practice_kind': session.practice_kind,
    }
    if review:
        result = review.result_json or {}
        metadata.update({
            'goal_status': (result.get('goal_assessment') or {}).get('status'),
            'score_version': result.get('score_version'),
            'prompt_version': result.get('prompt_version'),
            'model_version': result.get('model_version'),
        })
    if feedback_id:
        metadata['feedback_id'] = feedback_id
    entity_key = feedback_id or (attempt.public_id if attempt else session.public_id)
    return _insert_event(
        db, event_name=event_name, dedupe_key=f'{event_name}:{entity_key}', owner=owner,
        metadata=metadata, locale=session.locale,
        page_path=f'/reviews/{review.public_id}' if review else '/workspace', created_at=created_at,
    )


def record_practice_analysis_completed(db, task: ReviewTask, review: Review) -> bool:
    if not (task.request_payload or {}).get('practice_session_id'):
        return False
    attempt = db.query(PracticeAttempt).filter(PracticeAttempt.task_id == task.id).one()
    session = db.query(PracticeSession).filter(PracticeSession.id == attempt.session_id).one()
    return record_practice_event(
        db, event_name='practice_analysis_completed', session=session, attempt=attempt, review=review,
        created_at=review.created_at,
    )


def record_client_practice_event(db, *, actor, event_name: str, metadata: dict, locale: str | None) -> bool:
    from app.services.practice import _find_source_review_for_session, _review_access_status

    if actor is None:
        raise api_error(401, 'AUTH_MISSING', 'Practice analytics requires an authenticated actor')
    if event_name == 'practice_goal_shown':
        source_id = metadata.get('source_review_id')
        if not isinstance(source_id, str) or not source_id.strip():
            raise api_error(422, 'VALIDATION_ERROR', 'A source review is required')
        source, _photo = _find_source_review_for_session(db, actor, source_id)
        return _insert_event(
            db, event_name=event_name, dedupe_key=f'{event_name}:{source.public_id}', owner=actor.user,
            metadata={'source_review_id': source.public_id, 'review_id': source.public_id,
                      'goal_version': GOAL_ASSESSMENT_VERSION},
            locale=locale if locale in {'en', 'zh', 'ja'} else 'en', page_path=f'/reviews/{source.public_id}',
        )
    if event_name != 'practice_result_viewed':
        raise ValueError('Unsupported client practice event')
    attempt_id = metadata.get('attempt_id')
    if not isinstance(attempt_id, str) or not attempt_id.strip():
        raise api_error(422, 'VALIDATION_ERROR', 'A practice attempt is required')
    row = (
        db.query(PracticeAttempt, PracticeSession, Review)
        .join(PracticeSession, PracticeSession.id == PracticeAttempt.session_id)
        .join(Review, Review.id == PracticeAttempt.review_id)
        .filter(PracticeAttempt.public_id == attempt_id, PracticeAttempt.owner_user_id == actor.user.id,
                PracticeSession.owner_user_id == actor.user.id, Review.owner_user_id == actor.user.id)
        .first()
    )
    if row is None:
        raise api_error(404, 'PRACTICE_ATTEMPT_NOT_FOUND', 'Practice result not found')
    attempt, session, review = row
    if review.status != ReviewStatus.SUCCEEDED or _review_access_status(review, actor) != 'available':
        raise api_error(404, 'REVIEW_NOT_FOUND', 'Practice result not found')
    # Ignore every client-supplied link, status, timestamp, cost and free-text field.
    return record_practice_event(
        db, event_name=event_name, session=session, attempt=attempt, review=review,
    )
