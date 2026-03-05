from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas import ReviewResult


class AIReviewError(RuntimeError):
    pass


@dataclass
class AIReviewResponse:
    result: ReviewResult
    model_name: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    latency_ms: int | None = None


def _prompt_for_mode(mode: str) -> str:
    depth = '详细且专业' if mode == 'pro' else '简洁且直接'
    return (
        f'请你作为摄影点评师，对输入照片进行{depth}的点评。'
        '评分基准：以该照片所属题材的顶级大师作品作为 10 分参考标准（如风光、人像、街拍、纪实等各自题材内对标），'
        '打分要偏严格、克制，只有接近大师水准才可给高分。'
        '必须只输出一个 JSON 对象，不要输出 markdown。'
        'JSON 字段必须严格为：'
        '{"schema_version":"1.0","scores":{"composition":0-10,"lighting":0-10,"color":0-10,"story":0-10,"technical":0-10},'
        '"advantage":"...","critique":"...","suggestions":"..."}。'
        'scores 内所有值必须是整数。'
        'advantage 与 critique 请分别输出 1-3 条要点，使用“1. ...\\n2. ...”这种编号格式写在字符串里；'
        '每条要点需具体、可落地，避免空泛夸赞。'
        'suggestions 给出 2-4 条可执行改进建议，优先包含拍摄时机、机位、光线、构图、后期中的具体动作。'
    )


def _extract_json_object(content: str) -> dict:
    content = content.strip()
    if not content:
        raise AIReviewError('Empty model response')

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    match = re.search(r'\{.*\}', content, flags=re.DOTALL)
    if not match:
        raise AIReviewError('Model response is not valid JSON')

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise AIReviewError('Model response JSON parse failed') from exc


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
    raise AIReviewError('Unsupported message content format')


def run_ai_review(mode: str, image_url: str) -> AIReviewResponse:
    if not settings.siliconflow_api_key:
        raise AIReviewError('SILICONFLOW_API_KEY is not configured')

    endpoint = settings.siliconflow_base_url.rstrip('/') + '/chat/completions'
    payload = {
        'model': settings.ai_model_name,
        'temperature': 0.2,
        'response_format': {'type': 'json_object'},
        'messages': [
            {'role': 'system', 'content': '你是一个严格返回 JSON 的摄影点评助手，审美标准高、评分偏严格。'},
            {
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': _prompt_for_mode(mode)},
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
        raise AIReviewError(f'SiliconFlow HTTP {exc.code}: {err_body[:300]}') from exc
    except URLError as exc:
        raise AIReviewError(f'SiliconFlow request failed: {exc.reason}') from exc
    latency_ms = int((time.perf_counter() - start) * 1000)

    try:
        choice = body['choices'][0]
        message = choice['message']
        content = _extract_content(message.get('content'))
        parsed = _extract_json_object(content)
        result = ReviewResult.model_validate(parsed)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise AIReviewError('Invalid SiliconFlow response structure') from exc

    usage = body.get('usage') or {}
    return AIReviewResponse(
        result=result,
        model_name=body.get('model', settings.ai_model_name),
        input_tokens=usage.get('prompt_tokens'),
        output_tokens=usage.get('completion_tokens'),
        cost_usd=None,
        latency_ms=latency_ms,
    )
