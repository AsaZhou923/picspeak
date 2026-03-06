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
            'For advantage and critique, output 1-3 numbered points in a string using format "1. ...\n2. ..."; '
            'each point must be specific and actionable. '
            'Provide 2-4 actionable suggestions with concrete parameters/ranges when possible, '
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
            'advantage と critique はそれぞれ 1〜3 点を文字列内で「1. ...\n2. ...」形式で記載し、'
            '各項目は具体的で実行可能にしてください。'
            'suggestions は 2〜4 点、可能な限り数値付きで具体的に（例：「露出 +1〜2、シャドウ +1〜2、ハイライト -1、色温度 -300K」）。'
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
        'advantage 与 critique 请分别输出 1-3 条要点，使用“1. ...\n2. ...”这种编号格式写在字符串里；'
        '每条要点需具体、可落地，避免空泛夸赞。'
        'suggestions 给出 2-4 条可执行改进建议，尽量量化，包含具体参数或区间，例如“曝光 +1~2、阴影 +1~2、高光 -1、色温 -300K”，'
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
        scores = parsed.get('scores')
        if not isinstance(scores, dict):
            raise AIReviewError('Model response missing scores object')
        parsed['final_score'] = _compute_final_score(scores)
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
