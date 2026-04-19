from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import ValidationError

from app.core.config import settings
from app.schemas import ReviewResult


class AIReviewError(RuntimeError):
    pass


@dataclass
class AIReviewResponse:
    result: ReviewResult
    model_name: str
    model_version: str
    prompt_version: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    latency_ms: int | None = None


@dataclass
class AIJSONResponse:
    parsed: dict
    model_name: str
    usage: dict
    latency_ms: int


PROMPT_VERSION = 'photo-review-v5-split-score-lock'
SCORE_VERSION = 'score-v2-strict'


ALLOWED_IMAGE_TYPES = {'default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'}

IMAGE_TYPE_DIMENSION_GUIDE_ZH = {
    'default': '默认题材逻辑：Composition=构图组织，Lighting=光线控制，Color=色彩关系，Impact=表达（情绪/主题传达），Technique=技术完成度。',
    'portrait': '人像题材逻辑：Composition=人物构图，Lighting=面部光线，Color=肤色与色调，Impact=情绪表达，Technique=对焦与虚化。',
    'landscape': '风光题材逻辑：Composition=前景/层次，Lighting=光影，Color=自然色彩，Impact=景观震撼感，Technique=曝光/清晰度。',
    'architecture': '建筑题材逻辑：Composition=几何结构，Lighting=光影，Color=色彩风格，Impact=视觉张力，Technique=透视控制。',
    'street': '街拍题材逻辑：Composition=画面布局，Lighting=环境光，Color=氛围色彩，Impact=瞬间张力，Technique=抓拍清晰度。',
    'still_life': '静物题材逻辑：Composition=主体摆放与布局，Lighting=光影，Color=色彩搭配，Impact=背景设计，Technique=细节与质感表现。',
}

IMAGE_TYPE_DIMENSION_GUIDE_EN = {
    'default': 'Default logic: Composition=framing structure, Lighting=light control, Color=color relationships, Impact=expression (emotion/theme), Technique=technical execution.',
    'portrait': 'Portrait logic: Composition=subject placement, Lighting=facial light, Color=skin tone & palette, Impact=emotional expression, Technique=focus & bokeh control.',
    'landscape': 'Landscape logic: Composition=foreground & depth layers, Lighting=light and shadow, Color=natural palette, Impact=scene grandeur, Technique=exposure & clarity.',
    'architecture': 'Architecture logic: Composition=geometric structure, Lighting=light and shadow, Color=style palette, Impact=visual tension, Technique=perspective control.',
    'street': 'Street logic: Composition=frame organization, Lighting=ambient light use, Color=atmosphere palette, Impact=decisive-moment tension, Technique=capture sharpness.',
    'still_life': 'Still-life logic: Composition=object layout, Lighting=light shaping, Color=color matching, Impact=background expression, Technique=detail & texture rendering.',
}

IMAGE_TYPE_DIMENSION_GUIDE_JA = {
    'default': 'デフォルト題材ロジック：Composition=構図設計、Lighting=光の制御、Color=色関係、Impact=表現（感情/主題伝達）、Technique=技術完成度。',
    'portrait': 'ポートレート題材ロジック：Composition=人物構図、Lighting=顔の光、Color=肌色とトーン、Impact=感情表現、Technique=フォーカスとボケ。',
    'landscape': '風景題材ロジック：Composition=前景/レイヤー、Lighting=光と影、Color=自然な色彩、Impact=景観の迫力、Technique=露出/解像感。',
    'architecture': '建築題材ロジック：Composition=幾何構造、Lighting=光と影、Color=色彩スタイル、Impact=視覚的張力、Technique=遠近コントロール。',
    'street': 'ストリート題材ロジック：Composition=画面配置、Lighting=環境光、Color=雰囲気色彩、Impact=瞬間の張力、Technique=スナップの鮮明度。',
    'still_life': '静物題材ロジック：Composition=主題配置、Lighting=光の演出、Color=配色、Impact=背景表現、Technique=細部と質感。',
}



def _is_multimodal_model(model_name: str) -> bool:
    normalized = (model_name or '').strip().lower()
    if not normalized:
        return False

    explicit_multimodal_models = (
        'qwen3.5-plus',
        'qwen3.5-flash',
    )
    if any(normalized == name or normalized.startswith(f'{name}-') for name in explicit_multimodal_models):
        return True

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


def model_version_for_name(model_name: str) -> str:
    return (model_name or '').strip()


def _format_exif_context(exif_data: dict | None) -> str:
    """Convert EXIF dict to a concise technical parameters string for the AI prompt."""
    if not exif_data:
        return ''
    parts: list[str] = []
    camera_parts: list[str] = []
    if exif_data.get('Make'):
        camera_parts.append(str(exif_data['Make']))
    if exif_data.get('Model'):
        camera_parts.append(str(exif_data['Model']))
    if camera_parts:
        parts.append('Camera: ' + ' '.join(camera_parts))
    if exif_data.get('LensModel'):
        parts.append(f'Lens: {exif_data["LensModel"]}')
    if exif_data.get('FocalLength'):
        fl = exif_data['FocalLength']
        fl35 = exif_data.get('FocalLengthIn35mm')
        if fl35:
            parts.append(f'Focal Length: {fl}mm ({fl35}mm equiv.)')
        else:
            parts.append(f'Focal Length: {fl}mm')
    if exif_data.get('FNumber'):
        parts.append(f'Aperture: f/{exif_data["FNumber"]}')
    if exif_data.get('ExposureTime'):
        parts.append(f'Shutter: {exif_data["ExposureTime"]}')
    if exif_data.get('ISO'):
        parts.append(f'ISO: {exif_data["ISO"]}')
    if exif_data.get('ExposureBias') is not None and exif_data['ExposureBias'] != 0:
        bias = exif_data['ExposureBias']
        sign = '+' if bias > 0 else ''
        parts.append(f'Exposure Bias: {sign}{bias} EV')
    if exif_data.get('Flash'):
        parts.append(f'Flash: {exif_data["Flash"]}')
    if exif_data.get('WhiteBalance'):
        parts.append(f'White Balance: {exif_data["WhiteBalance"]}')
    if exif_data.get('ExposureMode'):
        parts.append(f'Exposure Mode: {exif_data["ExposureMode"]}')
    if exif_data.get('MeteringMode'):
        parts.append(f'Metering: {exif_data["MeteringMode"]}')
    return ', '.join(parts)


def _prompt_for_mode_legacy(mode: str, locale: str, exif_data: dict | None = None, image_type: str = 'default') -> str:
    lang = locale if locale in {'zh', 'en', 'ja'} else 'zh'
    depth_by_lang = {
        'zh': ('详细且专业', '简洁且直接'),
        'en': ('detailed and professional', 'concise and direct'),
        'ja': ('詳細かつ専門的', '簡潔で直接的'),
    }
    deep, concise = depth_by_lang[lang]
    depth = deep if mode == 'pro' else concise

    exif_context = _format_exif_context(exif_data)
    normalized_image_type = image_type if image_type in ALLOWED_IMAGE_TYPES else 'default'

    if lang == 'en':
        exif_note = (
            f' The following shooting parameters are provided for reference in the technical dimension assessment: {exif_context}.'
            if exif_context else ''
        )
        type_guide = IMAGE_TYPE_DIMENSION_GUIDE_EN[normalized_image_type]
        return (
            f'You are a photography critic. Provide a {depth} review for the input photo.{exif_note} '
            f'The image genre for this review is: {normalized_image_type}. Use this mapping for dimension interpretation: {type_guide} '
            'Scoring baseline: 10 means top master-level work within the same genre (landscape, portrait, street, documentary, etc.). '
            'Scores must be clearly differentiated and moderately strict; avoid giving 7-8 to ordinary photos. '
            'However, do not mechanically suppress scores for clearly excellent, strongly stylized work when the style is intentional, coherent, and well executed. '
            'Most ordinary photos should be in the 3-6 range; clearly strong photos can exceed 7, and outstanding stylized work may receive more generous scores across all five dimensions when the execution truly supports it. '
            'Output only one JSON object; do not output markdown. '
            'JSON schema must be exactly: '
            '{"schema_version":"1.0","scores":{"composition":0-10,"lighting":0-10,"color":0-10,"impact":0-10,"technical":0-10},'
            '"advantage":"...","critique":"...","suggestions":"..."}. '
            'All values in scores must be integers from 0 to 10. '
            'For advantage, critique, and suggestions, output 1-3 numbered points in a string using format "1. ...\n2. ...". '
            'Do not force 3 points when the image evidence only supports 1 or 2 strong points. '
            'Every point must be grounded in visible evidence from the photo, logically justified, and not speculative or generic. '
            'If a point cannot be clearly supported by the image, do not include it. '
            'Suggestions must follow the same rule and should be practical, with concrete parameters or ranges when appropriate, '
            'e.g. "Exposure +1~2, Shadows +1~2, Highlights -1, White Balance -300K". '
            'Each numbered point must follow a strict three-part structure: Observation + Reason + Action. '
            'Do not use empty generic statements such as "overall good but can be improved". '
            'Scoring anchors: 0-2 severe flaws, 3-4 clear weaknesses, 5-6 average/usable, 7-8 strong and above average, 9-10 outstanding with near master-level control. '
            'If a dimension score is 0-4, wording must be direct about problems and improvement urgency. '
            'If a dimension score is 8-10, wording should confirm strengths and only point out minor refinements. '
            'Keep score variance stable across different model calls for similar image quality; avoid random swings. '
            'All text fields must be written in English.'
        )

    if lang == 'ja':
        exif_note = (
            f'なお、技術次元の評価参考として以下の撮影パラメータが提供されています：{exif_context}。'
            if exif_context else ''
        )
        type_guide = IMAGE_TYPE_DIMENSION_GUIDE_JA[normalized_image_type]
        return (
            f'あなたは写真講評者です。入力写真に対して{depth}講評を行ってください。{exif_note}'
            f'今回の画像タイプは {normalized_image_type} です。次の次元解釈ロジックを適用してください：{type_guide}'
            '採点基準：同ジャンル（風景、ポートレート、ストリート、ドキュメンタリー等）のトップレベル作品を 10 点とします。'
            '採点は厳格で差が出るようにし、普通の写真に 7〜8 点を安易に付けないでください。'
            '一般的な写真は主に 3〜6 点、明確に優れた写真のみ 7 点以上にしてください。'
            '出力は JSON オブジェクト 1 つのみ。markdown は不要。'
            'JSON スキーマは厳密に：'
            '{"schema_version":"1.0","scores":{"composition":0-10,"lighting":0-10,"color":0-10,"impact":0-10,"technical":0-10},'
            '"advantage":"...","critique":"...","suggestions":"..."}。'
            'scores の値は 0-10 の整数のみ。'
            'advantage・critique・suggestions はそれぞれ 1〜3 点を文字列内で「1. ...\n2. ...」形式で記載してください。'
            '根拠が 1〜2 点しかない場合は無理に 3 点に増やさないでください。'
            '各項目は写真から確認できる視覚的根拠に基づき、論理的で、こじつけや一般論にならないようにしてください。'
            '画像から明確に裏付けられない内容は書かないでください。'
            'suggestions も同様に根拠ベースで、可能な限り数値付きで具体的に（例：「露出 +1〜2、シャドウ +1〜2、ハイライト -1、色温度 -300K」）。'
            '各番号項目は必ず「観察 + 理由 + 実行アクション」の三部構成にしてください。'
            '「全体的に良いが改善余地あり」のような情報量のない定型文は禁止です。'
            '採点アンカー：0-2=重大な欠陥、3-4=明確な弱点、5-6=平均/実用、7-8=明確に優秀、9-10=ほぼマスターレベル。'
            '低得点（0-4）は課題を明確かつ率直に記述し、高得点（8-10）は強み中心で軽微な改善のみを述べてください。'
            '同品質画像でのモデル呼び出し差によるスコア変動は最小化してください。'
            'すべてのテキスト項目は日本語で記述してください。'
        )

    exif_note = f'以下拍摄参数供技术维度评估参考：{exif_context}。' if exif_context else ''
    type_guide = IMAGE_TYPE_DIMENSION_GUIDE_ZH[normalized_image_type]
    return (
        f'请你作为摄影点评师，对输入照片进行{depth}的点评。{exif_note}'
        f'本次图片类型为 {normalized_image_type}，请按以下维度解释逻辑评分：{type_guide}'
        '评分基准：以该照片所属题材的顶级大师作品作为 10 分参考标准（如风光、人像、街拍、纪实等各自题材内对标）。'
        '打分必须严格且有明显差异性，严禁"随手一张都有 7~8 分"的宽松倾向；'
        '普通照片应更多落在 3-6 分区间，只有明显优秀才进入 7 分以上。'
        '必须只输出一个 JSON 对象，不要输出 markdown。'
        'JSON 字段必须严格为：'
        '{"schema_version":"1.0","scores":{"composition":0-10,"lighting":0-10,"color":0-10,"impact":0-10,"technical":0-10},'
        '"advantage":"...","critique":"...","suggestions":"..."}。'
        'scores 内所有值必须是 0-10 的整数。'
        'advantage、critique、suggestions 都请分别输出 1-3 条要点，使用"1. ...\n2. ..."这种编号格式写在字符串里。'
        '如果画面里只有 1 条或 2 条真正站得住脚的观察，就只写 1-2 条，不要为了凑数硬写到 3 条。'
        '每条要点都必须能被照片中的具体视觉信息支撑，论证要成立，不能牵强附会、不能写空泛套话、不能脱离画面瞎猜。'
        'suggestions 也必须基于前面识别出的真实问题或潜力点，给出有依据、可执行的建议；尽量量化，包含具体参数或区间，例如"曝光 +1~2、阴影 +1~2、高光 -1、色温 -300K"，'
        '并可结合拍摄时机、机位、光线、构图、后期动作。'
        '每条建议必须严格使用“三段式”：观察 + 原因 + 可执行动作。'
        '禁止输出空泛模板化表述，例如“整体不错，但还有提升空间”。'
        '评分锚点必须统一：0-2 严重缺陷，3-4 明显薄弱，5-6 合格/普通，7-8 明显优秀，9-10 接近大师水准。'
        '低分（0-4）措辞应直陈问题与改进优先级；高分（8-10）措辞应肯定优势，仅补充少量微调建议。'
        '尽量保持同等质量图片在不同模型调用下分数波动小，不要随机大幅跳分。'
        '所有文本字段请使用中文。'
    )


def _prompt_for_mode_v3(mode: str, locale: str, exif_data: dict | None = None, image_type: str = 'default') -> str:
    lang = locale if locale in {'zh', 'en', 'ja'} else 'zh'
    normalized_mode = (mode or '').strip().lower()
    if normalized_mode not in {'flash', 'pro'}:
        normalized_mode = 'flash'

    exif_context = _format_exif_context(exif_data)
    normalized_image_type = image_type if image_type in ALLOWED_IMAGE_TYPES else 'default'

    if lang == 'en':
        exif_note = (
            f' The following shooting parameters are provided for reference in the technical dimension assessment: {exif_context}.'
            if exif_context else ''
        )
        type_guide = IMAGE_TYPE_DIMENSION_GUIDE_EN[normalized_image_type]
        mode_note = (
            'Current mode is flash. Advantage and critique should stay concise and direct: 1-3 points, and keep each point to one compact sentence or two short clauses. '
            'The flash version should feel like a quick, high-signal review rather than a long breakdown. '
            if normalized_mode == 'flash' else
            'Current mode is pro. Advantage and critique must be noticeably more developed than flash: prefer 2-3 points when the image evidence supports it, '
            'and each point should include visible observation + professional judgment + effect on the final image. '
            'Do not write label-like fragments; the pro version should read like a fuller analysis, especially in advantage and critique. '
        )
        suggestion_note = (
            'Suggestions should still be 1-3 numbered points grounded in the identified issues or opportunities. '
            'In pro mode, depth should come mainly from richer advantage and critique analysis rather than padding suggestions with filler. '
        )
        return (
            f'You are a photography critic. Provide a {"concise and direct" if normalized_mode == "flash" else "detailed and professional"} review for the input photo.{exif_note} '
            f'The image genre for this review is: {normalized_image_type}. Use this mapping for dimension interpretation: {type_guide} '
            'Scoring baseline: 10 means top master-level work within the same genre (landscape, portrait, street, documentary, etc.). '
            'Scores must be strict and clearly differentiated; avoid giving 7-8 to ordinary photos. '
            'Most ordinary photos should stay in the 3-6 range; a 7 requires clear, repeatable strengths in multiple dimensions, not just a pleasant subject or one attractive element. '
            'An 8 requires portfolio-level execution with no obvious weak dimension, and 9-10 should be extremely rare. '
            'Do not raise scores simply because the image is stylized, cinematic, sentimental, or made with an interesting subject. Style only deserves high scores when execution, control, and coherence are all clearly visible. '
            'If the image has an obvious main-subject flaw, distracting composition issue, unstable exposure/color control, or weak technical clarity, affected dimensions should usually stay at 6 or below. '
            'Output only one JSON object; do not output markdown. '
            'JSON schema must be exactly: '
            '{"schema_version":"1.0","scores":{"composition":0-10,"lighting":0-10,"color":0-10,"impact":0-10,"technical":0-10},'
            '"advantage":"...","critique":"...","suggestions":"..."}. '
            'All values in scores must be integers from 0 to 10. '
            'For advantage, critique, and suggestions, output 1-3 numbered points in a string using format "1. ...\n2. ...". '
            'Do not force 3 points when the image evidence only supports 1 or 2 strong points. '
            'Every point must be grounded in visible evidence from the photo, logically justified, and not speculative or generic. '
            'If a point cannot be clearly supported by the image, do not include it. '
            f'{mode_note}'
            f'{suggestion_note}'
            'Suggestions must be practical, with concrete parameters or ranges when appropriate, '
            'e.g. "Exposure +1~2, Shadows +1~2, Highlights -1, White Balance -300K". '
            'Each suggestion point must follow a strict three-part structure: Observation + Reason + Action. '
            'Do not use empty generic statements such as "overall good but can be improved". '
            'Scoring anchors: 0-2 severe flaws, 3-4 clear weaknesses, 5-6 average/usable, 7 clearly strong, 8 portfolio-level, 9-10 exceptional and rare. '
            'If a dimension score is 0-4, wording must be direct about problems and improvement urgency. '
            'If a dimension score is 8-10, wording should confirm strengths and only point out minor refinements. '
            'Keep score variance stable across different model calls for similar image quality; avoid random swings. '
            'All text fields must be written in English.'
        )

    if lang == 'ja':
        exif_note = (
            f' 技術面の評価参考として、次の撮影情報があります：{exif_context}。'
            if exif_context else ''
        )
        type_guide = IMAGE_TYPE_DIMENSION_GUIDE_JA[normalized_image_type]
        mode_note = (
            '現在のモードは flash です。advantage と critique は短く要点重視で、1-3項目を優先し、各項目は1文または短い2節程度に収めてください。 '
            'flash は素早く読める高密度レビューにしてください。 '
            if normalized_mode == 'flash' else
            '現在のモードは pro です。advantage と critique は flash より明確に掘り下げ、根拠が十分なら 2-3 項目を優先してください。 '
            '各項目には「見えている事実 + 専門的判断 + 作品への影響」を含め、短いラベル文だけで終わらせないでください。 '
            'pro らしさは特に advantage と critique の分析の厚みで出してください。 '
        )
        suggestion_note = (
            'suggestions は 1-3 項目で、前述の問題点や伸びしろに基づく実行可能な提案にしてください。 '
            'pro でも suggestions を冗長にするのではなく、深さは主に advantage と critique に持たせてください。 '
        )
        return (
            f'あなたは写真講評者です。入力写真に対して{"簡潔で直接的" if normalized_mode == "flash" else "詳細でプロフェッショナル"}な講評を行ってください。{exif_note}'
            f'今回の画像タイプは {normalized_image_type} です。次の次元解釈ロジックを適用してください：{type_guide} '
            '採点基準：同ジャンル内で巨匠級の作品を 10 点とします。 '
            '採点は差が出るようにしつつ、厳しめを保ってください。普通の写真に安易に 7-8 点を付けないでください。 '
            '一般的な写真は主に 3-6 点に留め、7 点は複数次元で明確な強さが確認できる場合に限ってください。 '
            '8 点はポートフォリオ水準で、目立つ弱点がほぼ無い場合に限ります。9-10 点は極めて稀にしてください。 '
            'スタイル性、被写体の魅力、雰囲気の良さだけで加点しないでください。高得点は、意図だけでなく実行・制御・一貫性が画面から明確に読める場合に限ります。 '
            '主題の甘さ、構図の散漫さ、露出や色の不安定さ、技術的な粗さが目立つ場合、該当次元は通常 6 点以下に留めてください。 '
            '出力は JSON オブジェクト 1 つのみで、markdown は不要です。 '
            'JSON スキーマは厳密に次の形です：'
            '{"schema_version":"1.0","scores":{"composition":0-10,"lighting":0-10,"color":0-10,"impact":0-10,"technical":0-10},'
            '"advantage":"...","critique":"...","suggestions":"..."}. '
            'scores の値はすべて 0-10 の整数にしてください。 '
            'advantage、critique、suggestions はそれぞれ "1. ...\n2. ..." 形式の番号付き文字列で 1-3 項目を出力してください。 '
            '根拠が 1-2 項目しかなければ無理に 3 項目にしないでください。 '
            '各項目は写真から確認できる視覚的根拠に基づき、論理的で、推測や一般論に逃げないでください。 '
            '画像から十分に裏付けられない内容は書かないでください。 '
            f'{mode_note}'
            f'{suggestion_note}'
            'suggestions は可能なら具体的なパラメータや範囲も示してください。 '
            '例："露出 +1~2、シャドウ +1~2、ハイライト -1、色温度 -300K"。 '
            '各 suggestion は必ず「観察 + 理由 + 実行アクション」の三段構成にしてください。 '
            '「全体的に良いが改善余地もある」のような中身の薄い定型文は禁止です。 '
            '採点アンカー：0-2=重大な欠点、3-4=明確な弱さ、5-6=平均/実用、7=明確に強い、8=ポートフォリオ水準、9-10=傑出かつ稀。 '
            '低得点（0-4）は問題と改善優先度を率直に述べ、高得点（8-10）は強みを肯定しつつ微調整だけを添えてください。 '
            '同程度の画質に対するスコアの揺れは小さく保ってください。 '
            'すべてのテキスト項目は日本語で書いてください。'
        )

    exif_note = f'以下拍摄参数供技术维度评估参考：{exif_context}。' if exif_context else ''
    type_guide = IMAGE_TYPE_DIMENSION_GUIDE_ZH[normalized_image_type]
    mode_note = (
        '当前模式为 flash。advantage 和 critique 以短评为主，写 1-3 条；每条尽量控制在一句话或两个短分句内，直接说清观察到的优点或问题，不要展开过长分析。 '
        'flash 的体验应该像快速、高密度的判断。 '
        if normalized_mode == 'flash' else
        '当前模式为 pro。advantage 和 critique 必须明显比 flash 更展开：在画面证据足够时优先写 2-3 条，'
        '每条都要包含“可见观察 + 专业判断 + 对成片的影响”，形成完整分析，不要只写标签式短句。 '
        'pro 的深度主要体现在优点和问题部分要更具体、更充分。 '
    )
    suggestion_note = (
        'suggestions 保持 1-3 条即可，但必须严格基于前面识别出的真实问题或潜力点。 '
        '即使在 pro 模式下，也不要靠堆砌 suggestions 的字数制造深度，重点是把 advantage 和 critique 写透。 '
    )
    return (
        f'请你作为摄影点评师，对输入照片进行{"简洁直接" if normalized_mode == "flash" else "详细专业"}的点评。{exif_note}'
        f'本次图片类型为 {normalized_image_type}，请按以下维度解释逻辑评分：{type_guide} '
        '评分基准：以该照片所属题材中的顶级大师作品作为 10 分参考标准。 '
        '打分必须有明显差异性，并保持严格口径，普通照片不要轻易给到 7-8 分。 '
        '普通照片应主要落在 3-6 分；7 分必须建立在多个维度都明显扎实之上，不能因为题材讨喜、氛围感强或只有一个亮点就给高分。 '
        '8 分必须接近可入作品集的完成度，且没有明显短板；9-10 分应极少出现。 '
        '不要因为“电影感”“情绪感”“风格化”“被摄体本身好看”就主动抬分。只有当风格意图、执行控制和整体一致性都能被画面清楚证明时，风格化才值得高分。 '
        '如果主问题清晰可见，例如主体不够稳、构图干扰明显、曝光或色彩控制失衡、技术清晰度不足，对应维度通常应压在 6 分及以下。 '
        '必须只输出一个 JSON 对象，不要输出 markdown。 '
        'JSON 字段必须严格为：'
        '{"schema_version":"1.0","scores":{"composition":0-10,"lighting":0-10,"color":0-10,"impact":0-10,"technical":0-10},'
        '"advantage":"...","critique":"...","suggestions":"..."}。 '
        'scores 内所有值必须是 0-10 的整数。 '
        'advantage、critique、suggestions 都请分别输出 1-3 条要点，使用 "1. ...\n2. ..." 这种编号格式写在字符串里。 '
        '如果画面里只存在 1-2 条真正站得住脚的观察，就只写 1-2 条，不要为了凑数硬写到 3 条。 '
        '每条要点都必须能被照片中的具体视觉信息支撑，论证要成立，不能牵强附会，不能写空泛套话，不能脱离画面臆测。 '
        '如果某个判断不能被画面清晰支持，就不要写进去。 '
        f'{mode_note}'
        f'{suggestion_note}'
        'suggestions 必须给出有依据、可执行的建议；尽量量化，包含具体参数或区间，例如“曝光 +1~2、阴影 +1~2、高光 -1、色温 -300K”。 '
        '每条 suggestions 必须严格使用“三段式”：观察 + 原因 + 可执行动作。 '
        '禁止输出“整体不错，但还有提升空间”这类空泛模板话。 '
        '评分锚点必须统一：0-2 严重缺陷，3-4 明显薄弱，5-6 合格/普通，7=明确优秀，8=作品集级别，9-10=罕见且接近大师水准。 '
        '低分（0-4）措辞应直陈问题与改进优先级；高分（8-10）措辞应肯定优势，仅补充少量微调建议。 '
        '尽量保持同等质量图片在不同模型调用下分数波动小，不要随机大幅跳分。 '
        '所有文本字段请使用中文。'
    )


def _compute_final_score(scores: dict[str, int]) -> float:
    if not scores:
        raise AIReviewError('scores cannot be empty')
    values: list[int] = []
    if 'impact' not in scores and 'story' in scores:
        scores = dict(scores)
        scores['impact'] = scores['story']
    for key in ('composition', 'lighting', 'color', 'impact', 'technical'):
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


def _normalize_numbered_text_field(value: object) -> object:
    if isinstance(value, str):
        return value.strip()
    if not isinstance(value, list):
        return value

    points: list[str] = []
    for item in value:
        if item is None:
            continue
        text = str(item).strip()
        if not text:
            continue
        if re.match(r'^\d+\.\s+', text):
            points.append(text)
            continue
        points.append(f'{len(points) + 1}. {text}')
    return '\n'.join(points)


def _split_numbered_text_field(value: str) -> list[str]:
    text = value.strip()
    if not text:
        return []
    matches = re.findall(r'^\s*\d+\.\s.*?(?=^\s*\d+\.\s|\Z)', text, flags=re.MULTILINE | re.DOTALL)
    if matches:
        return [match.strip() for match in matches if match.strip()]
    return [text]


def _has_structured_label(text: str, labels: tuple[str, ...]) -> bool:
    return any(
        re.search(
            rf'(?:^|\d+\.\s*|[\uFF1B;\uFF0C,\n]\s*){re.escape(label)}[\uFF1A:]',
            text,
            flags=re.IGNORECASE,
        )
        for label in labels
    )


def _validate_suggestions_structure(value: object) -> None:
    if not isinstance(value, str):
        raise ValueError('suggestions must be a string')

    points = _split_numbered_text_field(value)
    if not points:
        return

    observation_labels = ('\u89c2\u5bdf', '\u89c0\u5bdf', 'Observation', '\u89b3\u5bdf')
    reason_labels = ('\u539f\u56e0', 'Reason', '\u7406\u7531')
    action_labels = (
        '\u53ef\u6267\u884c\u52a8\u4f5c',
        '\u53ef\u57f7\u884c\u52d5\u4f5c',
        '\u5904\u7406\u65b9\u6cd5',
        '\u884c\u52d5',
        '\u884c\u52a8',
        '\u52a8\u4f5c',
        '\u5efa\u8bae',
        'Action',
        '\u5b9f\u884c\u30a2\u30af\u30b7\u30e7\u30f3',
        '\u63d0\u6848',
    )

    for index, point in enumerate(points, start=1):
        if not _has_structured_label(point, observation_labels):
            raise ValueError(f'suggestions point {index} must include Observation label')
        if not _has_structured_label(point, reason_labels):
            raise ValueError(f'suggestions point {index} must include Reason label')
        if not _has_structured_label(point, action_labels):
            raise ValueError(f'suggestions point {index} must include Action label')


def _normalize_review_result_fields(parsed: dict, *, image_type: str, enforce_suggestion_structure: bool = True) -> dict:
    normalized = dict(parsed)
    for field_name in ('advantage', 'critique', 'suggestions'):
        normalized[field_name] = _normalize_numbered_text_field(normalized.get(field_name, ''))
    if enforce_suggestion_structure:
        _validate_suggestions_structure(normalized.get('suggestions', ''))
    normalized['image_type'] = image_type if image_type in ALLOWED_IMAGE_TYPES else 'default'
    return normalized


def _format_validation_error(exc: ValidationError) -> str:
    first_error = exc.errors()[0] if exc.errors() else None
    if not first_error:
        return str(exc)
    location = '.'.join(str(part) for part in first_error.get('loc', ())) or 'unknown'
    message = str(first_error.get('msg') or 'validation error')
    return f'{location}: {message}'


def _review_language_name(locale: str) -> str:
    normalized = (locale or '').strip().lower()
    return {
        'zh': 'Chinese',
        'ja': 'Japanese',
    }.get(normalized, 'English')


def _score_prompt(exif_data: dict | None = None, image_type: str = 'default') -> str:
    normalized_image_type = image_type if image_type in ALLOWED_IMAGE_TYPES else 'default'
    type_guide = IMAGE_TYPE_DIMENSION_GUIDE_EN[normalized_image_type]
    exif_context = _format_exif_context(exif_data)
    exif_note = f' Use EXIF as secondary evidence only: {exif_context}.' if exif_context else ''
    return (
        'You are a strict photography scoring engine. '
        f'The image genre is {normalized_image_type}. Use this interpretation guide: {type_guide}.{exif_note} '
        'Evaluate the photo in exactly five dimensions: composition, lighting, color, impact, technical. '
        'Scoring baseline: 10 means top master-level work within the same genre. '
        'Scores must be strict and clearly differentiated. Most ordinary photos should fall in the 3-6 range. '
        'A 7 requires multiple clear strengths across dimensions, 8 requires portfolio-level execution with no obvious weak dimension, '
        'and 9-10 should be extremely rare. '
        'Do not increase scores simply because the subject is attractive, the image feels cinematic, or the style is trendy. '
        'If the photo has a visible flaw in subject separation, composition, exposure or color control, or technical clarity, '
        'the affected dimension should usually stay at 6 or below. '
        'Return exactly one JSON object and nothing else: '
        '{"scores":{"composition":0-10,"lighting":0-10,"color":0-10,"impact":0-10,"technical":0-10}}. '
        'All score values must be integers.'
    )


def _writing_prompt(mode: str, locale: str, scores: dict[str, int], exif_data: dict | None = None, image_type: str = 'default') -> str:
    normalized_mode = (mode or '').strip().lower()
    if normalized_mode not in {'flash', 'pro'}:
        normalized_mode = 'flash'

    normalized_image_type = image_type if image_type in ALLOWED_IMAGE_TYPES else 'default'
    type_guide = IMAGE_TYPE_DIMENSION_GUIDE_EN[normalized_image_type]
    exif_context = _format_exif_context(exif_data)
    exif_note = f' EXIF reference: {exif_context}.' if exif_context else ''
    mode_note = (
        'Current mode is flash. Keep advantage and critique concise, direct, and high-signal. '
        'Prefer 1-3 short numbered points and avoid long breakdowns. '
        if normalized_mode == 'flash'
        else 'Current mode is pro. Make advantage and critique noticeably more developed than flash. '
        'Prefer 2-3 numbered points when the image evidence supports it, and make each point include visible observation, '
        'professional judgment, and effect on the final image. '
    )
    return (
        'You are a photography critic. '
        f'The image genre is {normalized_image_type}. Use this interpretation guide: {type_guide}.{exif_note} '
        f'All output text fields must be written in {_review_language_name(locale)}. '
        f'The numeric scores are already locked and must not be changed: {json.dumps(scores, ensure_ascii=False, separators=(",", ":"))}. '
        'Do not recompute scores, do not output different numeric ratings, and do not mention alternative numbers. '
        f'{mode_note}'
        'Return exactly one JSON object and nothing else: '
        '{"advantage":"...","critique":"...","suggestions":"..."}. '
        'advantage, critique, and suggestions must each be a numbered string using the format "1. ...\\n2. ...". '
        'Do not output arrays. '
        'Do not force 3 points when the image evidence only supports 1 or 2 strong points. '
        'Every point must be grounded in visible evidence from the photo, logically justified, and not generic. '
        'Suggestions must be practical and, when appropriate, include concrete parameters or ranges. '
        'Each suggestion must follow Observation + Reason + Action. '
        'Use explicit labels inside every suggestion point, exactly like: "观察：...；原因：...；可执行动作：...".'
    )


def _request_multimodal_json(*, model_name: str, prompt: str, image_url: str, temperature: float) -> AIJSONResponse:
    endpoint = settings.ai_api_base_url.rstrip('/') + '/chat/completions'
    payload = {
        'model': model_name,
        'temperature': temperature,
        'response_format': {'type': 'json_object'},
        'messages': [
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
    except (KeyError, IndexError, TypeError) as exc:
        raise AIReviewError('Invalid AI provider response envelope') from exc

    return AIJSONResponse(
        parsed=parsed,
        model_name=str(body.get('model') or model_name),
        usage=body.get('usage') or {},
        latency_ms=latency_ms,
    )


def run_ai_review(
    mode: str,
    image_url: str,
    locale: str = 'zh',
    exif_data: dict | None = None,
    image_type: str = 'default',
    enforce_suggestion_structure: bool = True,
) -> AIReviewResponse:
    if not settings.ai_api_key:
        raise AIReviewError('AI_API_KEY is not configured')

    scoring_model_name = model_name_for_mode('flash')
    writing_model_name = model_name_for_mode(mode)
    scoring_response = _request_multimodal_json(
        model_name=scoring_model_name,
        prompt=_score_prompt(exif_data, image_type=image_type),
        image_url=image_url,
        temperature=0,
    )

    try:
        raw_scoring_payload = scoring_response.parsed
        scores = raw_scoring_payload.get('scores') if isinstance(raw_scoring_payload.get('scores'), dict) else raw_scoring_payload
        if not isinstance(scores, dict):
            raise AIReviewError('Model response missing scores object')
        locked_scores = {key: int(scores[key]) for key in ('composition', 'lighting', 'color', 'impact', 'technical')}
    except AIReviewError:
        raise
    except (KeyError, TypeError, ValueError) as exc:
        raise AIReviewError(f'Invalid AI provider response structure: scoring.scores: {exc}') from exc

    final_score = _compute_final_score(locked_scores)
    writing_response = _request_multimodal_json(
        model_name=writing_model_name,
        prompt=_writing_prompt(mode, locale, locked_scores, exif_data, image_type=image_type),
        image_url=image_url,
        temperature=0.2,
    )

    try:
        parsed = _normalize_review_result_fields(
            writing_response.parsed,
            image_type=image_type,
            enforce_suggestion_structure=enforce_suggestion_structure,
        )
        parsed['score_version'] = SCORE_VERSION
        parsed['scores'] = locked_scores
        parsed['final_score'] = final_score
        result = ReviewResult.model_validate(parsed)
    except ValidationError as exc:
        raise AIReviewError(f'Invalid AI provider response structure: {_format_validation_error(exc)}') from exc
    except ValueError as exc:
        raise AIReviewError(f'Invalid AI provider response structure: {exc}') from exc

    scoring_usage = scoring_response.usage
    writing_usage = writing_response.usage
    return AIReviewResponse(
        result=result,
        model_name=writing_response.model_name,
        model_version=model_version_for_name(writing_response.model_name),
        prompt_version=PROMPT_VERSION,
        input_tokens=(scoring_usage.get('prompt_tokens') or 0) + (writing_usage.get('prompt_tokens') or 0),
        output_tokens=(scoring_usage.get('completion_tokens') or 0) + (writing_usage.get('completion_tokens') or 0),
        cost_usd=None,
        latency_ms=scoring_response.latency_ms + writing_response.latency_ms,
    )
