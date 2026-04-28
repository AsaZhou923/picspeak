from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentActor, get_current_actor, get_db
from app.core.config import settings
from app.core.errors import api_error
from app.db.models import Review, ReviewTask, ReviewTaskEvent, TaskStatus
from app.schemas import InternalTaskExecuteRequest, TaskStatusResponse
from app.services.review_task_processor import expire_review_tasks, process_review_task, public_task_error_message

router = APIRouter(tags=['tasks'])


def _is_retryable_task_error(task: ReviewTask) -> bool:
    if not task.error_code:
        return False
    if task.status == TaskStatus.PENDING and task.next_attempt_at is not None:
        return True
    if task.status == TaskStatus.RUNNING:
        return True
    return False


def _serialize_task_status(task: ReviewTask, review: Review | None = None) -> dict:
    error = None
    if task.error_code or task.error_message:
        retryable = _is_retryable_task_error(task)
        error = {
            'code': task.error_code,
            'message': public_task_error_message(task.error_code, retryable=retryable, fallback=task.error_message),
            'retryable': retryable,
            'timeout': task.error_code in {'TASK_EXPIRED', 'TASK_STALLED'},
            'failure_stage': 'pre_charge',
            'quota_charged': False,
        }
    return {
        'task_id': task.public_id,
        'status': task.status.value,
        'progress': task.progress,
        'review_id': review.public_id if review else None,
        'attempt_count': task.attempt_count,
        'max_attempts': task.max_attempts,
        'next_attempt_at': task.next_attempt_at,
        'last_heartbeat_at': task.last_heartbeat_at,
        'started_at': task.started_at,
        'finished_at': task.finished_at,
        'error': error,
    }


def _load_task_snapshot(db: Session, *, task_id: str, owner_user_id: int) -> tuple[ReviewTask | None, Review | None, ReviewTaskEvent | None]:
    expire_review_tasks(db)
    task = db.query(ReviewTask).filter(ReviewTask.public_id == task_id, ReviewTask.owner_user_id == owner_user_id).first()
    if task is None:
        return None, None, None

    review = db.query(Review).filter(Review.task_id == task.id).first()
    latest_event = (
        db.query(ReviewTaskEvent)
        .filter(ReviewTaskEvent.task_id == task.id)
        .order_by(ReviewTaskEvent.created_at.desc(), ReviewTaskEvent.id.desc())
        .first()
    )
    return task, review, latest_event


@router.get('/tasks/{task_id}', response_model=TaskStatusResponse)
def get_task_status(
    task_id: str,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    actor: CurrentActor = Depends(get_current_actor),
):
    task, review, _latest_event = _load_task_snapshot(db, task_id=task_id, owner_user_id=actor.user.id)
    if task is None:
        raise api_error(status.HTTP_404_NOT_FOUND, 'TASK_NOT_FOUND', 'Task not found')
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    db.commit()
    return TaskStatusResponse(**_serialize_task_status(task, review))


@router.post('/internal/tasks/reviews/execute')
def execute_review_task(payload: InternalTaskExecuteRequest, request: Request):
    if not settings.cloud_tasks_enabled:
        raise api_error(status.HTTP_404_NOT_FOUND, 'TASK_DISPATCH_DISABLED', 'Cloud Tasks execution is not enabled')
    header_secret = request.headers.get('X-Task-Dispatch-Secret', '')
    if not secrets.compare_digest(header_secret, settings.cloud_tasks_secret):
        raise api_error(status.HTTP_401_UNAUTHORIZED, 'TASK_DISPATCH_UNAUTHORIZED', 'Invalid task dispatch secret')
    result = process_review_task(payload.task_id, worker_name='cloud-tasks')
    if result.get('result') == 'delayed':
        raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, 'TASK_RETRY_NOT_READY', 'Task is scheduled for a later retry')
    return result
