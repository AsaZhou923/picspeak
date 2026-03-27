from __future__ import annotations

import json
import asyncio
from bisect import bisect_right
import hashlib
import logging
import re
import secrets
import sys
import time
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import RedirectResponse, StreamingResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from urllib import error as urllib_error
from urllib import parse, request as urllib_request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentActor,
    bind_guest_token,
    create_guest_user,
    get_current_actor,
    get_user_from_token,
    GUEST_TOKEN_COOKIE,
    issue_guest_token,
    new_public_id,
    quota_for_plan,
)
from app.core.config import settings
from app.core.errors import api_error
from app.core.network import client_ip_from_request
from app.core.security import create_access_token, sign_payload, sign_payload_with_exp, verify_payload
from app.db.models import (
    BillingSubscription,
    Photo,
    PhotoStatus,
    Review,
    ReviewLike,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    ReviewTaskEvent,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
    UsageLedger,
)
from app.db.session import SessionLocal, get_db
from app.schemas import (
    BillingCheckoutRequest,
    BillingCheckoutResponse,
    BillingPortalResponse,
    PhotoCreateRequest,
    PhotoCreateResponse,
    PhotoReviewsResponse,
    PresignRequest,
    PresignResponse,
    InternalTaskExecuteRequest,
    ReviewCreateAsyncResponse,
    ReviewCreateRequest,
    ReviewCreateSyncResponse,
    ReviewExportResponse,
    GalleryLikeResponse,
    ReviewGetResponse,
    ReviewHistoryItem,
    ReviewHistoryResponse,
    ReviewListItem,
    ReviewMetaResponse,
    ReviewMetaUpdateRequest,
    PublicGalleryItem,
    PublicGalleryResponse,
    REVIEW_SCHEMA_VERSION,
    ReviewShareResponse,
    TaskStatusResponse,
    UsageResponse,
    AuthClerkExchangeRequest,
    AuthGuestResponse,
    AuthGoogleLoginRequest,
    AuthTokenResponse,
    GuestReviewMigrateRequest,
    GuestReviewMigrateResponse,
)
from app.services.ai import AIReviewError, run_ai_review
from app.services.clerk_auth import ClerkIdentity, verify_clerk_session_token
from app.services.clerk_webhooks import ClerkWebhookEvent, verify_clerk_webhook
from app.services.content_audit import ContentAuditError, run_content_audit
from app.services.guard import (
    guest_usage_snapshot,
    has_priority_queue,
    history_retention_days_for_plan,
    plan_review_modes,
    review_history_cutoff,
    enforce_guest_review_limits,
    enforce_user_quota,
    guest_quota_scope_key,
    guest_rate_limit_scope_key,
    get_idempotency_record,
    hash_request,
    increment_quota,
    save_idempotency_record,
    user_usage_snapshot,
)
from app.services.lemonsqueezy import (
    LemonSqueezyAPIError,
    LemonSqueezyConfigurationError,
    create_checkout_for_user,
    retrieve_subscription,
)
from app.services.lemonsqueezy_webhooks import (
    process_lemonsqueezy_webhook_event,
    record_lemonsqueezy_webhook_event,
    verify_lemonsqueezy_webhook,
)
from app.services.object_storage import get_object_storage_client
from app.services.review_task_processor import expire_review_tasks, process_review_task
from app.services.task_dispatcher import TaskDispatchError, enqueue_review_task
from app.services.task_events import record_task_event

router = APIRouter(prefix='/api/v1', tags=['v1'])
webhook_router = APIRouter(prefix='/api', tags=['webhooks'])
ALLOWED_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
logger = logging.getLogger(__name__)
UPLOAD_METRIC_KEYS = (
    'exif_extract_ms',
    'compression_ms',
    'file_read_ms',
    'preprocess_total_ms',
    'bitmap_decode_ms',
    'sha256_ms',
    'frontend_preprocess_ms',
    'presign_request_ms',
    'object_upload_ms',
    'confirm_request_ms',
    'total_upload_flow_ms',
    'original_size_bytes',
    'final_size_bytes',
)
GOOGLE_OAUTH_STATE_COOKIE = 'ps_google_oauth_state'
GOOGLE_OAUTH_STATE_TTL_SECONDS = 600
USERNAME_SANITIZE_RE = re.compile(r'[^a-z0-9_]+')
PHOTO_PROXY_TTL_SECONDS = 600
PHOTO_THUMBNAIL_SIZE = 128
PHOTO_THUMBNAIL_MAX_SIZE = 512
PHOTO_THUMBNAIL_TTL_SECONDS = 24 * 3600
PHOTO_THUMBNAIL_STABLE_WINDOW_SECONDS = 3600
PHOTO_THUMBNAIL_CACHE_CONTROL = 'private, max-age=86400, stale-while-revalidate=604800'
IMAGE_RESAMPLING = getattr(Image, 'Resampling', Image).LANCZOS
REVIEW_TAG_LIMIT = 8
REVIEW_TAG_MAX_LENGTH = 32
REVIEW_NOTE_MAX_LENGTH = 1000
GALLERY_AUDIT_NONE = 'none'
GALLERY_AUDIT_APPROVED = 'approved'
GALLERY_AUDIT_REJECTED = 'rejected'
GALLERY_AUDIT_VALUES = {GALLERY_AUDIT_NONE, GALLERY_AUDIT_APPROVED, GALLERY_AUDIT_REJECTED}
GALLERY_RECOMMEND_PERCENTILE_THRESHOLD = 80.0
GALLERY_RECOMMEND_MIN_IMAGE_TYPE_SAMPLE = 8


def _duration_ms(started_at: float) -> int:
    return int(round((time.perf_counter() - started_at) * 1000))


def _coerce_int_metric(value: Any) -> int | None:
    try:
        metric = int(value)
    except (TypeError, ValueError):
        return None
    return metric if metric >= 0 else None


def _extract_upload_metrics(client_meta: dict[str, Any]) -> dict[str, Any]:
    raw_metrics = client_meta.get('upload_metrics')
    if not isinstance(raw_metrics, dict):
        return {}

    metrics: dict[str, Any] = {}
    for key in UPLOAD_METRIC_KEYS:
        value = _coerce_int_metric(raw_metrics.get(key))
        if value is not None:
            metrics[key] = value

    compressed = raw_metrics.get('compressed')
    if isinstance(compressed, bool):
        metrics['compressed'] = compressed

    return metrics


def _emit_structured_log(*, severity: str = 'INFO', event: str, message: str, **fields: Any) -> None:
    payload = {
        'severity': severity,
        'event': event,
        'message': message,
        **fields,
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(',', ':'), default=str) + '\n')
    sys.stdout.flush()


def _build_storage_photo_url(bucket: str, object_key: str) -> str:
    _ = bucket
    base = settings.object_base_url.rstrip('/')
    return f'{base}/{quote(object_key)}'


def _build_photo_proxy_url(
    request: Request,
    photo_public_id: str,
    owner_public_id: str,
    *,
    size: int | None = None,
) -> str:
    payload = {'photo_id': photo_public_id, 'uid': owner_public_id}
    route_name = 'get_photo_image'
    query_parts = []

    if size is not None:
        route_name = 'get_photo_thumbnail'
        payload['size'] = size
        rounded_exp = (
            (int(time.time()) + PHOTO_THUMBNAIL_TTL_SECONDS + PHOTO_THUMBNAIL_STABLE_WINDOW_SECONDS - 1)
            // PHOTO_THUMBNAIL_STABLE_WINDOW_SECONDS
        ) * PHOTO_THUMBNAIL_STABLE_WINDOW_SECONDS
        photo_token = sign_payload_with_exp(payload, rounded_exp)
        query_parts.append(f'size={size}')
    else:
        photo_token = sign_payload(payload, ttl_seconds=PHOTO_PROXY_TTL_SECONDS)

    query_parts.append(f'photo_token={quote(photo_token)}')
    return str(request.url_for(route_name, photo_id=photo_public_id)).rstrip('?') + '?' + '&'.join(query_parts)


def _find_photo_from_token(db: Session, photo_id: str, photo_token: str, size: int | None = None) -> Photo:
    token_payload = verify_payload(photo_token)
    if token_payload.get('photo_id') != photo_id:
        raise api_error(status.HTTP_403_FORBIDDEN, 'PHOTO_TOKEN_INVALID', 'Invalid photo token')

    owner_public_id = token_payload.get('uid')
    if not isinstance(owner_public_id, str) or not owner_public_id.strip():
        raise api_error(status.HTTP_403_FORBIDDEN, 'PHOTO_TOKEN_INVALID', 'Invalid photo token')

    if size is not None and token_payload.get('size') != size:
        raise api_error(status.HTTP_403_FORBIDDEN, 'PHOTO_TOKEN_INVALID', 'Invalid photo token')

    photo = (
        db.query(Photo)
        .join(User, User.id == Photo.owner_user_id)
        .filter(Photo.public_id == photo_id, User.public_id == owner_public_id.strip())
        .first()
    )
    if photo is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'PHOTO_NOT_FOUND', 'Photo not found')
    return photo


def _get_photo_object(photo: Photo) -> tuple[Any, bytes]:
    try:
        storage = get_object_storage_client()
        result = storage.get_object(Bucket=photo.bucket, Key=photo.object_key)
    except Exception as exc:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'PHOTO_FETCH_FAILED', f'Failed to fetch photo: {exc}') from exc

    body = result['Body']
    try:
        return body, body.read()
    finally:
        body.close()


def _build_thumbnail_bytes(source_bytes: bytes, size: int) -> tuple[bytes, str]:
    try:
        with Image.open(BytesIO(source_bytes)) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail((size, size), IMAGE_RESAMPLING)
            if image.mode not in {'RGB', 'RGBA', 'L'}:
                image = image.convert('RGBA' if 'A' in image.mode else 'RGB')

            output = BytesIO()
            image.save(output, format='WEBP', quality=82, method=6)
            return output.getvalue(), 'image/webp'
    except UnidentifiedImageError:
        return source_bytes, 'application/octet-stream'




def _google_token_info(id_token: str) -> dict:
    query = parse.urlencode({'id_token': id_token})
    url = f'https://oauth2.googleapis.com/tokeninfo?{query}'
    with urllib_request.urlopen(url, timeout=8) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _google_exchange_code(code: str) -> dict:
    if not settings.google_oauth_client_id.strip() or not settings.google_oauth_client_secret.strip() or not settings.google_oauth_redirect_uri.strip():
        raise api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, 'GOOGLE_OAUTH_NOT_CONFIGURED', 'Google OAuth callback is not configured')

    data = parse.urlencode(
        {
            'code': code,
            'client_id': settings.google_oauth_client_id,
            'client_secret': settings.google_oauth_client_secret,
            'redirect_uri': settings.google_oauth_redirect_uri,
            'grant_type': 'authorization_code',
        }
    ).encode('utf-8')
    req = urllib_request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urllib_request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _bind_google_oauth_state(response: Response, state: str) -> None:
    is_dev = settings.app_env.strip().lower() == 'dev'
    response.set_cookie(
        key=GOOGLE_OAUTH_STATE_COOKIE,
        value=state,
        httponly=True,
        secure=not is_dev,
        samesite='lax',
        max_age=GOOGLE_OAUTH_STATE_TTL_SECONDS,
        path='/',
    )


def _clear_google_oauth_state(response: Response) -> None:
    response.delete_cookie(
        key=GOOGLE_OAUTH_STATE_COOKIE,
        path='/',
        samesite='lax',
    )


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
    candidates = [
        identity.username,
        ' '.join(part for part in [identity.first_name, identity.last_name] if part),
        identity.email.split('@', 1)[0] if '@' in identity.email else identity.email,
        f'user_{identity.user_id[-8:]}',
    ]
    for raw in candidates:
        if not raw:
            continue
        normalized = USERNAME_SANITIZE_RE.sub('_', raw.strip().lower()).strip('_')
        normalized = re.sub(r'_+', '_', normalized)
        if normalized:
            return normalized[:40]
    return f'user_{identity.user_id[-8:]}'


def _build_unique_username(db: Session, identity: ClerkIdentity, current_user_id: int | None = None) -> str:
    base = _username_seed(identity)
    candidate = base
    suffix = 2
    while True:
        existing = db.query(User).filter(User.username == candidate).first()
        if existing is None or existing.id == current_user_id:
            return candidate
        suffix_text = str(suffix)
        trimmed_base = base[: max(1, 40 - len(suffix_text) - 1)]
        candidate = f'{trimmed_base}_{suffix_text}'
        suffix += 1


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
    if not user.username or user.username.startswith('google_') or user.username.startswith('gst_'):
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


def _handle_clerk_user_deleted(db: Session, user_payload: dict[str, Any]) -> tuple[str, str | None]:
    clerk_user_id = user_payload.get('id')
    if not isinstance(clerk_user_id, str) or not clerk_user_id.strip():
        return 'ignored_missing_user_id', None

    user = db.query(User).filter(User.clerk_user_id == clerk_user_id.strip()).first()
    if user is None:
        return 'ignored_not_found', None

    user.status = UserStatus.deleted
    db.add(user)
    db.flush()
    return 'deleted', user.public_id


def _process_clerk_webhook_event(db: Session, event: ClerkWebhookEvent) -> tuple[str, str | None]:
    if event.type in {'user.created', 'user.updated'}:
        return _sync_clerk_user_from_webhook(db, event.data)
    if event.type == 'user.deleted':
        return _handle_clerk_user_deleted(db, event.data)
    return 'ignored_event_type', None


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

    guest_reviews = (
        db.query(Review)
        .filter(Review.owner_user_id == guest_user.id)
        .order_by(Review.created_at.desc(), Review.id.desc())
        .limit(recent_limit)
        .all()
    )
    if not guest_reviews:
        return 0, 0

    review_ids = [item.id for item in guest_reviews]
    photo_ids = sorted({item.photo_id for item in guest_reviews})

    migrated_reviews = (
        db.query(Review)
        .filter(Review.id.in_(review_ids), Review.owner_user_id == guest_user.id)
        .update({Review.owner_user_id: target_user.id}, synchronize_session=False)
    )

    migrated_photos = 0
    if photo_ids:
        migrated_photos = (
            db.query(Photo)
            .filter(Photo.id.in_(photo_ids), Photo.owner_user_id == guest_user.id)
            .update({Photo.owner_user_id: target_user.id}, synchronize_session=False)
        )
        db.query(ReviewTask).filter(
            ReviewTask.owner_user_id == guest_user.id,
            ReviewTask.photo_id.in_(photo_ids),
        ).update({ReviewTask.owner_user_id: target_user.id, ReviewTask.idempotency_key: None}, synchronize_session=False)

    return int(migrated_reviews or 0), int(migrated_photos or 0)


def _login_from_google_claims(claims: dict, db: Session) -> AuthTokenResponse:
    if claims.get('email_verified') not in ('true', True):
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'GOOGLE_EMAIL_UNVERIFIED', 'Google account email is not verified')

    expected_client_id = settings.google_oauth_client_id.strip()
    if expected_client_id and claims.get('aud') != expected_client_id:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'GOOGLE_AUDIENCE_INVALID', 'Invalid Google token audience')

    google_sub = claims.get('sub')
    if not isinstance(google_sub, str) or not google_sub.strip():
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'GOOGLE_SUB_MISSING', 'Invalid Google token: missing sub')
    google_sub = google_sub.strip()

    email = claims.get('email') or f'{google_sub}@google.local'
    name = claims.get('name') or claims.get('given_name') or f'google_{google_sub}'

    user = db.query(User).filter(User.public_id == google_sub).first()
    if user is None:
        user = User(
            public_id=google_sub,
            email=email,
            username=name,
            password_hash=None,
            plan=UserPlan.free,
            daily_quota_total=quota_for_plan(UserPlan.free),
            daily_quota_used=0,
            status=UserStatus.active,
            last_login_at=datetime.now(timezone.utc),
        )
        db.add(user)
    else:
        user.email = email
        user.username = name
        user.last_login_at = datetime.now(timezone.utc)
        if user.plan == UserPlan.guest:
            user.plan = UserPlan.free
        user.daily_quota_total = quota_for_plan(user.plan)
        db.add(user)

    db.commit()
    db.refresh(user)
    return _serialize_auth_response(user, provider='google')


@router.get('/auth/google/start')
def auth_google_start():
    client_id = settings.google_oauth_client_id.strip()
    redirect_uri = settings.google_oauth_redirect_uri.strip()
    if not client_id or not redirect_uri:
        raise api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, 'GOOGLE_OAUTH_NOT_CONFIGURED', 'Google OAuth is not configured')

    state = secrets.token_urlsafe(32)
    params = parse.urlencode({
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': 'openid email profile',
        'access_type': 'offline',
        'prompt': 'select_account',
        'state': state,
    })
    response = RedirectResponse(f'https://accounts.google.com/o/oauth2/v2/auth?{params}', status_code=302)
    _bind_google_oauth_state(response, state)
    return response


@router.post('/auth/guest', response_model=AuthGuestResponse)
def auth_guest(
    response: Response,
    guest_cookie_token: str | None = Cookie(default=None, alias=GUEST_TOKEN_COOKIE),
    db: Session = Depends(get_db),
):
    user = None
    if guest_cookie_token:
        try:
            existing_user = get_user_from_token(guest_cookie_token, db)
            if existing_user.plan == UserPlan.guest:
                user = existing_user
        except HTTPException:
            user = None

    if user is None:
        user = create_guest_user(db)

    token = issue_guest_token(user)
    bind_guest_token(response, token)
    return AuthGuestResponse(
        access_token=token,
        token_type='bearer',
        user_id=user.public_id,
        plan=user.plan.value,
        auth_provider='guest',
    )


@router.post('/auth/google/login', response_model=AuthTokenResponse)
def auth_google_login(payload: AuthGoogleLoginRequest, db: Session = Depends(get_db)):
    try:
        claims = _google_token_info(payload.id_token)
    except urllib_error.URLError as exc:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'GOOGLE_TOKEN_VERIFY_FAILED', 'Google token verification failed') from exc

    return _login_from_google_claims(claims, db)




@router.post('/auth/clerk/exchange', response_model=AuthTokenResponse)
def auth_clerk_exchange(
    request: Request,
    response: Response,
    payload: AuthClerkExchangeRequest | None = None,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    session_token = _extract_bearer_token(authorization)
    identity = verify_clerk_session_token(session_token)
    user = _sync_clerk_user(db, identity)
    request.state.current_user_public_id = user.public_id

    guest_token = (payload.guest_token if payload else None) or request.cookies.get(GUEST_TOKEN_COOKIE)
    recent_limit = payload.recent_limit if payload else 20
    migrated_reviews, migrated_photos = _migrate_guest_records(
        db=db,
        target_user=user,
        guest_token=guest_token,
        recent_limit=recent_limit,
        strict=False,
    )

    db.commit()
    db.refresh(user)
    response.delete_cookie(key=GUEST_TOKEN_COOKIE, path='/')
    return _serialize_auth_response(
        user,
        provider='clerk',
        clerk_user_id=identity.user_id,
        migrated_reviews=migrated_reviews,
        migrated_photos=migrated_photos,
    )


@router.post('/webhooks/clerk')
async def clerk_webhook(request: Request, db: Session = Depends(get_db)):
    event = await verify_clerk_webhook(request)
    try:
        outcome, user_public_id = _process_clerk_webhook_event(db, event)
        db.commit()
    except HTTPException as exc:
        db.rollback()
        if exc.status_code in {
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_409_CONFLICT,
        }:
            logger.warning('Clerk webhook %s ignored: %s', event.type, exc.detail)
            return {'ok': True, 'event_type': event.type, 'outcome': 'ignored_conflict'}
        raise
    except Exception:
        db.rollback()
        raise

    if user_public_id:
        request.state.current_user_public_id = user_public_id
    return {'ok': True, 'event_type': event.type, 'outcome': outcome}


async def _handle_lemonsqueezy_webhook(request: Request, db: Session) -> dict[str, Any]:
    event = await verify_lemonsqueezy_webhook(request)
    event_record, duplicate = record_lemonsqueezy_webhook_event(db, event)
    if duplicate:
        db.commit()
        return {'ok': True, 'event_name': event.event_name, 'outcome': 'duplicate'}

    try:
        outcome, user_public_id = process_lemonsqueezy_webhook_event(db, event)
        event_record.outcome = outcome
        event_record.processed_at = datetime.now(timezone.utc)
        if user_public_id:
            user = db.query(User).filter(User.public_id == user_public_id).first()
            if user is not None:
                event_record.user_id = user.id
                request.state.current_user_public_id = user_public_id
        db.add(event_record)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return {'ok': True, 'event_name': event.event_name, 'outcome': event_record.outcome}


@webhook_router.post('/webhook/lemonsqueezy')
async def lemonsqueezy_webhook(request: Request, db: Session = Depends(get_db)):
    return await _handle_lemonsqueezy_webhook(request, db)


@router.post('/webhooks/lemonsqueezy')
async def lemonsqueezy_webhook_v1(request: Request, db: Session = Depends(get_db)):
    return await _handle_lemonsqueezy_webhook(request, db)


@router.post('/auth/guest/migrate', response_model=GuestReviewMigrateResponse)
def migrate_guest_reviews(
    payload: GuestReviewMigrateRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'GUEST_MIGRATE_TARGET_INVALID', 'Please sign in before migrating guest records')

    migrated_reviews, migrated_photos = _migrate_guest_records(
        db=db,
        target_user=actor.user,
        guest_token=payload.guest_token or request.cookies.get(GUEST_TOKEN_COOKIE),
        recent_limit=payload.recent_limit,
        strict=True,
    )
    db.commit()
    return GuestReviewMigrateResponse(migrated_reviews=migrated_reviews, migrated_photos=migrated_photos)


@router.get('/auth/google/callback')
def auth_google_callback(
    code: str = Query(..., min_length=1),
    state: str = Query(..., min_length=1),
    oauth_state_cookie: str | None = Cookie(default=None, alias=GOOGLE_OAUTH_STATE_COOKIE),
    db: Session = Depends(get_db),
):
    frontend_callback = f'{settings.frontend_origin.rstrip("/")}/auth/callback/google'
    if not oauth_state_cookie or not secrets.compare_digest(state, oauth_state_cookie):
        response = RedirectResponse(f'{frontend_callback}?error=invalid_oauth_state', status_code=302)
        _clear_google_oauth_state(response)
        return response

    try:
        token_resp = _google_exchange_code(code)
    except urllib_error.URLError as exc:
        error_msg = parse.quote(f'Google code exchange failed: {exc}')
        response = RedirectResponse(f'{frontend_callback}?error={error_msg}', status_code=302)
        _clear_google_oauth_state(response)
        return response

    id_token = token_resp.get('id_token')
    if not isinstance(id_token, str) or not id_token.strip():
        response = RedirectResponse(f'{frontend_callback}?error=missing_id_token', status_code=302)
        _clear_google_oauth_state(response)
        return response

    try:
        claims = _google_token_info(id_token)
    except urllib_error.URLError as exc:
        error_msg = parse.quote(f'Token verification failed: {exc}')
        response = RedirectResponse(f'{frontend_callback}?error={error_msg}', status_code=302)
        _clear_google_oauth_state(response)
        return response

    try:
        auth_data = _login_from_google_claims(claims, db)
    except HTTPException as exc:
        error_msg = parse.quote(_http_exception_message(exc))
        response = RedirectResponse(f'{frontend_callback}?error={error_msg}', status_code=302)
        _clear_google_oauth_state(response)
        return response

    params = parse.urlencode({
        'access_token': auth_data.access_token,
        'token_type': auth_data.token_type,
        'user_id': auth_data.user_id,
        'plan': auth_data.plan,
        'auth_provider': auth_data.auth_provider,
    })
    # Use URL fragment to avoid leaking tokens through server logs and Referer headers.
    response = RedirectResponse(f'{frontend_callback}#{params}', status_code=302)
    _clear_google_oauth_state(response)
    return response




def _default_visual_analysis_payload() -> dict[str, Any]:
    return {
        'composition_guides': {
            'subject_region': None,
            'horizon_line': None,
            'leading_lines': [],
            'suggested_crop': None,
        }
    }


def _default_tonal_analysis_payload() -> dict[str, Any]:
    return {
        'brightness': None,
        'contrast': None,
        'color_balance': None,
        'saturation': None,
    }


def _is_retryable_task_error(task: ReviewTask) -> bool:
    if not task.error_code:
        return False
    if task.status == TaskStatus.PENDING and task.next_attempt_at is not None:
        return True
    if task.status == TaskStatus.RUNNING:
        return True
    return False


def _attach_billing_info(
    result_payload: dict[str, Any],
    *,
    db: Session,
    user: User,
    charged: bool,
    guest_scope_key: str | None = None,
) -> None:
    if user.plan == UserPlan.guest:
        usage = guest_usage_snapshot(db, guest_scope_key) if guest_scope_key else None
    else:
        usage = user_usage_snapshot(db, user)

    result_payload['billing_info'] = {
        'quota_charged': charged,
        'remaining_quota': (
            {
                'daily_remaining': usage.get('daily_remaining'),
                'monthly_remaining': usage.get('monthly_remaining'),
                'pro_monthly_remaining': usage.get('pro_monthly_remaining'),
            }
            if usage is not None
            else None
        ),
    }

def _serialize_task_status(task: ReviewTask, review: Review | None = None) -> dict:
    error = None
    if task.error_code or task.error_message:
        error = {
            'code': task.error_code,
            'message': task.error_message,
            'retryable': _is_retryable_task_error(task),
            'timeout': task.error_code in {'TASK_EXPIRED', 'TASK_STALLED'},
            'failure_stage': 'pre_charge',
            'quota_charged': False,
        }
    return {
        'task_id': task.public_id,
        'status': task.status.value,
        'progress': task.progress,
        'review_id': review.public_id if review else None,
        'attempt_count': task.attempt_count,
        'max_attempts': task.max_attempts,
        'next_attempt_at': task.next_attempt_at,
        'last_heartbeat_at': task.last_heartbeat_at,
        'started_at': task.started_at,
        'finished_at': task.finished_at,
        'error': error,
    }


def _load_task_snapshot(db: Session, *, task_id: str, owner_user_id: int) -> tuple[ReviewTask | None, Review | None, ReviewTaskEvent | None]:
    expire_review_tasks(db)
    task = db.query(ReviewTask).filter(ReviewTask.public_id == task_id, ReviewTask.owner_user_id == owner_user_id).first()
    if task is None:
        return None, None, None

    review = db.query(Review).filter(Review.task_id == task.id).first()
    latest_event = (
        db.query(ReviewTaskEvent)
        .filter(ReviewTaskEvent.task_id == task.id)
        .order_by(ReviewTaskEvent.created_at.desc(), ReviewTaskEvent.id.desc())
        .first()
    )
    return task, review, latest_event


def _http_exception_message(exc: HTTPException) -> str:
    detail = exc.detail
    if isinstance(detail, dict):
        return str(detail.get('message') or detail.get('detail') or 'Request failed')
    return str(detail)


@router.post('/uploads/presign', response_model=PresignResponse)
def create_upload_presign(
    payload: PresignRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    started_at = time.perf_counter()
    if payload.content_type not in ALLOWED_CONTENT_TYPES:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'CONTENT_TYPE_UNSUPPORTED', 'Unsupported content_type')
    if payload.size_bytes > settings.max_upload_bytes:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'FILE_TOO_LARGE', 'File too large')

    now = datetime.now(timezone.utc)
    ext = Path(payload.filename).suffix or '.jpg'
    object_key = f'user_{actor.user.public_id}/{now:%Y/%m}/{new_public_id("obj")}{ext}'

    token_payload = {
        'upload_id': new_public_id('upl'),
        'uid': actor.user.public_id,
        'bucket': settings.object_bucket,
        'object_key': object_key,
        'content_type': payload.content_type,
        'size_bytes': payload.size_bytes,
        'sha256': payload.sha256,
    }
    upload_id = sign_payload(token_payload, ttl_seconds=600)

    try:
        s3_client = get_object_storage_client()
        put_url = s3_client.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': settings.object_bucket,
                'Key': object_key,
                'ContentType': payload.content_type,
            },
            ExpiresIn=600,
            HttpMethod='PUT',
        )
    except Exception as exc:
        raise api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, 'UPLOAD_PRESIGN_FAILED', f'Failed to generate upload presign URL: {exc}') from exc

    db.commit()

    duration_ms = _duration_ms(started_at)
    _emit_structured_log(
        severity='INFO',
        event='upload_presign_generated',
        message='Upload presign generated',
        request_id=getattr(request.state, 'request_id', None),
        user_public_id=actor.user.public_id,
        client_ip=client_ip_from_request(request),
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        object_key=object_key,
        presign_duration_ms=duration_ms,
    )

    return PresignResponse(
        upload_id=upload_id,
        object_key=object_key,
        put_url=put_url,
        headers={'Content-Type': payload.content_type},
        expires_at=now + timedelta(minutes=10),
    )


@router.post('/photos', response_model=PhotoCreateResponse)
def confirm_photo_upload(
    payload: PhotoCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    started_at = time.perf_counter()
    client_ip = client_ip_from_request(request)
    upload_metrics = _extract_upload_metrics(payload.client_meta)
    token = verify_payload(payload.upload_id)
    if token.get('uid') != actor.user.public_id:
        raise api_error(status.HTTP_403_FORBIDDEN, 'UPLOAD_OWNER_MISMATCH', 'Upload owner mismatch')

    client_width = payload.client_meta.get('width')
    client_height = payload.client_meta.get('height')
    if client_width is not None and int(client_width) <= 0:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PHOTO_WIDTH_INVALID', 'Invalid width')
    if client_height is not None and int(client_height) <= 0:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PHOTO_HEIGHT_INVALID', 'Invalid height')

    checksum_sha256 = token.get('sha256')
    if checksum_sha256:
        existing_photo = (
            db.query(Photo)
            .filter(
                Photo.owner_user_id == actor.user.id,
                Photo.checksum_sha256 == checksum_sha256,
                Photo.status.in_([PhotoStatus.READY, PhotoStatus.REJECTED]),
            )
            .order_by(Photo.created_at.desc(), Photo.id.desc())
            .first()
        )
        if existing_photo is not None:
            db.commit()
            _emit_structured_log(
                severity='INFO',
                event='photo_upload_cache_reused',
                message='Photo upload reused from checksum cache',
                request_id=getattr(request.state, 'request_id', None),
                user_public_id=actor.user.public_id,
                client_ip=client_ip,
                photo_public_id=existing_photo.public_id,
                photo_status=existing_photo.status.value,
                object_key=existing_photo.object_key,
                confirm_processing_ms=_duration_ms(started_at),
                **upload_metrics,
            )
            return PhotoCreateResponse(
                photo_id=existing_photo.public_id,
                photo_url=_build_photo_proxy_url(request, existing_photo.public_id, actor.user.public_id),
                status=existing_photo.status.value,
            )

    photo = Photo(
        public_id=new_public_id('pho'),
        owner_user_id=actor.user.id,
        upload_id=token['upload_id'],
        bucket=token['bucket'],
        object_key=token['object_key'],
        content_type=token['content_type'],
        size_bytes=token['size_bytes'],
        checksum_sha256=checksum_sha256,
        width=client_width,
        height=client_height,
        status=PhotoStatus.READY,
        exif_data=payload.exif_data,
        client_meta=payload.client_meta,
        nsfw_label=None,
        nsfw_score=None,
        rejected_reason=None,
    )
    db.add(photo)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise api_error(status.HTTP_409_CONFLICT, 'PHOTO_ALREADY_EXISTS', 'Photo already exists') from exc
    db.refresh(photo)

    _emit_structured_log(
        severity='INFO',
        event='photo_upload_confirmed',
        message='Photo upload confirmed',
        request_id=getattr(request.state, 'request_id', None),
        user_public_id=actor.user.public_id,
        client_ip=client_ip,
        photo_public_id=photo.public_id,
        photo_status=photo.status.value,
        object_key=photo.object_key,
        size_bytes=photo.size_bytes,
        width=photo.width,
        height=photo.height,
        confirm_processing_ms=_duration_ms(started_at),
        **upload_metrics,
    )

    return PhotoCreateResponse(
        photo_id=photo.public_id,
        photo_url=_build_photo_proxy_url(request, photo.public_id, actor.user.public_id),
        status=photo.status.value,
    )

def _default_review_scores() -> dict[str, int]:
    return {
        'composition': 0,
        'lighting': 0,
        'color': 0,
        'impact': 0,
        'technical': 0,
    }


def _coerce_review_scores(raw_scores: Any) -> dict[str, int]:
    normalized = _default_review_scores()
    if not isinstance(raw_scores, dict):
        return normalized

    for key in normalized:
        value = raw_scores.get(key)
        if value is None and key == 'impact':
            value = raw_scores.get('story')
        try:
            score = int(value)
        except (TypeError, ValueError):
            continue
        normalized[key] = max(0, min(score, 10))
    return normalized


def _build_review_extensions(raw_payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    visual_analysis = raw_payload.get('visual_analysis')
    exif_info = raw_payload.get('exif_info')
    share_info = raw_payload.get('share_info')
    tonal_analysis = raw_payload.get('tonal_analysis')
    issue_marks = raw_payload.get('issue_marks')
    billing_info = raw_payload.get('billing_info')
    resolved_visual = visual_analysis if isinstance(visual_analysis, dict) else {}
    resolved_visual.setdefault('composition_guides', _default_visual_analysis_payload()['composition_guides'])
    return (
        resolved_visual,
        exif_info if isinstance(exif_info, dict) else {},
        share_info if isinstance(share_info, dict) else {},
        tonal_analysis if isinstance(tonal_analysis, dict) else _default_tonal_analysis_payload(),
        issue_marks if isinstance(issue_marks, list) else [],
        billing_info if isinstance(billing_info, dict) else {},
    )


def _normalize_review_tags(raw_tags: list[str] | None) -> list[str]:
    if not raw_tags:
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for raw_tag in raw_tags:
        if not isinstance(raw_tag, str):
            continue
        tag = re.sub(r'\s+', ' ', raw_tag).strip()
        if not tag:
            continue
        tag = tag[:REVIEW_TAG_MAX_LENGTH]
        dedupe_key = tag.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalized.append(tag)
        if len(normalized) >= REVIEW_TAG_LIMIT:
            break
    return normalized


def _normalize_review_note(raw_note: str | None) -> str | None:
    if raw_note is None:
        return None
    note = re.sub(r'\s+', ' ', str(raw_note)).strip()
    if not note:
        return None
    return note[:REVIEW_NOTE_MAX_LENGTH]


def _review_image_type(review: Review) -> str:
    raw_payload = dict(review.result_json or {})
    return str(review.image_type or raw_payload.get('image_type') or 'default')


def _review_model_version(review: Review) -> str:
    raw_payload = dict(review.result_json or {})
    return str(raw_payload.get('model_version') or review.model_name or '')


def _review_gallery_audit_status(review: Review) -> str:
    value = str(review.gallery_audit_status or '').strip().lower()
    return value if value in GALLERY_AUDIT_VALUES else GALLERY_AUDIT_NONE


def _review_gallery_summary(review: Review) -> str:
    payload = dict(review.result_json or {})
    for field_name in ('suggestions', 'critique', 'advantage'):
        raw_value = payload.get(field_name)
        if not isinstance(raw_value, str):
            continue
        for line in raw_value.splitlines():
            normalized = re.sub(r'^\d+\.\s*', '', line).strip()
            if normalized:
                return normalized[:180]
    return 'Saved to the public gallery.'


def _score_percentile(value: float, sorted_values: list[float]) -> float | None:
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return 100.0
    rank = bisect_right(sorted_values, value) - 1
    rank = max(0, min(rank, len(sorted_values) - 1))
    return round((rank / (len(sorted_values) - 1)) * 100.0, 1)


def _gallery_recommendation_map(db: Session, review_ids: list[int]) -> dict[int, dict[str, float | bool | None]]:
    if not review_ids:
        return {}

    gallery_rows = (
        db.query(Review.id, Review.image_type, Review.final_score)
        .filter(*_public_gallery_filters())
        .all()
    )
    if not gallery_rows:
        return {}

    global_scores = sorted(float(row.final_score) for row in gallery_rows)
    scores_by_type: dict[str, list[float]] = {}
    row_map: dict[int, tuple[str, float]] = {}
    for row in gallery_rows:
        image_type = str(row.image_type or 'default')
        score = float(row.final_score)
        scores_by_type.setdefault(image_type, []).append(score)
        row_map[int(row.id)] = (image_type, score)

    for scores in scores_by_type.values():
        scores.sort()

    recommendations: dict[int, dict[str, float | bool | None]] = {}
    for review_id in review_ids:
        row = row_map.get(int(review_id))
        if row is None:
            continue
        image_type, score = row
        type_scores = scores_by_type.get(image_type, [])
        percentile = (
            _score_percentile(score, type_scores)
            if len(type_scores) >= GALLERY_RECOMMEND_MIN_IMAGE_TYPE_SAMPLE
            else _score_percentile(score, global_scores)
        )
        recommendations[int(review_id)] = {
            'recommended': bool(percentile is not None and percentile >= GALLERY_RECOMMEND_PERCENTILE_THRESHOLD),
            'score_percentile': percentile,
        }
    return recommendations


def _review_meta_payload(review: Review) -> ReviewMetaResponse:
    return ReviewMetaResponse(
        review_id=review.public_id,
        favorite=bool(review.favorite),
        gallery_visible=bool(review.gallery_visible),
        gallery_audit_status=_review_gallery_audit_status(review),
        gallery_added_at=review.gallery_added_at,
        gallery_rejected_reason=review.gallery_rejected_reason,
        tags=_normalize_review_tags(review.tags_json if isinstance(review.tags_json, list) else []),
        note=review.note,
    )


def _review_source_public_id(db: Session, review: Review) -> str | None:
    if not review.source_review_id:
        return None
    source_review = db.query(Review).filter(Review.id == review.source_review_id).first()
    return source_review.public_id if source_review else None


def _review_share_info(request: Request, review: Review, *, include_token: bool) -> dict[str, Any]:
    if not review.is_public or not review.share_token:
        return {}

    payload: dict[str, Any] = {
        'enabled': True,
        'share_url': str(request.url_for('get_public_review', share_token=review.share_token)),
    }
    if include_token:
        payload['share_token'] = review.share_token
    return payload


def _review_result_payload(
    result_json: dict | None,
    final_score: float | None,
    *,
    prompt_version: str | None = None,
    model_name: str | None = None,
    model_version: str | None = None,
    exif_info: dict[str, Any] | None = None,
    share_info_override: dict[str, Any] | None = None,
) -> dict:
    raw_payload = dict(result_json or {})
    scores = _coerce_review_scores(raw_payload.get('scores'))
    visual_analysis, stored_exif_info, share_info, tonal_analysis, issue_marks, billing_info = _build_review_extensions(raw_payload)

    resolved_final_score = final_score
    if resolved_final_score is None:
        payload_score = raw_payload.get('final_score')
        try:
            resolved_final_score = float(payload_score)
        except (TypeError, ValueError):
            resolved_final_score = round(sum(scores.values()) / len(scores), 1)

    return {
        'schema_version': str(raw_payload.get('schema_version') or REVIEW_SCHEMA_VERSION),
        'prompt_version': str(raw_payload.get('prompt_version') or prompt_version or ''),
        'score_version': str(raw_payload.get('score_version') or 'legacy'),
        'model_name': str(raw_payload.get('model_name') or model_name or ''),
        'model_version': str(raw_payload.get('model_version') or model_version or ''),
        'scores': scores,
        'final_score': float(resolved_final_score),
        'advantage': str(raw_payload.get('advantage') or ''),
        'critique': str(raw_payload.get('critique') or ''),
        'suggestions': str(raw_payload.get('suggestions') or ''),
        'image_type': str(raw_payload.get('image_type') or 'default'),
        'visual_analysis': visual_analysis,
        'tonal_analysis': tonal_analysis,
        'issue_marks': issue_marks,
        'billing_info': billing_info,
        'exif_info': exif_info if isinstance(exif_info, dict) else stored_exif_info,
        'share_info': share_info_override if isinstance(share_info_override, dict) else share_info,
    }


def _find_photo_owned(db: Session, photo_public_id: str, owner_user_id: int) -> Photo:
    photo = db.query(Photo).filter(Photo.public_id == photo_public_id, Photo.owner_user_id == owner_user_id).first()
    if photo is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'PHOTO_NOT_FOUND', 'Photo not found')
    return photo


def _find_review_owned(db: Session, review_public_id: str, owner_user_id: int, *, include_deleted: bool = False) -> Review:
    query = db.query(Review).filter(Review.public_id == review_public_id, Review.owner_user_id == owner_user_id)
    if not include_deleted:
        query = query.filter(Review.deleted_at.is_(None))
    review = query.first()
    if review is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    return review


def _resolve_source_review(db: Session, actor: CurrentActor, payload: ReviewCreateRequest, photo: Photo) -> Review | None:
    if not payload.source_review_id:
        return None

    source_review = _find_review_owned(db, payload.source_review_id, actor.user.id)
    if source_review.photo_id != photo.id:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'REANALYZE_PHOTO_MISMATCH', 'Source review does not belong to this photo')
    return source_review


def _apply_review_history_visibility(query, plan: UserPlan):
    cutoff = review_history_cutoff(plan)
    if cutoff is not None:
        query = query.filter(Review.created_at >= cutoff)
    return query


def _apply_review_history_filters(
    query,
    *,
    date_field=None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    min_score: float | None = None,
    max_score: float | None = None,
    image_type: str | None = None,
    favorite_only: bool = False,
):
    active_date_field = Review.created_at if date_field is None else date_field
    query = query.filter(Review.deleted_at.is_(None))
    if created_from is not None:
        query = query.filter(active_date_field >= created_from)
    if created_to is not None:
        query = query.filter(active_date_field <= created_to)
    if min_score is not None:
        query = query.filter(Review.final_score >= min_score)
    if max_score is not None:
        query = query.filter(Review.final_score <= max_score)
    if image_type:
        query = query.filter(Review.image_type == image_type)
    if favorite_only:
        query = query.filter(Review.favorite == True)  # noqa: E712
    return query


def _review_history_item(request: Request, review: Review, photo: Photo, owner_public_id: str, source_review_id: str | None) -> ReviewHistoryItem:
    result_payload = dict(review.result_json or {})
    return ReviewHistoryItem(
        review_id=review.public_id,
        photo_id=photo.public_id,
        photo_url=_build_photo_proxy_url(request, photo.public_id, owner_public_id),
        photo_thumbnail_url=_build_photo_proxy_url(request, photo.public_id, owner_public_id, size=PHOTO_THUMBNAIL_SIZE),
        mode=review.mode.value,
        status=review.status.value,
        image_type=_review_image_type(review),
        source_review_id=source_review_id,
        final_score=float(review.final_score),
        scores=_coerce_review_scores(result_payload.get('scores')),
        model_name=str(review.model_name or ''),
        model_version=_review_model_version(review),
        favorite=bool(review.favorite),
        gallery_visible=bool(review.gallery_visible),
        gallery_audit_status=_review_gallery_audit_status(review),
        gallery_added_at=review.gallery_added_at,
        tags=_normalize_review_tags(review.tags_json if isinstance(review.tags_json, list) else []),
        note=review.note,
        is_shared=bool(review.is_public and review.share_token),
        created_at=review.created_at,
    )


def _public_gallery_item(
    request: Request,
    review: Review,
    photo: Photo,
    owner: User,
    *,
    like_count: int = 0,
    liked_by_viewer: bool = False,
    recommendation: dict[str, float | bool | None] | None = None,
) -> PublicGalleryItem:
    return PublicGalleryItem(
        review_id=review.public_id,
        photo_id=photo.public_id,
        photo_url=_build_photo_proxy_url(request, photo.public_id, owner.public_id),
        photo_thumbnail_url=_build_photo_proxy_url(request, photo.public_id, owner.public_id, size=PHOTO_THUMBNAIL_MAX_SIZE),
        mode=review.mode.value,
        image_type=_review_image_type(review),
        final_score=float(review.final_score),
        score_version=str((review.result_json or {}).get('score_version') or 'legacy'),
        summary=_review_gallery_summary(review),
        owner_username=owner.username,
        owner_avatar_url=owner.avatar_url,
        like_count=max(0, int(like_count)),
        liked_by_viewer=bool(liked_by_viewer),
        recommended=bool((recommendation or {}).get('recommended')),
        score_percentile=(
            float((recommendation or {}).get('score_percentile'))
            if (recommendation or {}).get('score_percentile') is not None
            else None
        ),
        gallery_added_at=review.gallery_added_at or review.created_at,
        created_at=review.created_at,
    )


def _gallery_like_counts(db: Session, review_ids: list[int]) -> dict[int, int]:
    if not review_ids:
        return {}

    rows = (
        db.query(ReviewLike.review_id, func.count(ReviewLike.id))
        .filter(ReviewLike.review_id.in_(review_ids))
        .group_by(ReviewLike.review_id)
        .all()
    )
    return {int(review_id): int(count) for review_id, count in rows}


def _gallery_viewer_likes(db: Session, review_ids: list[int], user_id: int | None) -> set[int]:
    if not review_ids or user_id is None:
        return set()

    rows = (
        db.query(ReviewLike.review_id)
        .filter(ReviewLike.review_id.in_(review_ids), ReviewLike.user_id == user_id)
        .all()
    )
    return {int(review_id) for (review_id,) in rows}


def _gallery_like_count(db: Session, review_id: int) -> int:
    return int(db.query(func.count(ReviewLike.id)).filter(ReviewLike.review_id == review_id).scalar() or 0)


def _public_gallery_filters() -> tuple[Any, ...]:
    return (
        Review.deleted_at.is_(None),
        Review.gallery_visible == True,  # noqa: E712
        Review.gallery_audit_status == GALLERY_AUDIT_APPROVED,
    )


def _find_public_gallery_review(db: Session, review_public_id: str) -> Review:
    review = db.query(Review).filter(Review.public_id == review_public_id, *_public_gallery_filters()).first()
    if review is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    return review


def _optional_gallery_viewer(authorization: str | None, db: Session) -> User | None:
    if not authorization:
        return None
    token = _extract_bearer_token(authorization)
    return get_user_from_token(token, db)


def _build_review_export_payload(
    *,
    review: Review,
    photo_id: str,
    photo_url: str | None,
    photo_thumbnail_url: str | None,
    source_review_id: str | None,
) -> ReviewExportResponse:
    result_payload = dict(review.result_json or {})
    return ReviewExportResponse(
        photo={
            'photo_id': photo_id,
            'photo_url': photo_url,
            'photo_thumbnail_url': photo_thumbnail_url,
        },
        review={
            'review_id': review.public_id,
            'source_review_id': source_review_id,
            'mode': review.mode.value,
            'status': review.status.value,
            'image_type': _review_image_type(review),
            'model_name': str(review.model_name or ''),
            'model_version': _review_model_version(review),
            'final_score': float(review.final_score),
            'scores': _coerce_review_scores(result_payload.get('scores')),
            'advantage': str(result_payload.get('advantage') or ''),
            'critique': str(result_payload.get('critique') or ''),
            'suggestions': str(result_payload.get('suggestions') or ''),
            'favorite': bool(review.favorite),
            'tags': _normalize_review_tags(review.tags_json if isinstance(review.tags_json, list) else []),
            'note': review.note,
            'created_at': review.created_at,
            'exported_at': datetime.now(timezone.utc),
        },
    )


def _generate_review_share_token(db: Session) -> str:
    for _ in range(5):
        share_token = secrets.token_urlsafe(18)
        exists = db.query(Review.id).filter(Review.share_token == share_token).first()
        if exists is None:
            return share_token
    raise api_error(status.HTTP_500_INTERNAL_SERVER_ERROR, 'SHARE_TOKEN_GENERATION_FAILED', 'Failed to generate share token')


@router.post('/reviews', response_model=ReviewCreateAsyncResponse | ReviewCreateSyncResponse)
def create_review(
    payload: ReviewCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest and payload.mode == ReviewMode.pro.value:
        raise api_error(status.HTTP_403_FORBIDDEN, 'PLAN_MODE_FORBIDDEN', 'Guest users cannot use pro review mode')

    mode_enum = ReviewMode(payload.mode)
    photo = _find_photo_owned(db, payload.photo_id, actor.user.id)
    source_review = _resolve_source_review(db, actor, payload, photo)
    if photo.status != PhotoStatus.READY:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PHOTO_NOT_READY', 'Photo is not ready for review')

    idempotency_key = payload.idempotency_key or request.headers.get('Idempotency-Key')
    payload_dump = json.dumps(payload.model_dump(by_alias=True), ensure_ascii=False, sort_keys=True)

    if idempotency_key:
        record = get_idempotency_record(db, actor.user.id, '/reviews', idempotency_key)
        if record is not None and record.response_json is not None:
            response_json = dict(record.response_json)
            result_payload = response_json.get('result')
            if isinstance(result_payload, dict):
                response_json['result'] = _review_result_payload(result_payload, None)
            return response_json

    if actor.plan != UserPlan.guest and source_review is None:
        existing_review = (
            db.query(Review)
            .filter(
                Review.photo_id == photo.id,
                Review.owner_user_id == actor.user.id,
                Review.mode == mode_enum,
                Review.status == ReviewStatus.SUCCEEDED,
                Review.deleted_at.is_(None),
            )
            .order_by(Review.created_at.desc(), Review.id.desc())
            .first()
        )
        if existing_review is not None:
            response_sync = {
                'review_id': existing_review.public_id,
                'status': existing_review.status.value,
                'result': _review_result_payload(
                    existing_review.result_json,
                    existing_review.final_score,
                    model_name=existing_review.model_name,
                    model_version=_review_model_version(existing_review),
                    exif_info=photo.exif_data if photo.exif_data else None,
                    share_info_override=_review_share_info(request, existing_review, include_token=True),
                ),
            }
            if idempotency_key:
                save_idempotency_record(
                    db,
                    user_id=actor.user.id,
                    endpoint='/reviews',
                    key=idempotency_key,
                    request_hash=hash_request(payload_dump),
                    http_status=200,
                    response_json=response_sync,
                )
                db.commit()
            return response_sync

    if actor.plan == UserPlan.guest:
        enforce_guest_review_limits(
            db,
            actor,
            request_scope_key=guest_rate_limit_scope_key(request, actor.user),
            quota_scope_key=guest_quota_scope_key(request, actor.user),
        )
    else:
        enforce_user_quota(db, actor.user, mode=mode_enum)

    guest_scope_key = guest_quota_scope_key(request, actor.user) if actor.plan == UserPlan.guest else None

    if payload.async_mode:
        task_payload = payload.model_dump(by_alias=True)
        if source_review is not None:
            task_payload['source_review_internal_id'] = source_review.id
        if guest_scope_key:
            task_payload['_guest_scope_key'] = guest_scope_key
        task = ReviewTask(
            public_id=new_public_id('tsk'),
            photo_id=photo.id,
            owner_user_id=actor.user.id,
            mode=mode_enum,
            status=TaskStatus.PENDING,
            idempotency_key=idempotency_key,
            request_payload=task_payload,
            attempt_count=0,
            max_attempts=3,
            progress=0,
            next_attempt_at=datetime.now(timezone.utc),
            expire_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
        db.add(task)
        try:
            db.flush()
            record_task_event(db, task, event_type='TASK_CREATED', message='Task enqueued', payload={'mode': payload.mode, 'locale': payload.locale})
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            existing = (
                db.query(ReviewTask)
                .filter(ReviewTask.owner_user_id == actor.user.id, ReviewTask.idempotency_key == idempotency_key)
                .first()
            )
            if existing:
                return {'task_id': existing.public_id, 'status': existing.status.value, 'estimated_seconds': 12}
            raise api_error(status.HTTP_409_CONFLICT, 'TASK_DUPLICATE', 'Duplicate task') from exc

        response = {'task_id': task.public_id, 'status': task.status.value, 'estimated_seconds': 12}
        if settings.cloud_tasks_enabled:
            try:
                enqueue_review_task(task.public_id)
            except TaskDispatchError as exc:
                logger.exception('Failed to enqueue Cloud Task for review task %s', task.public_id)
                db.rollback()
                failed_task = db.query(ReviewTask).filter(ReviewTask.id == task.id).first()
                if failed_task is not None:
                    failed_task.status = TaskStatus.FAILED
                    failed_task.progress = 100
                    failed_task.finished_at = datetime.now(timezone.utc)
                    failed_task.error_code = 'TASK_DISPATCH_FAILED'
                    failed_task.error_message = str(exc)[:500]
                    db.add(failed_task)
                    record_task_event(db, failed_task, event_type='TASK_DISPATCH_FAILED', message=failed_task.error_message)
                    db.commit()
                raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, 'TASK_DISPATCH_FAILED', 'Failed to enqueue async review task') from exc
        if idempotency_key:
            save_idempotency_record(
                db,
                user_id=actor.user.id,
                endpoint='/reviews',
                key=idempotency_key,
                request_hash=hash_request(payload_dump),
                http_status=200,
                response_json=response,
            )
            db.commit()
        return response

    image_url = _build_storage_photo_url(photo.bucket, photo.object_key)
    try:
        ai_response = run_ai_review(payload.mode, image_url=image_url, locale=payload.locale, exif_data=photo.exif_data or None, image_type=payload.image_type)
    except AIReviewError as exc:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'AI_REVIEW_FAILED', f'AI review failed: {exc}') from exc

    result_payload = _review_result_payload(
        ai_response.result.model_dump(),
        ai_response.result.final_score,
        prompt_version=ai_response.prompt_version,
        model_name=ai_response.model_name,
        model_version=ai_response.model_version,
        exif_info=photo.exif_data if photo.exif_data else None,
    )
    review = Review(
        public_id=new_public_id('rev'),
        task_id=None,
        photo_id=photo.id,
        owner_user_id=actor.user.id,
        source_review_id=source_review.id if source_review is not None else None,
        mode=mode_enum,
        status=ReviewStatus.SUCCEEDED,
        image_type=payload.image_type,
        schema_version=result_payload['schema_version'],
        result_json=result_payload,
        final_score=result_payload['final_score'],
        input_tokens=ai_response.input_tokens,
        output_tokens=ai_response.output_tokens,
        cost_usd=ai_response.cost_usd,
        latency_ms=ai_response.latency_ms,
        model_name=ai_response.model_name,
    )
    db.add(review)
    db.flush()
    db.add(
        UsageLedger(
            user_id=actor.user.id,
            review_id=review.id,
            task_id=None,
            usage_type='review_request',
            amount=1,
            unit='count',
            bill_date=datetime.now(timezone.utc).date(),
            metadata_json={'mode': payload.mode},
        )
    )
    increment_quota(db, actor.user)
    _attach_billing_info(result_payload, db=db, user=actor.user, charged=True, guest_scope_key=guest_scope_key)
    review.result_json = result_payload
    db.add(review)
    db.commit()
    db.refresh(review)

    response_sync = {'review_id': review.public_id, 'status': review.status.value, 'result': result_payload}
    if idempotency_key:
        save_idempotency_record(
            db,
            user_id=actor.user.id,
            endpoint='/reviews',
            key=idempotency_key,
            request_hash=hash_request(payload_dump),
            http_status=200,
            response_json=response_sync,
        )
        db.commit()
    return response_sync


@router.get('/tasks/{task_id}', response_model=TaskStatusResponse)
def get_task_status(
    task_id: str,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    task, review, _latest_event = _load_task_snapshot(db, task_id=task_id, owner_user_id=actor.user.id)
    if task is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'TASK_NOT_FOUND', 'Task not found')
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    db.commit()
    return TaskStatusResponse(**_serialize_task_status(task, review))


@router.post('/internal/tasks/reviews/execute')
def execute_review_task(payload: InternalTaskExecuteRequest, request: Request):
    if not settings.cloud_tasks_enabled:
        raise api_error(status.HTTP_404_NOT_FOUND, 'TASK_DISPATCH_DISABLED', 'Cloud Tasks execution is not enabled')
    header_secret = request.headers.get('X-Task-Dispatch-Secret', '')
    if header_secret != settings.cloud_tasks_secret:
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'TASK_DISPATCH_UNAUTHORIZED', 'Invalid task dispatch secret')
    result = process_review_task(payload.task_id, worker_name='cloud-tasks')
    if result.get('result') == 'delayed':
        raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, 'TASK_RETRY_NOT_READY', 'Task is scheduled for a later retry')
    return result


@router.get('/gallery', response_model=PublicGalleryResponse)
def list_public_gallery(
    request: Request,
    limit: int = Query(default=24, ge=1, le=60),
    cursor: str | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    min_score: float | None = Query(default=None, ge=0, le=10),
    max_score: float | None = Query(default=None, ge=0, le=10),
    image_type: str | None = Query(default=None, pattern='^(default|landscape|portrait|street|still_life|architecture)$'),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if created_from is not None and created_to is not None and created_from > created_to:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'GALLERY_FILTER_INVALID', 'created_from cannot be later than created_to')
    if min_score is not None and max_score is not None and min_score > max_score:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'GALLERY_FILTER_INVALID', 'min_score cannot be greater than max_score')

    viewer = _optional_gallery_viewer(authorization, db)
    gallery_filters = _public_gallery_filters()
    count_query = db.query(func.count(Review.id)).filter(*gallery_filters)
    count_query = _apply_review_history_filters(
        count_query,
        date_field=Review.gallery_added_at,
        created_from=created_from,
        created_to=created_to,
        min_score=min_score,
        max_score=max_score,
        image_type=image_type,
    )
    total_count = count_query.scalar() or 0
    query = (
        db.query(Review, Photo, User)
        .join(Photo, Photo.id == Review.photo_id)
        .join(User, User.id == Review.owner_user_id)
        .filter(*gallery_filters)
        .order_by(Review.gallery_added_at.desc(), Review.id.desc())
    )
    query = _apply_review_history_filters(
        query,
        date_field=Review.gallery_added_at,
        created_from=created_from,
        created_to=created_to,
        min_score=min_score,
        max_score=max_score,
        image_type=image_type,
    )

    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
        except ValueError as exc:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'CURSOR_INVALID', 'Invalid cursor') from exc
        query = query.filter(Review.gallery_added_at < cursor_dt)

    rows = query.limit(limit + 1).all()
    has_next = len(rows) > limit
    rows = rows[:limit]
    review_ids = [review.id for review, _photo, _owner in rows]
    like_counts = _gallery_like_counts(db, review_ids)
    viewer_likes = _gallery_viewer_likes(db, review_ids, None if viewer is None else viewer.id)
    recommendations = _gallery_recommendation_map(db, review_ids)
    items = [
        _public_gallery_item(
            request,
            review,
            photo,
            owner,
            like_count=like_counts.get(review.id, 0),
            liked_by_viewer=review.id in viewer_likes,
            recommendation=recommendations.get(review.id),
        )
        for review, photo, owner in rows
    ]
    next_cursor = rows[-1][0].gallery_added_at.isoformat() if has_next and rows and rows[-1][0].gallery_added_at else None

    db.commit()
    return PublicGalleryResponse(items=items, total_count=total_count, next_cursor=next_cursor)


@router.post('/gallery/{review_id}/likes', response_model=GalleryLikeResponse)
def like_public_gallery_review(
    review_id: str,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        raise api_error(status.HTTP_403_FORBIDDEN, 'GALLERY_LIKE_LOGIN_REQUIRED', 'Please sign in before liking gallery items')

    review = _find_public_gallery_review(db, review_id)
    existing = (
        db.query(ReviewLike)
        .filter(ReviewLike.review_id == review.id, ReviewLike.user_id == actor.user.id)
        .first()
    )
    if existing is None:
        db.add(ReviewLike(review_id=review.id, user_id=actor.user.id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    else:
        db.commit()

    like_count = _gallery_like_count(db, review.id)
    return GalleryLikeResponse(review_id=review.public_id, like_count=like_count, liked_by_viewer=True)


@router.delete('/gallery/{review_id}/likes', response_model=GalleryLikeResponse)
def unlike_public_gallery_review(
    review_id: str,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        raise api_error(status.HTTP_403_FORBIDDEN, 'GALLERY_LIKE_LOGIN_REQUIRED', 'Please sign in before liking gallery items')

    review = _find_public_gallery_review(db, review_id)
    (
        db.query(ReviewLike)
        .filter(ReviewLike.review_id == review.id, ReviewLike.user_id == actor.user.id)
        .delete(synchronize_session=False)
    )
    db.commit()

    like_count = _gallery_like_count(db, review.id)
    return GalleryLikeResponse(review_id=review.public_id, like_count=like_count, liked_by_viewer=False)


@router.get('/reviews/{review_id}', response_model=ReviewGetResponse)
def get_review(
    review_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    review = db.query(Review).filter(
        Review.public_id == review_id,
        Review.deleted_at.is_(None),
        (Review.owner_user_id == actor.user.id) | (Review.is_public == True),  # noqa: E712
    ).first()
    if review is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')
    is_owner = review.owner_user_id == actor.user.id
    cutoff = review_history_cutoff(actor.plan)
    if (
        cutoff is not None
        and is_owner
        and not review.is_public
        and review.created_at < cutoff
    ):
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')

    photo = db.query(Photo).filter(Photo.id == review.photo_id).first()
    if photo is not None:
        photo_owner = db.query(User).filter(User.id == photo.owner_user_id).first()
        photo_url = _build_photo_proxy_url(request, photo.public_id, photo_owner.public_id) if photo_owner else None
    else:
        photo_url = None
    db.commit()
    return ReviewGetResponse(
        review_id=review.public_id,
        photo_id=photo.public_id if photo else 'unknown',
        photo_url=photo_url,
        mode=review.mode.value,
        status=review.status.value,
        image_type=_review_image_type(review),
        source_review_id=_review_source_public_id(db, review) if is_owner else None,
        viewer_is_owner=is_owner,
        favorite=bool(review.favorite) if is_owner else False,
        gallery_visible=bool(review.gallery_visible) if is_owner else False,
        gallery_audit_status=_review_gallery_audit_status(review) if is_owner else GALLERY_AUDIT_NONE,
        gallery_added_at=review.gallery_added_at if is_owner else None,
        gallery_rejected_reason=review.gallery_rejected_reason if is_owner else None,
        tags=_normalize_review_tags(review.tags_json if isinstance(review.tags_json, list) else []) if is_owner else [],
        note=review.note if is_owner else None,
        result=_review_result_payload(
            review.result_json,
            review.final_score,
            model_name=review.model_name,
            model_version=_review_model_version(review),
            exif_info=photo.exif_data if photo and photo.exif_data else None,
            share_info_override=_review_share_info(request, review, include_token=is_owner),
        ),
        created_at=review.created_at,
        exif_data=photo.exif_data if photo and photo.exif_data else None,
    )


@router.get('/public/reviews/{share_token}', response_model=ReviewGetResponse, name='get_public_review')
def get_public_review(
    share_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    review = db.query(Review).filter(
        Review.share_token == share_token,
        Review.is_public == True,  # noqa: E712
        Review.deleted_at.is_(None),
    ).first()
    if review is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'REVIEW_NOT_FOUND', 'Review not found')

    photo = db.query(Photo).filter(Photo.id == review.photo_id).first()
    if photo is not None:
        photo_owner = db.query(User).filter(User.id == photo.owner_user_id).first()
        photo_url = _build_photo_proxy_url(request, photo.public_id, photo_owner.public_id) if photo_owner else None
    else:
        photo_url = None

    db.commit()
    return ReviewGetResponse(
        review_id=review.public_id,
        photo_id=photo.public_id if photo else 'unknown',
        photo_url=photo_url,
        mode=review.mode.value,
        status=review.status.value,
        image_type=_review_image_type(review),
        source_review_id=None,
        viewer_is_owner=False,
        favorite=False,
        gallery_visible=False,
        gallery_audit_status=GALLERY_AUDIT_NONE,
        gallery_added_at=None,
        gallery_rejected_reason=None,
        tags=[],
        note=None,
        result=_review_result_payload(
            review.result_json,
            review.final_score,
            model_name=review.model_name,
            model_version=_review_model_version(review),
            exif_info=None,
            share_info_override=_review_share_info(request, review, include_token=False),
        ),
        created_at=review.created_at,
        exif_data=None,
    )


@router.get('/me/reviews', response_model=ReviewHistoryResponse)
def list_my_reviews(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    min_score: float | None = Query(default=None, ge=0, le=10),
    max_score: float | None = Query(default=None, ge=0, le=10),
    image_type: str | None = Query(default=None, pattern='^(default|landscape|portrait|street|still_life|architecture)$'),
    favorite_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        db.commit()
        return ReviewHistoryResponse(items=[], next_cursor=None)
    if created_from is not None and created_to is not None and created_from > created_to:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'REVIEW_FILTER_INVALID', 'created_from cannot be later than created_to')
    if min_score is not None and max_score is not None and min_score > max_score:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'REVIEW_FILTER_INVALID', 'min_score cannot be greater than max_score')

    query = (
        db.query(Review, Photo)
        .join(Photo, Photo.id == Review.photo_id)
        .filter(Review.owner_user_id == actor.user.id)
        .order_by(Review.created_at.desc(), Review.id.desc())
    )
    query = _apply_review_history_visibility(query, actor.plan)
    query = _apply_review_history_filters(
        query,
        created_from=created_from,
        created_to=created_to,
        min_score=min_score,
        max_score=max_score,
        image_type=image_type,
        favorite_only=favorite_only,
    )

    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
        except ValueError as exc:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'CURSOR_INVALID', 'Invalid cursor') from exc
        query = query.filter(Review.created_at < cursor_dt)

    rows = query.limit(limit + 1).all()
    has_next = len(rows) > limit
    rows = rows[:limit]
    source_review_ids = {review.source_review_id for review, _photo in rows if review.source_review_id}
    source_review_map = {
        review_id: public_id
        for review_id, public_id in db.query(Review.id, Review.public_id).filter(Review.id.in_(source_review_ids)).all()
    } if source_review_ids else {}

    items = [
        _review_history_item(request, review, photo, actor.user.public_id, source_review_map.get(review.source_review_id))
        for review, photo in rows
    ]
    next_cursor = rows[-1][0].created_at.isoformat() if has_next and rows else None

    db.commit()
    return ReviewHistoryResponse(items=items, next_cursor=next_cursor)


@router.get('/photos/{photo_id}/reviews', response_model=PhotoReviewsResponse)
def list_photo_reviews(
    photo_id: str,
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    photo = _find_photo_owned(db, photo_id, actor.user.id)
    if actor.plan == UserPlan.guest:
        db.commit()
        return PhotoReviewsResponse(items=[], next_cursor=None)

    query = (
        db.query(Review)
        .filter(Review.photo_id == photo.id, Review.owner_user_id == actor.user.id, Review.deleted_at.is_(None))
        .order_by(Review.created_at.desc())
    )
    query = _apply_review_history_visibility(query, actor.plan)

    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
        except ValueError as exc:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'CURSOR_INVALID', 'Invalid cursor') from exc
        query = query.filter(Review.created_at < cursor_dt)

    rows = query.limit(limit + 1).all()
    has_next = len(rows) > limit
    rows = rows[:limit]

    items = [ReviewListItem(review_id=row.public_id, mode=row.mode.value, status=row.status.value) for row in rows]
    next_cursor = rows[-1].created_at.isoformat() if has_next and rows else None

    db.commit()
    return PhotoReviewsResponse(items=items, next_cursor=next_cursor)


@router.post('/reviews/{review_id}/share', response_model=ReviewShareResponse)
def enable_review_share(
    review_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    review = _find_review_owned(db, review_id, actor.user.id)
    if not review.share_token:
        review.share_token = _generate_review_share_token(db)
    review.is_public = True
    db.add(review)
    db.commit()
    db.refresh(review)
    return ReviewShareResponse(
        review_id=review.public_id,
        share_token=review.share_token,
        share_url=str(request.url_for('get_public_review', share_token=review.share_token)),
        enabled=True,
    )


@router.patch('/reviews/{review_id}/meta', response_model=ReviewMetaResponse)
def update_review_meta(
    review_id: str,
    payload: ReviewMetaUpdateRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    review = _find_review_owned(db, review_id, actor.user.id)
    photo = db.query(Photo).filter(Photo.id == review.photo_id).first()
    if payload.favorite is not None:
        review.favorite = bool(payload.favorite)
    if payload.gallery_visible is not None:
        if payload.gallery_visible and actor.plan == UserPlan.guest:
            raise api_error(status.HTTP_403_FORBIDDEN, 'GALLERY_LOGIN_REQUIRED', 'Please sign in before submitting to the gallery')

        if payload.gallery_visible:
            if photo is None:
                raise api_error(status.HTTP_404_NOT_FOUND, 'PHOTO_NOT_FOUND', 'Photo not found')
            try:
                audit_result = run_content_audit(_build_storage_photo_url(photo.bucket, photo.object_key))
            except ContentAuditError as exc:
                raise api_error(status.HTTP_502_BAD_GATEWAY, 'IMAGE_AUDIT_FAILED', f'Image content audit failed: {exc}') from exc

            review.favorite = True
            review.gallery_visible = True
            review.gallery_added_at = datetime.now(timezone.utc)
            if audit_result.safe:
                review.gallery_audit_status = GALLERY_AUDIT_APPROVED
                review.gallery_rejected_reason = None
                review.is_public = True
            else:
                review.gallery_audit_status = GALLERY_AUDIT_REJECTED
                review.gallery_rejected_reason = audit_result.reason or 'Image content did not pass gallery audit'
                review.is_public = bool(review.share_token)
        else:
            review.gallery_visible = False
            review.gallery_audit_status = GALLERY_AUDIT_NONE
            review.gallery_added_at = None
            review.gallery_rejected_reason = None
            review.is_public = bool(review.share_token)
    if payload.tags is not None:
        review.tags_json = _normalize_review_tags(payload.tags)
    if payload.note is not None:
        review.note = _normalize_review_note(payload.note)
    db.add(review)
    db.commit()
    db.refresh(review)
    return _review_meta_payload(review)


@router.get('/reviews/{review_id}/export', response_model=ReviewExportResponse)
def export_review(
    review_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    review = _find_review_owned(db, review_id, actor.user.id)
    photo = db.query(Photo).filter(Photo.id == review.photo_id).first()
    photo_public_id = photo.public_id if photo else 'unknown'
    photo_url = _build_photo_proxy_url(request, photo.public_id, actor.user.public_id) if photo else None
    photo_thumbnail_url = (
        _build_photo_proxy_url(request, photo.public_id, actor.user.public_id, size=PHOTO_THUMBNAIL_SIZE)
        if photo else None
    )
    payload = _build_review_export_payload(
        review=review,
        photo_id=photo_public_id,
        photo_url=photo_url,
        photo_thumbnail_url=photo_thumbnail_url,
        source_review_id=_review_source_public_id(db, review),
    )
    db.commit()
    return payload


@router.delete('/reviews/{review_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    review_id: str,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    review = _find_review_owned(db, review_id, actor.user.id, include_deleted=True)
    if review.deleted_at is None:
        review.deleted_at = datetime.now(timezone.utc)
        review.is_public = False
        review.gallery_visible = False
        review.gallery_audit_status = GALLERY_AUDIT_NONE
        review.gallery_added_at = None
        review.gallery_rejected_reason = None
        db.add(review)
        db.commit()
    else:
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get('/photos/{photo_id}/image', name='get_photo_image')
def get_photo_image(
    photo_id: str,
    photo_token: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    photo = _find_photo_from_token(db, photo_id, photo_token)

    try:
        storage = get_object_storage_client()
        result = storage.get_object(Bucket=photo.bucket, Key=photo.object_key)
    except Exception as exc:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'PHOTO_FETCH_FAILED', f'Failed to fetch photo: {exc}') from exc

    body = result['Body']

    def iter_body():
        try:
            yield from body.iter_chunks(chunk_size=64 * 1024)
        finally:
            body.close()

    return StreamingResponse(
        iter_body(),
        media_type=photo.content_type,
        headers={
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    )


@router.get('/photos/{photo_id}/thumbnail', name='get_photo_thumbnail')
def get_photo_thumbnail(
    photo_id: str,
    photo_token: str = Query(..., min_length=1),
    size: int = Query(default=PHOTO_THUMBNAIL_SIZE, ge=64, le=PHOTO_THUMBNAIL_MAX_SIZE),
    if_none_match: str | None = Header(default=None, alias='If-None-Match'),
    db: Session = Depends(get_db),
):
    photo = _find_photo_from_token(db, photo_id, photo_token, size=size)
    etag = hashlib.sha1(f'{photo.public_id}:{photo.updated_at.isoformat()}:{size}'.encode('utf-8')).hexdigest()
    headers = {
        'Cache-Control': PHOTO_THUMBNAIL_CACHE_CONTROL,
        'ETag': etag,
        'X-Content-Type-Options': 'nosniff',
    }

    if if_none_match == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    _, source_bytes = _get_photo_object(photo)
    thumbnail_bytes, media_type = _build_thumbnail_bytes(source_bytes, size)
    if media_type == 'application/octet-stream':
        media_type = photo.content_type

    headers['Content-Length'] = str(len(thumbnail_bytes))
    return Response(content=thumbnail_bytes, media_type=media_type, headers=headers)


@router.get('/me/usage', response_model=UsageResponse)
def get_usage(request: Request, db: Session = Depends(get_db), actor: CurrentActor = Depends(get_current_actor)):
    quota = (
        guest_usage_snapshot(db, guest_quota_scope_key(request, actor.user))
        if actor.plan == UserPlan.guest
        else user_usage_snapshot(db, actor.user)
    )
    subscription = None
    if actor.plan == UserPlan.pro:
        active_subscription = _active_subscription_for_user(db, actor.user)
        if active_subscription is not None:
            subscription = {
                'status': active_subscription.status,
                'cancelled': active_subscription.cancelled,
                'renews_at': active_subscription.renews_at,
                'ends_at': active_subscription.ends_at,
                'current_period_ends_at': _current_period_ends_at(active_subscription),
            }
    db.commit()
    return UsageResponse(
        plan=actor.plan.value,
        quota=quota,
        features={
            'review_modes': plan_review_modes(actor.plan),
            'history_retention_days': history_retention_days_for_plan(actor.plan),
            'priority_queue': has_priority_queue(actor.plan),
        },
        subscription=subscription,
        rate_limit={},
    )


def _subscription_portal_url(subscription: BillingSubscription) -> str | None:
    candidates = (
        subscription.customer_portal_url,
        subscription.customer_portal_update_subscription_url,
        subscription.update_payment_method_url,
    )
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _configured_customer_portal_url() -> str | None:
    checkout_url = settings.lemonsqueezy_pro_checkout_url.strip()
    if not checkout_url:
        return None

    parsed = urlsplit(checkout_url)
    if not parsed.scheme or not parsed.netloc:
        return None

    return urlunsplit((parsed.scheme, parsed.netloc, '/billing', '', ''))


def _is_lemonsqueezy_dashboard_url(url: str | None) -> bool:
    if not isinstance(url, str) or not url.strip():
        return False

    parsed = urlsplit(url.strip())
    return parsed.netloc == 'app.lemonsqueezy.com' and parsed.path.startswith('/dashboard')


def _customer_portal_destination(subscription: BillingSubscription) -> str | None:
    portal_url = _subscription_portal_url(subscription)
    if portal_url and not _is_lemonsqueezy_dashboard_url(portal_url):
        return portal_url
    fallback_url = _configured_customer_portal_url()
    if fallback_url and not _is_lemonsqueezy_dashboard_url(fallback_url):
        return fallback_url
    return None


def _refresh_subscription_portal_urls(db: Session, subscription: BillingSubscription) -> BillingSubscription:
    subscription_id = str(subscription.provider_subscription_id or '').strip()
    if not subscription_id:
        return subscription

    data = retrieve_subscription(subscription_id)
    attributes = data.get('attributes')
    if not isinstance(attributes, dict):
        return subscription

    urls = attributes.get('urls')
    url_map = urls if isinstance(urls, dict) else {}

    subscription.update_payment_method_url = str(
        url_map.get('update_payment_method') or subscription.update_payment_method_url or ''
    ).strip() or None
    subscription.customer_portal_url = str(url_map.get('customer_portal') or subscription.customer_portal_url or '').strip() or None
    subscription.customer_portal_update_subscription_url = str(
        url_map.get('customer_portal_update_subscription') or subscription.customer_portal_update_subscription_url or ''
    ).strip() or None
    subscription.raw_payload = data
    db.add(subscription)
    db.flush()
    return subscription


def _subscription_grants_pro_access(subscription: BillingSubscription, *, now: datetime | None = None) -> bool:
    current = now or datetime.now(timezone.utc)
    status = (subscription.status or '').strip().lower()
    if status in {'active', 'on_trial'}:
        return True
    if status == 'cancelled' and subscription.ends_at and subscription.ends_at > current:
        return True
    return False


def _current_period_ends_at(subscription: BillingSubscription) -> datetime | None:
    status = (subscription.status or '').strip().lower()
    if status == 'cancelled' and subscription.ends_at is not None:
        return subscription.ends_at
    return subscription.renews_at or subscription.ends_at or subscription.trial_ends_at


def _active_subscription_for_user(db: Session, user: User) -> BillingSubscription | None:
    for item in (
        db.query(BillingSubscription)
        .filter(BillingSubscription.user_id == user.id, BillingSubscription.provider == 'lemonsqueezy')
        .order_by(BillingSubscription.updated_at.desc(), BillingSubscription.id.desc())
    ):
        if _subscription_grants_pro_access(item):
            return item
    return None


def _best_subscription_for_portal(subscriptions: list[BillingSubscription]) -> BillingSubscription | None:
    active_with_portal: BillingSubscription | None = None
    active_without_portal: BillingSubscription | None = None
    latest_with_portal: BillingSubscription | None = None

    for subscription in subscriptions:
        portal_url = _subscription_portal_url(subscription)
        if portal_url and latest_with_portal is None:
            latest_with_portal = subscription

        if _subscription_grants_pro_access(subscription):
            if portal_url:
                active_with_portal = subscription
                break
            if active_without_portal is None:
                active_without_portal = subscription

    return active_with_portal or active_without_portal or latest_with_portal or (subscriptions[0] if subscriptions else None)


@router.post('/billing/checkout', response_model=BillingCheckoutResponse)
def create_billing_checkout(
    payload: BillingCheckoutRequest,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        raise api_error(status.HTTP_403_FORBIDDEN, 'BILLING_SIGNIN_REQUIRED', 'Please sign in before starting checkout')
    if actor.plan == UserPlan.pro:
        db.commit()
        return BillingCheckoutResponse(
            status='already_active',
            plan=payload.plan,
            message='Your account is already on Pro.',
            checkout_url=None,
        )
    try:
        checkout = create_checkout_for_user(actor.user)
    except LemonSqueezyConfigurationError as exc:
        raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, 'LEMONSQUEEZY_NOT_CONFIGURED', str(exc)) from exc
    except LemonSqueezyAPIError as exc:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'LEMONSQUEEZY_API_FAILED', str(exc)) from exc
    db.commit()
    return BillingCheckoutResponse(
        status='created',
        plan=payload.plan,
        message='Checkout created successfully.',
        checkout_url=checkout.checkout_url,
    )


@router.get('/billing/portal', response_model=BillingPortalResponse)
def get_billing_portal(
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan != UserPlan.pro:
        raise api_error(status.HTTP_403_FORBIDDEN, 'BILLING_PORTAL_PRO_REQUIRED', 'Only Pro users can manage a subscription')

    subscriptions = (
        db.query(BillingSubscription)
        .filter(
            BillingSubscription.user_id == actor.user.id,
            BillingSubscription.provider == 'lemonsqueezy',
        )
        .order_by(BillingSubscription.updated_at.desc(), BillingSubscription.id.desc())
        .all()
    )
    subscription = _best_subscription_for_portal(subscriptions)
    if subscription is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'BILLING_SUBSCRIPTION_NOT_FOUND', 'No subscription was found for this account')

    try:
        subscription = _refresh_subscription_portal_urls(db, subscription)
    except LemonSqueezyConfigurationError:
        logger.warning('Lemon Squeezy is not configured while refreshing billing portal links')
    except LemonSqueezyAPIError as exc:
        logger.warning('Failed to refresh billing portal link from Lemon Squeezy: %s', exc)

    portal_url = _customer_portal_destination(subscription)
    if not portal_url:
        raise api_error(
            status.HTTP_409_CONFLICT,
            'BILLING_PORTAL_UNAVAILABLE',
            'Your subscription is active, but the billing portal link is not ready yet',
        )

    db.commit()
    return BillingPortalResponse(
        status='ready',
        portal_url=portal_url,
        message='Billing portal ready.',
    )


@router.websocket('/ws/tasks/{task_id}')
async def stream_task_status(websocket: WebSocket, task_id: str):
    token = websocket.cookies.get('ps_guest_token')
    if not token:
        protocol_header = websocket.headers.get('sec-websocket-protocol', '')
        protocols = [item.strip() for item in protocol_header.split(',') if item.strip()]
        if len(protocols) >= 2 and protocols[0] == 'picspeak-auth':
            token = protocols[1]
    if not token:
        await websocket.close(code=4401, reason='Missing access token')
        return

    db = SessionLocal()
    try:
        try:
            user = get_user_from_token(token, db)
        except HTTPException as exc:
            await websocket.close(code=4401, reason=_http_exception_message(exc))
            return

        await websocket.accept(subprotocol='picspeak-auth')
        last_payload: str | None = None

        while True:
            task, review, latest_event = _load_task_snapshot(db, task_id=task_id, owner_user_id=user.id)
            if task is None:
                await websocket.send_json({'error': {'code': 'TASK_NOT_FOUND', 'message': 'Task not found'}})
                await websocket.close(code=4404)
                return
            payload = {
                'type': 'task.update',
                'task': _serialize_task_status(task, review),
                'event': {
                    'event_type': latest_event.event_type,
                    'message': latest_event.message,
                    'created_at': latest_event.created_at.isoformat(),
                } if latest_event else None,
            }
            encoded_payload = jsonable_encoder(payload)
            payload_json = json.dumps(encoded_payload, sort_keys=True, default=str)
            if payload_json != last_payload:
                await websocket.send_json(encoded_payload)
                last_payload = payload_json

            if task.status in {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.EXPIRED, TaskStatus.DEAD_LETTER}:
                await websocket.close(code=1000)
                return

            db.expire_all()
            await asyncio.sleep(max(settings.ws_task_poll_interval_ms, 250) / 1000)
    except WebSocketDisconnect:
        return
    finally:
        db.close()
