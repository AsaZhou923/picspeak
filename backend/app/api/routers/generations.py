from __future__ import annotations

import json
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_current_actor, get_db
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import GeneratedImage, ImageGenerationTask, Photo, PhotoStatus, Review, TaskStatus, UserPlan
from app.schemas import (
    GeneratedImageDetailResponse,
    GeneratedImageHistoryResponse,
    GeneratedImageItem,
    GenerationCreateRequest,
    GenerationCreateResponse,
    GenerationTaskStatusResponse,
    GenerationTemplatesResponse,
)
from app.services.guard import get_idempotency_record, hash_request, save_idempotency_record
from app.services.image_generation_pricing import (
    estimate_image_generation_credits,
    get_credits_table,
    normalize_generation_quality,
    normalize_generation_size,
)
from app.services.image_generation_prompt import (
    PromptSafetyError,
    build_general_generation_prompt,
    build_review_linked_generation_prompt,
    get_generation_templates,
)
from app.services.image_generation_task_processor import (
    _serialize_generation_task_status,
    ensure_generation_credits_available,
    make_generation_task,
)
from app.services.object_storage import get_object_storage_client
from app.services.product_analytics import record_product_event


router = APIRouter(tags=['generations'])


def _encode_generation_cursor(image: GeneratedImage) -> str:
    return f'{image.created_at.isoformat()}|{image.id}'


def _decode_generation_cursor(cursor: str) -> tuple[datetime, int]:
    raw_created_at, separator, raw_id = cursor.partition('|')
    if not separator:
        raise ValueError('legacy cursor')
    created_at = datetime.fromisoformat(raw_created_at)
    return created_at, int(raw_id)


@router.get('/generations/templates', response_model=GenerationTemplatesResponse)
def get_generation_template_catalog():
    return {'items': get_generation_templates(), 'credits_table': get_credits_table()}


@router.post('/generations', response_model=GenerationCreateResponse)
def create_generation(
    payload: GenerationCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        raise api_error(status.HTTP_403_FORBIDDEN, 'GENERATION_LOGIN_REQUIRED', 'Sign in before generating images')

    quality = normalize_generation_quality(payload.quality)
    size = normalize_generation_size(payload.size)
    if actor.plan == UserPlan.free and quality != 'low':
        raise api_error(status.HTTP_403_FORBIDDEN, 'GENERATION_QUALITY_FORBIDDEN', 'Free users can only generate low quality images')

    source_photo_internal_id: int | None = None
    source_review_internal_id: int | None = None
    source_review: Review | None = None
    if payload.generation_mode == 'review_linked':
        if not payload.source_review_id:
            raise api_error(status.HTTP_400_BAD_REQUEST, 'SOURCE_REVIEW_REQUIRED', 'Review-linked generation requires source_review_id')
        source_review = (
            db.query(Review)
            .filter(
                Review.public_id == payload.source_review_id,
                Review.owner_user_id == actor.user.id,
                Review.deleted_at.is_(None),
            )
            .first()
        )
        if source_review is None:
            raise api_error(status.HTTP_404_NOT_FOUND, 'SOURCE_REVIEW_NOT_FOUND', 'Source review not found')
        source_review_internal_id = source_review.id
        source_photo_internal_id = source_review.photo_id
    elif payload.source_photo_id:
        source_photo = _find_source_photo(db, payload.source_photo_id, actor.user.id)
        source_photo_internal_id = source_photo.id

    idempotency_key = payload.idempotency_key or request.headers.get('Idempotency-Key')
    payload_dump = json.dumps(payload.model_dump(by_alias=True), ensure_ascii=False, sort_keys=True)
    if idempotency_key:
        record = get_idempotency_record(db, actor.user.id, '/generations', idempotency_key)
        if record is not None and record.response_json is not None:
            return record.response_json

    try:
        if payload.generation_mode == 'review_linked' and source_review is not None:
            final_prompt = build_review_linked_generation_prompt(
                review_result=dict(source_review.result_json or {}),
                user_prompt=payload.prompt,
                intent=payload.intent,
                image_type=payload.image_type or source_review.image_type or 'default',
                style=payload.style,
                negative_prompt=payload.negative_prompt,
            )
        else:
            final_prompt = build_general_generation_prompt(
                user_prompt=payload.prompt,
                template_key=payload.template_key or payload.intent,
                style=payload.style,
                negative_prompt=payload.negative_prompt,
            )
    except PromptSafetyError as exc:
        raise api_error(status.HTTP_400_BAD_REQUEST, 'GENERATION_PROMPT_REJECTED', str(exc)) from exc

    reference_image_count = 1 if source_photo_internal_id is not None else 0
    credits_reserved = estimate_image_generation_credits(
        quality=quality,
        size=size,
        reference_image_count=reference_image_count,
    )
    request_payload = {
        'generation_mode': payload.generation_mode,
        'intent': payload.intent,
        'user_prompt': payload.prompt,
        'template_key': payload.template_key,
        'prompt_example_id': payload.prompt_example_id,
        'prompt_example_category': payload.prompt_example_category,
        'image_type': payload.image_type,
        'quality': quality,
        'size': size,
        'style': payload.style,
        'negative_prompt': payload.negative_prompt,
        'output_format': payload.output_format,
        'model_snapshot': settings.image_generation_model_snapshot,
        'reference_image_count': reference_image_count,
        'credits_reserved': credits_reserved,
        'source_review_public_id': payload.source_review_id,
        'source_photo_public_id': payload.source_photo_id,
    }
    task = make_generation_task(
        owner_user_id=actor.user.id,
        prompt=final_prompt,
        request_payload=request_payload,
        generation_mode=payload.generation_mode,
        intent=payload.intent,
        source_photo_id=source_photo_internal_id,
        source_review_id=source_review_internal_id,
        idempotency_key=idempotency_key,
    )
    db.add(task)
    db.flush()

    response = {
        'task_id': task.public_id,
        'status': task.status.value,
        'estimated_seconds': 45,
        'credits_reserved': credits_reserved,
    }
    if idempotency_key:
        save_idempotency_record(
            db,
            user_id=actor.user.id,
            endpoint='/generations',
            key=idempotency_key,
            request_hash=hash_request(payload_dump),
            http_status=200,
            response_json=response,
        )
    _record_generation_event(
        db,
        actor,
        event_name='generation_requested',
        page_path=f'/reviews/{payload.source_review_id}' if payload.generation_mode == 'review_linked' and payload.source_review_id else '/generate',
        metadata={
            'generation_mode': payload.generation_mode,
            'intent': payload.intent,
            'template_key': payload.template_key,
            'prompt_example_id': payload.prompt_example_id,
            'prompt_example_category': payload.prompt_example_category,
            'quality': quality,
            'size': size,
            'task_id': task.public_id,
            'credits_reserved': credits_reserved,
            'source_review_id': payload.source_review_id,
        },
    )
    db.commit()
    return response


@router.get('/generation-tasks/{task_id}', response_model=GenerationTaskStatusResponse)
def get_generation_task_status(
    task_id: str,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    task = db.query(ImageGenerationTask).filter(ImageGenerationTask.public_id == task_id, ImageGenerationTask.owner_user_id == actor.user.id).first()
    if task is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'GENERATION_TASK_NOT_FOUND', 'Generation task not found')
    image = db.query(GeneratedImage).filter(GeneratedImage.task_id == task.id, GeneratedImage.deleted_at.is_(None)).first()
    return GenerationTaskStatusResponse(**_serialize_generation_task_status(task, image))


@router.get('/generations/{generation_id}', response_model=GeneratedImageDetailResponse)
def get_generation(
    generation_id: str,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    image = _find_generation_owned(db, generation_id, actor.user.id)
    _record_generation_event(
        db,
        actor,
        event_name='generation_viewed',
        page_path=f'/generations/{generation_id}',
        metadata={'generation_id': generation_id, 'generation_mode': image.generation_mode},
    )
    db.commit()
    return _generation_detail_payload(db, image)


@router.get('/me/generations', response_model=GeneratedImageHistoryResponse)
def list_my_generations(
    cursor: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    page_size = min(max(int(limit or 20), 1), 50)
    query = (
        db.query(GeneratedImage)
        .filter(GeneratedImage.owner_user_id == actor.user.id, GeneratedImage.deleted_at.is_(None))
        .order_by(GeneratedImage.created_at.desc(), GeneratedImage.id.desc())
    )
    if cursor:
        try:
            cursor_created_at, cursor_id = _decode_generation_cursor(cursor)
        except ValueError:
            legacy_cursor = (
                db.query(GeneratedImage.created_at, GeneratedImage.id)
                .filter(
                    GeneratedImage.public_id == cursor,
                    GeneratedImage.owner_user_id == actor.user.id,
                    GeneratedImage.deleted_at.is_(None),
                )
                .first()
            )
            if legacy_cursor is None:
                raise api_error(status.HTTP_400_BAD_REQUEST, 'GENERATION_CURSOR_INVALID', 'Invalid generation cursor')
            cursor_created_at, cursor_id = legacy_cursor
        query = query.filter(
            or_(
                GeneratedImage.created_at < cursor_created_at,
                and_(GeneratedImage.created_at == cursor_created_at, GeneratedImage.id < cursor_id),
            )
        )
    rows = query.limit(page_size + 1).all()
    has_more = len(rows) > page_size
    items = rows[:page_size]
    related_public_ids = _generation_related_public_ids(db, items)
    return {
        'items': [_generation_item_payload(db, image, related_public_ids=related_public_ids) for image in items],
        'next_cursor': _encode_generation_cursor(items[-1]) if has_more and items else None,
    }


@router.delete('/generations/{generation_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_generation(
    generation_id: str,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    image = _find_generation_owned(db, generation_id, actor.user.id)
    image.deleted_at = datetime.now(timezone.utc)
    db.add(image)
    db.commit()
    return None


@router.get('/generations/{generation_id}/download')
def download_generation(
    generation_id: str,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    image = _find_generation_owned(db, generation_id, actor.user.id)
    try:
        response = get_object_storage_client().get_object(Bucket=image.object_bucket, Key=image.object_key)
    except Exception as exc:
        raise api_error(status.HTTP_502_BAD_GATEWAY, 'GENERATION_DOWNLOAD_FAILED', 'Generated image could not be downloaded') from exc

    content_length = _response_content_length(response)
    max_bytes = settings.image_generation_download_max_bytes
    if content_length is None:
        raise api_error(
            status.HTTP_502_BAD_GATEWAY,
            'GENERATION_DOWNLOAD_SIZE_UNKNOWN',
            'Generated image size could not be verified',
        )
    if content_length > max_bytes:
        raise api_error(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            'GENERATION_DOWNLOAD_TOO_LARGE',
            'Generated image exceeds the download size limit',
            max_bytes=max_bytes,
            content_length=content_length,
        )

    content_type = str(response.get('ContentType') or image.content_type or 'application/octet-stream')
    extension = _extension_for_content_type(content_type, fallback=image.output_format)
    filename = f'{image.public_id}.{extension}'
    body = response['Body']
    return StreamingResponse(
        body.iter_chunks(),
        media_type=content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Length': str(content_length),
        },
    )


@router.post('/generations/{generation_id}/reuse', response_model=GenerationCreateResponse)
def reuse_generation(
    generation_id: str,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    if actor.plan == UserPlan.guest:
        raise api_error(status.HTTP_403_FORBIDDEN, 'GENERATION_LOGIN_REQUIRED', 'Sign in before generating images')
    image = _find_generation_owned(db, generation_id, actor.user.id)
    payload = dict(image.metadata_json or {})
    request_payload = {
        'generation_mode': image.generation_mode,
        'intent': image.intent,
        'user_prompt': payload.get('user_prompt') or image.prompt,
        'template_key': image.template_key,
        'prompt_example_id': payload.get('prompt_example_id'),
        'prompt_example_category': payload.get('prompt_example_category'),
        'quality': image.quality,
        'size': image.size,
        'style': payload.get('style') or 'realistic',
        'negative_prompt': payload.get('negative_prompt'),
        'output_format': image.output_format,
        'model_snapshot': settings.image_generation_model_snapshot,
        'reference_image_count': 1 if image.source_photo_id is not None else 0,
    }
    credits_reserved = estimate_image_generation_credits(
        quality=image.quality,
        size=image.size,
        reference_image_count=int(request_payload['reference_image_count']),
    )
    try:
        ensure_generation_credits_available(db, actor.user, credits_needed=credits_reserved)
    except ValueError:
        raise api_error(status.HTTP_402_PAYMENT_REQUIRED, 'GENERATION_CREDITS_EXHAUSTED', 'Image generation credits are exhausted')
    request_payload['credits_reserved'] = credits_reserved
    task = make_generation_task(
        owner_user_id=actor.user.id,
        prompt=image.prompt,
        request_payload=request_payload,
        generation_mode=image.generation_mode,
        intent=image.intent,
        source_photo_id=image.source_photo_id,
        source_review_id=image.source_review_id,
    )
    db.add(task)
    db.commit()
    return {
        'task_id': task.public_id,
        'status': task.status.value,
        'estimated_seconds': 45,
        'credits_reserved': credits_reserved,
    }


def _record_generation_event(
    db: Session,
    actor: CurrentActor,
    *,
    event_name: str,
    page_path: str,
    metadata: dict,
) -> None:
    try:
        record_product_event(
            db,
            event_name=event_name,
            user_public_id=actor.user.public_id,
            plan=actor.plan.value if hasattr(actor.plan, 'value') else str(actor.plan),
            source='unknown',
            page_path=page_path,
            metadata=metadata,
        )
    except Exception:
        # Analytics must not block generation flows.
        pass


def _find_generation_owned(db: Session, generation_id: str, owner_user_id: int) -> GeneratedImage:
    image = (
        db.query(GeneratedImage)
        .filter(
            GeneratedImage.public_id == generation_id,
            GeneratedImage.owner_user_id == owner_user_id,
            GeneratedImage.deleted_at.is_(None),
        )
        .first()
    )
    if image is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'GENERATION_NOT_FOUND', 'Generated image not found')
    return image


def _find_source_photo(db: Session, photo_id: str, owner_user_id: int) -> Photo:
    photo = (
        db.query(Photo)
        .filter(
            Photo.public_id == photo_id,
            Photo.owner_user_id == owner_user_id,
            Photo.status == PhotoStatus.READY,
        )
        .first()
    )
    if photo is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'SOURCE_PHOTO_NOT_FOUND', 'Source photo not found')
    return photo


def _build_generated_image_url(image: GeneratedImage) -> str:
    return f'{settings.object_base_url.rstrip("/")}/{quote(image.object_key)}'


def _generation_related_public_ids(db: Session, images: list[GeneratedImage]) -> dict[str, dict[int, str]]:
    task_ids = {image.task_id for image in images if image.task_id is not None}
    photo_ids = {image.source_photo_id for image in images if image.source_photo_id is not None}
    review_ids = {image.source_review_id for image in images if image.source_review_id is not None}

    return {
        'tasks': _public_id_map(db, ImageGenerationTask, task_ids),
        'photos': _public_id_map(db, Photo, photo_ids),
        'reviews': _public_id_map(db, Review, review_ids),
    }


def _public_id_map(db: Session, model: type[ImageGenerationTask] | type[Photo] | type[Review], ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = db.query(model.id, model.public_id).filter(model.id.in_(ids)).all()
    return {int(row[0]): str(row[1]) for row in rows}


def _generation_item_payload(
    db: Session,
    image: GeneratedImage,
    *,
    related_public_ids: dict[str, dict[int, str]] | None = None,
) -> GeneratedImageItem:
    metadata = dict(image.metadata_json or {})
    related_public_ids = related_public_ids or {}
    return GeneratedImageItem(
        generation_id=image.public_id,
        task_id=_related_public_id(db, ImageGenerationTask, getattr(image, 'task_id', None), related_public_ids.get('tasks')),
        image_url=_build_generated_image_url(image),
        generation_mode=image.generation_mode,
        intent=image.intent,
        prompt=str(metadata.get('user_prompt') or image.prompt),
        revised_prompt=image.revised_prompt,
        model_name=image.model_name,
        model_snapshot=image.model_snapshot,
        quality=image.quality,
        size=image.size,
        output_format=image.output_format,
        credits_charged=image.credits_charged,
        template_key=image.template_key,
        source_photo_id=_related_public_id(db, Photo, image.source_photo_id, related_public_ids.get('photos')),
        source_review_id=_related_public_id(db, Review, image.source_review_id, related_public_ids.get('reviews')),
        created_at=image.created_at,
    )


def _generation_detail_payload(db: Session, image: GeneratedImage) -> GeneratedImageDetailResponse:
    item = _generation_item_payload(db, image)
    return GeneratedImageDetailResponse(
        **item.model_dump(),
        cost_usd=float(image.cost_usd) if image.cost_usd is not None else None,
        input_text_tokens=image.input_text_tokens,
        input_image_tokens=image.input_image_tokens,
        output_image_tokens=image.output_image_tokens,
        metadata=dict(image.metadata_json or {}),
    )


def _related_public_id(
    db: Session,
    model: type[ImageGenerationTask] | type[Photo] | type[Review],
    record_id: int | None,
    lookup: dict[int, str] | None,
) -> str | None:
    if not record_id:
        return None
    if lookup is not None:
        return lookup.get(record_id)
    row = db.query(model.public_id).filter(model.id == record_id).first()
    return str(row[0]) if row else None


def _extension_for_content_type(content_type: str, *, fallback: str) -> str:
    normalized = str(content_type or '').split(';', 1)[0].strip().lower()
    if normalized == 'image/png':
        return 'png'
    if normalized == 'image/jpeg':
        return 'jpg'
    if normalized == 'image/webp':
        return 'webp'
    return str(fallback or 'bin').strip().lstrip('.') or 'bin'


def _response_content_length(response: dict) -> int | None:
    try:
        content_length = int(response.get('ContentLength'))
    except (TypeError, ValueError):
        return None
    return content_length if content_length >= 0 else None
