from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.ai_prompts import (
    PROMPT_VERSION,
    SCORE_PROMPT_VERSION,
    SCORE_VERSION,
    SCORER_PREPROCESS_VERSION,
)
from app.services.ai import AIReviewError, CanonicalScore, build_cached_canonical_score
from app.services.review_score_cache import (
    canonical_score_cache_lease,
    checkpoint_task_canonical_score,
    clear_task_canonical_score_checkpoint,
    load_task_canonical_score_checkpoint,
    review_uses_current_full_review_contract,
    review_uses_current_score_contract,
    writer_contract_for_review_request,
)


class ReviewScoreCacheTests(unittest.TestCase):
    def test_requires_every_score_contract_component(self) -> None:
        review = SimpleNamespace(
            scorer_model_name='gpt-5.6-luna',
            result_json={
                'prompt_version': PROMPT_VERSION,
                'score_prompt_version': SCORE_PROMPT_VERSION,
                'score_version': SCORE_VERSION,
                'scorer_model_version': 'gpt-5.6-luna-2026-08-01',
                'scorer_preprocess_version': SCORER_PREPROCESS_VERSION,
                'writer_model_name': 'gpt-5.6-luna',
                'writer_model_version': 'gpt-5.6-luna',
            },
            model_name='gpt-5.6-luna',
            writer_model_name='gpt-5.6-luna',
        )
        with patch('app.services.review_score_cache.settings.openai_score_model', 'gpt-5.6-luna'), patch(
            'app.services.review_score_cache.settings.openai_review_model', 'gpt-5.6-luna'
        ):
            writer_name = writer_contract_for_review_request(mode='pro', review_model='gpt-5.6-luna')
            self.assertTrue(review_uses_current_score_contract(review))
            self.assertTrue(
                review_uses_current_full_review_contract(
                    review,
                    writer_model_name=writer_name,
                )
            )
            review.result_json['prompt_version'] = 'old-writer-prompt'
            self.assertTrue(review_uses_current_score_contract(review))
            self.assertFalse(
                review_uses_current_full_review_contract(
                    review,
                    writer_model_name=writer_name,
                )
            )
            review.result_json['prompt_version'] = PROMPT_VERSION
            review.writer_model_name = 'another-official-model'
            self.assertFalse(
                review_uses_current_full_review_contract(
                    review,
                    writer_model_name=writer_name,
                )
            )
            review.writer_model_name = 'gpt-5.6-luna'
            review.result_json['scorer_model_version'] = 'gpt-5.6-luna-older'
            self.assertTrue(review_uses_current_score_contract(review))
            review.result_json['scorer_model_version'] = ''
            self.assertFalse(review_uses_current_score_contract(review))
            review.result_json['scorer_model_version'] = 'gpt-5.6-luna-2026-08-01'
            review.result_json['score_version'] = 'legacy'
            self.assertFalse(review_uses_current_score_contract(review))

    def test_writer_contract_for_gpt_uses_official_model_alias(self) -> None:
        with patch('app.services.review_score_cache.settings.openai_review_model', 'gpt-5.6-luna'):
            self.assertEqual(
                writer_contract_for_review_request(mode='flash', review_model='gpt-5.6-luna'),
                'gpt-5.6-luna',
            )

    def test_cached_score_requires_exact_integer_scores(self) -> None:
        with patch('app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'):
            with self.assertRaisesRegex(AIReviewError, 'exact int'):
                build_cached_canonical_score(
                    {'composition': '7', 'lighting': 6, 'color': 6, 'impact': 5, 'technical': 6},
                    scorer_model_name='gpt-5.6-luna',
                    scorer_model_version='gpt-5.6-luna',
                )
            with self.assertRaisesRegex(AIReviewError, 'exact int'):
                build_cached_canonical_score(
                    {'composition': 7.0, 'lighting': 6, 'color': 6, 'impact': 5, 'technical': 6},
                    scorer_model_name='gpt-5.6-luna',
                    scorer_model_version='gpt-5.6-luna',
                )

    def test_cached_score_requires_persisted_final_score_to_match_dimensions(self) -> None:
        with patch('app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'):
            with self.assertRaisesRegex(AIReviewError, 'final_score'):
                build_cached_canonical_score(
                    {'composition': 7, 'lighting': 6, 'color': 6, 'impact': 5, 'technical': 6},
                    scorer_model_name='gpt-5.6-luna',
                    scorer_model_version='gpt-5.6-luna',
                    final_score=7.0,
                )

    def test_score_cache_lease_uses_nonblocking_postgres_advisory_lock_on_miss(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        db.execute.return_value.scalar.return_value = False
        db.bind = None
        db.get_bind.return_value.dialect.name = 'postgresql'
        photo = SimpleNamespace(id=42)

        with self.assertRaisesRegex(AIReviewError, 'already running'):
            with canonical_score_cache_lease(db, photo=photo, image_type='default'):
                pass

        sql = str(db.execute.call_args.args[0])
        self.assertIn('pg_try_advisory_xact_lock', sql)

    def test_full_review_contract_accepts_provider_snapshots_without_version_configuration(self) -> None:
        review = SimpleNamespace(
            scorer_model_name='gpt-5.6-luna',
            writer_model_name='gpt-5.6-luna',
            model_name='gpt-5.6-luna-2026-08-20',
            result_json={
                'prompt_version': PROMPT_VERSION,
                'score_prompt_version': SCORE_PROMPT_VERSION,
                'score_version': SCORE_VERSION,
                'scorer_model_version': 'gpt-5.6-luna-2026-08-01',
                'scorer_preprocess_version': SCORER_PREPROCESS_VERSION,
                'writer_model_name': 'gpt-5.6-luna',
                'writer_model_version': 'gpt-5.6-luna-2026-08-20',
            },
        )
        with patch('app.services.review_score_cache.settings.openai_score_model', 'gpt-5.6-luna'), patch(
            'app.services.review_score_cache.settings.openai_review_model', 'gpt-5.6-luna'
        ):
            writer_name = writer_contract_for_review_request(
                mode='flash',
                review_model='gpt-5.6-luna',
            )
            self.assertTrue(
                review_uses_current_full_review_contract(
                    review,
                    writer_model_name=writer_name,
                )
            )

    def test_task_checkpoint_round_trip_preserves_paid_score_usage(self) -> None:
        task = SimpleNamespace(request_payload={'locale': 'zh'})
        score = CanonicalScore(
            scores={'composition': 7, 'lighting': 6, 'color': 6, 'impact': 5, 'technical': 6},
            final_score=6.0,
            model_name='gpt-5.6-luna',
            model_version='gpt-5.6-luna-2026-08-01',
            score_prompt_version=SCORE_PROMPT_VERSION,
            score_version=SCORE_VERSION,
            preprocess_version=SCORER_PREPROCESS_VERSION,
            input_tokens=3590,
            output_tokens=414,
            latency_ms=10_000,
        )

        with patch('app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'):
            checkpoint_task_canonical_score(task, score)
            restored = load_task_canonical_score_checkpoint(task)

        self.assertIsNotNone(restored)
        self.assertEqual(restored.scores, score.scores)
        self.assertEqual(restored.input_tokens, 3590)
        self.assertEqual(restored.output_tokens, 414)
        self.assertEqual(restored.latency_ms, 10_000)
        self.assertFalse(restored.cache_hit)
        self.assertEqual(task.request_payload['locale'], 'zh')

        clear_task_canonical_score_checkpoint(task)
        self.assertEqual(task.request_payload, {'locale': 'zh'})

    def test_task_checkpoint_rejects_stale_score_contract(self) -> None:
        task = SimpleNamespace(
            request_payload={
                '_canonical_score_checkpoint': {
                    'checkpoint_version': 1,
                    'scores': {'composition': 7, 'lighting': 6, 'color': 6, 'impact': 5, 'technical': 6},
                    'final_score': 6.0,
                    'model_name': 'gpt-5.6-luna',
                    'model_version': 'gpt-5.6-luna-2026-08-01',
                    'score_prompt_version': 'stale-prompt',
                    'score_version': SCORE_VERSION,
                    'preprocess_version': SCORER_PREPROCESS_VERSION,
                }
            }
        )

        with patch('app.services.ai.settings.openai_score_model', 'gpt-5.6-luna'):
            self.assertIsNone(load_task_canonical_score_checkpoint(task))


if __name__ == '__main__':
    unittest.main()
