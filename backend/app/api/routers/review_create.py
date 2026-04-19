from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_current_actor, get_db, new_public_id
from app.api.routers.photos import _build_storage_photo_url, _find_photo_owned
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import (
    PhotoStatus,
    Review,
    ReviewMode,
    ReviewStatus,
    ReviewTask,
    TaskStatus,
    UsageLedger,
    UserPlan,
)
from app.schemas import ReviewCreateAsyncResponse, ReviewCreateRequest, ReviewCreateSyncResponse
from app.services.ai import AIReviewError, run_ai_review
from app.services.guard import (
    enforce_guest_review_limits,
    enforce_user_quota,
    get_idempotency_record,
    guest_quota_scope_key,
    guest_rate_limit_scope_key,
    hash_request,
    increment_quota,
    save_idempotency_record,
)
from app.services.task_dispatcher import TaskDispatchError, enqueue_review_task
from app.services.task_events import record_task_event
from .review_support import (
    _attach_billing_info,
    _resolve_source_review,
    _review_model_version,
    _review_result_payload,
    _review_share_info,
)

router = APIRouter(tags=['reviews'])
logger = logging.getLogger(__name__)


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
        logger.warning('AI review failed for photo %s: %s', photo.public_id, exc)
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'AI_REVIEW_FAILED', 'AI review could not be completed') from exc

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
