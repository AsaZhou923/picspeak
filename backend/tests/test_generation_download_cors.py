from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.responses import Response
from fastapi.testclient import TestClient

from app.main import app


def test_generation_download_disposition_is_exposed_on_real_cors_middleware():
    """Use the application's actual CORS configuration without DB/provider side effects."""
    cors = next(middleware for middleware in app.user_middleware if middleware.cls.__name__ == 'CORSMiddleware')
    isolated = FastAPI()
    isolated.add_middleware(cors.cls, **cors.kwargs)

    @isolated.get('/generations/example/download')
    def download():
        return Response(content=b'RIFF\x00\x00\x00\x00WEBP', media_type='image/webp',
                        headers={'Content-Disposition': 'attachment; filename="example.webp"'})

    origin = next(iter(cors.kwargs['allow_origins']), 'http://localhost:3000')
    with TestClient(isolated) as client:
        response = client.get('/generations/example/download', headers={'Origin': origin})
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] in (origin, '*')
    exposed = {part.strip().lower() for part in response.headers['access-control-expose-headers'].split(',')}
    assert {'content-disposition', 'x-request-id', 'x-guest-access-token'} <= exposed
    assert response.headers['content-disposition'] == 'attachment; filename="example.webp"'
    assert response.content.startswith(b'RIFF') and b'WEBP' in response.content
