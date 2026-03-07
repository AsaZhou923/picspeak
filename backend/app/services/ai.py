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


def _is_multimodal_model(model_name: str) -> bool:
    normalized = (model_name or '').strip().lower()
    if not normalized:
        return False

    multimodal_markers = (
        '-vl',
        'vl-',
        '/vl',
    )
    return any(marker in normalized for marker in multimodal_markers)


def _is_incompatible_multimodal_model(model_name: str) -> bool:
    normalized = (model_name or '').strip().lower()
    # SiliconFlow's Qwen thinking vision variants can reject the OpenAI-style
    # multimodal messages payload we send for photo review.
    return 'qwen3-vl' in normalized and 'thinking' in normalized


def model_name_for_mode(mode: str) -> str:
    normalized = (mode or '').strip().lower()
    candidates: list[str] = []

    if normalized == 'pro' and settings.pro_model_name.strip():
        candidates.append(settings.pro_model_name.strip())
    elif normalized == 'flash' and settings.flash_model_name.strip():
        candidates.append(settings.flash_model_name.strip())

    if settings.ai_model_name.strip():
        candidates.append(settings.ai_model_name.strip())
    if settings.flash_model_name.strip():
        candidates.append(settings.flash_model_name.strip())
    if settings.pro_model_name.strip():
        candidates.append(settings.pro_model_name.strip())

    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if not _is_multimodal_model(candidate):
            continue
        if _is_incompatible_multimodal_model(candidate):
            continue
        return candidate

    raise AIReviewError(
        'No multimodal AI model is configured. Set AI_MODEL_NAME, FLASH_MODEL_NAME, or PRO_MODEL_NAME to a vision-capable model.'
    )


def _prompt_for_mode(mode: str, locale: str) -> str:
    lang = locale if locale in {'zh', 'en', 'ja'} else 'zh'
    depth_by_lang = {
        'zh': ('详细且专业', '简洁且直接'),
        'en': ('detailed and professional', 'concise and direct'),
        'ja': ('詳細かつ専門的', '簡潔で直接的'),
    }
    deep, concise = depth_by_lang[lang]
    depth = deep if mode == 'pro' else concise

    if lang == 'en':
        return (
            f'You are a photography critic. Provide a {depth} review for the input photo. '
            'Scoring baseline: 10 means top master-level work within the same genre (landscape, portrait, street, documentary, etc.). '
            'Scores must be strict and clearly differentiated; avoid giving 7-8 to ordinary photos. '
            'Most ordinary photos should be in the 3-6 range; only clearly strong photos should exceed 7. '
            'Output only one JSON object; do not output markdown. '
            'JSON schema must be exactly: '
            '{"schema_version":"1.0","scores":{"composition":0-10,"lighting":0-10,"color":0-10,"story":0-10,"technical":0-10},'
            '"advantage":"...","critique":"...","suggestions":"..."}. '
            'All values in scores must be integers from 0 to 10. '
            'For advantage, critique, and suggestions, output 1-3 numbered points in a string using format "1. ...\n2. ...". '
            'Do not force 3 points when the image evidence only supports 1 or 2 strong points. '
            'Every point must be grounded in visible evidence from the photo, logically justified, and not speculative or generic. '
            'If a point cannot be clearly supported by the image, do not include it. '
            'Suggestions must follow the same rule and should be practical, with concrete parameters or ranges when appropriate, '
            'e.g. "Exposure +1~2, Shadows +1~2, Highlights -1, White Balance -300K". '
            'All text fields must be written in English.'
        )

    if lang == 'ja':
        return (
            f'あなたは写真講評者です。入力写真に対して{depth}講評を行ってください。'
            '採点基準：同ジャンル（風景、ポートレート、ストリート、ドキュメンタリー等）のトップレベル作品を 10 点とします。'
            '採点は厳格で差が出るようにし、普通の写真に 7〜8 点を安易に付けないでください。'
            '一般的な写真は主に 3〜6 点、明確に優れた写真のみ 7 点以上にしてください。'
            '出力は JSON オブジェクト 1 つのみ。markdown は不要。'
            'JSON スキーマは厳密に：'
            '{"schema_version":"1.0","scores":{"composition":0-10,"lighting":0-10,"color":0-10,"story":0-10,"technical":0-10},'
            '"advantage":"...","critique":"...","suggestions":"..."}。'
            'scores の値は 0-10 の整数のみ。'
            'advantage・critique・suggestions はそれぞれ 1〜3 点を文字列内で「1. ...\n2. ...」形式で記載してください。'
            '根拠が 1〜2 点しかない場合は無理に 3 点に増やさないでください。'
            '各項目は写真から確認できる視覚的根拠に基づき、論理的で、こじつけや一般論にならないようにしてください。'
            '画像から明確に裏付けられない内容は書かないでください。'
            'suggestions も同様に根拠ベースで、可能な限り数値付きで具体的に（例：「露出 +1〜2、シャドウ +1〜2、ハイライト -1、色温度 -300K」）。'
            'すべてのテキスト項目は日本語で記述してください。'
        )

    return (
        f'请你作为摄影点评师，对输入照片进行{depth}的点评。'
        '评分基准：以该照片所属题材的顶级大师作品作为 10 分参考标准（如风光、人像、街拍、纪实等各自题材内对标）。'
        '打分必须严格且有明显差异性，严禁“随手一张都有 7~8 分”的宽松倾向；'
        '普通照片应更多落在 3-6 分区间，只有明显优秀才进入 7 分以上。'
        '必须只输出一个 JSON 对象，不要输出 markdown。'
        'JSON 字段必须严格为：'
        '{"schema_version":"1.0","scores":{"composition":0-10,"lighting":0-10,"color":0-10,"story":0-10,"technical":0-10},'
        '"advantage":"...","critique":"...","suggestions":"..."}。'
        'scores 内所有值必须是 0-10 的整数。'
        'advantage、critique、suggestions 都请分别输出 1-3 条要点，使用“1. ...\n2. ...”这种编号格式写在字符串里。'
        '如果画面里只有 1 条或 2 条真正站得住脚的观察，就只写 1-2 条，不要为了凑数硬写到 3 条。'
        '每条要点都必须能被照片中的具体视觉信息支撑，论证要成立，不能牵强附会、不能写空泛套话、不能脱离画面瞎猜。'
        'suggestions 也必须基于前面识别出的真实问题或潜力点，给出有依据、可执行的建议；尽量量化，包含具体参数或区间，例如“曝光 +1~2、阴影 +1~2、高光 -1、色温 -300K”，'
        '并可结合拍摄时机、机位、光线、构图、后期动作。'
        '所有文本字段请使用中文。'
    )


def _compute_final_score(scores: dict[str, int]) -> float:
    if not scores:
        raise AIReviewError('scores cannot be empty')
    values: list[int] = []
    for key in ('composition', 'lighting', 'color', 'story', 'technical'):
        if key not in scores:
            raise AIReviewError(f'Missing score field: {key}')
        value = scores[key]
        if not isinstance(value, int):
            raise AIReviewError(f'Score for {key} must be int')
        if value < 0 or value > 10:
            raise AIReviewError(f'Score for {key} out of range')
        values.append(value)
    return round(sum(values) / len(values), 1)


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


def run_ai_review(mode: str, image_url: str, locale: str = 'zh') -> AIReviewResponse:
    if not settings.ai_api_key:
        raise AIReviewError('AI_API_KEY is not configured')

    model_name = model_name_for_mode(mode)
    endpoint = settings.ai_api_base_url.rstrip('/') + '/chat/completions'
    payload = {
        'model': model_name,
        'temperature': 0.2,
        'response_format': {'type': 'json_object'},
        'messages': [
            {'role': 'system', 'content': '你是一个严格返回 JSON 的摄影点评助手，审美标准高、评分偏严格。'},
            {
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': _prompt_for_mode(mode, locale)},
                    {'type': 'image_url', 'image_url': {'url': image_url}},
                ],
            },
        ],
    }

    req = Request(
        endpoint,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {settings.ai_api_key}',
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
        raise AIReviewError(f'AI provider HTTP {exc.code}: {err_body[:300]}') from exc
    except URLError as exc:
        raise AIReviewError(f'AI provider request failed: {exc.reason}') from exc
    latency_ms = int((time.perf_counter() - start) * 1000)

    try:
        choice = body['choices'][0]
        message = choice['message']
        content = _extract_content(message.get('content'))
        parsed = _extract_json_object(content)
        scores = parsed.get('scores')
        if not isinstance(scores, dict):
            raise AIReviewError('Model response missing scores object')
        parsed['final_score'] = _compute_final_score(scores)
        result = ReviewResult.model_validate(parsed)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise AIReviewError('Invalid AI provider response structure') from exc

    usage = body.get('usage') or {}
    return AIReviewResponse(
        result=result,
        model_name=body.get('model', model_name),
        input_tokens=usage.get('prompt_tokens'),
        output_tokens=usage.get('completion_tokens'),
        cost_usd=None,
        latency_ms=latency_ms,
    )
