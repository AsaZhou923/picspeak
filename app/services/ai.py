from __future__ import annotations

from app.schemas import ReviewResult


def run_mock_review(mode: str) -> ReviewResult:
    if mode == 'pro':
        return ReviewResult(
            schema_version='1.0',
            scores={
                'composition': 8,
                'lighting': 8,
                'color': 8,
                'story': 7,
                'technical': 8,
            },
            advantage='主体表达明确，层次关系清晰，色彩控制稳定。',
            critique='边缘元素略分散注意力，高光区域细节可进一步保留。',
            suggestions='建议裁切右侧 5%，并降低高光 15%，适当提升阴影 10%。',
        )

    return ReviewResult(
        schema_version='1.0',
        scores={
            'composition': 7,
            'lighting': 7,
            'color': 8,
            'story': 6,
            'technical': 7,
        },
        advantage='画面色彩舒服，主体可识别性较强。',
        critique='前景稍有干扰，视觉引导线不够集中。',
        suggestions='建议简化前景元素，并尝试降低曝光 0.3-0.5 档。',
    )
