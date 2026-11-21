from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
import json
import logging
import re
import sys
from typing import Any, Iterator

from app.core.config import settings
from app.services.audit import mask_capability_url_text

SERVICE_NAME = 'picspeak-api'
ERROR_REPORTING_TYPE = 'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent'

_request_id_var: ContextVar[str | None] = ContextVar('picspeak_request_id', default=None)
_user_public_id_var: ContextVar[str | None] = ContextVar('picspeak_user_public_id', default=None)
_request_path_var: ContextVar[str | None] = ContextVar('picspeak_request_path', default=None)

# Worker correlation. Worker logs have no originating HTTP request, so they
# carry these task identifiers instead of request_id.
_WORKER_LOG_CONTEXT_VARS: dict[str, ContextVar[str | None]] = {
    'worker_name': ContextVar('picspeak_worker_name', default=None),
    'task_public_id': ContextVar('picspeak_task_public_id', default=None),
    'task_kind': ContextVar('picspeak_task_kind', default=None),
    'owner_public_id': ContextVar('picspeak_owner_public_id', default=None),
}

_CAPABILITY_PATH_RE = re.compile(r'(/(?:public/reviews|share)/)([^/?#\s"\'<>]+)', re.IGNORECASE)
_AMZ_QUERY_PARAM_RE = re.compile(
    r'((?:^|[?&]|%3[fF]|%26|\\u0026|\\u003[fF]|&amp;)x-amz-[a-z0-9_-]+(?:=|%3[dD]|\\u003[dD]))'
    r'.*?'
    r'(?=$|[&\s"\'<>]|%26|\\u0026|&amp;)',
    re.IGNORECASE,
)

_saved_uvicorn_handlers: dict[str, tuple[list[logging.Handler], bool]] = {}

_STANDARD_LOG_RECORD_ATTRS = frozenset({
    'args',
    'asctime',
    'created',
    'exc_info',
    'exc_text',
    'filename',
    'funcName',
    'levelname',
    'levelno',
    'lineno',
    'module',
    'msecs',
    'message',
    'msg',
    'name',
    'pathname',
    'process',
    'processName',
    'relativeCreated',
    'stack_info',
    'taskName',
    'thread',
    'threadName',
    # Internal / explicitly handled attributes
    'report_error',
    'request_id',
    'user_public_id',
    'request_path',
})

_SEVERITY_BY_LEVEL = {
    logging.DEBUG: 'DEBUG',
    logging.INFO: 'INFO',
    logging.WARNING: 'WARNING',
    logging.ERROR: 'ERROR',
    logging.CRITICAL: 'CRITICAL',
}


def mask_capability_path(path: str) -> str:
    """Mask capability-bearing path segments such as /public/reviews/{share_token}."""
    return _CAPABILITY_PATH_RE.sub(r'\1***', path)


def mask_capability_log_text(text: str) -> str:
    """Mask capability query params (including X-Amz-*) and share-token path segments."""
    masked = mask_capability_url_text(text)
    masked = _AMZ_QUERY_PARAM_RE.sub(r'\1***', masked)
    masked = mask_capability_path(masked)
    return masked


def _mask_log_value(value: Any) -> Any:
    if isinstance(value, str):
        return mask_capability_log_text(value)
    if isinstance(value, tuple):
        return tuple(_mask_log_value(item) for item in value)
    if isinstance(value, list):
        return [_mask_log_value(item) for item in value]
    if isinstance(value, dict):
        return {k: _mask_log_value(v) for k, v in value.items()}
    return value


def mark_exception_reported(exc: BaseException) -> None:
    """Mark an exception as already reported by the app's exception handler."""
    # Mark the object itself: id()-based bookkeeping could match a later,
    # unrelated exception that reuses a freed id and hide a real error.
    try:
        setattr(exc, '_picspeak_error_reported', True)
    except Exception:
        pass


def is_exception_reported(exc: BaseException | None) -> bool:
    """Return True if exc (or a wrapped cause/context/sub-exception) was already reported."""
    if exc is None:
        return False
    seen: set[int] = set()
    stack: list[BaseException] = [exc]
    while stack:
        current = stack.pop()
        obj_id = id(current)
        if obj_id in seen:
            continue
        seen.add(obj_id)
        if getattr(current, '_picspeak_error_reported', False):
            return True
        if current.__cause__ is not None:
            stack.append(current.__cause__)
        if current.__context__ is not None:
            stack.append(current.__context__)
        sub_exceptions = getattr(current, 'exceptions', None)
        if isinstance(sub_exceptions, (tuple, list)):
            for sub in sub_exceptions:
                if isinstance(sub, BaseException):
                    stack.append(sub)
    return False


def bind_request_log_context(
    *,
    request_id: str | None,
    request_path: str | None,
    user_public_id: str | None = None,
) -> tuple[Token[str | None], Token[str | None], Token[str | None]]:
    safe_path = mask_capability_path(request_path) if isinstance(request_path, str) else request_path
    return (
        _request_id_var.set(request_id),
        _request_path_var.set(safe_path),
        _user_public_id_var.set(user_public_id),
    )


def set_request_log_user(user_public_id: str | None) -> None:
    if isinstance(user_public_id, str) and user_public_id:
        _user_public_id_var.set(user_public_id)


def reset_request_log_context(tokens: tuple[Token[str | None], Token[str | None], Token[str | None]]) -> None:
    request_id_token, request_path_token, user_token = tokens
    _request_id_var.reset(request_id_token)
    _request_path_var.reset(request_path_token)
    _user_public_id_var.reset(user_token)


@contextmanager
def worker_log_context(
    *,
    worker_name: str | None = None,
    task_public_id: str | None = None,
    task_kind: str | None = None,
    owner_public_id: str | None = None,
) -> Iterator[None]:
    """Attach worker/task correlation fields to logs emitted inside the block.

    Only non-None fields are bound, so a task block nested in a worker loop keeps
    the loop's worker_name unless it overrides it.
    """
    fields = {
        'worker_name': worker_name,
        'task_public_id': task_public_id,
        'task_kind': task_kind,
        'owner_public_id': owner_public_id,
    }
    tokens = [
        (_WORKER_LOG_CONTEXT_VARS[name], _WORKER_LOG_CONTEXT_VARS[name].set(value))
        for name, value in fields.items()
        if value is not None
    ]
    try:
        yield
    finally:
        for var, token in reversed(tokens):
            var.reset(token)


def get_request_log_context() -> dict[str, str | None]:
    return {
        'request_id': _request_id_var.get(),
        'request_path': _request_path_var.get(),
        'user_public_id': _user_public_id_var.get(),
    }


def _cloud_severity(levelno: int) -> str:
    if levelno >= logging.CRITICAL:
        return 'CRITICAL'
    if levelno >= logging.ERROR:
        return 'ERROR'
    if levelno >= logging.WARNING:
        return 'WARNING'
    if levelno >= logging.INFO:
        return 'INFO'
    return _SEVERITY_BY_LEVEL.get(levelno, 'DEBUG')


class RequestContextFilter(logging.Filter):
    """Attach active request context fields to every LogRecord."""

    _picspeak_managed = True

    def filter(self, record: logging.LogRecord) -> bool:
        if not getattr(record, 'request_id', None):
            record.request_id = _request_id_var.get()
        if not getattr(record, 'user_public_id', None):
            record.user_public_id = _user_public_id_var.get()
        if not getattr(record, 'request_path', None):
            record.request_path = _request_path_var.get()
        for name, var in _WORKER_LOG_CONTEXT_VARS.items():
            value = var.get()
            if value is not None and not getattr(record, name, None):
                setattr(record, name, value)
        return True


class CapabilityMaskingFilter(logging.Filter):
    """Mask capability tokens in query strings, share paths, args, and extra fields."""

    _picspeak_managed = True

    def filter(self, record: logging.LogRecord) -> bool:
        # Preserve uvicorn.access 5-tuple args so AccessFormatter can unpack them.
        if (
            record.name == 'uvicorn.access'
            and isinstance(record.args, tuple)
            and len(record.args) == 5
        ):
            record.args = _mask_log_value(record.args)
        elif record.args:
            try:
                formatted = record.getMessage()
            except Exception:
                formatted = str(record.msg)
            record.msg = mask_capability_log_text(formatted)
            record.args = ()
        elif isinstance(record.msg, str):
            record.msg = mask_capability_log_text(record.msg)

        for attr in ('request_path', 'url'):
            val = getattr(record, attr, None)
            if isinstance(val, str):
                setattr(record, attr, mask_capability_log_text(val))
        for key in list(record.__dict__.keys()):
            if key in _STANDARD_LOG_RECORD_ATTRS or key.startswith('_') or key in {'request_path', 'url'}:
                continue
            val = record.__dict__[key]
            if isinstance(val, (str, dict, list, tuple)):
                record.__dict__[key] = _mask_log_value(val)
        return True


class DuplicateReportedExceptionFilter(logging.Filter):
    """Suppress duplicate uvicorn ASGI tracebacks for exceptions already reported by FastAPI."""

    _picspeak_managed = True

    def filter(self, record: logging.LogRecord) -> bool:
        if record.name == 'uvicorn.error' and record.exc_info and is_exception_reported(record.exc_info[1]):
            return False
        return True


class CloudLoggingJsonFormatter(logging.Formatter):
    """Format log records as single-line JSON for Cloud Logging & Error Reporting."""

    def format(self, record: logging.LogRecord) -> str:
        message = record.getMessage()
        if record.exc_info:
            exc_text = self.formatException(record.exc_info)
            if exc_text:
                message = f'{message}\n{exc_text}' if message else exc_text
        if record.stack_info:
            stack_text = self.formatStack(record.stack_info)
            if stack_text:
                message = f'{message}\n{stack_text}' if message else stack_text
        message = mask_capability_log_text(message)

        request_id = getattr(record, 'request_id', None) or _request_id_var.get()
        user_public_id = getattr(record, 'user_public_id', None) or _user_public_id_var.get()
        raw_path = getattr(record, 'request_path', None) or _request_path_var.get()
        request_path = mask_capability_log_text(raw_path) if isinstance(raw_path, str) else raw_path

        payload: dict[str, Any] = {
            'severity': _cloud_severity(record.levelno),
            'message': message,
            'logger': record.name,
            'serviceContext': {'service': SERVICE_NAME},
        }
        if request_id:
            payload['request_id'] = request_id
        if user_public_id:
            payload['user_public_id'] = user_public_id
        if request_path:
            payload['request_path'] = request_path
        for name, var in _WORKER_LOG_CONTEXT_VARS.items():
            value = getattr(record, name, None) or var.get()
            if value is not None:
                payload[name] = value

        for key, value in record.__dict__.items():
            if key in _STANDARD_LOG_RECORD_ATTRS or key.startswith('_') or key in payload:
                continue
            if value is not None:
                payload[key] = _mask_log_value(value)

        is_uvicorn_asgi_dup = (
            record.name == 'uvicorn.error'
            and 'Exception in ASGI application' in message
        )
        should_report_error = (
            record.levelno >= logging.ERROR
            and (bool(record.exc_info) or bool(getattr(record, 'report_error', False)))
            and not is_uvicorn_asgi_dup
        )
        if should_report_error:
            payload['@type'] = ERROR_REPORTING_TYPE
            context: dict[str, Any] = {}
            if user_public_id:
                context['user'] = user_public_id
            http_method = getattr(record, 'http_method', None)
            status_code = getattr(record, 'status_code', None)
            if request_path or http_method:
                http_request: dict[str, Any] = {}
                if http_method:
                    http_request['method'] = http_method
                if request_path:
                    http_request['url'] = request_path
                if isinstance(status_code, int):
                    http_request['responseStatusCode'] = status_code
                context['httpRequest'] = http_request
            if context:
                payload['context'] = context

        return json.dumps(payload, ensure_ascii=False, separators=(',', ':'), default=str)


class DevTextFormatter(logging.Formatter):
    """Human-readable formatter for local development logs."""

    def format(self, record: logging.LogRecord) -> str:
        request_id = getattr(record, 'request_id', None) or _request_id_var.get()
        task_public_id = getattr(record, 'task_public_id', None)
        prefix = f' [req={request_id}]' if request_id else ''
        if task_public_id:
            prefix = f'{prefix} [task={task_public_id}]'
        timestamp = self.formatTime(record, '%Y-%m-%d %H:%M:%S')
        base = f'{timestamp} {record.levelname} [{record.name}]{prefix} {record.getMessage()}'
        if record.exc_info:
            exc_text = self.formatException(record.exc_info)
            if exc_text:
                base = f'{base}\n{exc_text}'
        if record.stack_info:
            stack_text = self.formatStack(record.stack_info)
            if stack_text:
                base = f'{base}\n{stack_text}'
        return mask_capability_log_text(base)


def _is_uvicorn_default_handler(handler: logging.Handler) -> bool:
    formatter = getattr(handler, 'formatter', None)
    module = getattr(type(formatter), '__module__', '') if formatter is not None else ''
    return module.startswith('uvicorn.')


def _attach_managed_filter(target: logging.Logger | logging.Handler, flt: logging.Filter) -> None:
    for existing in list(target.filters):
        if getattr(existing, '_picspeak_managed', False) and type(existing) is type(flt):
            target.removeFilter(existing)
    target.addFilter(flt)


def _configure_uvicorn_loggers(*, use_json: bool) -> None:
    mask_filter = CapabilityMaskingFilter()
    dup_filter = DuplicateReportedExceptionFilter()

    for name in ('uvicorn', 'uvicorn.error', 'uvicorn.access'):
        uv_logger = logging.getLogger(name)
        _attach_managed_filter(uv_logger, mask_filter)
        if name == 'uvicorn.error':
            _attach_managed_filter(uv_logger, dup_filter)

        if use_json:
            uvicorn_handlers = [h for h in uv_logger.handlers if _is_uvicorn_default_handler(h)]
            if uvicorn_handlers:
                if name not in _saved_uvicorn_handlers:
                    _saved_uvicorn_handlers[name] = (list(uvicorn_handlers), uv_logger.propagate)
                for h in uvicorn_handlers:
                    uv_logger.removeHandler(h)
            if name in _saved_uvicorn_handlers or not uv_logger.handlers:
                uv_logger.propagate = True
        elif name in _saved_uvicorn_handlers:
            saved_handlers, saved_propagate = _saved_uvicorn_handlers.pop(name)
            for h in saved_handlers:
                if h not in uv_logger.handlers:
                    uv_logger.addHandler(h)
            uv_logger.propagate = saved_propagate


def configure_logging(*, json_logs: bool | None = None, stream: Any | None = None) -> logging.Handler:
    """Configure root and uvicorn logging without removing handlers installed by others."""
    use_json = settings.use_structured_json_logs if json_logs is None else bool(json_logs)
    root_logger = logging.getLogger()

    for existing in list(root_logger.handlers):
        if getattr(existing, '_picspeak_managed', False):
            root_logger.removeHandler(existing)

    handler = logging.StreamHandler(stream or sys.stdout)
    handler._picspeak_managed = True  # type: ignore[attr-defined]
    handler.addFilter(RequestContextFilter())
    handler.addFilter(CapabilityMaskingFilter())
    handler.addFilter(DuplicateReportedExceptionFilter())
    handler.setFormatter(CloudLoggingJsonFormatter() if use_json else DevTextFormatter())
    root_logger.addHandler(handler)
    if root_logger.level == logging.NOTSET or root_logger.level > logging.INFO:
        root_logger.setLevel(logging.INFO)

    _configure_uvicorn_loggers(use_json=use_json)
    return handler
