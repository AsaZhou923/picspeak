from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import settings


class ContentAuditError(RuntimeError):
    pass


@dataclass
class ContentAuditResult:
    safe: bool
    nsfw_score: float
    label: str
    reason: str
    latency_ms: int


def _extract_json_object(content: str) -> dict:
    content = content.strip()
    if not content:
        raise ContentAuditError('Empty moderation response')

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    match = re.search(r'\{.*\}', content, flags=re.DOTALL)
    if not match:
        raise ContentAuditError('Moderation response is not valid JSON')

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise ContentAuditError('Moderation response JSON parse failed') from exc


def _extract_content(message_content: object) -> str:
    if isinstance(message_content, str):
        return message_content
    if isinstance(message_content, list):
        texts: list[str] = []
        for item in message_content:
            if isinstance(item, dict) and item.get('type') == 'text':
                text = item.get('text')
                if isinstance(text, str):
                    texts.append(text)
        return '\n'.join(texts)
    raise ContentAuditError('Unsupported moderation message content format')


def _normalize_result(parsed: dict) -> ContentAuditResult:
    safe = bool(parsed.get('safe', True))
    raw_score = parsed.get('nsfw_score', 0)
    try:
        score = float(raw_score)
    except (TypeError, ValueError) as exc:
        raise ContentAuditError('Invalid nsfw_score in moderation response') from exc
    score = max(0.0, min(score, 1.0))

    label = str(parsed.get('label') or ('safe' if safe else 'unsafe'))[:50]
    reason = str(parsed.get('reason') or '')[:300]
    return ContentAuditResult(safe=safe, nsfw_score=score, label=label, reason=reason, latency_ms=0)


def run_content_audit(image_url: str) -> ContentAuditResult:
    if not settings.image_audit_enabled:
        return ContentAuditResult(safe=True, nsfw_score=0.0, label='disabled', reason='audit disabled', latency_ms=0)

    if not settings.siliconflow_api_key:
        raise ContentAuditError('SILICONFLOW_API_KEY is not configured')

    endpoint = settings.siliconflow_base_url.rstrip('/') + '/chat/completions'
    prompt = (
        '你是图片内容审核器。请判断图片是否含有明显涉黄、性暗示、裸露、血腥暴力、仇恨或违法内容。'
        '必须只输出 JSON：{"safe":true/false,"nsfw_score":0-1,"label":"safe|sexual|violence|illegal|other","reason":"..."}。'
        '其中 nsfw_score 越高表示越不安全。'
    )
    payload = {
        'model': settings.ai_model_name,
        'temperature': 0,
        'response_format': {'type': 'json_object'},
        'messages': [
            {'role': 'system', 'content': '你是严格返回 JSON 的图片安全审核助手。'},
            {
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': prompt},
                    {'type': 'image_url', 'image_url': {'url': image_url}},
                ],
            },
        ],
    }

    req = Request(
        endpoint,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {settings.siliconflow_api_key}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )

    start = time.perf_counter()
    try:
        with urlopen(req, timeout=settings.ai_timeout_seconds) as resp:
            body = json.loads(resp.read().decode('utf-8'))
    except HTTPError as exc:
        err_body = exc.read().decode('utf-8', errors='ignore') if hasattr(exc, 'read') else str(exc)
        raise ContentAuditError(f'SiliconFlow HTTP {exc.code}: {err_body[:300]}') from exc
    except URLError as exc:
        raise ContentAuditError(f'SiliconFlow request failed: {exc.reason}') from exc

    latency_ms = int((time.perf_counter() - start) * 1000)
    try:
        choice = body['choices'][0]
        message = choice['message']
        content = _extract_content(message.get('content'))
        parsed = _extract_json_object(content)
        result = _normalize_result(parsed)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ContentAuditError('Invalid SiliconFlow moderation response') from exc

    result.latency_ms = latency_ms
    if result.nsfw_score >= settings.image_audit_reject_threshold:
        result.safe = False
        if result.label == 'safe':
            result.label = 'unsafe'
    return result
