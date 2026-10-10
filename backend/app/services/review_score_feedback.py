"""Private, version-bound feedback on an ordinary single-photo score."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, new_public_id
from app.core.errors import ApiHTTPException, api_error
from app.db.models import (
    Photo, PhotoStatus, PracticeAttempt, RateLimitCounter, Review, ReviewScoreFeedback,
    ReviewScoreSnapshot, ReviewStatus, ReviewTask, User, UserPlan, UserStatus,
)
from app.schemas import ScoreFeedbackPutRequest, ScoreFeedbackResponse
from app.services.billing_access import effective_user_billing_plan
from app.services.guard import (
    _enforce_scope_rate_limit, day_window_start, minute_window_start, review_history_cutoff,
)

SNAPSHOT_SCHEMA_VERSION = 'review-score-snapshot-v1'
SCORE_KEYS = ('composition', 'lighting', 'color', 'impact', 'technical')
# Keep these aligned with frontend/src/lib/demo-review.ts, including legacy demos.
DEMO_REVIEW_IDS = frozenset({'rev_8424d4fbde054759', 'rev_35e0951d0df94a1e'})
WRITE_LIMIT_PER_MINUTE = 10
NEW_REVIEW_LIMIT_PER_DAY = 50


def _score_number(value: object) -> Decimal:
    if value is None or isinstance(value, bool):
        raise ValueError('Missing numeric score')
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError('Invalid numeric score') from exc
    if not number.is_finite() or not 0 <= number <= 10:
        raise ValueError('Score outside valid range')
    return number


def score_snapshot_payload(review: Review) -> dict | None:
    """Whitelist only score identity; unknown historical provenance stays null.

    Scores use the same integer presentation as ReviewResult. Six decimal places
    suppress binary floating-point noise in the displayed overall score.
    """
    raw = review.result_json if isinstance(review.result_json, dict) else {}
    if (
        review.public_id in DEMO_REVIEW_IDS
        or getattr(review, 'status', None) != ReviewStatus.SUCCEEDED
        or raw.get('analysis_type', 'single') != 'single'
        or any(raw.get(key) is not None for key in ('comparison', 'practice', 'goal_assessment'))
    ):
        return None
    raw_scores = raw.get('scores')
    if not isinstance(raw_scores, dict):
        return None
    try:
        final_score = _score_number(review.final_score).quantize(Decimal('0.000001'))
        scores = {
            key: int(_score_number(raw_scores.get(key, raw_scores.get('story') if key == 'impact' else None)))
            for key in SCORE_KEYS
        }
    except ValueError:
        return None

    def provenance(key: str, fallback: object = None) -> str | None:
        value = raw.get(key) or fallback
        return value if isinstance(value, str) and value else None

    mode = getattr(review.mode, 'value', review.mode)
    if mode not in {'flash', 'pro'}:
        return None
    return {
        'review_public_id': review.public_id,
        'snapshot_schema_version': SNAPSHOT_SCHEMA_VERSION,
        'analysis_type': 'single',
        'mode': mode,
        'image_type': getattr(review, 'image_type', None) or raw.get('image_type') or 'default',
        'final_score': format(final_score, '.6f'),
        'scores': scores,
        'score_version': provenance('score_version'),
        'score_prompt_version': provenance('score_prompt_version'),
        'scorer_model_name': provenance('scorer_model_name', getattr(review, 'scorer_model_name', None)),
        'scorer_model_version': provenance('scorer_model_version'),
        'scorer_reasoning_effort': provenance('scorer_reasoning_effort'),
        'scorer_preprocess_version': provenance('scorer_preprocess_version'),
    }


def snapshot_revision(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


def score_revision(review: Review) -> str | None:
    payload = score_snapshot_payload(review)
    return snapshot_revision(payload) if payload is not None else None


def _lock_user(db: Session, actor: CurrentActor) -> User:
    # Serializes per-account writes and quota markers across different reviews.
    user = db.query(User).filter(User.id == actor.user.id).populate_existing().with_for_update().first()
    if user is None or user.status != UserStatus.active:
        raise api_error(403, 'AUTH_USER_INACTIVE', 'User is not active')
    if user.plan == UserPlan.guest:
        raise api_error(401, 'SCORE_FEEDBACK_LOGIN_REQUIRED', 'Sign in to continue')
    return user


def _eligible_review(db: Session, actor: CurrentActor, review_id: str, expected_revision: str) -> tuple[Review, dict, str]:
    row = (
        db.query(Review, Photo, User)
        .join(Photo, Photo.id == Review.photo_id)
        .join(User, User.id == Review.owner_user_id)
        .filter(Review.public_id == review_id, Review.deleted_at.is_(None))
        .populate_existing().with_for_update(of=Review).first()
    )
    if row is None:
        raise api_error(404, 'REVIEW_NOT_FOUND', 'Review not found')
    review, photo, owner = row
    is_owner = review.owner_user_id == actor.user.id
    gallery = (
        bool(review.is_public)
        and bool(review.gallery_visible)
        and review.gallery_audit_status == 'approved'
        and review.status == ReviewStatus.SUCCEEDED
        and photo.status == PhotoStatus.READY
        and owner.status == UserStatus.active
    )
    cutoff = review_history_cutoff(effective_user_billing_plan(db, actor.user))
    created_at = review.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    if not is_owner and not gallery and review.is_public and review.share_token:
        raise api_error(404, 'SCORE_FEEDBACK_NOT_ALLOWED', 'Gallery publication is required')
    if (not is_owner and not gallery) or (is_owner and not review.is_public and cutoff and created_at < cutoff):
        raise api_error(404, 'REVIEW_NOT_FOUND', 'Review not found')
    if photo is None or photo.status != PhotoStatus.READY:
        raise api_error(404, 'REVIEW_NOT_FOUND', 'Review not found')
    payload = score_snapshot_payload(review)
    task = db.query(ReviewTask).filter(ReviewTask.id == review.task_id).first() if review.task_id else None
    task_payload = (task.request_payload or {}) if task is not None else {}
    practice_attempt = db.query(PracticeAttempt.id).filter(PracticeAttempt.review_id == review.id).first()
    if payload is None or task_payload.get('analysis_type', 'single') != 'single' or practice_attempt:
        raise api_error(422, 'SCORE_FEEDBACK_UNSUPPORTED_REVIEW', 'Feedback requires an ordinary single-photo score')
    if snapshot_revision(payload) != expected_revision:
        raise api_error(409, 'SCORE_FEEDBACK_SCORE_CHANGED', 'Score changed; reload the review')
    return review, payload, 'author' if is_owner else 'community'


def _current_feedback(db: Session, snapshot_id: int, user_id: int) -> ReviewScoreFeedback | None:
    return (
        db.query(ReviewScoreFeedback)
        .filter(ReviewScoreFeedback.snapshot_id == snapshot_id, ReviewScoreFeedback.user_id == user_id)
        .populate_existing().with_for_update().first()
    )


def serialize_feedback(feedback: ReviewScoreFeedback) -> ScoreFeedbackResponse:
    # Recovery/withdrawal responses intentionally contain no review or snapshot.
    return ScoreFeedbackResponse(
        feedback_id=feedback.public_id, verdict=feedback.verdict,
        state=feedback.state, feedback_version=feedback.feedback_version,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at,
        withdrawn_at=feedback.withdrawn_at,
    )


def get_review_feedback(db: Session, actor: CurrentActor, review_id: str, expected_revision: str) -> dict:
    try:
        review, _payload, role = _eligible_review(db, actor, review_id, expected_revision)
    except ApiHTTPException as exc:
        if exc.detail['code'] == 'SCORE_FEEDBACK_NOT_ALLOWED':
            return {'eligible': False, 'role': None, 'reason': 'SCORE_FEEDBACK_NOT_ALLOWED', 'my_feedback': None}
        raise
    snapshot = db.query(ReviewScoreSnapshot).filter(
        ReviewScoreSnapshot.review_id == review.id, ReviewScoreSnapshot.revision_hash == expected_revision,
    ).first()
    feedback = _current_feedback(db, snapshot.id, actor.user.id) if snapshot else None
    return {
        'review_id': review.public_id,
        'score_revision': expected_revision,
        'eligible': True,
        'role': role,
        'my_feedback': serialize_feedback(feedback) if feedback else None,
    }


def _write_rate_limit(db: Session, user: User, now: datetime) -> None:
    _enforce_scope_rate_limit(
        db, scope='score_feedback_write', scope_key=f'user:{user.public_id}', endpoint='score_feedback',
        per_minute_limit=WRITE_LIMIT_PER_MINUTE, window_start=minute_window_start(now), window_seconds=60,
    )


def _reserve_new_review(db: Session, user: User, review: Review, now: datetime) -> None:
    start = day_window_start(now)
    scope_key = f'user:{user.public_id}'
    marker = db.query(RateLimitCounter.id).filter(
        RateLimitCounter.scope == 'score_feedback_review_day', RateLimitCounter.scope_key == scope_key,
        RateLimitCounter.endpoint == review.public_id, RateLimitCounter.window_start == start,
        RateLimitCounter.window_seconds == 86400,
    ).first()
    if marker:
        return
    _enforce_scope_rate_limit(
        db, scope='score_feedback_new_day', scope_key=scope_key, endpoint='score_feedback',
        per_minute_limit=NEW_REVIEW_LIMIT_PER_DAY, window_start=start, window_seconds=86400,
    )
    _enforce_scope_rate_limit(
        db, scope='score_feedback_review_day', scope_key=scope_key, endpoint=review.public_id,
        per_minute_limit=1, window_start=start, window_seconds=86400,
    )


def put_review_feedback(db: Session, actor: CurrentActor, review_id: str, request: ScoreFeedbackPutRequest) -> ScoreFeedbackResponse:
    user = _lock_user(db, actor)
    review, payload, role = _eligible_review(db, actor, review_id, request.expected_score_revision)
    snapshot = db.query(ReviewScoreSnapshot).filter(
        ReviewScoreSnapshot.review_id == review.id,
        ReviewScoreSnapshot.revision_hash == request.expected_score_revision,
    ).first()
    feedback = _current_feedback(db, snapshot.id, user.id) if snapshot else None
    now = datetime.now(timezone.utc)
    expected_version = request.expected_feedback_version or 0
    if feedback is not None:
        same_active_answer = feedback.state == 'active' and feedback.verdict == request.verdict
        if same_active_answer and (
            request.expected_feedback_version == feedback.feedback_version
            or feedback.feedback_version == expected_version + 1
        ):
            return serialize_feedback(feedback)
    _write_rate_limit(db, user, now)
    if feedback is None:
        if request.expected_feedback_version not in {None, 0}:
            raise api_error(409, 'SCORE_FEEDBACK_VERSION_CONFLICT', 'Feedback changed; refresh your feedback')
        _reserve_new_review(db, user, review, now)
        if snapshot is None:
            values = {key: value for key, value in payload.items() if key not in {'review_public_id', 'scores'}}
            snapshot = ReviewScoreSnapshot(
                public_id=new_public_id('rss'), review_id=review.id,
                revision_hash=request.expected_score_revision, scores_json=payload['scores'], **values,
            )
            db.add(snapshot)
            db.flush()
        feedback = ReviewScoreFeedback(
            public_id=new_public_id('sfb'), snapshot_id=snapshot.id, user_id=user.id,
            role_at_submission=role, source_surface=request.source_surface, verdict=request.verdict,
            state='active', feedback_version=1, created_at=now, updated_at=now,
        )
        db.add(feedback)
    else:
        if request.expected_feedback_version != feedback.feedback_version:
            raise api_error(409, 'SCORE_FEEDBACK_VERSION_CONFLICT', 'Feedback changed; refresh your feedback')
        feedback.verdict = request.verdict
        feedback.state = 'active'
        feedback.source_surface = request.source_surface
        feedback.withdrawn_at = None
        feedback.feedback_version += 1
        feedback.updated_at = now
    db.flush()
    return serialize_feedback(feedback)


def get_owned_feedback(db: Session, actor: CurrentActor, feedback_id: str) -> ReviewScoreFeedback:
    feedback = (
        db.query(ReviewScoreFeedback)
        .filter(ReviewScoreFeedback.public_id == feedback_id, ReviewScoreFeedback.user_id == actor.user.id)
        .populate_existing().with_for_update().first()
    )
    if feedback is None:
        raise api_error(404, 'SCORE_FEEDBACK_NOT_FOUND', 'Feedback not found')
    return feedback


def withdraw_feedback(db: Session, actor: CurrentActor, feedback_id: str, expected_version: int) -> ScoreFeedbackResponse:
    user = _lock_user(db, actor)
    feedback = get_owned_feedback(db, actor, feedback_id)
    now = datetime.now(timezone.utc)
    _write_rate_limit(db, user, now)
    if feedback.state == 'withdrawn' and expected_version == feedback.feedback_version:
        return serialize_feedback(feedback)
    if expected_version != feedback.feedback_version:
        raise api_error(409, 'SCORE_FEEDBACK_VERSION_CONFLICT', 'Feedback changed; refresh your feedback')
    feedback.state = 'withdrawn'
    feedback.withdrawn_at = now
    feedback.updated_at = now
    feedback.feedback_version += 1
    db.flush()
    return serialize_feedback(feedback)
