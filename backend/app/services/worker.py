from __future__ import annotations

from datetime import datetime, timezone
import logging
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor, wait
from typing import Any

from app.core.config import settings
from app.core.logging_config import worker_log_context
from app.services.audit import cleanup_expired_request_logs
from app.services.guard import cleanup_expired_idempotency_keys, cleanup_expired_rate_limit_counters
from app.services.guest_cleanup import cleanup_stale_guest_users
from app.services.image_generation_task_processor import claim_next_pending_image_generation_task, expire_image_generation_tasks, process_image_generation_task
from app.services.notification_processor import cleanup_expired_notifications, process_pending_notifications
from app.services.review_task_processor import claim_next_pending_review_task, expire_review_tasks, process_review_task
from app.services.worker_health import maybe_warn_stale_pending_tasks, oldest_pending_task_ages_seconds


logger = logging.getLogger(__name__)


class ReviewWorker:
    def __init__(self, worker_name: str | None = None) -> None:
        self._running = False
        self._threads = []
        self._maintenance_lock = threading.Lock()
        self._notification_lock = threading.Lock()
        self._task_sweep_lock = threading.Lock()
        self._backlog_check_lock = threading.Lock()
        self._heartbeat_lock = threading.Lock()
        self._notification_stop_event = threading.Event()
        self._notification_thread: threading.Thread | None = None
        self._next_guest_cleanup_at = 0.0
        self._next_request_log_cleanup_at = 0.0
        self._next_limit_record_cleanup_at = 0.0
        self._next_notification_sweep_at = 0.0
        self._next_task_sweep_at = 0.0
        self._next_backlog_check_at = 0.0
        self._started_monotonic: float | None = None
        self._last_loop_at: datetime | None = None
        self._last_loop_monotonic: float | None = None
        self._last_error: str | None = None
        self._last_error_at: datetime | None = None
        self.worker_name = worker_name or settings.review_worker_name
        # Dedicated thread pool for image generation tasks (blocking I/O, up to 180s).
        # Keeps the worker main loop unblocked so review tasks can still be claimed.
        _gen_concurrency = max(int(settings.image_generation_worker_concurrency or 1), 1)
        self._gen_executor = ThreadPoolExecutor(
            max_workers=_gen_concurrency,
            thread_name_prefix=f'{self.worker_name}-gen',
        )
        self._gen_futures: list[Future] = []

    def record_heartbeat(
        self,
        *,
        now: datetime | None = None,
        now_monotonic: float | None = None,
    ) -> None:
        wall_now = now or datetime.now(timezone.utc)
        if wall_now.tzinfo is None:
            wall_now = wall_now.replace(tzinfo=timezone.utc)
        mono_now = time.monotonic() if now_monotonic is None else float(now_monotonic)
        with self._heartbeat_lock:
            self._last_loop_at = wall_now
            self._last_loop_monotonic = mono_now

    def record_error(self, error: BaseException | str, *, now: datetime | None = None) -> None:
        wall_now = now or datetime.now(timezone.utc)
        if wall_now.tzinfo is None:
            wall_now = wall_now.replace(tzinfo=timezone.utc)
        summary = f'{type(error).__name__}: {error}' if isinstance(error, BaseException) else str(error)
        with self._heartbeat_lock:
            self._last_error = summary[:500]
            self._last_error_at = wall_now

    def heartbeat_snapshot(
        self,
        *,
        stale_after_seconds: int | None = None,
        include_error_text: bool = False,
        now_monotonic: float | None = None,
    ) -> dict[str, Any]:
        threshold = max(
            int(settings.worker_heartbeat_stale_seconds if stale_after_seconds is None else stale_after_seconds),
            1,
        )
        mono_now = time.monotonic() if now_monotonic is None else float(now_monotonic)
        with self._heartbeat_lock:
            last_loop_at = self._last_loop_at
            last_loop_monotonic = self._last_loop_monotonic
            started_monotonic = self._started_monotonic
            last_error = self._last_error
            last_error_at = self._last_error_at
            running = self._running
            alive_threads = sum(1 for thread in self._threads if thread.is_alive())

        last_loop_age_seconds = (
            round(max(0.0, mono_now - last_loop_monotonic), 1)
            if last_loop_monotonic is not None
            else None
        )
        if last_loop_monotonic is not None:
            heartbeat_stale = (mono_now - last_loop_monotonic) > threshold or (running and alive_threads == 0)
        elif running:
            heartbeat_stale = alive_threads == 0 or (
                started_monotonic is not None and (mono_now - started_monotonic) > threshold
            )
        else:
            heartbeat_stale = False

        snapshot: dict[str, Any] = {
            'enabled': bool(settings.run_embedded_worker),
            'running': running,
            'alive_threads': alive_threads,
            'heartbeat_stale': heartbeat_stale,
            'last_loop_at': last_loop_at.isoformat() if last_loop_at is not None else None,
            'last_loop_age_seconds': last_loop_age_seconds,
            'has_error': last_error is not None,
            'last_error_at': last_error_at.isoformat() if last_error_at is not None else None,
        }
        if include_error_text:
            snapshot['last_error'] = last_error
        return snapshot

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        with self._heartbeat_lock:
            self._started_monotonic = time.monotonic()
        self._notification_stop_event.clear()
        self._notification_thread = threading.Thread(
            target=self._notification_maintenance_loop,
            name=f'{self.worker_name}-notifications',
            daemon=True,
        )
        self._notification_thread.start()

        worker_count = max(int(settings.review_worker_concurrency), 1)
        self._threads = []
        for idx in range(worker_count):
            thread = threading.Thread(target=self._loop, name=f'{self.worker_name}-{idx + 1}', daemon=True)
            thread.start()
            self._threads.append(thread)

    def stop(self) -> None:
        self._running = False
        with self._heartbeat_lock:
            self._started_monotonic = None
        self._notification_stop_event.set()
        if self._notification_thread and self._notification_thread.is_alive():
            self._notification_thread.join(timeout=2)
        self._notification_thread = None
        for thread in self._threads:
            if thread.is_alive():
                thread.join(timeout=2)
        self._threads = []
        self._drain_generation_futures()
        self._gen_executor.shutdown(wait=False, cancel_futures=True)

    def _loop(self) -> None:
        with worker_log_context(worker_name=self.worker_name):
            self._run_loop()

    def _run_loop(self) -> None:
        idle_sleep_seconds = max(int(settings.review_worker_idle_sleep_ms), 50) / 1000
        idle_delay = idle_sleep_seconds
        while self._running:
            task = None
            task_kind = ''
            self.record_heartbeat()
            try:
                self._run_guest_cleanup_if_due()
                self._run_request_log_cleanup_if_due()
                self._run_limit_record_cleanup_if_due()
                self._prune_done_gen_futures()

                from app.db.session import SessionLocal

                db = SessionLocal()
                try:
                    task = claim_next_pending_review_task(db, worker_name=self.worker_name)
                    task_kind = 'review' if task is not None else ''
                    if task is None:
                        task = claim_next_pending_image_generation_task(db, worker_name=self.worker_name)
                        task_kind = 'generation' if task is not None else ''
                finally:
                    db.close()

                if task is None:
                    self.record_heartbeat()
                    time.sleep(idle_delay)
                    idle_delay = min(idle_delay * 2, max(idle_sleep_seconds, 2.0))
                    continue

                idle_delay = idle_sleep_seconds
                if task_kind == 'generation':
                    logger.info('Review worker submitting image generation task %s to thread pool', task.public_id)
                    _task_public_id = task.public_id
                    _worker_name = self.worker_name
                    future = self._gen_executor.submit(
                        process_image_generation_task,
                        _task_public_id,
                        worker_name=_worker_name,
                        claim_token=task.claimed_by,
                    )
                    self._gen_futures.append(future)
                    self.record_heartbeat()
                    continue

                logger.info('Review worker claimed task %s', task.public_id)
                process_review_task(task.public_id, worker_name=self.worker_name, claim_token=task.claimed_by)
                self.record_heartbeat()
            except Exception as exc:
                self.record_error(exc)
                logger.exception(
                    'Review worker loop crashed while processing task %s',
                    getattr(task, 'public_id', None),
                    extra={
                        'event': 'worker_loop_unhandled_exception',
                        'worker_name': self.worker_name,
                        'task_public_id': getattr(task, 'public_id', None),
                        'task_kind': task_kind or None,
                    },
                )
                time.sleep(idle_sleep_seconds)
            finally:
                time.sleep(0.05)


    def _notification_maintenance_loop(self) -> None:
        with worker_log_context(worker_name=self.worker_name):
            self._run_notification_maintenance_loop()

    def _run_notification_maintenance_loop(self) -> None:
        while self._running and not self._notification_stop_event.is_set():
            try:
                self._run_task_sweep_if_due()
                self._run_pending_backlog_check_if_due()
                self._run_notification_sweep_if_due()
            except Exception as exc:
                self.record_error(exc)
                logger.exception(
                    'Worker notification maintenance loop crashed',
                    extra={
                        'event': 'worker_maintenance_unhandled_exception',
                        'worker_name': self.worker_name,
                    },
                )
            finally:
                now = time.monotonic()
                wait_seconds = 1.0
                if self._next_notification_sweep_at > now:
                    wait_seconds = min(max(self._next_notification_sweep_at - now, 0.05), 1.0)
                self._notification_stop_event.wait(wait_seconds)

    def _run_task_sweep_if_due(self) -> None:
        if time.monotonic() < self._next_task_sweep_at:
            return
        if not self._task_sweep_lock.acquire(blocking=False):
            return
        try:
            now = time.monotonic()
            if now < self._next_task_sweep_at:
                return
            self._next_task_sweep_at = now + 10

            from app.db.session import SessionLocal

            for sweep in (expire_review_tasks, expire_image_generation_tasks):
                db = SessionLocal()
                try:
                    sweep(db)
                except Exception as exc:
                    self.record_error(exc)
                    logger.exception(
                        'Failed to run task maintenance',
                        extra={'event': 'worker_task_maintenance_error', 'worker_name': self.worker_name},
                    )
                finally:
                    db.close()
        except Exception as exc:
            self.record_error(exc)
            logger.exception(
                'Failed to open or close task maintenance session',
                extra={'event': 'worker_task_maintenance_error', 'worker_name': self.worker_name},
            )
        finally:
            self._task_sweep_lock.release()

    def _run_pending_backlog_check_if_due(self) -> None:
        if time.monotonic() < self._next_backlog_check_at:
            return
        if not self._backlog_check_lock.acquire(blocking=False):
            return
        try:
            now = time.monotonic()
            if now < self._next_backlog_check_at:
                return
            self._next_backlog_check_at = now + 60

            from app.db.session import SessionLocal

            db = SessionLocal()
            try:
                ages = oldest_pending_task_ages_seconds(db)
                maybe_warn_stale_pending_tasks(
                    oldest_pending_review_seconds=ages['oldest_pending_review_seconds'],
                    oldest_pending_generation_seconds=ages['oldest_pending_generation_seconds'],
                    worker_heartbeat_stale=self.heartbeat_snapshot()['heartbeat_stale'],
                )
            finally:
                db.close()
        except Exception:
            logger.warning('Failed to inspect pending task backlog age', exc_info=True)
        finally:
            self._backlog_check_lock.release()

    def _prune_done_gen_futures(self) -> None:
        """Remove completed generation futures and log any exceptions."""
        done = [f for f in self._gen_futures if f.done()]
        for future in done:
            exc = future.exception()
            if exc is not None:
                self.record_error(exc)
                logger.error(
                    'Image generation thread raised an unhandled exception: %s',
                    exc,
                    extra={
                        'event': 'worker_generation_unhandled_exception',
                        'worker_name': self.worker_name,
                    },
                    exc_info=(type(exc), exc, exc.__traceback__),
                )
        self._gen_futures = [f for f in self._gen_futures if not f.done()]

    def _drain_generation_futures(self) -> None:
        self._prune_done_gen_futures()
        if not self._gen_futures:
            return

        timeout_seconds = max(int(settings.image_generation_shutdown_timeout_seconds or 0), 0)
        done, pending = wait(self._gen_futures, timeout=timeout_seconds)
        for future in done:
            exc = future.exception()
            if exc is not None:
                self.record_error(exc)
                logger.error(
                    'Image generation thread raised during shutdown: %s',
                    exc,
                    extra={
                        'event': 'worker_generation_unhandled_exception',
                        'worker_name': self.worker_name,
                    },
                    exc_info=(type(exc), exc, exc.__traceback__),
                )
        if pending:
            logger.warning(
                'Worker shutdown timed out with %s image generation task(s) still running after %ss',
                len(pending),
                timeout_seconds,
            )
            for future in pending:
                future.cancel()
        self._gen_futures = [future for future in pending if not future.done()]

    def _run_guest_cleanup_if_due(self) -> None:
        if not settings.guest_user_cleanup_enabled:
            return

        now = time.monotonic()
        if now < self._next_guest_cleanup_at:
            return
        if not self._maintenance_lock.acquire(blocking=False):
            return

        try:
            now = time.monotonic()
            if now < self._next_guest_cleanup_at:
                return
            self._next_guest_cleanup_at = now + max(int(settings.guest_user_cleanup_interval_seconds), 60)

            from app.db.session import SessionLocal

            db = SessionLocal()
            try:
                deleted_count = cleanup_stale_guest_users(db)
            finally:
                db.close()

            if deleted_count:
                logger.info('Deleted %s stale guest users without review history', deleted_count)
        except Exception as exc:
            self.record_error(exc)
            logger.exception('Failed to run stale guest cleanup')
        finally:
            self._maintenance_lock.release()

    def _run_request_log_cleanup_if_due(self) -> None:
        if int(settings.api_request_log_retention_days or 0) <= 0:
            return

        now = time.monotonic()
        if now < self._next_request_log_cleanup_at:
            return
        if not self._maintenance_lock.acquire(blocking=False):
            return

        try:
            now = time.monotonic()
            if now < self._next_request_log_cleanup_at:
                return
            self._next_request_log_cleanup_at = now + 60

            from app.db.session import SessionLocal

            db = SessionLocal()
            try:
                deleted_count = cleanup_expired_request_logs(db)
            finally:
                db.close()

            if deleted_count:
                logger.info('Deleted %s expired API request log(s)', deleted_count)
        except Exception as exc:
            self.record_error(exc)
            logger.exception('Failed to clean up expired API request logs')
        finally:
            self._maintenance_lock.release()

    def _run_limit_record_cleanup_if_due(self) -> None:
        now = time.monotonic()
        if now < self._next_limit_record_cleanup_at:
            return
        if not self._maintenance_lock.acquire(blocking=False):
            return

        try:
            now = time.monotonic()
            if now < self._next_limit_record_cleanup_at:
                return
            self._next_limit_record_cleanup_at = now + 60

            from app.db.session import SessionLocal

            db = SessionLocal()
            try:
                counters_deleted = cleanup_expired_rate_limit_counters(db)
                idempotency_deleted = cleanup_expired_idempotency_keys(db)
            finally:
                db.close()

            if counters_deleted or idempotency_deleted:
                logger.info(
                    'Deleted %s expired rate-limit counter(s) and %s expired idempotency record(s)',
                    counters_deleted,
                    idempotency_deleted,
                )
        except Exception as exc:
            self.record_error(exc)
            logger.exception('Failed to clean up expired rate-limit counters and idempotency records')
        finally:
            self._maintenance_lock.release()

    def _run_notification_sweep_if_due(self) -> None:
        if not getattr(settings, 'notifications_worker_enabled', True):
            return

        now = time.monotonic()
        if now < self._next_notification_sweep_at:
            return
        if not self._notification_lock.acquire(blocking=False):
            return

        try:
            now = time.monotonic()
            if now < self._next_notification_sweep_at:
                return
            interval = int(
                getattr(settings, 'notification_sweep_interval_seconds', None)
                or getattr(settings, 'notifications_worker_interval_seconds', 60)
                or 60
            )
            self._next_notification_sweep_at = now + min(max(interval, 1), 60)

            from app.db.session import SessionLocal

            db = SessionLocal()
            try:
                result = process_pending_notifications(db, limit=100)
                expired = cleanup_expired_notifications(db)
                if expired:
                    db.commit()
            finally:
                db.close()

            if result.get('processed') or expired:
                logger.info('Notification sweep processed %s event(s), deleted %s expired notification(s)', result.get('processed'), expired)
        except Exception as exc:
            self.record_error(exc)
            logger.exception('Failed to run notification sweep')
        finally:
            self._notification_lock.release()


worker = ReviewWorker()
