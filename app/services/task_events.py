from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.db.models import ReviewTask, ReviewTaskEvent


def record_task_event(
    db: Session,
    task: ReviewTask,
    *,
    event_type: str,
    message: str | None = None,
    payload: dict[str, Any] | None = None,
) -> ReviewTaskEvent:
    event = ReviewTaskEvent(
        task_id=task.id,
        task_public_id=task.public_id,
        event_type=event_type,
        status=task.status.value if hasattr(task.status, 'value') else str(task.status),
        progress=int(task.progress or 0),
        attempt_count=int(task.attempt_count or 0),
        error_code=task.error_code,
        message=message,
        payload_json=payload or {},
    )
    db.add(event)
    return event
