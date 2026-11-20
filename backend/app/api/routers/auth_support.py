from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_user_from_token, new_public_id, quota_for_plan
from app.core.errors import api_error
from app.core.security import create_access_token
from app.db.models import (
    IdempotencyKey,
    Notification,
    NotificationEvent,
    NotificationPreference,
    Photo,
    PracticeAttempt,
    PracticeFeedback,
    PracticeSceneGroup,
    PracticeSession,
    Review,
    ReviewCallCost,
    ReviewScoreFeedback,
    ReviewScoreSnapshot,
    ReviewTask,
    User,
    UserPlan,
    UserStatus,
)
from app.schemas import AuthTokenResponse
from app.services.clerk_auth import ClerkIdentity
from app.services.clerk_webhooks import ClerkWebhookEvent
from app.services.public_identity import (
    normalize_username_seed,
    username_derived_from_email,
)

MAX_USERNAME_ATTEMPTS = 100


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
    # Usernames appear on public Gallery pages, so never derive one from the email.
    candidates = [
        identity.username,
        ' '.join(part for part in [identity.first_name, identity.last_name] if part),
        f'user_{identity.user_id[-8:]}',
    ]
    for raw in candidates:
        if not raw:
            continue
        normalized = normalize_username_seed(raw)
        if normalized:
            return normalized
    return f'user_{identity.user_id[-8:]}'


def _build_unique_username(db: Session, identity: ClerkIdentity, current_user_id: int | None = None) -> str:
    base = _username_seed(identity)
    for attempt in range(MAX_USERNAME_ATTEMPTS):
        if attempt == 0:
            candidate = base
        else:
            suffix_text = str(attempt + 1)
            trimmed_base = base[: max(1, 40 - len(suffix_text) - 1)]
            candidate = f'{trimmed_base}_{suffix_text}'
        existing = db.query(User).filter(User.username == candidate).first()
        if existing is None or existing.id == current_user_id:
            return candidate

    raise api_error(status.HTTP_409_CONFLICT, 'USERNAME_UNAVAILABLE', 'Could not allocate a unique username')


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
    email_derived_username = user is not None and username_derived_from_email(user.username, user.email)

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
    if not user.username or email_derived_username or user.username.startswith('gst_'):
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


def _cleanup_deleted_user_feature_state(db: Session, user: User) -> None:
    now = datetime.now(timezone.utc)

    owned_review_ids = [
        review_id
        for (review_id,) in (
            db.query(Review.id)
            .filter(Review.owner_user_id == user.id)
            .order_by(Review.id)
            .with_for_update()
            .all()
        )
    ]
    if owned_review_ids:
        db.query(Review).filter(Review.id.in_(owned_review_ids)).update(
            {
                Review.is_public: False,
                Review.share_token: None,
                Review.gallery_visible: False,
                Review.gallery_audit_status: 'none',
                Review.gallery_added_at: None,
                Review.gallery_rejected_reason: None,
            },
            synchronize_session=False,
        )
        owned_snapshot_ids = [
            snapshot_id
            for (snapshot_id,) in (
                db.query(ReviewScoreSnapshot.id)
                .filter(ReviewScoreSnapshot.review_id.in_(owned_review_ids))
                .order_by(ReviewScoreSnapshot.id)
                .with_for_update()
                .all()
            )
        ]
        if owned_snapshot_ids:
            db.query(ReviewScoreFeedback).filter(
                ReviewScoreFeedback.snapshot_id.in_(owned_snapshot_ids)
            ).delete(synchronize_session=False)
            db.query(ReviewScoreSnapshot).filter(ReviewScoreSnapshot.id.in_(owned_snapshot_ids)).delete(
                synchronize_session=False
            )

    db.query(ReviewScoreFeedback).filter(ReviewScoreFeedback.user_id == user.id).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.recipient_user_id == user.id).delete(synchronize_session=False)
    db.query(NotificationPreference).filter(NotificationPreference.user_id == user.id).delete(synchronize_session=False)
    db.query(NotificationEvent).filter(NotificationEvent.recipient_user_id == user.id).update(
        {
            NotificationEvent.recipient_user_id: None,
            NotificationEvent.payload_json: {},
            NotificationEvent.cursor_json: {},
            NotificationEvent.optional_preference_eligible: False,
            NotificationEvent.status: 'expired_delivery',
            NotificationEvent.processed_at: now,
            NotificationEvent.available_at: now,
            NotificationEvent.last_error_code: 'RECIPIENT_DELETED',
        },
        synchronize_session=False,
    )


def _handle_clerk_user_deleted(db: Session, user_payload: dict[str, Any]) -> tuple[str, str | None]:
    clerk_user_id = user_payload.get('id')
    if not isinstance(clerk_user_id, str) or not clerk_user_id.strip():
        return 'ignored_missing_user_id', None

    user = (
        db.query(User)
        .filter(User.clerk_user_id == clerk_user_id.strip())
        .with_for_update()
        .populate_existing()
        .first()
    )
    if user is None:
        return 'ignored_not_found', None

    (
        db.query(NotificationEvent.id)
        .filter(NotificationEvent.recipient_user_id == user.id)
        .order_by(NotificationEvent.id)
        .with_for_update()
        .all()
    )
    _cleanup_deleted_user_feature_state(db, user)
    user.status = UserStatus.deleted
    user.public_profile_enabled = False
    db.add(user)
    db.flush()
    return 'deleted', user.public_id


def _process_clerk_webhook_event(db: Session, event: ClerkWebhookEvent) -> tuple[str, str | None]:
    if event.type in {'user.created', 'user.updated'}:
        return _sync_clerk_user_from_webhook(db, event.data)
    if event.type == 'user.deleted':
        return _handle_clerk_user_deleted(db, event.data)
    return 'ignored_event_type', None


def lock_guest_for_transfer(db: Session, guest_user_id: int, *, expected_status: UserStatus) -> User | None:
    """Lock a guest's tasks, then photos, then the guest row for an ownership transfer.

    This is the global row-lock order for ownership-sensitive writes: review
    tasks, then photos in ascending id, then users.

    Worker completion locks its task FOR UPDATE before it inserts rows that
    reference the photo and user and updates the admitting user's quota. A
    synchronous review holds its photo FOR SHARE from admission until it inserts
    the review and updates the user. Taking tasks, photos and the user in that
    order means each of them waits for a transfer at its first lock and never
    holds a lock the transfer still needs. Photo and user locks are NO KEY UPDATE
    so foreign-key inserts (KEY SHARE) are not blocked. Returns None when the
    guest no longer has ``expected_status``, e.g. a concurrent sign-in already
    retired it.
    """
    db.query(ReviewTask.id).filter(ReviewTask.owner_user_id == guest_user_id).order_by(
        ReviewTask.id.asc()
    ).with_for_update().all()
    db.query(Photo.id).filter(Photo.owner_user_id == guest_user_id).order_by(
        Photo.id.asc()
    ).with_for_update(key_share=True).all()
    return (
        db.query(User)
        .filter(User.id == guest_user_id, User.plan == UserPlan.guest, User.status == expected_status)
        .with_for_update(key_share=True)
        .populate_existing()
        .first()
    )


def transfer_guest_user_records(
    db: Session,
    *,
    guest_user: User,
    target_user: User,
    mark_guest_deleted: bool = True,
) -> dict[str, int]:
    """Transfer all content records owned by ``guest_user`` to ``target_user``.

    Callers must first take the locks of ``lock_guest_for_transfer``. Usage
    ledger rows stay with the user whose quota admitted the request.
    """
    guest_photos = (
        db.query(Photo)
        .filter(Photo.owner_user_id == guest_user.id)
        .order_by(Photo.id.asc())
        .populate_existing()
        .all()
    )
    guest_tasks = (
        db.query(ReviewTask)
        .filter(ReviewTask.owner_user_id == guest_user.id)
        .order_by(ReviewTask.id.asc())
        .populate_existing()
        .all()
    )
    guest_reviews = (
        db.query(Review)
        .filter(Review.owner_user_id == guest_user.id)
        .order_by(Review.created_at.desc(), Review.id.desc())
        .all()
    )
    guest_sessions = db.query(PracticeSession).filter(PracticeSession.owner_user_id == guest_user.id).all()
    guest_scene_groups = db.query(PracticeSceneGroup).filter(PracticeSceneGroup.owner_user_id == guest_user.id).all()
    guest_attempts = db.query(PracticeAttempt).filter(PracticeAttempt.owner_user_id == guest_user.id).all()
    guest_feedback = db.query(PracticeFeedback).filter(PracticeFeedback.owner_user_id == guest_user.id).all()

    guest_idempotency_records = db.query(IdempotencyKey).filter(IdempotencyKey.user_id == guest_user.id).all()
    target_idempotency_keys = {
        (endpoint, key)
        for endpoint, key in db.query(IdempotencyKey.endpoint, IdempotencyKey.idempotency_key)
        .filter(IdempotencyKey.user_id == target_user.id)
        .all()
    }
    target_task_idempotency_keys = {
        key
        for (key,) in db.query(ReviewTask.idempotency_key)
        .filter(ReviewTask.owner_user_id == target_user.id, ReviewTask.idempotency_key.isnot(None))
        .all()
    }
    target_session_idempotency_keys = {
        key
        for (key,) in db.query(PracticeSession.idempotency_key)
        .filter(PracticeSession.owner_user_id == target_user.id, PracticeSession.idempotency_key.isnot(None))
        .all()
    }

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

    migrated_tasks = 0
    for task in guest_tasks:
        if task.owner_user_id != target_user.id:
            if task.idempotency_key and task.idempotency_key in target_task_idempotency_keys:
                task.idempotency_key = None
            task.owner_user_id = target_user.id
            db.add(task)
            migrated_tasks += 1

    # Cost facts follow their task/owner across guest-to-account ownership changes.
    migrated_call_costs = 0
    for call in db.query(ReviewCallCost).filter(ReviewCallCost.owner_user_id == guest_user.id).all():
        if call.owner_user_id != target_user.id:
            call.owner_user_id = target_user.id
            db.add(call)
            migrated_call_costs += 1

    migrated_sessions = 0
    for session in guest_sessions:
        if session.owner_user_id != target_user.id:
            if session.idempotency_key and session.idempotency_key in target_session_idempotency_keys:
                session.idempotency_key = None
            session.owner_user_id = target_user.id
            db.add(session)
            migrated_sessions += 1

    migrated_scene_groups = 0
    for scene_group in guest_scene_groups:
        if scene_group.owner_user_id != target_user.id:
            scene_group.owner_user_id = target_user.id
            db.add(scene_group)
            migrated_scene_groups += 1

    migrated_attempts = 0
    for attempt in guest_attempts:
        if attempt.owner_user_id != target_user.id:
            attempt.owner_user_id = target_user.id
            db.add(attempt)
            migrated_attempts += 1

    migrated_feedback = 0
    for feedback in guest_feedback:
        if feedback.owner_user_id != target_user.id:
            feedback.owner_user_id = target_user.id
            db.add(feedback)
            migrated_feedback += 1

    for record in guest_idempotency_records:
        if (record.endpoint, record.idempotency_key) in target_idempotency_keys:
            db.delete(record)
        else:
            record.user_id = target_user.id
            db.add(record)

    if mark_guest_deleted and (
        migrated_reviews
        or migrated_photos
        or migrated_tasks
        or migrated_sessions
        or migrated_scene_groups
        or migrated_attempts
        or migrated_feedback
    ):
        guest_user.status = UserStatus.deleted
        db.add(guest_user)

    db.flush()
    return {
        'reviews': migrated_reviews,
        'photos': migrated_photos,
        'tasks': migrated_tasks,
        'call_costs': migrated_call_costs,
        'practice_sessions': migrated_sessions,
        'practice_scene_groups': migrated_scene_groups,
        'practice_attempts': migrated_attempts,
        'practice_feedback': migrated_feedback,
    }


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

    # A concurrent sign-in for the same guest waits on these locks and then sees
    # the guest already retired, so a transfer is never reported twice.
    locked_guest = lock_guest_for_transfer(db, guest_user.id, expected_status=UserStatus.active)
    if locked_guest is None:
        if strict:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'GUEST_TOKEN_INVALID', 'Provided token is invalid')
        return 0, 0

    # `recent_limit` is kept in request schemas and this signature for backward
    # compatibility, but migration always moves every guest record so nothing is
    # stranded or left with mismatched review/photo/task ownership.
    _ = recent_limit

    counts = transfer_guest_user_records(
        db,
        guest_user=locked_guest,
        target_user=target_user,
        mark_guest_deleted=True,
    )
    return counts['reviews'], counts['photos']
