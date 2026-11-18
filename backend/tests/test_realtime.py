from __future__ import annotations

import asyncio
import sys
import threading
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException, WebSocketDisconnect
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers import realtime
from app.db.models import TaskStatus


class TaskSocket:
    def __init__(self, *, token: str | None = 'access-token', protocols: str = '') -> None:
        self.cookies = {'ps_guest_token': token} if token else {}
        self.headers = {'sec-websocket-protocol': protocols}
        self.accepted = False
        self.messages = []
        self.close_code = None

    async def accept(self, *, subprotocol: str) -> None:
        self.accepted = subprotocol == 'picspeak-auth'

    async def send_json(self, payload: dict) -> None:
        self.messages.append(payload)

    async def close(self, *, code: int, reason: str = '') -> None:
        self.close_code = code


def task_snapshot(status: TaskStatus = TaskStatus.PENDING):
    task = SimpleNamespace(
        public_id='tsk_stream', status=status, progress=0, attempt_count=0,
        max_attempts=3, next_attempt_at=None, last_heartbeat_at=None,
        started_at=None, finished_at=None, error_code=None, error_message=None,
    )
    return task, None, None


class RealtimeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            'sqlite://', poolclass=QueuePool, pool_size=2, max_overflow=0,
            connect_args={'check_same_thread': False},
        )
        self.sessions = sessionmaker(bind=self.engine)
        self.addCleanup(self.engine.dispose)

    async def test_waiting_sockets_return_connections_and_query_outside_event_loop(self) -> None:
        event_loop_thread = threading.get_ident()
        query_threads = []
        sleeping = 0
        all_sleeping = asyncio.Event()
        sockets = [TaskSocket() for _ in range(5)]

        def authenticate(token, db):
            self.assertEqual(token, 'access-token')
            db.execute(text('SELECT 1'))
            query_threads.append(threading.get_ident())
            return SimpleNamespace(id=7)

        def load_snapshot(db, *, task_id, owner_user_id):
            self.assertEqual((task_id, owner_user_id), ('tsk_stream', 7))
            db.execute(text('SELECT 1'))
            query_threads.append(threading.get_ident())
            return task_snapshot()

        async def sleep_between_updates(_seconds):
            nonlocal sleeping
            sleeping += 1
            if sleeping == len(sockets):
                self.assertEqual(self.engine.pool.checkedout(), 0)
                all_sleeping.set()
            await asyncio.wait_for(all_sleeping.wait(), timeout=3)
            raise WebSocketDisconnect()

        with (
            patch.object(realtime, 'SessionLocal', self.sessions),
            patch.object(realtime, 'get_user_from_token', side_effect=authenticate),
            patch.object(realtime, '_load_task_snapshot', side_effect=load_snapshot),
            patch.object(realtime.asyncio, 'sleep', side_effect=sleep_between_updates),
        ):
            await asyncio.wait_for(
                asyncio.gather(*(realtime.stream_task_status(socket, 'tsk_stream') for socket in sockets)),
                timeout=5,
            )

        self.assertEqual(len(query_threads), len(sockets) * 2)
        self.assertTrue(all(thread_id != event_loop_thread for thread_id in query_threads))
        self.assertTrue(all(socket.accepted and len(socket.messages) == 1 for socket in sockets))
        self.assertEqual(self.engine.pool.checkedout(), 0)

    async def test_duplicate_updates_are_suppressed_and_terminal_event_is_serialized(self) -> None:
        socket = TaskSocket(token=None, protocols='picspeak-auth, bearer-token')
        finished_task, _, _ = task_snapshot(TaskStatus.SUCCEEDED)
        event_time = datetime(2026, 11, 18, tzinfo=timezone.utc)
        event = SimpleNamespace(event_type='completed', error_code=None, message='Done', created_at=event_time)
        snapshots = [task_snapshot(), task_snapshot(), (finished_task, SimpleNamespace(public_id='rev_done'), event)]

        with (
            patch.object(realtime, 'SessionLocal', self.sessions),
            patch.object(realtime, 'get_user_from_token', return_value=SimpleNamespace(id=7)) as authenticate,
            patch.object(realtime, '_load_task_snapshot', side_effect=snapshots) as load_snapshot,
            patch.object(realtime.asyncio, 'sleep'),
        ):
            await realtime.stream_task_status(socket, 'tsk_stream')

        self.assertEqual(authenticate.call_args.args[0], 'bearer-token')
        self.assertTrue(socket.accepted)
        self.assertEqual(load_snapshot.call_count, 3)
        self.assertTrue(all(call.kwargs == {'task_id': 'tsk_stream', 'owner_user_id': 7} for call in load_snapshot.call_args_list))
        self.assertEqual(len(socket.messages), 2)
        self.assertEqual(socket.messages[-1]['task']['review_id'], 'rev_done')
        self.assertEqual(socket.messages[-1]['event']['created_at'], event_time.isoformat())
        self.assertEqual(socket.close_code, 1000)

    async def test_missing_or_invalid_authentication_closes_before_accepting(self) -> None:
        missing = TaskSocket(token=None)
        invalid = TaskSocket()

        def reject_token(_token, db):
            db.execute(text('SELECT 1'))
            raise HTTPException(status_code=401, detail='Invalid token')

        with (
            patch.object(realtime, 'SessionLocal', self.sessions),
            patch.object(realtime, 'get_user_from_token', side_effect=reject_token) as authenticate,
        ):
            await realtime.stream_task_status(missing, 'tsk_stream')
            await realtime.stream_task_status(invalid, 'tsk_stream')

        self.assertEqual(authenticate.call_count, 1)
        self.assertEqual((missing.close_code, invalid.close_code), (4401, 4401))
        self.assertFalse(missing.accepted or invalid.accepted)
        self.assertEqual(self.engine.pool.checkedout(), 0)

    async def test_missing_or_foreign_task_closes_with_not_found(self) -> None:
        socket = TaskSocket()
        with (
            patch.object(realtime, 'SessionLocal', self.sessions),
            patch.object(realtime, 'get_user_from_token', return_value=SimpleNamespace(id=7)),
            patch.object(realtime, '_load_task_snapshot', return_value=(None, None, None)),
        ):
            await realtime.stream_task_status(socket, 'tsk_foreign')

        self.assertEqual(socket.close_code, 4404)
        self.assertEqual(socket.messages[0]['error']['code'], 'TASK_NOT_FOUND')

    async def test_snapshot_failure_returns_connection(self) -> None:
        def fail_snapshot(db, **_kwargs):
            db.execute(text('SELECT 1'))
            raise RuntimeError('query failed')

        with (
            patch.object(realtime, 'SessionLocal', self.sessions),
            patch.object(realtime, 'get_user_from_token', return_value=SimpleNamespace(id=7)),
            patch.object(realtime, '_load_task_snapshot', side_effect=fail_snapshot),
        ):
            with self.assertRaisesRegex(RuntimeError, 'query failed'):
                await realtime.stream_task_status(TaskSocket(), 'tsk_stream')

        self.assertEqual(self.engine.pool.checkedout(), 0)
