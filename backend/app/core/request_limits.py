from __future__ import annotations

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import ApiHTTPException

REQUEST_TOO_LARGE_CODE = 'REQUEST_TOO_LARGE'
REQUEST_TOO_LARGE_MESSAGE = 'Request body is too large'


class RequestBodyTooLarge(ApiHTTPException):
    # An HTTPException, so FastAPI's body parsing re-raises it and the app's
    # error handler returns a normal 413 API error.
    def __init__(self) -> None:
        super().__init__(status_code=413, code=REQUEST_TOO_LARGE_CODE, message=REQUEST_TOO_LARGE_MESSAGE)


class RequestBodyLimitMiddleware:
    """Reject request bodies larger than ``max_body_bytes`` (0 disables).

    Photos upload directly to object storage, so API bodies stay small. Bodies
    are checked by Content-Length up front and by counting streamed bytes, so a
    chunked request cannot bypass the limit.
    """

    def __init__(self, app: ASGIApp, *, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope['type'] != 'http' or self.max_body_bytes <= 0:
            await self.app(scope, receive, send)
            return

        for name, value in scope.get('headers', []):
            if name == b'content-length':
                try:
                    declared = int(value)
                except ValueError:
                    declared = 0
                if declared > self.max_body_bytes:
                    await _send_too_large(send)
                    return

        received = 0
        response_started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message['type'] == 'http.request':
                received += len(message.get('body', b''))
                if received > self.max_body_bytes:
                    raise RequestBodyTooLarge
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if message['type'] == 'http.response.start':
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except RequestBodyTooLarge:
            if response_started:
                raise
            await _send_too_large(send)


async def _send_too_large(send: Send) -> None:
    body = json.dumps(
        {'error': {'code': REQUEST_TOO_LARGE_CODE, 'message': REQUEST_TOO_LARGE_MESSAGE}},
        separators=(',', ':'),
    ).encode('utf-8')
    await send({
        'type': 'http.response.start',
        'status': 413,
        'headers': [
            (b'content-type', b'application/json'),
            (b'content-length', str(len(body)).encode('ascii')),
            (b'connection', b'close'),
        ],
    })
    await send({'type': 'http.response.body', 'body': body})
