from __future__ import annotations

import re
from typing import Any


SUMMARY_FIELDS = ('summary', 'overall_summary', 'short_summary', 'final_summary')
REVIEW_TEXT_FIELDS = ('suggestions', 'critique', 'advantage')


def _first_clean_line(value: object, *, max_length: int) -> str:
    if isinstance(value, list):
        candidates = [str(item) for item in value if item is not None]
    elif isinstance(value, str):
        candidates = value.splitlines()
    else:
        return ''

    for line in candidates:
        normalized = re.sub(r'^\s*\d+\.\s*', '', str(line)).strip()
        if normalized:
            return normalized[:max_length]
    return ''


def extract_review_gallery_summary(
    result_json: dict[str, Any] | None,
    *,
    max_length: int = 180,
    fallback: str = '',
) -> str:
    payload = dict(result_json or {})
    # Preserve the public Gallery API's established review-schema priority.
    for field_name in (*REVIEW_TEXT_FIELDS, *SUMMARY_FIELDS):
        summary = _first_clean_line(payload.get(field_name), max_length=max_length)
        if summary:
            return summary
    return fallback
