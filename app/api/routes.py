from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, new_public_id
from app.core.config import settings
from app.core.network import client_ip_from_request
from app.core.security import sign_payload, verify_payload
from app.db.models import (
    Photo,
    PhotoStatus,
    Review,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    User,
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
)
from app.services.ai import AIReviewError, run_ai_review
from app.services.guard import (
    enforce_rate_limit,
    enforce_user_quota,
    get_idempotency_record,
    hash_request,
    increment_quota,
    save_idempotency_record,
)

router = APIRouter(prefix='/api/v1', tags=['v1'])
ALLOWED_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/webp'}


def _build_photo_url(bucket: str, object_key: str) -> str:
    _ = bucket
    base = settings.object_base_url.rstrip('/')
    return f'{base}/{quote(object_key)}'


def _build_put_url(bucket: str, object_key: str) -> str:
    _ = bucket
    base = settings.object_base_url.rstrip('/')
    return f'{base}/{quote(object_key)}'



@router.post('/uploads/presign', response_model=PresignResponse)
def create_upload_presign(
    payload: PresignRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    enforce_rate_limit(db, user, '/uploads/presign', client_ip=client_ip_from_request(request))

    if payload.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Unsupported content_type')
    if payload.size_bytes > settings.max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='File too large')

    now = datetime.now(timezone.utc)
    ext = Path(payload.filename).suffix or '.jpg'
    object_key = f'user_{user.public_id}/{now:%Y/%m}/{new_public_id("obj")}{ext}'

    token_payload = {
        'upload_id': new_public_id('upl'),
        'uid': user.public_id,
        'bucket': settings.object_bucket,
        'object_key': object_key,
        'content_type': payload.content_type,
        'size_bytes': payload.size_bytes,
        'sha256': payload.sha256,
    }
    upload_id = sign_payload(token_payload, ttl_seconds=600)
    db.commit()

    return PresignResponse(
        upload_id=upload_id,
        object_key=object_key,
        put_url=_build_put_url(settings.object_bucket, object_key),
        headers={'Content-Type': payload.content_type},
        expires_at=now + timedelta(minutes=10),
    )


@router.post('/photos', response_model=PhotoCreateResponse)
def confirm_photo_upload(
    payload: PhotoCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    enforce_rate_limit(db, user, '/photos', client_ip=client_ip_from_request(request))

    token = verify_payload(payload.upload_id)
    if token.get('uid') != user.public_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Upload owner mismatch')

    client_width = payload.client_meta.get('width')
    client_height = payload.client_meta.get('height')
    if client_width is not None and int(client_width) <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid width')
    if client_height is not None and int(client_height) <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid height')

    photo = Photo(
        public_id=new_public_id('pho'),
        owner_user_id=user.id,
        upload_id=token['upload_id'],
        bucket=token['bucket'],
        object_key=token['object_key'],
        content_type=token['content_type'],
        size_bytes=token['size_bytes'],
        checksum_sha256=token.get('sha256'),
        width=client_width,
        height=client_height,
        status=PhotoStatus.READY,
        exif_data=payload.exif_data,
        client_meta=payload.client_meta,
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
        photo_url=_build_photo_url(photo.bucket, photo.object_key),
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
    user: User = Depends(get_current_user),
):
    if user.status != UserStatus.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='User is not active')

    enforce_rate_limit(db, user, '/reviews', client_ip=client_ip_from_request(request))
    enforce_user_quota(user)

    photo = _find_photo_owned(db, payload.photo_id, user.id)
    if photo.status != PhotoStatus.READY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Photo is not ready for review')

    idempotency_key = payload.idempotency_key or request.headers.get('Idempotency-Key')
    payload_dump = json.dumps(payload.model_dump(by_alias=True), ensure_ascii=False, sort_keys=True)

    if idempotency_key:
        record = get_idempotency_record(db, user.id, '/reviews', idempotency_key)
        if record is not None and record.response_json is not None:
            return record.response_json

    mode_enum = ReviewMode(payload.mode)

    if payload.async_mode:
        task = ReviewTask(
            public_id=new_public_id('tsk'),
            photo_id=photo.id,
            owner_user_id=user.id,
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
        increment_quota(db, user)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            existing = (
                db.query(ReviewTask)
                .filter(ReviewTask.owner_user_id == user.id, ReviewTask.idempotency_key == idempotency_key)
                .first()
            )
            if existing:
                return {'task_id': existing.public_id, 'status': existing.status.value, 'estimated_seconds': 12}
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Duplicate task') from exc

        response = {'task_id': task.public_id, 'status': task.status.value, 'estimated_seconds': 12}
        if idempotency_key:
            save_idempotency_record(
                db,
                user_id=user.id,
                endpoint='/reviews',
                key=idempotency_key,
                request_hash=hash_request(payload_dump),
                http_status=200,
                response_json=response,
            )
            db.commit()
        return response

    image_url = _build_put_url(photo.bucket, photo.object_key)
    try:
        ai_response = run_ai_review(payload.mode, image_url=image_url)
    except AIReviewError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f'AI review failed: {exc}') from exc

    result = ai_response.result
    review = Review(
        public_id=new_public_id('rev'),
        task_id=None,
        photo_id=photo.id,
        owner_user_id=user.id,
        mode=mode_enum,
        status=ReviewStatus.SUCCEEDED,
        schema_version=result.schema_version,
        result_json=result.model_dump(),
        input_tokens=ai_response.input_tokens,
        output_tokens=ai_response.output_tokens,
        cost_usd=ai_response.cost_usd,
        latency_ms=ai_response.latency_ms,
        model_name=ai_response.model_name,
    )
    db.add(review)
    increment_quota(db, user)
    db.commit()
    db.refresh(review)

    response_sync = {'review_id': review.public_id, 'status': review.status.value, 'result': result.model_dump()}
    if idempotency_key:
        save_idempotency_record(
            db,
            user_id=user.id,
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
    user: User = Depends(get_current_user),
):
    enforce_rate_limit(db, user, '/tasks/{task_id}', client_ip=client_ip_from_request(request))

    task = db.query(ReviewTask).filter(ReviewTask.public_id == task_id, ReviewTask.owner_user_id == user.id).first()
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
    user: User = Depends(get_current_user),
):
    enforce_rate_limit(db, user, '/reviews/{review_id}', client_ip=client_ip_from_request(request))

    review = db.query(Review).filter(Review.public_id == review_id, Review.owner_user_id == user.id).first()
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
    user: User = Depends(get_current_user),
):
    enforce_rate_limit(db, user, '/photos/{photo_id}/reviews', client_ip=client_ip_from_request(request))

    photo = _find_photo_owned(db, photo_id, user.id)

    query = db.query(Review).filter(Review.photo_id == photo.id, Review.owner_user_id == user.id).order_by(Review.created_at.desc())

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
def get_usage(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rate = enforce_rate_limit(db, user, '/me/usage', client_ip=client_ip_from_request(request))
    db.commit()
    return UsageResponse(
        plan=user.plan.value,
        quota={
            'daily_total': user.daily_quota_total,
            'used': user.daily_quota_used,
            'remaining': max(user.daily_quota_total - user.daily_quota_used, 0),
        },
        rate_limit=rate,
    )
