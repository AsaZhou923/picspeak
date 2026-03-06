from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from urllib import error as urllib_error
from urllib import parse, request as urllib_request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentActor,
    bind_guest_token,
    create_guest_user,
    get_current_actor,
    issue_guest_token,
    new_public_id,
    quota_for_plan,
)
from app.core.config import settings
from app.core.network import client_ip_from_request
from app.core.security import create_access_token, sign_payload, verify_payload
from app.db.models import (
    Photo,
    PhotoStatus,
    Review,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    User,
    UserPlan,
    UserStatus,
)
from app.db.session import get_db
from app.schemas import (
    PhotoCreateRequest,
    PhotoCreateResponse,
    PhotoReviewsResponse,
    PresignRequest,
    PresignResponse,
    ReviewCreateAsyncResponse,
    ReviewCreateRequest,
    ReviewCreateSyncResponse,
    ReviewGetResponse,
    ReviewListItem,
    TaskStatusResponse,
    UsageResponse,
    AuthGuestResponse,
    AuthGoogleLoginRequest,
    AuthTokenResponse,
)
from app.services.ai import AIReviewError, run_ai_review
from app.services.content_audit import ContentAuditError, run_content_audit
from app.services.guard import (
    enforce_rate_limit,
    enforce_user_quota,
    get_idempotency_record,
    hash_request,
    increment_quota,
    save_idempotency_record,
)
from app.services.object_storage import get_object_storage_client

router = APIRouter(prefix='/api/v1', tags=['v1'])
ALLOWED_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/webp'}


def _build_photo_url(bucket: str, object_key: str) -> str:
    _ = bucket
    base = settings.object_base_url.rstrip('/')
    return f'{base}/{quote(object_key)}'




def _google_token_info(id_token: str) -> dict:
    query = parse.urlencode({'id_token': id_token})
    url = f'https://oauth2.googleapis.com/tokeninfo?{query}'
    with urllib_request.urlopen(url, timeout=8) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _google_exchange_code(code: str) -> dict:
    if not settings.google_oauth_client_id.strip() or not settings.google_oauth_client_secret.strip() or not settings.google_oauth_redirect_uri.strip():
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Google OAuth callback is not configured')

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


def _login_from_google_claims(claims: dict, db: Session) -> AuthTokenResponse:
    if claims.get('email_verified') not in ('true', True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Google account email is not verified')

    expected_client_id = settings.google_oauth_client_id.strip()
    if expected_client_id and claims.get('aud') != expected_client_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid Google token audience')

    google_sub = claims.get('sub')
    if not isinstance(google_sub, str) or not google_sub.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid Google token: missing sub')
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
    token = create_access_token({'sub': user.public_id, 'email': user.email, 'plan': user.plan.value, 'provider': 'google'})
    return AuthTokenResponse(access_token=token, token_type='bearer', user_id=user.public_id, plan=user.plan.value)


@router.post('/auth/guest', response_model=AuthGuestResponse)
def auth_guest(response: Response, db: Session = Depends(get_db)):
    user = create_guest_user(db)
    token = issue_guest_token(user)
    bind_guest_token(response, token)
    return AuthGuestResponse(access_token=token, token_type='bearer', user_id=user.public_id, plan=user.plan.value)


@router.post('/auth/google/login', response_model=AuthTokenResponse)
def auth_google_login(payload: AuthGoogleLoginRequest, db: Session = Depends(get_db)):
    try:
        claims = _google_token_info(payload.id_token)
    except urllib_error.URLError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f'Google token verification failed: {exc}') from exc

    return _login_from_google_claims(claims, db)


@router.get('/auth/google/callback', response_model=AuthTokenResponse)
def auth_google_callback(code: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    try:
        token_resp = _google_exchange_code(code)
    except urllib_error.URLError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f'Google code exchange failed: {exc}') from exc

    id_token = token_resp.get('id_token')
    if not isinstance(id_token, str) or not id_token.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Google token response missing id_token')

    try:
        claims = _google_token_info(id_token)
    except urllib_error.URLError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f'Google token verification failed: {exc}') from exc

    return _login_from_google_claims(claims, db)


@router.post('/uploads/presign', response_model=PresignResponse)
def create_upload_presign(
    payload: PresignRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    enforce_rate_limit(db, actor, '/uploads/presign', client_ip=client_ip_from_request(request))

    if payload.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Unsupported content_type')
    if payload.size_bytes > settings.max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='File too large')

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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f'Failed to generate upload presign URL: {exc}',
        ) from exc

    db.commit()

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
    enforce_rate_limit(db, actor, '/photos', client_ip=client_ip_from_request(request))

    token = verify_payload(payload.upload_id)
    if token.get('uid') != actor.user.public_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Upload owner mismatch')

    client_width = payload.client_meta.get('width')
    client_height = payload.client_meta.get('height')
    if client_width is not None and int(client_width) <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid width')
    if client_height is not None and int(client_height) <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid height')

    image_url = _build_photo_url(token['bucket'], token['object_key'])
    try:
        audit_result = run_content_audit(image_url=image_url)
    except ContentAuditError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f'Image content audit failed: {exc}') from exc

    photo_status = PhotoStatus.READY if audit_result.safe else PhotoStatus.REJECTED
    rejected_reason = None if audit_result.safe else (audit_result.reason or 'Image content is not allowed')

    photo = Photo(
        public_id=new_public_id('pho'),
        owner_user_id=actor.user.id,
        upload_id=token['upload_id'],
        bucket=token['bucket'],
        object_key=token['object_key'],
        content_type=token['content_type'],
        size_bytes=token['size_bytes'],
        checksum_sha256=token.get('sha256'),
        width=client_width,
        height=client_height,
        status=photo_status,
        exif_data=payload.exif_data,
        client_meta=payload.client_meta,
        nsfw_label=audit_result.label,
        nsfw_score=audit_result.nsfw_score,
        rejected_reason=rejected_reason,
    )
    db.add(photo)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Photo already exists') from exc
    db.refresh(photo)

    return PhotoCreateResponse(
        photo_id=photo.public_id,
        photo_url=image_url,
        status=photo.status.value,
    )


def _find_photo_owned(db: Session, photo_public_id: str, owner_user_id: int) -> Photo:
    photo = db.query(Photo).filter(Photo.public_id == photo_public_id, Photo.owner_user_id == owner_user_id).first()
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Photo not found')
    return photo


@router.post('/reviews', response_model=ReviewCreateAsyncResponse | ReviewCreateSyncResponse)
def create_review(
    payload: ReviewCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.user.status != UserStatus.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='User is not active')

    enforce_rate_limit(db, actor, '/reviews', client_ip=client_ip_from_request(request))
    enforce_user_quota(db, actor.user)

    photo = _find_photo_owned(db, payload.photo_id, actor.user.id)
    if photo.status != PhotoStatus.READY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Photo is not ready for review')

    idempotency_key = payload.idempotency_key or request.headers.get('Idempotency-Key')
    payload_dump = json.dumps(payload.model_dump(by_alias=True), ensure_ascii=False, sort_keys=True)

    if idempotency_key:
        record = get_idempotency_record(db, actor.user.id, '/reviews', idempotency_key)
        if record is not None and record.response_json is not None:
            return record.response_json

    mode_enum = ReviewMode(payload.mode)

    if payload.async_mode:
        task = ReviewTask(
            public_id=new_public_id('tsk'),
            photo_id=photo.id,
            owner_user_id=actor.user.id,
            mode=mode_enum,
            status=TaskStatus.PENDING,
            idempotency_key=idempotency_key,
            request_payload=payload.model_dump(by_alias=True),
            attempt_count=0,
            max_attempts=3,
            progress=0,
            expire_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
        db.add(task)
        increment_quota(db, actor.user)
        try:
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
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Duplicate task') from exc

        response = {'task_id': task.public_id, 'status': task.status.value, 'estimated_seconds': 12}
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

    image_url = _build_photo_url(photo.bucket, photo.object_key)
    try:
        ai_response = run_ai_review(payload.mode, image_url=image_url, locale=payload.locale)
    except AIReviewError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f'AI review failed: {exc}') from exc

    result = ai_response.result
    review = Review(
        public_id=new_public_id('rev'),
        task_id=None,
        photo_id=photo.id,
        owner_user_id=actor.user.id,
        mode=mode_enum,
        status=ReviewStatus.SUCCEEDED,
        schema_version=result.schema_version,
        result_json=result.model_dump(),
        final_score=result.final_score,
        input_tokens=ai_response.input_tokens,
        output_tokens=ai_response.output_tokens,
        cost_usd=ai_response.cost_usd,
        latency_ms=ai_response.latency_ms,
        model_name=ai_response.model_name,
    )
    db.add(review)
    increment_quota(db, actor.user)
    db.commit()
    db.refresh(review)

    response_sync = {'review_id': review.public_id, 'status': review.status.value, 'result': result.model_dump()}
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
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    enforce_rate_limit(db, actor, '/tasks/{task_id}', client_ip=client_ip_from_request(request))

    task = db.query(ReviewTask).filter(ReviewTask.public_id == task_id, ReviewTask.owner_user_id == actor.user.id).first()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Task not found')

    review = db.query(Review).filter(Review.task_id == task.id).first()
    error = None
    if task.error_code or task.error_message:
        error = {'code': task.error_code, 'message': task.error_message}

    db.commit()
    return TaskStatusResponse(
        task_id=task.public_id,
        status=task.status.value,
        progress=task.progress,
        review_id=review.public_id if review else None,
        error=error,
    )


@router.get('/reviews/{review_id}', response_model=ReviewGetResponse)
def get_review(
    review_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    enforce_rate_limit(db, actor, '/reviews/{review_id}', client_ip=client_ip_from_request(request))

    review = db.query(Review).filter(Review.public_id == review_id, Review.owner_user_id == actor.user.id).first()
    if review is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Review not found')

    photo = db.query(Photo).filter(Photo.id == review.photo_id).first()
    db.commit()
    return ReviewGetResponse(
        review_id=review.public_id,
        photo_id=photo.public_id if photo else 'unknown',
        mode=review.mode.value,
        status=review.status.value,
        result=review.result_json,
        created_at=review.created_at,
    )


@router.get('/photos/{photo_id}/reviews', response_model=PhotoReviewsResponse)
def list_photo_reviews(
    photo_id: str,
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    enforce_rate_limit(db, actor, '/photos/{photo_id}/reviews', client_ip=client_ip_from_request(request))

    photo = _find_photo_owned(db, photo_id, actor.user.id)

    query = db.query(Review).filter(Review.photo_id == photo.id, Review.owner_user_id == actor.user.id).order_by(Review.created_at.desc())

    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid cursor') from exc
        query = query.filter(Review.created_at < cursor_dt)

    rows = query.limit(limit + 1).all()
    has_next = len(rows) > limit
    rows = rows[:limit]

    items = [ReviewListItem(review_id=row.public_id, mode=row.mode.value, status=row.status.value) for row in rows]
    next_cursor = rows[-1].created_at.isoformat() if has_next and rows else None

    db.commit()
    return PhotoReviewsResponse(items=items, next_cursor=next_cursor)


@router.get('/me/usage', response_model=UsageResponse)
def get_usage(request: Request, db: Session = Depends(get_db), actor: CurrentActor = Depends(get_current_actor)):
    rate = enforce_rate_limit(db, actor, '/me/usage', client_ip=client_ip_from_request(request))
    db.commit()
    return UsageResponse(
        plan=actor.plan.value,
        quota={
            'daily_total': actor.user.daily_quota_total,
            'used': actor.user.daily_quota_used,
            'remaining': max(actor.user.daily_quota_total - actor.user.daily_quota_used, 0),
        },
        rate_limit=rate,
    )
