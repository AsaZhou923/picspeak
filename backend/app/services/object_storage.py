from __future__ import annotations

from functools import lru_cache

import boto3
from botocore.client import BaseClient

from app.core.config import settings


@lru_cache(maxsize=1)
def get_object_storage_client() -> BaseClient:
    endpoint = settings.object_s3_endpoint.strip()
    if not endpoint:
        raise ValueError('OBJECT_S3_ENDPOINT is not configured')

    access_key_id = settings.object_access_key_id.strip()
    secret_access_key = settings.object_secret_access_key.strip()
    if not access_key_id or not secret_access_key:
        raise ValueError('OBJECT_ACCESS_KEY_ID / OBJECT_SECRET_ACCESS_KEY are not configured')

    return boto3.client(
        's3',
        endpoint_url=endpoint,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name=settings.object_region.strip() or 'auto',
    )


def get_object_read_url(object_key: str, *, bucket: str | None = None, expires_in: int = 3600) -> str:
    resolved_bucket = (bucket or settings.object_bucket).strip()
    if not resolved_bucket:
        raise ValueError('OBJECT_BUCKET is not configured')

    return get_object_storage_client().generate_presigned_url(
        ClientMethod='get_object',
        Params={
            'Bucket': resolved_bucket,
            'Key': object_key,
        },
        ExpiresIn=expires_in,
    )

