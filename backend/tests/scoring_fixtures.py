from __future__ import annotations

from copy import deepcopy


DIMENSION_KEYS = ('composition', 'lighting', 'color', 'impact', 'technical')

LOW_SCORES = {'composition': 7, 'lighting': 6, 'color': 6, 'impact': 5, 'technical': 6}
HIGH_SCORES = {'composition': 9, 'lighting': 8, 'color': 8, 'impact': 9, 'technical': 6}


def score_evidence_fixture(scores: dict[str, int] | None = None, *, audited: bool = False) -> dict:
    resolved_scores = scores or LOW_SCORES
    evidence = {
        'dimensions': {
            'composition': {
                'strength': 'The frame gives the main subject a readable position.',
                'limitation': 'The edge details still compete with the subject.',
                'high_score_justification': '',
            },
            'lighting': {
                'strength': 'The light describes the main forms clearly.',
                'limitation': 'The tonal separation is useful but not especially shaped.',
                'high_score_justification': '',
            },
            'color': {
                'strength': 'The palette stays coherent across the frame.',
                'limitation': 'The color relationship remains somewhat familiar.',
                'high_score_justification': '',
            },
            'impact': {
                'strength': 'The image has a clear mood.',
                'limitation': 'The visual relationship is not yet distinctive enough.',
                'high_score_justification': '',
            },
            'technical': {
                'strength': 'The file is readable at review size.',
                'limitation': 'Fine detail and exposure control are only moderate.',
                'high_score_justification': '',
            },
        },
        'overall_justification': '',
    }
    for key, value in resolved_scores.items():
        if value >= 8:
            evidence['dimensions'][key]['high_score_justification'] = (
                f'The {key} score is supported by visible control rather than subject appeal alone.'
            )
    if sum(resolved_scores.values()) / len(resolved_scores) >= 8:
        evidence['overall_justification'] = (
            'The high candidate score is supported by multiple visible controls across the frame.'
        )
    if audited:
        evidence['high_score_audited'] = True
    return deepcopy(evidence)


def model_score_payload(scores: dict[str, int] | None = None) -> dict:
    resolved_scores = scores or LOW_SCORES
    return {
        'scores': deepcopy(resolved_scores),
        'score_evidence': score_evidence_fixture(resolved_scores),
    }
