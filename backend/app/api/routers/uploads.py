from __future__ import annotations

import json
import logging
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_current_actor, get_db, new_public_id
from app.api.routers.photos import (
    ALLOWED_CONTENT_TYPES,
    PHOTO_THUMBNAIL_SIZE,
    _build_photo_proxy_url,
    _build_storage_photo_url,
    _find_photo_owned,
)
from app.core.config import settings
from app.core.errors import api_error
from app.core.network import client_ip_from_request
from app.core.security import sign_payload, verify_payload
from app.db.models import Photo, PhotoStatus
from app.schemas import PhotoCreateRequest, PhotoCreateResponse, PresignRequest, PresignResponse
from app.services.object_storage import get_object_storage_client

router = APIRouter(tags=['uploads'])
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


def _with_derived_upload_totals(upload_metrics: dict[str, Any], *, confirm_processing_ms: int) -> dict[str, Any]:
    metrics = dict(upload_metrics)
    if metrics.get('confirm_request_ms') is None:
        metrics['confirm_request_ms'] = confirm_processing_ms

    if metrics.get('total_upload_flow_ms') is None:
        total = 0
        used = False
        for key in ('frontend_preprocess_ms', 'presign_request_ms', 'object_upload_ms'):
            value = _coerce_int_metric(metrics.get(key))
            if value is not None:
                total += value
                used = True
        total += confirm_processing_ms
        metrics['total_upload_flow_ms'] = total if used else confirm_processing_ms
        metrics['total_upload_flow_ms_source'] = 'backend_derived'
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
                Photo.status == PhotoStatus.READY,
            )
            .order_by(Photo.created_at.desc(), Photo.id.desc())
            .first()
        )
        if existing_photo is not None:
            db.commit()
            confirm_processing_ms = _duration_ms(started_at)
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
                confirm_processing_ms=confirm_processing_ms,
                **_with_derived_upload_totals(upload_metrics, confirm_processing_ms=confirm_processing_ms),
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
    confirm_processing_ms = _duration_ms(started_at)

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
        confirm_processing_ms=confirm_processing_ms,
        **_with_derived_upload_totals(upload_metrics, confirm_processing_ms=confirm_processing_ms),
    )

    return PhotoCreateResponse(
        photo_id=photo.public_id,
        photo_url=_build_photo_proxy_url(request, photo.public_id, actor.user.public_id),
        status=photo.status.value,
    )
