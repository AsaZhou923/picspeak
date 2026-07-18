from __future__ import annotations

from sqlalchemy.exc import DBAPIError, OperationalError, TimeoutError as SQLAlchemyTimeoutError


def is_database_unavailable_error(exc: Exception) -> bool:
    return isinstance(exc, (OperationalError, SQLAlchemyTimeoutError)) or (
        isinstance(exc, DBAPIError) and exc.connection_invalidated
    )


def describe_export_error(exc: Exception, *, max_length: int = 300) -> str:
    details = getattr(exc, 'orig', None) or exc
    message = ' '.join(str(details).split())
    if len(message) > max_length:
        message = message[: max_length - 3].rstrip() + '...'
    return f'{exc.__class__.__name__}: {message}' if message else exc.__class__.__name__
