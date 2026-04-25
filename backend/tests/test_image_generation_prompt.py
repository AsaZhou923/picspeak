from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.image_generation_prompt import (  # noqa: E402
    PromptSafetyError,
    build_general_generation_prompt,
    build_review_linked_generation_prompt,
    get_generation_templates,
)


class ImageGenerationPromptTests(unittest.TestCase):
    def test_templates_cover_phase_two_generate_page_categories(self) -> None:
        keys = {template['key'] for template in get_generation_templates()}

        self.assertTrue(
            {
                'custom_creation',
                'photo_inspiration',
                'social_visual',
                'portrait_avatar',
                'product_scene',
                'interior_atmosphere',
                'color_moodboard',
            }.issubset(keys)
        )

    def test_interior_template_adds_space_specific_prompt_direction(self) -> None:
        prompt = build_general_generation_prompt(
            user_prompt='warm cafe corner with plants and wood furniture',
            template_key='interior_atmosphere',
            style='editorial',
            negative_prompt='',
        )

        self.assertIn('interior atmosphere', prompt)
        self.assertIn('natural window light', prompt)
        self.assertIn('warm cafe corner', prompt)

    def test_custom_template_keeps_user_direction_without_falling_back_to_photo_template(self) -> None:
        prompt = build_general_generation_prompt(
            user_prompt='surreal glass greenhouse floating above a quiet city at dawn',
            template_key='custom_creation',
            style='minimal',
            negative_prompt='',
        )

        self.assertIn('based on the user direction', prompt)
        self.assertIn('surreal glass greenhouse', prompt)
        self.assertNotIn('retaken by a photographer', prompt)

    def test_general_prompt_adds_template_style_and_ai_reference_boundary(self) -> None:
        prompt = build_general_generation_prompt(
            user_prompt='rainy street portrait with neon reflections',
            template_key='photo_inspiration',
            style='cinematic',
            negative_prompt='no text',
        )

        self.assertIn('rainy street portrait', prompt)
        self.assertIn('cinematic', prompt)
        self.assertIn('AI-generated visual reference', prompt)
        self.assertIn('Negative constraints: no text', prompt)

    def test_prompt_safety_rejects_transparent_background_requests(self) -> None:
        with self.assertRaises(PromptSafetyError):
            build_general_generation_prompt(
                user_prompt='create a logo on transparent background',
                template_key='social_visual',
                style='minimal',
                negative_prompt='',
            )

    def test_review_linked_prompt_structures_critique_into_next_shoot_reference(self) -> None:
        prompt = build_review_linked_generation_prompt(
            review_result={
                'advantage': 'Strong atmosphere and warm color harmony.',
                'critique': 'The subject blends into a cluttered background.',
                'suggestions': 'Move the subject to the left third and use warm side light.',
                'scores': {'composition': 4, 'lighting': 6, 'color': 7, 'impact': 5, 'technical': 6},
                'image_type': 'portrait',
            },
            user_prompt='generate a clearer retake reference',
            intent='retake_reference',
            image_type='portrait',
            style='cinematic',
        )

        self.assertIn('next-shoot reference', prompt)
        self.assertIn('not a corrected version', prompt)
        self.assertIn('left third', prompt)
        self.assertIn('Weakest critique dimension: composition', prompt)


if __name__ == '__main__':
    unittest.main()
