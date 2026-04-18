from __future__ import annotations

import hashlib
import time
from io import BytesIO
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.core.errors import api_error
from app.core.security import sign_payload, sign_payload_with_exp, verify_payload
from app.db.models import Photo, User
from app.services.object_storage import get_object_storage_client

router = APIRouter(prefix='/photos', tags=['photos'])

ALLOWED_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
PHOTO_PROXY_TTL_SECONDS = 600
PHOTO_THUMBNAIL_SIZE = 128
PHOTO_THUMBNAIL_MAX_SIZE = 512
PHOTO_THUMBNAIL_TTL_SECONDS = 24 * 3600
PHOTO_THUMBNAIL_STABLE_WINDOW_SECONDS = 3600
PHOTO_THUMBNAIL_CACHE_CONTROL = 'private, max-age=86400, stale-while-revalidate=604800'
GALLERY_THUMBNAIL_CACHE_CONTROL = 'public, max-age=31536000, immutable'
IMAGE_RESAMPLING = getattr(Image, 'Resampling', Image).LANCZOS


def _request_origin(request: Request) -> tuple[str, str]:
    base = urlsplit(str(request.base_url))
    forwarded_proto = request.headers.get('x-forwarded-proto', '').split(',', 1)[0].strip()
    forwarded_host = request.headers.get('x-forwarded-host', '').split(',', 1)[0].strip()
    host = forwarded_host or request.headers.get('host', '').strip() or base.netloc
    scheme = forwarded_proto or base.scheme

    if scheme == 'http' and host and not host.startswith('localhost') and not host.startswith('127.0.0.1'):
        scheme = 'https'

    return scheme or base.scheme, host or base.netloc


def _request_url_for(request: Request, route_name: str, **path_params: str | int) -> str:
    resolved = urlsplit(str(request.url_for(route_name, **path_params)).rstrip('?'))
    scheme, host = _request_origin(request)
    return urlunsplit((scheme, host, resolved.path, resolved.query, resolved.fragment))


def _build_storage_photo_url(bucket: str, object_key: str) -> str:
    _ = bucket
    base = settings.object_base_url.rstrip('/')
    return f'{base}/{quote(object_key)}'


def _photo_client_meta(photo: Photo) -> dict[str, Any]:
    return dict(photo.client_meta) if isinstance(photo.client_meta, dict) else {}


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
    return _request_url_for(request, route_name, photo_id=photo_public_id) + '?' + '&'.join(query_parts)


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


def _find_photo_owned(db: Session, photo_public_id: str, owner_user_id: int) -> Photo:
    photo = db.query(Photo).filter(Photo.public_id == photo_public_id, Photo.owner_user_id == owner_user_id).first()
    if photo is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'PHOTO_NOT_FOUND', 'Photo not found')
    return photo


@router.get('/{photo_id}/image', name='get_photo_image')
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


@router.get('/{photo_id}/thumbnail', name='get_photo_thumbnail')
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
