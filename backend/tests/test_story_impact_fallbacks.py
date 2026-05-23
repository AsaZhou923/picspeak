from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.review_support import _coerce_review_scores
from app.services.ai import _compute_final_score
from app.services.review_task_processor import _normalize_review_result_payload


class StoryImpactFallbackTests(unittest.TestCase):
    def test_compute_final_score_uses_story_when_impact_is_missing(self) -> None:
        final_score = _compute_final_score(
            {
                'composition': 6,
                'lighting': 5,
                'color': 7,
                'story': 4,
                'technical': 8,
            }
        )

        self.assertEqual(final_score, 6.0)

    def test_normalize_review_result_payload_copies_story_into_impact(self) -> None:
        payload = _normalize_review_result_payload(
            {
                'scores': {
                    'composition': 6,
                    'lighting': 5,
                    'color': 7,
                    'story': 4,
                    'technical': 8,
                }
            },
            final_score=None,
            prompt_version='photo-review-v5',
            model_name='qwen3.5-plus',
            model_version='qwen3.5-plus',
            exif_info=None,
        )

        self.assertEqual(payload['scores']['impact'], 4)
        self.assertEqual(payload['final_score'], 6.0)

    def test_review_history_score_coercion_uses_story_when_impact_is_missing(self) -> None:
        scores = _coerce_review_scores(
            {
                'composition': 8,
                'lighting': 7,
                'color': 6,
                'story': 5,
                'technical': 9,
            }
        )

        self.assertEqual(scores['impact'], 5)


if __name__ == '__main__':
    unittest.main()
