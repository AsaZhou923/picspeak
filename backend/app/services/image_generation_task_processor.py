from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import logging
from typing import Any
from urllib.parse import quote

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.api.deps import new_public_id
from app.core.config import settings
from app.db.models import GeneratedImage, ImageGenerationTask, Photo, PhotoStatus, TaskStatus, UsageLedger, User, UserPlan
from app.db.session import SessionLocal
from app.services.image_generation import ImageGenerationError, ImageGenerationResult, OpenAIImageGenerationClient
from app.services.image_generation_pricing import (
    estimate_image_generation_cost_usd,
    estimate_image_generation_credits,
    normalize_generation_quality,
    normalize_generation_size,
)
from app.services.object_storage import get_object_storage_client


logger = logging.getLogger(__name__)

_PUBLIC_GENERATION_ERROR_MESSAGES = {
    'OPENAI_IMAGE_GENERATION_FAILED': 'Image generation is temporarily unavailable',
    'IMAGE_GENERATION_PROCESSING_FAILED': 'Image generation could not be completed',
    'IMAGE_GENERATION_CREDITS_EXHAUSTED': 'Image generation credits are exhausted',
    'IMAGE_GENERATION_STORAGE_FAILED': 'Generated image could not be saved',
}


def count_monthly_generation_credits(db: Session, user: User, *, now: datetime | None = None) -> int:
    period_start, next_period_start = _monthly_generation_credit_period(now=now)
    return _sum_monthly_generation_credit_amount(db, user, period_start=period_start, next_period_start=next_period_start)


def count_monthly_generation_credit_consumed(db: Session, user: User, *, now: datetime | None = None) -> int:
    period_start, next_period_start = _monthly_generation_credit_period(now=now)
    consumed = (
        db.query(func.coalesce(func.sum(UsageLedger.amount), 0))
        .filter(
            UsageLedger.user_id == user.id,
            UsageLedger.usage_type == 'image_generation_credit',
            UsageLedger.bill_date >= period_start,
            UsageLedger.bill_date < next_period_start,
            UsageLedger.amount > 0,
        )
        .scalar()
    )
    return int(consumed or 0)


def count_monthly_generation_credit_grants(db: Session, user: User, *, now: datetime | None = None) -> int:
    period_start, next_period_start = _monthly_generation_credit_period(now=now)
    granted = (
        db.query(func.coalesce(func.sum(UsageLedger.amount), 0))
        .filter(
            UsageLedger.user_id == user.id,
            UsageLedger.usage_type == 'image_generation_credit',
            UsageLedger.bill_date >= period_start,
            UsageLedger.bill_date < next_period_start,
            UsageLedger.amount < 0,
        )
        .scalar()
    )
    return abs(int(granted or 0))


def _monthly_generation_credit_period(*, now: datetime | None = None):
    current = now or datetime.now(timezone.utc)
    period_start = current.date().replace(day=1)
    if period_start.month == 12:
        next_period_start = period_start.replace(year=period_start.year + 1, month=1)
    else:
        next_period_start = period_start.replace(month=period_start.month + 1)
    return period_start, next_period_start


def _sum_monthly_generation_credit_amount(
    db: Session,
    user: User,
    *,
    period_start,
    next_period_start,
) -> int:
    used = (
        db.query(func.coalesce(func.sum(UsageLedger.amount), 0))
        .filter(
            UsageLedger.user_id == user.id,
            UsageLedger.usage_type == 'image_generation_credit',
            UsageLedger.bill_date >= period_start,
            UsageLedger.bill_date < next_period_start,
        )
        .scalar()
    )
    return int(used or 0)


def monthly_generation_credit_limit_for_plan(plan: UserPlan) -> int:
    if plan == UserPlan.pro:
        return settings.image_generation_pro_monthly_credits
    if plan == UserPlan.free:
        return settings.image_generation_free_monthly_credits
    return 0


def ensure_generation_credits_available(db: Session, user: User, *, credits_needed: int) -> None:
    limit = monthly_generation_credit_limit_for_plan(user.plan)
    used = count_monthly_generation_credits(db, user)
    if used + credits_needed > limit:
        raise ValueError('IMAGE_GENERATION_CREDITS_EXHAUSTED')


def _serialize_generation_task_status(task: ImageGenerationTask, image: GeneratedImage | None = None) -> dict[str, Any]:
    request_payload = dict(getattr(task, 'request_payload', None) or {})
    error = None
    if task.error_code or task.error_message:
        retryable = task.status == TaskStatus.PENDING and task.next_attempt_at is not None
        public_message = _PUBLIC_GENERATION_ERROR_MESSAGES.get(str(task.error_code), task.error_message)
        if task.error_code == 'OPENAI_IMAGE_GENERATION_FAILED' and retryable:
            public_message = 'Image generation is temporarily unavailable; retry scheduled'
        error = {
            'code': task.error_code,
            'message': public_message,
            'retryable': retryable,
            'timeout': task.error_code in {'TASK_EXPIRED', 'TASK_STALLED'},
            'failure_stage': 'pre_charge',
            'quota_charged': False,
        }
    return {
        'task_id': task.public_id,
        'status': task.status.value if hasattr(task.status, 'value') else str(task.status),
        'progress': task.progress,
        'generation_id': image.public_id if image else None,
        'generation_mode': getattr(task, 'generation_mode', 'general'),
        'intent': getattr(task, 'intent', None),
        'source_review_id': request_payload.get('source_review_public_id'),
        'attempt_count': task.attempt_count,
        'max_attempts': task.max_attempts,
        'next_attempt_at': task.next_attempt_at,
        'last_heartbeat_at': task.last_heartbeat_at,
        'started_at': task.started_at,
        'finished_at': task.finished_at,
        'error': error,
    }


def _prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode('utf-8')).hexdigest()


_ALLOWED_OUTPUT_FORMATS = frozenset({'webp', 'png', 'jpeg'})


def generation_object_key(*, owner_public_id: str, generated_public_id: str, output_format: str, now: datetime | None = None) -> str:
    assert output_format in _ALLOWED_OUTPUT_FORMATS, f'Unsupported output_format for S3 key: {output_format!r}'
    current = now or datetime.now(timezone.utc)
    return f'generated/user_{owner_public_id}/{current:%Y/%m}/{generated_public_id}.{output_format}'


def _claim_generation_task(db: Session, task_id: int, worker_name: str) -> bool:
    now = datetime.now(timezone.utc)
    updated = (
        db.query(ImageGenerationTask)
        .filter(ImageGenerationTask.id == task_id, ImageGenerationTask.status == TaskStatus.PENDING)
        .update(
            {
                ImageGenerationTask.status: TaskStatus.RUNNING,
                ImageGenerationTask.progress: 10,
                ImageGenerationTask.attempt_count: ImageGenerationTask.attempt_count + 1,
                ImageGenerationTask.started_at: now,
                ImageGenerationTask.claimed_by: worker_name,
                ImageGenerationTask.last_heartbeat_at: now,
            },
            synchronize_session=False,
        )
    )
    if updated != 1:
        db.rollback()
        return False
    db.commit()
    return True


def claim_next_pending_image_generation_task(db: Session, *, worker_name: str) -> ImageGenerationTask | None:
    now = datetime.now(timezone.utc)
    max_running = max(1, int(settings.image_generation_worker_concurrency or 1))
    running_count = (
        db.query(func.count(ImageGenerationTask.id))
        .filter(ImageGenerationTask.status == TaskStatus.RUNNING)
        .scalar()
        or 0
    )
    if int(running_count) >= max_running:
        return None

    candidate = (
        db.query(ImageGenerationTask)
        .join(User, User.id == ImageGenerationTask.owner_user_id)
        .filter(
            ImageGenerationTask.status == TaskStatus.PENDING,
            (ImageGenerationTask.next_attempt_at.is_(None) | (ImageGenerationTask.next_attempt_at <= now)),
        )
        .order_by(
            case((User.plan == UserPlan.pro, 0), else_=1),
            ImageGenerationTask.next_attempt_at.asc().nullsfirst(),
            ImageGenerationTask.created_at.asc(),
        )
        .first()
    )
    if candidate is None:
        return None
    if not _claim_generation_task(db, candidate.id, worker_name):
        return None
    return db.query(ImageGenerationTask).filter(ImageGenerationTask.id == candidate.id).first()


def process_image_generation_task(task_public_id: str, *, worker_name: str) -> dict[str, str]:
    db = SessionLocal()
    try:
        task = db.query(ImageGenerationTask).filter(ImageGenerationTask.public_id == task_public_id).first()
        if task is None:
            return {'result': 'missing'}
        if task.status in {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.EXPIRED, TaskStatus.DEAD_LETTER}:
            return {'result': 'noop', 'status': task.status.value}
        if task.status == TaskStatus.PENDING and task.next_attempt_at and task.next_attempt_at > datetime.now(timezone.utc):
            return {'result': 'delayed', 'status': task.status.value}
        if task.status == TaskStatus.PENDING:
            if not _claim_generation_task(db, task.id, worker_name):
                return {'result': 'noop', 'status': task.status.value}
        elif task.status != TaskStatus.RUNNING:
            return {'result': 'noop', 'status': task.status.value}

        task = db.query(ImageGenerationTask).filter(ImageGenerationTask.id == task.id).first()
        if task is None:
            return {'result': 'missing'}
        try:
            _process_generation_task(db, task)
        except Exception as exc:
            logger.exception('Unhandled image generation task error for task %s', task_public_id)
            db.rollback()
            fresh_task = db.query(ImageGenerationTask).filter(ImageGenerationTask.public_id == task_public_id).first()
            if fresh_task is not None:
                _handle_generation_failure(
                    db,
                    fresh_task,
                    error_code='IMAGE_GENERATION_PROCESSING_FAILED',
                    error_message=str(exc),
                    retryable=True,
                )
            return {'result': 'failed'}
        return {'result': 'processed', 'status': task.status.value}
    finally:
        db.close()


def _process_generation_task(db: Session, task: ImageGenerationTask) -> None:
    owner = db.query(User).filter(User.id == task.owner_user_id).first()
    if owner is None:
        _handle_generation_failure(db, task, error_code='USER_NOT_FOUND', error_message='Task owner not found', retryable=False)
        return

    payload = dict(task.request_payload or {})
    quality = normalize_generation_quality(payload.get('quality') or settings.image_generation_default_quality)
    size = normalize_generation_size(payload.get('size'))
    output_format = str(payload.get('output_format') or 'webp').strip().lower() or 'webp'
    reference_count = int(payload.get('reference_image_count') or 0)
    credits = estimate_image_generation_credits(quality=quality, size=size, reference_image_count=reference_count)

    try:
        ensure_generation_credits_available(db, owner, credits_needed=credits)
    except ValueError as exc:
        _handle_generation_failure(db, task, error_code=str(exc), error_message='Image generation credits are exhausted', retryable=False)
        return

    task.progress = 60
    task.last_heartbeat_at = datetime.now(timezone.utc)
    db.add(task)
    db.commit()

    client = OpenAIImageGenerationClient()
    try:
        reference_image = _load_reference_image(db, task) if reference_count > 0 else None
        if reference_image is None:
            result = client.generate(prompt=task.prompt, quality=quality, size=size, output_format=output_format)
        else:
            result = client.edit(
                prompt=task.prompt,
                quality=quality,
                size=size,
                image_bytes=reference_image['bytes'],
                image_content_type=reference_image['content_type'],
                image_filename=reference_image['filename'],
                output_format=output_format,
                reference_image_url=reference_image['url'],
            )
    except ImageGenerationError as exc:
        _handle_generation_failure(
            db,
            task,
            error_code='OPENAI_IMAGE_GENERATION_FAILED',
            error_message=str(exc),
            retryable=True,
        )
        return

    result.cost_usd = result.cost_usd or float(
        estimate_image_generation_cost_usd(quality=quality, size=size, reference_image_count=reference_count)
    )
    output_format = _output_format_for_content_type(result.content_type, fallback=output_format)
    task.request_payload = {**payload, 'output_format': output_format}

    generated_public_id = new_public_id('gen')
    object_key = generation_object_key(
        owner_public_id=owner.public_id,
        generated_public_id=generated_public_id,
        output_format=output_format,
    )
    try:
        storage = get_object_storage_client()
        storage.put_object(
            Bucket=settings.object_bucket,
            Key=object_key,
            Body=result.image_bytes,
            ContentType=result.content_type,
        )
    except Exception as exc:
        _handle_generation_failure(
            db,
            task,
            error_code='IMAGE_GENERATION_STORAGE_FAILED',
            error_message=str(exc),
            retryable=True,
        )
        return

    _persist_successful_generation(
        db,
        task=task,
        owner=owner,
        result=result,
        bucket=settings.object_bucket,
        object_key=object_key,
        credits_charged=credits,
        generated_public_id=generated_public_id,
    )
    task.status = TaskStatus.SUCCEEDED
    task.progress = 100
    task.finished_at = datetime.now(timezone.utc)
    task.last_heartbeat_at = datetime.now(timezone.utc)
    task.error_code = None
    task.error_message = None
    db.add(task)
    db.commit()


def _load_reference_image(db: Session, task: ImageGenerationTask) -> dict[str, Any] | None:
    if not task.source_photo_id:
        return None

    photo = (
        db.query(Photo)
        .filter(
            Photo.id == task.source_photo_id,
            Photo.owner_user_id == task.owner_user_id,
            Photo.status == PhotoStatus.READY,
        )
        .first()
    )
    if photo is None:
        raise ImageGenerationError('Reference photo is not available')

    try:
        response = get_object_storage_client().get_object(Bucket=photo.bucket, Key=photo.object_key)
        body = response['Body']
        image_bytes = body.read() if hasattr(body, 'read') else b''.join(body.iter_chunks())
    except Exception as exc:
        raise ImageGenerationError('Reference photo could not be loaded') from exc

    content_type = str(response.get('ContentType') or photo.content_type or 'image/png')
    return {
        'bytes': image_bytes,
        'content_type': content_type,
        'filename': _reference_filename(photo.public_id, content_type),
        'url': _public_object_url(photo.object_key),
    }


def _public_object_url(object_key: str) -> str:
    return f'{settings.object_base_url.rstrip("/")}/{quote(str(object_key).lstrip("/"))}'


def _reference_filename(public_id: str, content_type: str) -> str:
    extension = _output_format_for_content_type(content_type, fallback='png')
    if extension == 'jpeg':
        extension = 'jpg'
    return f'{public_id}.{extension}'


def _persist_successful_generation(
    db,
    *,
    task,
    owner,
    result: ImageGenerationResult,
    bucket: str,
    object_key: str,
    credits_charged: int,
    generated_public_id: str,
) -> GeneratedImage:
    payload = dict(task.request_payload or {})
    generated = GeneratedImage(
        public_id=generated_public_id,
        task_id=task.id,
        owner_user_id=task.owner_user_id,
        source_photo_id=task.source_photo_id,
        source_review_id=task.source_review_id,
        object_bucket=bucket,
        object_key=object_key,
        content_type=result.content_type,
        intent=task.intent,
        generation_mode=task.generation_mode,
        prompt=task.prompt,
        revised_prompt=result.revised_prompt,
        model_name=result.model_name,
        model_snapshot=payload.get('model_snapshot'),
        quality=payload.get('quality', 'low'),
        size=payload.get('size', '1024x1024'),
        output_format=payload.get('output_format', 'webp'),
        input_text_tokens=result.input_text_tokens,
        input_image_tokens=result.input_image_tokens,
        output_image_tokens=result.output_image_tokens,
        cost_usd=result.cost_usd,
        credits_charged=credits_charged,
        template_key=payload.get('template_key'),
        metadata_json={
            'ai_generated': True,
            'owner_public_id': owner.public_id,
            'user_prompt': payload.get('user_prompt'),
            'style': payload.get('style'),
            'negative_prompt': payload.get('negative_prompt'),
            'image_type': payload.get('image_type'),
            'source_review_public_id': payload.get('source_review_public_id'),
        },
    )
    db.add(generated)
    db.flush()
    db.add(
        UsageLedger(
            user_id=task.owner_user_id,
            review_id=None,
            task_id=None,
            usage_type='image_generation_credit',
            amount=credits_charged,
            unit='credits',
            bill_date=datetime.now(timezone.utc).date(),
            metadata_json={
                'generation_id': generated.public_id,
                'generation_task_id': task.public_id,
                'quality': generated.quality,
                'size': generated.size,
                'generation_mode': generated.generation_mode,
            },
        )
    )
    return generated


def _output_format_for_content_type(content_type: str, *, fallback: str) -> str:
    normalized = str(content_type or '').split(';', 1)[0].strip().lower()
    if normalized == 'image/png':
        return 'png'
    if normalized == 'image/jpeg':
        return 'jpeg'
    if normalized == 'image/webp':
        return 'webp'
    return fallback


def _handle_generation_failure(
    db: Session,
    task: ImageGenerationTask,
    *,
    error_code: str,
    error_message: str,
    retryable: bool,
) -> None:
    if retryable and task.attempt_count < task.max_attempts:
        task.status = TaskStatus.PENDING
        task.progress = 0
        task.next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=10)
    else:
        task.status = TaskStatus.FAILED
        task.progress = 100
        task.finished_at = datetime.now(timezone.utc)
    task.error_code = error_code
    task.error_message = error_message[:500]
    task.last_heartbeat_at = datetime.now(timezone.utc)
    db.add(task)
    db.commit()


def make_generation_task(
    *,
    owner_user_id: int,
    prompt: str,
    request_payload: dict[str, Any],
    generation_mode: str,
    intent: str,
    source_photo_id: int | None = None,
    source_review_id: int | None = None,
    idempotency_key: str | None = None,
) -> ImageGenerationTask:
    return ImageGenerationTask(
        public_id=new_public_id('igt'),
        owner_user_id=owner_user_id,
        source_photo_id=source_photo_id,
        source_review_id=source_review_id,
        status=TaskStatus.PENDING,
        generation_mode=generation_mode,
        intent=intent,
        prompt=prompt,
        prompt_hash=_prompt_hash(prompt),
        idempotency_key=idempotency_key,
        request_payload=request_payload,
        attempt_count=0,
        max_attempts=2,
        progress=0,
        next_attempt_at=None,
    )
