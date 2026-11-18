from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_user_from_token
from app.api.routers.tasks import _is_retryable_task_error, _load_task_snapshot, _serialize_task_status
from app.core.config import settings
from app.db.models import TaskStatus
from app.db.session import SessionLocal
from app.services.review_task_processor import public_task_error_message

router = APIRouter(tags=['realtime'])


def _http_exception_message_ws(exc) -> str:
    detail = exc.detail
    if isinstance(detail, dict):
        return str(detail.get('message') or detail.get('detail') or 'Request failed')
    return str(detail)


def _authenticate_task_stream(token: str) -> int:
    with SessionLocal() as db:
        return get_user_from_token(token, db).id


def _load_task_stream_update(task_id: str, owner_user_id: int) -> tuple[dict | None, bool]:
    # Build a plain payload before closing the session so no ORM access escapes
    # the thread pool or keeps a connection checked out between updates.
    with SessionLocal() as db:
        task, review, latest_event = _load_task_snapshot(db, task_id=task_id, owner_user_id=owner_user_id)
        if task is None:
            return None, False
        payload = {
            'type': 'task.update',
            'task': _serialize_task_status(task, review),
            'event': {
                'event_type': latest_event.event_type,
                'message': public_task_error_message(
                    latest_event.error_code,
                    retryable=_is_retryable_task_error(task),
                    fallback=latest_event.message,
                ),
                'created_at': latest_event.created_at.isoformat(),
            } if latest_event else None,
        }
        terminal = task.status in {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.EXPIRED, TaskStatus.DEAD_LETTER}
        return jsonable_encoder(payload), terminal


@router.websocket('/ws/tasks/{task_id}')
async def stream_task_status(websocket: WebSocket, task_id: str):
    token = websocket.cookies.get('ps_guest_token')
    if not token:
        protocol_header = websocket.headers.get('sec-websocket-protocol', '')
        protocols = [item.strip() for item in protocol_header.split(',') if item.strip()]
        if len(protocols) >= 2 and protocols[0] == 'picspeak-auth':
            token = protocols[1]
    if not token:
        await websocket.close(code=4401, reason='Missing access token')
        return

    try:
        try:
            owner_user_id = await run_in_threadpool(_authenticate_task_stream, token)
        except HTTPException as exc:
            await websocket.close(code=4401, reason=_http_exception_message_ws(exc))
            return

        await websocket.accept(subprotocol='picspeak-auth')
        last_payload: str | None = None

        while True:
            encoded_payload, terminal = await run_in_threadpool(_load_task_stream_update, task_id, owner_user_id)
            if encoded_payload is None:
                await websocket.send_json({'error': {'code': 'TASK_NOT_FOUND', 'message': 'Task not found'}})
                await websocket.close(code=4404)
                return
            payload_json = json.dumps(encoded_payload, sort_keys=True, default=str)
            if payload_json != last_payload:
                await websocket.send_json(encoded_payload)
                last_payload = payload_json

            if terminal:
                await websocket.close(code=1000)
                return

            await asyncio.sleep(max(settings.ws_task_poll_interval_ms, 250) / 1000)
    except WebSocketDisconnect:
        return
