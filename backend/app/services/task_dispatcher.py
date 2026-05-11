from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from app.core.config import settings


class TaskDispatchError(RuntimeError):
    pass


def enqueue_review_task(task_public_id: str, *, delay_seconds: int = 0) -> None:
    _enqueue_cloud_task(
        task_public_id,
        target_url=settings.cloud_tasks_target_url,
        delay_seconds=delay_seconds,
    )


def enqueue_image_generation_task(task_public_id: str, *, delay_seconds: int = 0) -> None:
    _enqueue_cloud_task(
        task_public_id,
        target_url=_image_generation_target_url(),
        delay_seconds=delay_seconds,
    )


def _image_generation_target_url() -> str:
    configured = str(getattr(settings, 'cloud_tasks_generation_target_url', '') or '').strip()
    if configured:
        return configured

    review_url = str(settings.cloud_tasks_target_url or '').strip()
    for suffix in ('/internal/tasks/reviews/execute', '/reviews/execute'):
        if review_url.endswith(suffix):
            return f'{review_url[: -len(suffix)]}/internal/tasks/generations/execute'
    raise TaskDispatchError('Cloud Tasks generation target URL is not configured')


def _enqueue_cloud_task(task_public_id: str, *, target_url: str, delay_seconds: int = 0) -> None:
    if not settings.cloud_tasks_enabled:
        return
    if not str(target_url or '').strip():
        raise TaskDispatchError(f'Cloud Tasks target URL is not configured for {task_public_id}')
    from google.cloud import tasks_v2
    from google.protobuf import duration_pb2, timestamp_pb2

    client = tasks_v2.CloudTasksClient()
    parent = client.queue_path(
        settings.cloud_tasks_project_id,
        settings.cloud_tasks_location,
        settings.cloud_tasks_queue,
    )

    body = json.dumps({'task_id': task_public_id}).encode('utf-8')
    http_request = tasks_v2.HttpRequest(
        http_method=tasks_v2.HttpMethod.POST,
        url=target_url,
        headers={
            'Content-Type': 'application/json',
            'X-Task-Dispatch-Secret': settings.cloud_tasks_secret,
        },
        body=body,
    )
    if settings.cloud_tasks_service_account_email:
        http_request.oidc_token = tasks_v2.OidcToken(
            service_account_email=settings.cloud_tasks_service_account_email,
            audience=settings.cloud_tasks_oidc_audience or target_url,
        )

    task = tasks_v2.Task(http_request=http_request)
    if delay_seconds > 0:
        schedule_time = timestamp_pb2.Timestamp()
        schedule_time.FromDatetime(datetime.now(timezone.utc) + timedelta(seconds=delay_seconds))
        task.schedule_time = schedule_time

    deadline_seconds = max(15, min(int(settings.cloud_tasks_dispatch_deadline_seconds), 1800))
    task.dispatch_deadline = duration_pb2.Duration(seconds=deadline_seconds)

    try:
        client.create_task(parent=parent, task=task)
    except Exception as exc:
        raise TaskDispatchError(f'Failed to enqueue Cloud Task for {task_public_id}: {exc}') from exc
