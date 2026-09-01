from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
from io import BytesIO
import logging
from numbers import Number
from typing import Any
from urllib.parse import quote
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import case, func, text
from sqlalchemy.orm import Session

from app.api.deps import new_public_id
from app.core.config import settings
from app.db.models import (
    GeneratedImage,
    ImageGenerationTask,
    Photo,
    PhotoStatus,
    ProductAnalyticsEvent,
    TaskStatus,
    User,
    UserPlan,
)
from app.db.session import SessionLocal
from app.services.generation_credit_reservations import (
    GenerationCreditReservationError,
    consume_generation_credit_reservation,
    count_monthly_generation_credit_consumed as _count_monthly_generation_credit_consumed,
    count_monthly_generation_credit_grants as _count_monthly_generation_credit_grants,
    count_monthly_generation_credit_holds as _count_monthly_generation_credit_holds,
    count_monthly_generation_credits as _count_monthly_generation_credits,
    ensure_generation_credits_available as _ensure_generation_credits_available,
    monthly_generation_credit_limit_for_plan,
    release_generation_credit_reservation,
    require_held_generation_credit_reservation,
)
from app.services.image_generation import ImageGenerationError, ImageGenerationResult, OpenAIImageGenerationClient
from app.services.image_generation_pricing import (
    estimate_image_generation_cost_usd,
    estimate_image_generation_credits,
    normalize_generation_quality,
    normalize_generation_size,
)
from app.services.object_storage import get_object_storage_client
from app.services.product_analytics import record_product_event


logger = logging.getLogger(__name__)

_PUBLIC_GENERATION_ERROR_MESSAGES = {
    'OPENAI_IMAGE_GENERATION_FAILED': 'Image generation is temporarily unavailable',
    'IMAGE_GENERATION_PROCESSING_FAILED': 'Image generation could not be completed',
    'IMAGE_GENERATION_CREDITS_EXHAUSTED': 'Image generation credits are exhausted',
    'IMAGE_GENERATION_STORAGE_FAILED': 'Generated image could not be saved',
    'IMAGE_GENERATION_PERSISTENCE_FAILED': 'Generated image could not be saved',
}


def count_monthly_generation_credits(db: Session, user: User, *, now: datetime | None = None) -> int:
    return _count_monthly_generation_credits(db, user, now=now)


def count_monthly_generation_credit_consumed(db: Session, user: User, *, now: datetime | None = None) -> int:
    return _count_monthly_generation_credit_consumed(db, user, now=now)


def count_monthly_generation_credit_grants(db: Session, user: User, *, now: datetime | None = None) -> int:
    return _count_monthly_generation_credit_grants(db, user, now=now)


def count_monthly_generation_credit_holds(db: Session, user: User, *, now: datetime | None = None) -> int:
    return _count_monthly_generation_credit_holds(db, user, now=now)


def ensure_generation_credits_available(db: Session, user: User, *, credits_needed: int) -> None:
    _ensure_generation_credits_available(db, user, credits_needed=credits_needed)


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
_REFERENCE_IMAGE_MAX_EDGE = 2048
_GENERATION_CLAIM_ADVISORY_LOCK_KEY = 918_203_041
_TERMINAL_GENERATION_EVENTS = frozenset({'generation_succeeded', 'generation_failed'})
_SERVER_OWNED_GENERATION_EVENTS = frozenset({'generation_requested', *_TERMINAL_GENERATION_EVENTS})
_PENDING_REQUEST_EVENT_KEY = 'pending_request_event'
_PENDING_TERMINAL_EVENT_KEY = 'pending_terminal_event'


def generation_object_key(*, owner_public_id: str, generated_public_id: str, output_format: str, now: datetime | None = None) -> str:
    assert output_format in _ALLOWED_OUTPUT_FORMATS, f'Unsupported output_format for S3 key: {output_format!r}'
    current = now or datetime.now(timezone.utc)
    return f'generated/user_{owner_public_id}/{current:%Y/%m}/{generated_public_id}.{output_format}'


def _generation_task_stale_timeout_seconds() -> int:
    configured_timeout = int(getattr(settings, 'image_generation_task_stale_timeout_seconds', 0) or 0)
    provider_timeout = int(getattr(settings, 'image_generation_timeout_seconds', 180) or 180)
    return max(configured_timeout, provider_timeout + 60, 60)


def _generation_retry_delay_seconds(attempt_count: int) -> int:
    base = max(int(settings.review_retry_base_delay_seconds), 1)
    max_delay = max(int(settings.review_retry_max_delay_seconds), base)
    return min(base * (2 ** max(attempt_count - 1, 0)), max_delay)


def expire_image_generation_tasks(db: Session) -> None:
    _reconcile_pending_generation_request_events(db)
    _reconcile_pending_generation_terminal_events(db)
    _reconcile_completed_generation_tasks(db)
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(seconds=_generation_task_stale_timeout_seconds())
    stalled_tasks = (
        db.query(ImageGenerationTask)
        .filter(
            ImageGenerationTask.status == TaskStatus.RUNNING,
            ImageGenerationTask.finished_at.is_(None),
            (
                (ImageGenerationTask.last_heartbeat_at.is_not(None) & (ImageGenerationTask.last_heartbeat_at < stale_cutoff))
                | (
                    ImageGenerationTask.last_heartbeat_at.is_(None)
                    & ImageGenerationTask.started_at.is_not(None)
                    & (ImageGenerationTask.started_at < stale_cutoff)
                )
            ),
        )
        .all()
    )
    if not stalled_tasks:
        return

    terminal_events: list[tuple[ImageGenerationTask, User, str, dict[str, Any]]] = []
    for task in stalled_tasks:
        if task.attempt_count < task.max_attempts:
            retry_at = now + timedelta(seconds=_generation_retry_delay_seconds(task.attempt_count))
            task.status = TaskStatus.PENDING
            task.progress = 0
            task.error_code = 'TASK_STALLED'
            task.error_message = 'Image generation heartbeat stalled; retry scheduled'
            task.next_attempt_at = retry_at
            task.claimed_by = None
            task.started_at = None
            task.last_heartbeat_at = now
        else:
            task.status = TaskStatus.DEAD_LETTER
            task.progress = 100
            task.error_code = 'TASK_STALLED'
            task.error_message = 'Image generation heartbeat stalled and max retries were exhausted'
            task.finished_at = now
            task.last_heartbeat_at = now
            release_generation_credit_reservation(db, task=task, reason='TASK_STALLED')
            owner = db.query(User).filter(User.id == task.owner_user_id).first()
            if owner is not None:
                metadata = _generation_failure_event_metadata(task, 'TASK_STALLED')
                stage_generation_terminal_event(task, event_name='generation_failed', metadata=metadata)
                terminal_events.append(
                    (task, owner, 'generation_failed', metadata)
                )
        db.add(task)
    db.commit()
    _record_terminal_generation_events_after_state_commit(db, terminal_events)


def _reconcile_completed_generation_tasks(db: Session) -> None:
    now = datetime.now(timezone.utc)
    completed_pairs = (
        db.query(ImageGenerationTask, GeneratedImage)
        .join(GeneratedImage, GeneratedImage.task_id == ImageGenerationTask.id)
        .filter(
            ImageGenerationTask.status.in_([TaskStatus.PENDING, TaskStatus.RUNNING]),
            GeneratedImage.deleted_at.is_(None),
        )
        .all()
    )
    if not completed_pairs:
        return

    terminal_events: list[tuple[ImageGenerationTask, User, str, dict[str, Any]]] = []
    for task, image in completed_pairs:
        try:
            consume_generation_credit_reservation(
                db,
                task=task,
                usage_metadata={
                    'generation_id': image.public_id,
                    'quality': image.quality,
                    'size': image.size,
                    'generation_mode': image.generation_mode,
                    'reconciled': True,
                },
            )
        except GenerationCreditReservationError:
            logger.warning('Completed generation task %s has no consumable credit reservation', task.public_id)
            continue
        task.status = TaskStatus.SUCCEEDED
        task.progress = 100
        task.finished_at = task.finished_at or now
        task.last_heartbeat_at = now
        task.error_code = None
        task.error_message = None
        db.add(task)
        owner = db.query(User).filter(User.id == task.owner_user_id).first()
        if owner is not None:
            metadata = {
                'generation_id': image.public_id,
                'task_id': task.public_id,
                'generation_mode': image.generation_mode,
                'intent': image.intent,
                'quality': image.quality,
                'size': image.size,
                'credits_charged': image.credits_charged,
                'template_key': image.template_key,
                'reconciled': True,
            }
            stage_generation_terminal_event(task, event_name='generation_succeeded', metadata=metadata)
            terminal_events.append(
                (
                    task,
                    owner,
                    'generation_succeeded',
                    metadata,
                )
            )
    db.commit()
    _record_terminal_generation_events_after_state_commit(db, terminal_events)


def _new_generation_claim_token(worker_name: str) -> str:
    return f'{worker_name}:{uuid4().hex}'


def _database_dialect_name(db: Session) -> str | None:
    bind = getattr(db, 'bind', None) or getattr(db, 'get_bind', lambda: None)()
    dialect = getattr(bind, 'dialect', None)
    name = getattr(dialect, 'name', None)
    return str(name) if name else None


def _acquire_generation_claim_gate(db: Session) -> None:
    if _database_dialect_name(db) == 'postgresql':
        db.execute(text('SELECT pg_advisory_xact_lock(:lock_key)'), {'lock_key': _GENERATION_CLAIM_ADVISORY_LOCK_KEY})


def _running_generation_task_count(db: Session) -> int:
    running_count = (
        db.query(func.count(ImageGenerationTask.id))
        .filter(ImageGenerationTask.status == TaskStatus.RUNNING)
        .scalar()
        or 0
    )
    if isinstance(running_count, Number):
        return int(running_count)
    return 0


def _claim_generation_task(db: Session, task_id: int, claim_token: str) -> bool:
    _acquire_generation_claim_gate(db)
    max_running = max(1, int(settings.image_generation_worker_concurrency or 1))
    if _running_generation_task_count(db) >= max_running:
        db.rollback()
        return False

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
                ImageGenerationTask.next_attempt_at: None,
                ImageGenerationTask.claimed_by: claim_token,
                ImageGenerationTask.last_heartbeat_at: now,
                ImageGenerationTask.error_code: None,
                ImageGenerationTask.error_message: None,
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
    expire_image_generation_tasks(db)
    now = datetime.now(timezone.utc)

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
    if not _claim_generation_task(db, candidate.id, _new_generation_claim_token(worker_name)):
        return None
    return db.query(ImageGenerationTask).filter(ImageGenerationTask.id == candidate.id).first()


def process_image_generation_task(
    task_public_id: str,
    *,
    worker_name: str,
    claim_token: str | None = None,
) -> dict[str, str]:
    db = SessionLocal()
    try:
        # Cloud Task retries can arrive after a prior invocation died while
        # holding a lease. Requeue genuinely stale work before evaluating the
        # current invocation's token; fresh overlapping invocations remain no-ops.
        expire_image_generation_tasks(db)
        task = db.query(ImageGenerationTask).filter(ImageGenerationTask.public_id == task_public_id).first()
        if task is None:
            return {'result': 'missing'}
        if task.status in {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.EXPIRED, TaskStatus.DEAD_LETTER}:
            return {'result': 'noop', 'status': task.status.value}
        if task.status == TaskStatus.PENDING and task.next_attempt_at and task.next_attempt_at > datetime.now(timezone.utc):
            return {'result': 'delayed', 'status': task.status.value}
        if task.status == TaskStatus.PENDING:
            claim_token = claim_token or _new_generation_claim_token(worker_name)
            if not _claim_generation_task(db, task.id, claim_token):
                fresh_task = db.query(ImageGenerationTask).filter(ImageGenerationTask.id == task.id).first()
                if fresh_task is not None and fresh_task.status == TaskStatus.PENDING:
                    # The global worker slot was full. Cloud Tasks must receive a
                    # retryable response instead of acknowledging work that is
                    # still pending and would otherwise be stranded.
                    return {'result': 'delayed', 'status': fresh_task.status.value, 'reason': 'capacity'}
                return {
                    'result': 'noop',
                    'status': fresh_task.status.value if fresh_task is not None else task.status.value,
                }
            task = db.query(ImageGenerationTask).filter(ImageGenerationTask.id == task.id).first()
            if task is None:
                return {'result': 'missing'}
        elif task.status == TaskStatus.RUNNING:
            if not claim_token or task.claimed_by != claim_token:
                return {'result': 'noop', 'status': task.status.value, 'reason': 'lease_mismatch'}
        else:
            return {'result': 'noop', 'status': task.status.value}

        if task.claimed_by != claim_token:
            return {'result': 'noop', 'status': task.status.value, 'reason': 'lease_mismatch'}

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

    payload = dict(getattr(task, 'request_payload', None) or {})
    quality = normalize_generation_quality(payload.get('quality') or settings.image_generation_default_quality)
    size = normalize_generation_size(payload.get('size'))
    output_format = str(payload.get('output_format') or 'webp').strip().lower() or 'webp'
    reference_count = int(payload.get('reference_image_count') or 0)
    credits = estimate_image_generation_credits(quality=quality, size=size, reference_image_count=reference_count)
    try:
        require_held_generation_credit_reservation(db, task=task, expected_credits=credits)
    except GenerationCreditReservationError as exc:
        _handle_generation_failure(
            db,
            task,
            error_code='IMAGE_GENERATION_RESERVATION_INVALID',
            error_message=str(exc),
            retryable=False,
        )
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

    try:
        generated = _persist_successful_generation(
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
        consume_generation_credit_reservation(
            db,
            task=task,
            usage_metadata={
                'generation_id': generated.public_id,
                'quality': quality,
                'size': size,
                'generation_mode': task.generation_mode,
            },
        )
        success_metadata = {
            'generation_id': generated.public_id,
            'task_id': task.public_id,
            'generation_mode': task.generation_mode,
            'intent': task.intent,
            'quality': quality,
            'size': size,
            'credits_charged': credits,
            'cost_usd': result.cost_usd,
            'template_key': payload.get('template_key'),
            'prompt_example_id': payload.get('prompt_example_id'),
            'prompt_example_category': payload.get('prompt_example_category'),
            'source_review_id': payload.get('source_review_public_id'),
        }
        stage_generation_terminal_event(
            task,
            event_name='generation_succeeded',
            metadata=success_metadata,
        )
        db.add(task)
        db.commit()
        _record_terminal_generation_events_after_state_commit(
            db,
            [(task, owner, 'generation_succeeded', success_metadata)],
        )
    except GenerationCreditReservationError as exc:
        db.rollback()
        cleanup = _delete_uploaded_generation_object(
            storage,
            bucket=settings.object_bucket,
            object_key=object_key,
            task_public_id=task.public_id,
        )
        _handle_generation_failure(
            db,
            task,
            error_code='IMAGE_GENERATION_RESERVATION_INVALID',
            error_message=str(exc),
            retryable=False,
            event_metadata=cleanup,
        )
        return
    except Exception as exc:
        db.rollback()
        if _generated_image_was_committed(db, task=task, bucket=settings.object_bucket, object_key=object_key):
            logger.warning(
                'Generation task %s commit raised after generated image became visible; preserving uploaded object %s',
                task.public_id,
                object_key,
            )
            return
        cleanup = _delete_uploaded_generation_object(storage, bucket=settings.object_bucket, object_key=object_key, task_public_id=task.public_id)
        _handle_generation_failure(
            db,
            task,
            error_code='IMAGE_GENERATION_PERSISTENCE_FAILED',
            error_message=str(exc),
            retryable=False,
            event_metadata=cleanup,
        )
        return


def _delete_uploaded_generation_object(
    storage: Any,
    *,
    bucket: str,
    object_key: str,
    task_public_id: str,
) -> dict[str, Any]:
    try:
        storage.delete_object(Bucket=bucket, Key=object_key)
    except Exception as exc:
        logger.exception('Failed to delete generated object %s after task %s persistence failure', object_key, task_public_id)
        return {
            'uploaded_object_bucket': bucket,
            'uploaded_object_key': object_key,
            'uploaded_object_cleanup': 'failed',
            'uploaded_object_cleanup_error': str(exc)[:500],
        }
    return {
        'uploaded_object_bucket': bucket,
        'uploaded_object_key': object_key,
        'uploaded_object_cleanup': 'deleted',
    }


def _generated_image_was_committed(
    db: Session,
    *,
    task: ImageGenerationTask,
    bucket: str,
    object_key: str,
) -> bool:
    try:
        return (
            db.query(GeneratedImage.id)
            .filter(
                GeneratedImage.task_id == task.id,
                GeneratedImage.object_bucket == bucket,
                GeneratedImage.object_key == object_key,
                GeneratedImage.deleted_at.is_(None),
            )
            .first()
            is not None
        )
    except Exception:
        logger.exception(
            'Could not verify whether generated object %s for task %s was committed; preserving object',
            object_key,
            task.public_id,
        )
        db.rollback()
        return True


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

    storage = get_object_storage_client()
    try:
        response = storage.get_object(Bucket=photo.bucket, Key=photo.object_key)
        body = response['Body']
        image_bytes = body.read() if hasattr(body, 'read') else b''.join(body.iter_chunks())
    except Exception as exc:
        raise ImageGenerationError('Reference photo could not be loaded') from exc

    normalized_bytes, content_type = _normalize_reference_image(image_bytes)
    normalized_key = _reference_input_object_key(task, photo)
    try:
        storage.put_object(
            Bucket=settings.object_bucket,
            Key=normalized_key,
            Body=normalized_bytes,
            ContentType=content_type,
        )
    except Exception as exc:
        raise ImageGenerationError('Reference photo could not be prepared') from exc

    return {
        'bytes': normalized_bytes,
        'content_type': content_type,
        'filename': _reference_filename(photo.public_id, content_type),
        'url': _public_object_url(normalized_key),
    }


def _public_object_url(object_key: str) -> str:
    return f'{settings.object_base_url.rstrip("/")}/{quote(str(object_key).lstrip("/"))}'


def _reference_input_object_key(task: ImageGenerationTask, photo: Photo) -> str:
    return f'generated/reference-inputs/{task.public_id}/{photo.public_id}.jpg'


def _normalize_reference_image(source_bytes: bytes) -> tuple[bytes, str]:
    try:
        with Image.open(BytesIO(source_bytes)) as image:
            image = ImageOps.exif_transpose(image)
            if image.mode in {'RGBA', 'LA'} or 'transparency' in image.info:
                background = Image.new('RGB', image.size, (255, 255, 255))
                rgba_image = image.convert('RGBA')
                background.paste(rgba_image, mask=rgba_image.getchannel('A'))
                image = background
            elif image.mode != 'RGB':
                image = image.convert('RGB')

            image.thumbnail((_REFERENCE_IMAGE_MAX_EDGE, _REFERENCE_IMAGE_MAX_EDGE), Image.Resampling.LANCZOS)
            output = BytesIO()
            image.save(output, format='JPEG', quality=92, optimize=True)
            return output.getvalue(), 'image/jpeg'
    except (OSError, UnidentifiedImageError) as exc:
        raise ImageGenerationError('Reference photo is not a supported image file') from exc


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
    payload = dict(getattr(task, 'request_payload', None) or {})
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
            'prompt_example_id': payload.get('prompt_example_id'),
            'prompt_example_category': payload.get('prompt_example_category'),
            'source_review_public_id': payload.get('source_review_public_id'),
        },
    )
    db.add(generated)
    db.flush()
    return generated


def _record_generation_task_event(
    db: Session,
    *,
    task: ImageGenerationTask,
    owner: User,
    event_name: str,
    metadata: dict[str, Any],
    page_path: str = '/generation-worker',
    source: str | None = None,
    created_at: datetime | None = None,
) -> bool:
    try:
        payload = dict(task.request_payload or {})
        record_product_event(
            db,
            event_name=event_name,
            user_public_id=owner.public_id,
            plan=owner.plan.value if hasattr(owner.plan, 'value') else str(owner.plan),
            source=source if source is not None else payload.get('analytics_source'),
            page_path=page_path,
            metadata=metadata,
            created_at=created_at,
        )
        return True
    except Exception:
        db.rollback()
        logger.debug('Failed to record generation task analytics event %s for %s', event_name, task.public_id, exc_info=True)
        return False


def _generation_task_event_already_recorded(
    db: Session,
    *,
    task: ImageGenerationTask,
    owner: User,
    event_name: str,
    page_path: str = '/generation-worker',
) -> bool:
    if event_name not in _SERVER_OWNED_GENERATION_EVENTS:
        return False
    try:
        return (
            db.query(ProductAnalyticsEvent.id)
            .filter(
                ProductAnalyticsEvent.event_name == event_name,
                ProductAnalyticsEvent.user_public_id == owner.public_id,
                ProductAnalyticsEvent.page_path == page_path,
                ProductAnalyticsEvent.metadata_json.contains({'task_id': task.public_id}),
            )
            .first()
            is not None
        )
    except Exception:
        db.rollback()
        logger.debug('Failed to check generation terminal event uniqueness for %s', task.public_id, exc_info=True)
        return False


def stage_generation_request_event(
    task: ImageGenerationTask,
    *,
    page_path: str,
    source: str | None,
    metadata: dict[str, Any],
) -> None:
    task.request_payload = {
        **dict(task.request_payload or {}),
        _PENDING_REQUEST_EVENT_KEY: {
            'event_name': 'generation_requested',
            'page_path': page_path,
            'source': source,
            'metadata': {**metadata, 'task_id': task.public_id},
            'staged_at': datetime.now(timezone.utc).isoformat(),
        },
    }


def _pending_generation_request_event(
    task: ImageGenerationTask,
) -> tuple[str, str | None, dict[str, Any], datetime | None] | None:
    staged = dict(task.request_payload or {}).get(_PENDING_REQUEST_EVENT_KEY)
    if not isinstance(staged, dict) or staged.get('event_name') != 'generation_requested':
        return None
    page_path = str(staged.get('page_path') or '/generate')
    source = staged.get('source')
    metadata = staged.get('metadata')
    if not isinstance(metadata, dict):
        return None
    return (
        page_path,
        str(source) if source is not None else None,
        dict(metadata),
        _parse_staged_event_datetime(staged.get('staged_at')),
    )


def stage_generation_terminal_event(
    task: ImageGenerationTask,
    *,
    event_name: str,
    metadata: dict[str, Any],
) -> None:
    if event_name not in _TERMINAL_GENERATION_EVENTS:
        raise ValueError(f'Unsupported generation terminal event: {event_name}')
    task.request_payload = {
        **dict(task.request_payload or {}),
        _PENDING_TERMINAL_EVENT_KEY: {
            'event_name': event_name,
            'metadata': {**metadata, 'task_id': task.public_id},
            'staged_at': datetime.now(timezone.utc).isoformat(),
        },
    }


def _parse_staged_event_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _pending_generation_terminal_event(
    task: ImageGenerationTask,
) -> tuple[str, dict[str, Any], datetime | None] | None:
    staged = dict(task.request_payload or {}).get(_PENDING_TERMINAL_EVENT_KEY)
    if not isinstance(staged, dict):
        return None
    event_name = str(staged.get('event_name') or '')
    metadata = staged.get('metadata')
    if event_name not in _TERMINAL_GENERATION_EVENTS or not isinstance(metadata, dict):
        return None
    return event_name, dict(metadata), _parse_staged_event_datetime(staged.get('staged_at'))


def record_generation_task_event_once(
    db: Session,
    *,
    task: ImageGenerationTask,
    owner: User,
    event_name: str,
    metadata: dict[str, Any],
    page_path: str = '/generation-worker',
    source: str | None = None,
    created_at: datetime | None = None,
) -> bool:
    event_metadata = {
        **metadata,
        'task_id': task.public_id,
        'server_owned': True,
        'terminal_event': event_name in _TERMINAL_GENERATION_EVENTS,
    }
    if _generation_task_event_already_recorded(
        db,
        task=task,
        owner=owner,
        event_name=event_name,
        page_path=page_path,
    ):
        return True
    return _record_generation_task_event(
        db,
        task=task,
        owner=owner,
        event_name=event_name,
        metadata=event_metadata,
        page_path=page_path,
        source=source,
        created_at=created_at,
    )


def _lock_generation_task_for_event_delivery(
    db: Session,
    task: ImageGenerationTask,
) -> ImageGenerationTask | None:
    if _database_dialect_name(db) != 'postgresql' or getattr(task, 'id', None) is None:
        return task
    return (
        db.query(ImageGenerationTask)
        .filter(ImageGenerationTask.id == task.id)
        .populate_existing()
        .with_for_update()
        .one_or_none()
    )


def deliver_generation_terminal_event(db: Session, *, task: ImageGenerationTask, owner: User) -> bool:
    locked_task = _lock_generation_task_for_event_delivery(db, task)
    if locked_task is None:
        return False
    pending = _pending_generation_terminal_event(locked_task)
    if pending is None:
        return True
    event_name, metadata, created_at = pending
    if not record_generation_task_event_once(
        db,
        task=locked_task,
        owner=owner,
        event_name=event_name,
        metadata=metadata,
        created_at=created_at,
    ):
        return False

    payload = dict(locked_task.request_payload or {})
    payload.pop(_PENDING_TERMINAL_EVENT_KEY, None)
    locked_task.request_payload = payload
    db.add(locked_task)
    try:
        # Commit the analytics row and outbox acknowledgement atomically. If it
        # fails, both roll back and the staged marker remains for reconciliation.
        db.commit()
        return True
    except Exception:
        db.rollback()
        logger.debug('Failed to acknowledge generation terminal event for %s', locked_task.public_id, exc_info=True)
        return False


def deliver_generation_request_event(db: Session, *, task: ImageGenerationTask, owner: User) -> bool:
    locked_task = _lock_generation_task_for_event_delivery(db, task)
    if locked_task is None:
        return False
    pending = _pending_generation_request_event(locked_task)
    if pending is None:
        return True
    page_path, source, metadata, created_at = pending
    if not record_generation_task_event_once(
        db,
        task=locked_task,
        owner=owner,
        event_name='generation_requested',
        metadata=metadata,
        page_path=page_path,
        source=source,
        created_at=created_at,
    ):
        return False

    payload = dict(locked_task.request_payload or {})
    payload.pop(_PENDING_REQUEST_EVENT_KEY, None)
    locked_task.request_payload = payload
    db.add(locked_task)
    try:
        db.commit()
        return True
    except Exception:
        db.rollback()
        logger.debug('Failed to acknowledge generation request event for %s', locked_task.public_id, exc_info=True)
        return False


def _reconcile_pending_generation_request_events(db: Session) -> None:
    tasks = (
        db.query(ImageGenerationTask)
        .filter(ImageGenerationTask.request_payload.op('?')(_PENDING_REQUEST_EVENT_KEY))
        .all()
    )
    for task in tasks:
        if _pending_generation_request_event(task) is None:
            continue
        owner = db.query(User).filter(User.id == task.owner_user_id).first()
        if owner is None:
            continue
        deliver_generation_request_event(db, task=task, owner=owner)


def _reconcile_pending_generation_terminal_events(db: Session) -> None:
    tasks = (
        db.query(ImageGenerationTask)
        .filter(
            ImageGenerationTask.status.in_(
                [TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.EXPIRED, TaskStatus.DEAD_LETTER]
            ),
            ImageGenerationTask.request_payload.op('?')(_PENDING_TERMINAL_EVENT_KEY),
        )
        .all()
    )
    for task in tasks:
        if _pending_generation_terminal_event(task) is None:
            continue
        owner = db.query(User).filter(User.id == task.owner_user_id).first()
        if owner is None:
            continue
        deliver_generation_terminal_event(db, task=task, owner=owner)


def _record_terminal_generation_events_after_state_commit(
    db: Session,
    events: list[tuple[ImageGenerationTask, User, str, dict[str, Any]]],
) -> None:
    for task, owner, event_name, metadata in events:
        if _pending_generation_terminal_event(task) is None:
            raise RuntimeError(
                f'Generation task {task.public_id} reached terminal delivery without a durable outbox marker'
            )
        deliver_generation_terminal_event(db, task=task, owner=owner)


def _output_format_for_content_type(content_type: str, *, fallback: str) -> str:
    normalized = str(content_type or '').split(';', 1)[0].strip().lower()
    if normalized == 'image/png':
        return 'png'
    if normalized == 'image/jpeg':
        return 'jpeg'
    if normalized == 'image/webp':
        return 'webp'
    return fallback


def _generation_failure_stage(error_code: str) -> str:
    if error_code == 'IMAGE_GENERATION_CREDITS_EXHAUSTED':
        return 'quota'
    if error_code == 'IMAGE_GENERATION_STORAGE_FAILED':
        return 'storage'
    if error_code == 'IMAGE_GENERATION_PERSISTENCE_FAILED':
        return 'persistence'
    if error_code == 'OPENAI_IMAGE_GENERATION_FAILED':
        return 'ai_service'
    if error_code == 'TASK_DISPATCH_FAILED':
        return 'dispatch'
    if error_code == 'TASK_STALLED':
        return 'worker_timeout'
    if error_code in {'GENERATION_PROMPT_REJECTED', 'PROMPT_SAFETY'}:
        return 'prompt_safety'
    if error_code in {'USER_NOT_FOUND', 'SOURCE_REVIEW_NOT_FOUND', 'SOURCE_PHOTO_NOT_FOUND'}:
        return 'auth_or_source'
    return 'worker'


def _generation_failure_event_metadata(
    task: ImageGenerationTask,
    error_code: str,
    extra_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = dict(task.request_payload or {})
    return {
        'task_id': task.public_id,
        'generation_mode': task.generation_mode,
        'intent': task.intent,
        'quality': payload.get('quality'),
        'size': payload.get('size'),
        'template_key': payload.get('template_key'),
        'prompt_example_id': payload.get('prompt_example_id'),
        'prompt_example_category': payload.get('prompt_example_category'),
        'source_review_id': payload.get('source_review_public_id'),
        'error_code': error_code,
        'failure_stage': _generation_failure_stage(error_code),
        **(extra_metadata or {}),
    }


def _handle_generation_failure(
    db: Session,
    task: ImageGenerationTask,
    *,
    error_code: str,
    error_message: str,
    retryable: bool,
    event_metadata: dict[str, Any] | None = None,
) -> None:
    retry_delay: int | None = None
    if retryable and task.attempt_count < task.max_attempts:
        retry_delay = _generation_retry_delay_seconds(task.attempt_count)
        task.status = TaskStatus.PENDING
        task.progress = 0
        task.next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=retry_delay)
    else:
        task.status = TaskStatus.FAILED
        task.progress = 100
        task.finished_at = datetime.now(timezone.utc)
    task.error_code = error_code
    task.error_message = error_message[:500]
    task.last_heartbeat_at = datetime.now(timezone.utc)
    if event_metadata:
        task.request_payload = {
            **dict(task.request_payload or {}),
            'terminal_failure_metadata': dict(event_metadata),
        }
    db.add(task)
    terminal_event: tuple[ImageGenerationTask, User, str, dict[str, Any]] | None = None
    if task.status == TaskStatus.FAILED:
        release_generation_credit_reservation(db, task=task, reason=error_code)
        owner = db.query(User).filter(User.id == task.owner_user_id).first()
        if owner is not None:
            terminal_metadata = _generation_failure_event_metadata(task, error_code, event_metadata)
            stage_generation_terminal_event(
                task,
                event_name='generation_failed',
                metadata=terminal_metadata,
            )
            terminal_event = (
                task,
                owner,
                'generation_failed',
                terminal_metadata,
            )
    db.commit()
    if terminal_event is not None:
        _record_terminal_generation_events_after_state_commit(db, [terminal_event])
    if retry_delay is not None and getattr(settings, 'cloud_tasks_enabled', False) is True:
        try:
            from app.services.task_dispatcher import TaskDispatchError, enqueue_image_generation_task

            enqueue_image_generation_task(task.public_id, delay_seconds=retry_delay)
        except TaskDispatchError as exc:
            logger.exception('Failed to enqueue Cloud Task retry for image generation task %s', task.public_id)
            failed_task = db.query(ImageGenerationTask).filter(ImageGenerationTask.id == task.id).first()
            if failed_task is not None:
                now = datetime.now(timezone.utc)
                failed_task.status = TaskStatus.FAILED
                failed_task.progress = 100
                failed_task.finished_at = now
                failed_task.last_heartbeat_at = now
                failed_task.error_code = 'TASK_DISPATCH_FAILED'
                failed_task.error_message = str(exc)[:500]
                db.add(failed_task)
                release_generation_credit_reservation(db, task=failed_task, reason='TASK_DISPATCH_FAILED')
                owner = db.query(User).filter(User.id == failed_task.owner_user_id).first()
                terminal_metadata = _generation_failure_event_metadata(failed_task, 'TASK_DISPATCH_FAILED')
                if owner is not None:
                    stage_generation_terminal_event(
                        failed_task,
                        event_name='generation_failed',
                        metadata=terminal_metadata,
                    )
                db.commit()
                if owner is not None:
                    _record_terminal_generation_events_after_state_commit(
                        db,
                        [
                            (
                                failed_task,
                                owner,
                                'generation_failed',
                                terminal_metadata,
                            )
                        ],
                    )


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
