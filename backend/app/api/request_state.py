from __future__ import annotations

from fastapi import Request


def set_current_user_public_id(request: Request, public_id: str) -> None:
    request.state.current_user_public_id = public_id


def get_current_user_public_id(request: Request) -> str | None:
    value = getattr(request.state, 'current_user_public_id', None)
    return value if isinstance(value, str) and value else None
