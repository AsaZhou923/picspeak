from fastapi import Request
from ipaddress import IPv6Address, ip_address, ip_network

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


def _forwarded_for_client_ip(forwarded_for: str) -> str | None:
    # Each trusted proxy appends the address it received the request from, so
    # only the entry written by the outermost trusted proxy identifies the
    # client. Entries further left are client-supplied and can be forged.
    hops = max(int(settings.trusted_proxy_hops), 1)
    entries = [item.strip() for item in forwarded_for.split(',')]
    if len(entries) < hops:
        return None
    return _valid_ip(entries[-hops])


def client_ip_from_request(request: Request) -> str | None:
    if settings.trust_x_forwarded_for:
        forwarded_for = request.headers.get('x-forwarded-for')
        if forwarded_for:
            forwarded_ip = _forwarded_for_client_ip(forwarded_for)
            if forwarded_ip:
                return forwarded_ip
    if request.client:
        return request.client.host
    return None


def client_network_from_request(request: Request) -> str | None:
    """Return the client's network: the IPv4 address, or the IPv6 /64 prefix.

    One IPv6 subscriber usually controls a whole /64, so per-address IPv6 keys
    would let a single client rotate through unlimited quota buckets.
    """
    client_ip = client_ip_from_request(request)
    if not client_ip:
        return None
    try:
        address = ip_address(client_ip)
    except ValueError:
        return None
    if isinstance(address, IPv6Address):
        if address.ipv4_mapped is not None:
            return str(address.ipv4_mapped)
        return str(ip_network(f'{address}/64', strict=False))
    return str(address)


def device_key_from_request(request: Request) -> str | None:
    device_id = request.headers.get('x-device-id', '').strip()
    if device_id:
        return f'device:{device_id[:128]}'

    user_agent = request.headers.get('user-agent', '').strip()
    if user_agent:
        return f'ua:{user_agent[:256]}'
    return None
