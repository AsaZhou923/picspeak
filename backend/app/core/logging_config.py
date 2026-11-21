from __future__ import annotations

from contextvars import ContextVar, Token
import json
import logging
import sys
from typing import Any

from app.core.config import settings

SERVICE_NAME = 'picspeak-api'
ERROR_REPORTING_TYPE = 'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent'

_request_id_var: ContextVar[str | None] = ContextVar('picspeak_request_id', default=None)
_user_public_id_var: ContextVar[str | None] = ContextVar('picspeak_user_public_id', default=None)
_request_path_var: ContextVar[str | None] = ContextVar('picspeak_request_path', default=None)

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


def bind_request_log_context(
    *,
    request_id: str | None,
    request_path: str | None,
    user_public_id: str | None = None,
) -> tuple[Token[str | None], Token[str | None], Token[str | None]]:
    return (
        _request_id_var.set(request_id),
        _request_path_var.set(request_path),
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

    def filter(self, record: logging.LogRecord) -> bool:
        if not getattr(record, 'request_id', None):
            record.request_id = _request_id_var.get()
        if not getattr(record, 'user_public_id', None):
            record.user_public_id = _user_public_id_var.get()
        if not getattr(record, 'request_path', None):
            record.request_path = _request_path_var.get()
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

        request_id = getattr(record, 'request_id', None) or _request_id_var.get()
        user_public_id = getattr(record, 'user_public_id', None) or _user_public_id_var.get()
        request_path = getattr(record, 'request_path', None) or _request_path_var.get()

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

        for key, value in record.__dict__.items():
            if key in _STANDARD_LOG_RECORD_ATTRS or key.startswith('_') or key in payload:
                continue
            if value is not None:
                payload[key] = value

        should_report_error = record.levelno >= logging.ERROR and (
            bool(record.exc_info) or bool(getattr(record, 'report_error', False))
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
        prefix = f' [req={request_id}]' if request_id else ''
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
        return base


def configure_logging(*, json_logs: bool | None = None, stream: Any | None = None) -> logging.Handler:
    """Configure root logging for either Cloud Logging JSON or local readable text."""
    use_json = settings.use_structured_json_logs if json_logs is None else bool(json_logs)
    root_logger = logging.getLogger()

    for existing in list(root_logger.handlers):
        if getattr(existing, '_picspeak_managed', False):
            root_logger.removeHandler(existing)
        elif use_json and type(existing) is logging.StreamHandler:
            root_logger.removeHandler(existing)

    handler = logging.StreamHandler(stream or sys.stdout)
    handler._picspeak_managed = True  # type: ignore[attr-defined]
    handler.addFilter(RequestContextFilter())
    handler.setFormatter(CloudLoggingJsonFormatter() if use_json else DevTextFormatter())
    root_logger.addHandler(handler)
    if root_logger.level == logging.NOTSET or root_logger.level > logging.INFO:
        root_logger.setLevel(logging.INFO)
    return handler
