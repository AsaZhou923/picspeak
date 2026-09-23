from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.api.deps import CurrentActor, get_current_actor, get_db, new_public_id
from app.api.routers.photos import _build_storage_photo_url, _find_photo_owned
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import (
    PhotoStatus,
    Photo,
    PracticeAttempt,
    PracticeSession,
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
from app.services.retake_comparison import run_retake_comparison
from app.services.practice import prepare_practice_attempt_for_task
from app.services.review_score_cache import (
    canonical_score_cache_lease,
    review_uses_current_full_review_contract,
    writer_contract_for_review_request,
)
from .review_support import (
    _attach_billing_info,
    _resolve_source_review,
    _review_model_version,
    _review_result_payload,
    _review_share_info,
)

router = APIRouter(tags=['reviews'])
logger = logging.getLogger(__name__)


def _replay_review_response(db: Session, actor: CurrentActor, stored_response: dict) -> dict:
    response = dict(stored_response)
    task_id = response.get('task_id')
    if task_id:
        task = db.query(ReviewTask).filter(
            ReviewTask.public_id == task_id, ReviewTask.owner_user_id == actor.user.id,
        ).first()
        if task is not None and isinstance(task.status, TaskStatus):
            response['status'] = task.status.value
    result = response.get('result')
    if isinstance(result, dict):
        response['result'] = _review_result_payload(result, None)
    return response


def _review_request_hash_payload(db: Session, actor: CurrentActor, payload: ReviewCreateRequest) -> dict:
    payload_for_hash = payload.model_dump(by_alias=True)
    payload_for_hash.pop('idempotency_key', None)
    if payload.practice_session_id:
        session = (
            db.query(PracticeSession)
            .filter(PracticeSession.public_id == payload.practice_session_id, PracticeSession.owner_user_id == actor.user.id)
            .first()
        )
        if session is not None:
            payload_for_hash['practice_frozen_goal'] = {
                'practice_kind': session.practice_kind,
                'source_review_id': session.source_review_id,
                'source_photo_id': session.source_photo_id,
                'goal_snapshot': session.goal_snapshot,
                'success_criteria': session.success_criteria,
                'locale': session.locale,
            }
    return payload_for_hash


def _matches_request_hash(stored_hash: str, request_hash: str, payload: ReviewCreateRequest) -> bool:
    if stored_hash == request_hash:
        return True
    if payload.practice_session_id:
        return False
    # Records from the pre-practice application included the transport key in
    # their hash. Preserve exact legacy replays across the additive deployment.
    legacy_payload = payload.model_dump(by_alias=True, exclude={'practice_session_id'})
    return stored_hash == hash_request(json.dumps(legacy_payload, ensure_ascii=False, sort_keys=True))


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
    payload_dump = json.dumps(_review_request_hash_payload(db, actor, payload), ensure_ascii=False, sort_keys=True)
    request_hash = hash_request(payload_dump)

    if idempotency_key:
        record = get_idempotency_record(db, actor.user.id, '/reviews', idempotency_key)
        if record is not None and not _matches_request_hash(record.request_hash, request_hash, payload):
            raise api_error(status.HTTP_409_CONFLICT, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with different review content')
        if record is not None and record.response_json is not None:
            return _replay_review_response(db, actor, record.response_json)

    if payload.practice_session_id and not payload.async_mode:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'PRACTICE_ASYNC_REQUIRED', 'Practice attempts must be created asynchronously')

    if actor.plan != UserPlan.guest and source_review is None and not payload.practice_session_id:
        requested_writer_model_name = writer_contract_for_review_request(
            mode=payload.mode,
            review_model=payload.review_model,
        )
        existing_query = db.query(Review).filter(
            Review.photo_id == photo.id,
            Review.owner_user_id == actor.user.id,
            Review.mode == mode_enum,
            Review.status == ReviewStatus.SUCCEEDED,
            Review.deleted_at.is_(None),
        )
        if payload.review_model == 'gpt-5.6-luna':
            existing_query = existing_query.filter(Review.model_name.ilike('%gpt-5.6-luna%'))
        else:
            existing_query = existing_query.filter(
                or_(Review.model_name.is_(None), ~Review.model_name.ilike('%gpt-%'))
            )
        existing_reviews = (
            existing_query
            .order_by(Review.created_at.desc(), Review.id.desc())
            .limit(20)
            .all()
        )
        existing_review = next(
            (
                review
                for review in existing_reviews
                if review_uses_current_full_review_contract(
                    review,
                    writer_model_name=requested_writer_model_name,
                )
            ),
            None,
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
                    request_hash=request_hash,
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
        task_payload['_request_hash'] = request_hash
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
        response = None
        try:
            db.flush()
            practice_attempt = prepare_practice_attempt_for_task(
                db,
                actor,
                payload=payload,
                photo=photo,
                task=task,
            )
            record_task_event(
                db,
                task,
                event_type='TASK_CREATED',
                message='Task enqueued',
                payload={
                    'mode': payload.mode,
                    'locale': payload.locale,
                    'analysis_type': payload.analysis_type,
                    'review_model': payload.review_model,
                },
            )
            response = {
                'task_id': task.public_id,
                'status': task.status.value,
                'estimated_seconds': 12,
                'practice_session_id': payload.practice_session_id,
                'practice_attempt_id': practice_attempt.public_id if practice_attempt is not None else None,
            }
            if idempotency_key:
                save_idempotency_record(
                    db,
                    user_id=actor.user.id,
                    endpoint='/reviews',
                    key=idempotency_key,
                    request_hash=request_hash,
                    http_status=200,
                    response_json=response,
                )
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            if idempotency_key:
                record = get_idempotency_record(db, actor.user.id, '/reviews', idempotency_key)
                if record is not None and not _matches_request_hash(record.request_hash, request_hash, payload):
                    raise api_error(status.HTTP_409_CONFLICT, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with different review content') from exc
                if record is not None and record.response_json is not None:
                    return _replay_review_response(db, actor, record.response_json)
            existing = (
                db.query(ReviewTask)
                .filter(ReviewTask.owner_user_id == actor.user.id, ReviewTask.idempotency_key == idempotency_key)
                .first()
            )
            if existing:
                existing_hash = (existing.request_payload or {}).get('_request_hash')
                if not existing_hash:
                    try:
                        existing_payload = ReviewCreateRequest.model_validate(existing.request_payload or {})
                        existing_hash = hash_request(json.dumps(
                            _review_request_hash_payload(db, actor, existing_payload), ensure_ascii=False, sort_keys=True,
                        ))
                    except ValidationError:
                        existing_hash = ''
                if not _matches_request_hash(existing_hash, request_hash, payload):
                    raise api_error(status.HTTP_409_CONFLICT, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with different review content') from exc
                attempt_public_id = (
                    db.query(PracticeAttempt.public_id)
                    .filter(PracticeAttempt.task_id == existing.id)
                    .scalar()
                )
                return {
                    'task_id': existing.public_id,
                    'status': existing.status.value,
                    'estimated_seconds': 12,
                    'practice_session_id': payload.practice_session_id,
                    'practice_attempt_id': attempt_public_id,
                }
            raise api_error(status.HTTP_409_CONFLICT, 'TASK_DUPLICATE', 'Duplicate task') from exc

        assert response is not None
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
        return response

    image_url = _build_storage_photo_url(photo.object_key)
    try:
        if payload.analysis_type == 'retake_compare':
            if source_review is None:
                raise AIReviewError('Retake comparison source review is missing')
            source_photo = (
                db.query(Photo)
                .filter(Photo.id == source_review.photo_id, Photo.owner_user_id == actor.user.id)
                .first()
            )
            if source_photo is None or source_photo.status != PhotoStatus.READY:
                raise AIReviewError('Retake comparison source photo is not ready')
            ai_response = run_retake_comparison(
                original_image_url=_build_storage_photo_url(source_photo.object_key),
                retake_image_url=image_url,
                original_review_id=source_review.public_id,
                original_photo_id=source_photo.public_id,
                retake_photo_id=photo.public_id,
                locale=payload.locale,
                image_type=payload.image_type,
            )
        else:
            with canonical_score_cache_lease(
                db,
                photo=photo,
                image_type=payload.image_type,
            ) as canonical_score:
                ai_response = run_ai_review(
                    payload.mode,
                    image_url=image_url,
                    locale=payload.locale,
                    exif_data=photo.exif_data or None,
                    image_type=payload.image_type,
                    review_model=payload.review_model,
                    canonical_score=canonical_score,
                )
    except AIReviewError as exc:
        logger.warning('AI review failed for photo %s: %s', photo.public_id, exc)
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'AI_REVIEW_FAILED', 'AI review could not be completed') from exc

    result_payload = _review_result_payload(
        ai_response.result.model_dump(),
        ai_response.result.final_score,
        prompt_version=ai_response.prompt_version,
        model_name=ai_response.model_name,
        model_version=ai_response.model_version,
        scorer_model_name=ai_response.scorer_model_name,
        scorer_model_version=ai_response.scorer_model_version,
        writer_model_name=ai_response.writer_model_name,
        writer_model_version=ai_response.writer_model_version,
        score_prompt_version=ai_response.score_prompt_version,
        scorer_preprocess_version=ai_response.scorer_preprocess_version,
        score_cache_hit=ai_response.score_cache_hit,
        exif_info=photo.exif_data if photo.exif_data else None,
    )
    if ai_response.cost_rate_version:
        result_payload.setdefault('billing_info', {})['cost_rate_version'] = ai_response.cost_rate_version
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
        cost_rate_version=ai_response.cost_rate_version,
        latency_ms=ai_response.latency_ms,
        model_name=ai_response.model_name,
        scorer_model_name=ai_response.scorer_model_name,
        writer_model_name=ai_response.writer_model_name,
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
            metadata_json={
                'mode': payload.mode,
                'analysis_type': payload.analysis_type,
                'review_model': payload.review_model,
                'scorer_model': ai_response.scorer_model_name,
                'writer_model': ai_response.writer_model_name,
            },
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
            request_hash=request_hash,
            http_status=200,
            response_json=response_sync,
        )
        db.commit()
    return response_sync
