from fastapi import Request

from app.core.config import settings


def client_ip_from_request(request: Request) -> str | None:
    if settings.trust_x_forwarded_for:
        forwarded_for = request.headers.get('x-forwarded-for')
        if forwarded_for:
            candidate = forwarded_for.split(',', 1)[0].strip()
            if candidate:
                return candidate
    if request.client:
        return request.client.host
    return None
