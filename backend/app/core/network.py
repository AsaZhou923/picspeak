from fastapi import Request
from ipaddress import ip_address

from app.core.config import settings


def _valid_ip(value: str) -> str | None:
    candidate = value.strip()
    if not candidate:
        return None
    try:
        ip_address(candidate)
    except ValueError:
        return None
    return candidate


def client_ip_from_request(request: Request) -> str | None:
    if settings.trust_x_forwarded_for:
        forwarded_for = request.headers.get('x-forwarded-for')
        if forwarded_for:
            candidate = forwarded_for.split(',', 1)[0].strip()
            valid_candidate = _valid_ip(candidate)
            if valid_candidate:
                return valid_candidate
    if request.client:
        return request.client.host
    return None


def device_key_from_request(request: Request) -> str | None:
    device_id = request.headers.get('x-device-id', '').strip()
    if device_id:
        return f'device:{device_id[:128]}'

    user_agent = request.headers.get('user-agent', '').strip()
    if user_agent:
        return f'ua:{user_agent[:256]}'
    return None
