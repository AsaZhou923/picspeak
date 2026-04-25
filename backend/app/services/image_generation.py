from __future__ import annotations

import base64
from dataclasses import dataclass
import json
import time
import uuid
from typing import Any
from urllib import error as urllib_error
from urllib.parse import quote
from urllib import request as urllib_request

from app.core.config import settings


class ImageGenerationError(RuntimeError):
    pass


@dataclass(slots=True)
class ImageGenerationResult:
    image_bytes: bytes
    content_type: str
    revised_prompt: str | None = None
    input_text_tokens: int | None = None
    input_image_tokens: int | None = None
    output_image_tokens: int | None = None
    cost_usd: float | None = None
    model_name: str = 'gpt-image-2'


class OpenAIImageGenerationClient:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        api_url: str | None = None,
        api_base_url: str | None = None,
        timeout_seconds: int | None = None,
        model_name: str | None = None,
    ) -> None:
        self.api_key = (api_key if api_key is not None else settings.openai_api_key).strip()
        self.api_url = _resolve_generation_api_url(
            api_url=api_url if api_url is not None else settings.image_generation_api_url,
            api_base_url=api_base_url,
        )
        self.timeout_seconds = timeout_seconds or settings.image_generation_timeout_seconds
        self.model_name = _resolve_model_name(model_name or settings.image_generation_model, self.api_url)

    def generate(
        self,
        *,
        prompt: str,
        quality: str,
        size: str,
        output_format: str = 'webp',
    ) -> ImageGenerationResult:
        if not self.api_key:
            raise ImageGenerationError('OPENAI_API_KEY is not configured')

        payload = {
            'model': self.model_name,
            'prompt': prompt,
            'quality': quality,
            'n': 1,
            'output_format': output_format,
        }
        if _is_apimart_endpoint(self.api_url):
            payload['size'] = _to_apimart_size(size)
            payload['resolution'] = _to_apimart_resolution(quality=quality, size=payload['size'])
        else:
            payload['size'] = size
            payload['response_format'] = 'b64_json'
        response = self._post_json(payload)
        return self._parse_generation_response(response, output_format=output_format)

    def edit(
        self,
        *,
        prompt: str,
        quality: str,
        size: str,
        image_bytes: bytes,
        image_content_type: str,
        image_filename: str = 'reference.png',
        output_format: str = 'webp',
    ) -> ImageGenerationResult:
        if not self.api_key:
            raise ImageGenerationError('OPENAI_API_KEY is not configured')
        if _is_apimart_endpoint(self.api_url):
            raise ImageGenerationError('Reference image edits are not supported by the configured image endpoint')

        fields = {
            'model': self.model_name,
            'prompt': prompt,
            'quality': quality,
            'size': size,
            'n': '1',
            'response_format': 'b64_json',
            'output_format': output_format,
        }
        files = {
            'image': (image_filename, image_content_type or 'image/png', image_bytes),
        }
        response = self._post_multipart(_edits_api_url(self.api_url), fields=fields, files=files)
        return self._parse_generation_response(response, output_format=output_format)

    def _post_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode('utf-8')
        request = urllib_request.Request(
            self.api_url,
            data=body,
            headers={
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'PicSpeak/1.0 (+https://picspeak.app)',
            },
            method='POST',
        )
        try:
            with urllib_request.urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib_error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='replace')
            raise ImageGenerationError(f'OpenAI image generation HTTP {exc.code}: {detail[:500]}') from exc
        except urllib_error.URLError as exc:
            raise ImageGenerationError(f'OpenAI image generation request failed: {exc.reason}') from exc
        except json.JSONDecodeError as exc:
            raise ImageGenerationError('OpenAI image generation returned invalid JSON') from exc

    def _post_multipart(
        self,
        url: str,
        *,
        fields: dict[str, str],
        files: dict[str, tuple[str, str, bytes]],
    ) -> dict[str, Any]:
        boundary = f'----PicSpeakBoundary{uuid.uuid4().hex}'
        body = _build_multipart_body(boundary=boundary, fields=fields, files=files)
        request = urllib_request.Request(
            url,
            data=body,
            headers={
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': f'multipart/form-data; boundary={boundary}',
                'Accept': 'application/json',
                'User-Agent': 'PicSpeak/1.0 (+https://picspeak.app)',
            },
            method='POST',
        )
        try:
            with urllib_request.urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib_error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='replace')
            raise ImageGenerationError(f'OpenAI image edit HTTP {exc.code}: {detail[:500]}') from exc
        except urllib_error.URLError as exc:
            raise ImageGenerationError(f'OpenAI image edit request failed: {exc.reason}') from exc
        except json.JSONDecodeError as exc:
            raise ImageGenerationError('OpenAI image edit returned invalid JSON') from exc

    def _parse_generation_response(self, payload: dict[str, Any], *, output_format: str) -> ImageGenerationResult:
        _raise_payload_error(payload)
        data = payload.get('data')
        if not isinstance(data, list) or not data:
            raise ImageGenerationError('OpenAI image generation response did not include image data')
        first = data[0] if isinstance(data[0], dict) else {}
        task_id = first.get('task_id')
        if isinstance(task_id, str) and task_id.strip():
            return self._poll_task_result(task_id.strip(), output_format=output_format)

        b64_json = first.get('b64_json')
        if not isinstance(b64_json, str) or not b64_json.strip():
            raise ImageGenerationError('OpenAI image generation response did not include b64_json')
        try:
            image_bytes = base64.b64decode(b64_json)
        except ValueError as exc:
            raise ImageGenerationError('OpenAI image generation returned invalid base64 image data') from exc

        usage = payload.get('usage') if isinstance(payload.get('usage'), dict) else {}
        return ImageGenerationResult(
            image_bytes=image_bytes,
            content_type=f'image/{output_format}',
            revised_prompt=first.get('revised_prompt') if isinstance(first.get('revised_prompt'), str) else None,
            input_text_tokens=_optional_int(usage.get('input_text_tokens') or usage.get('input_tokens')),
            input_image_tokens=_optional_int(usage.get('input_image_tokens')),
            output_image_tokens=_optional_int(usage.get('output_image_tokens')),
            model_name=self.model_name,
        )

    def _poll_task_result(self, task_id: str, *, output_format: str) -> ImageGenerationResult:
        deadline = time.monotonic() + self.timeout_seconds
        poll_interval_seconds = 5
        last_status = 'submitted'
        while time.monotonic() < deadline:
            payload = self._get_json(_task_status_url(self.api_url, task_id))
            _raise_payload_error(payload)
            data = payload.get('data') if isinstance(payload.get('data'), dict) else {}
            status = str(data.get('status') or '').strip().lower()
            if status:
                last_status = status
            if status == 'completed':
                image_url = _extract_apimart_image_url(data)
                image_bytes, content_type = self._download_image(image_url)
                return ImageGenerationResult(
                    image_bytes=image_bytes,
                    content_type=content_type or f'image/{output_format}',
                    model_name=self.model_name,
                )
            if status == 'failed':
                message = data.get('error') or data.get('message') or 'remote image generation task failed'
                raise ImageGenerationError(f'OpenAI image generation task failed: {message}')
            time.sleep(poll_interval_seconds)
        raise ImageGenerationError(f'OpenAI image generation task timed out while {last_status}')

    def _get_json(self, url: str) -> dict[str, Any]:
        request = urllib_request.Request(
            url,
            headers={
                'Authorization': f'Bearer {self.api_key}',
                'Accept': 'application/json',
                'User-Agent': 'PicSpeak/1.0 (+https://picspeak.app)',
            },
            method='GET',
        )
        try:
            with urllib_request.urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib_error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='replace')
            raise ImageGenerationError(f'OpenAI image generation HTTP {exc.code}: {detail[:500]}') from exc
        except urllib_error.URLError as exc:
            raise ImageGenerationError(f'OpenAI image generation request failed: {exc.reason}') from exc
        except json.JSONDecodeError as exc:
            raise ImageGenerationError('OpenAI image generation returned invalid JSON') from exc

    def _download_image(self, image_url: str) -> tuple[bytes, str | None]:
        request = urllib_request.Request(
            image_url,
            headers={'Accept': 'image/*', 'User-Agent': 'PicSpeak/1.0 (+https://picspeak.app)'},
            method='GET',
        )
        try:
            with urllib_request.urlopen(request, timeout=self.timeout_seconds) as response:
                return response.read(), response.headers.get('Content-Type')
        except urllib_error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='replace')
            raise ImageGenerationError(f'Generated image download HTTP {exc.code}: {detail[:500]}') from exc
        except urllib_error.URLError as exc:
            raise ImageGenerationError(f'Generated image download failed: {exc.reason}') from exc


def _optional_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _resolve_generation_api_url(*, api_url: str | None, api_base_url: str | None = None) -> str:
    if api_base_url:
        base_url = api_base_url.strip().rstrip('/')
        if base_url.endswith('/images/generations'):
            return base_url
        return f'{base_url}/images/generations'

    resolved_url = (api_url or '').strip().rstrip('/')
    if not resolved_url:
        return 'https://api.openai.com/v1/images/generations'
    if resolved_url.endswith('/images/generations'):
        return resolved_url
    return f'{resolved_url}/images/generations'


def _resolve_model_name(model_name: str | None, api_url: str) -> str:
    normalized = str(model_name or '').strip()
    if _is_apimart_endpoint(api_url) and normalized in {'', 'gpt-image-2'}:
        return 'gpt-image-2-official'
    return normalized or 'gpt-image-2'


def _is_apimart_endpoint(api_url: str) -> bool:
    return 'api.apimart.ai' in api_url.lower()


def _to_apimart_size(size: str) -> str:
    normalized = str(size or '').strip().lower()
    return {
        '1024x1024': '1:1',
        '1024x1536': '9:16',
        '1536x1024': '16:9',
    }.get(normalized, normalized or '1:1')


def _to_apimart_resolution(*, quality: str, size: str) -> str:
    normalized_quality = str(quality or '').strip().lower()
    normalized_size = str(size or '').strip().lower()
    if normalized_quality == 'low':
        return '1k'
    if normalized_quality == 'medium':
        return '2k'
    if normalized_quality == 'high':
        if normalized_size in {'16:9', '9:16', '2:1', '1:2', '21:9', '9:21'}:
            return '4k'
        return '2k'
    return '1k'


def _task_status_url(api_url: str, task_id: str) -> str:
    base_url = api_url.strip().rstrip('/')
    encoded_task_id = quote(task_id, safe='')
    if base_url.endswith('/images/generations'):
        return f'{base_url[: -len("/images/generations")]}/tasks/{encoded_task_id}'
    return f'{base_url}/tasks/{encoded_task_id}'


def _edits_api_url(api_url: str) -> str:
    normalized = api_url.strip().rstrip('/')
    if normalized.endswith('/images/generations'):
        return f'{normalized[: -len("/images/generations")]}/images/edits'
    return f'{normalized}/images/edits'


def _build_multipart_body(
    *,
    boundary: str,
    fields: dict[str, str],
    files: dict[str, tuple[str, str, bytes]],
) -> bytes:
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f'--{boundary}\r\n'.encode('utf-8'),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode('utf-8'),
                str(value).encode('utf-8'),
                b'\r\n',
            ]
        )
    for name, (filename, content_type, payload) in files.items():
        safe_filename = filename.replace('"', '')
        chunks.extend(
            [
                f'--{boundary}\r\n'.encode('utf-8'),
                (
                    f'Content-Disposition: form-data; name="{name}"; '
                    f'filename="{safe_filename}"\r\n'
                ).encode('utf-8'),
                f'Content-Type: {content_type or "application/octet-stream"}\r\n\r\n'.encode('utf-8'),
                payload,
                b'\r\n',
            ]
        )
    chunks.append(f'--{boundary}--\r\n'.encode('utf-8'))
    return b''.join(chunks)


def _extract_apimart_image_url(data: dict[str, Any]) -> str:
    result = data.get('result') if isinstance(data.get('result'), dict) else {}
    images = result.get('images')
    if not isinstance(images, list) or not images:
        raise ImageGenerationError('OpenAI image generation task completed without image result')
    first = images[0] if isinstance(images[0], dict) else {}
    raw_url = first.get('url')
    if isinstance(raw_url, list) and raw_url:
        raw_url = raw_url[0]
    if not isinstance(raw_url, str) or not raw_url.strip():
        raise ImageGenerationError('OpenAI image generation task completed without image URL')
    return raw_url.strip()


def _raise_payload_error(payload: dict[str, Any]) -> None:
    error_payload = payload.get('error')
    if not isinstance(error_payload, dict):
        return
    code = error_payload.get('code') or payload.get('code') or 'unknown'
    message = error_payload.get('message') or error_payload.get('type') or 'unknown image generation error'
    raise ImageGenerationError(f'OpenAI image generation error {code}: {message}')
