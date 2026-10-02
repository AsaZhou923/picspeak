from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


DIAGNOSTIC_IMPROVEMENT = 'DIAGNOSTIC_IMPROVEMENT'
NO_IMPROVEMENT = 'NO_IMPROVEMENT'
INSUFFICIENT_INVALID = 'INSUFFICIENT_INVALID'
DIMENSIONS = ('composition', 'lighting', 'color', 'impact', 'technical')


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def _finite_score(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(float(value)) and 0 <= float(value) <= 10


def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


def _nearest_rank_p95(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(0.95 * len(ordered)) - 1)]


def _spearman(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) != len(ys) or len(xs) < 2:
        return None
    rx = _ranks(xs)
    ry = _ranks(ys)
    mx = _mean(rx)
    my = _mean(ry)
    numerator = sum((x - mx) * (y - my) for x, y in zip(rx, ry))
    denom_x = math.sqrt(sum((x - mx) ** 2 for x in rx))
    denom_y = math.sqrt(sum((y - my) ** 2 for y in ry))
    if denom_x == 0 or denom_y == 0:
        return None
    return numerator / (denom_x * denom_y)


def _ranks(values: list[float]) -> list[float]:
    indexed = sorted(enumerate(values), key=lambda item: item[1])
    ranks = [0.0] * len(values)
    index = 0
    while index < len(indexed):
        end = index + 1
        while end < len(indexed) and indexed[end][1] == indexed[index][1]:
            end += 1
        rank = (index + 1 + end) / 2
        for original, _ in indexed[index:end]:
            ranks[original] = rank
        index = end
    return ranks


def _pair_accuracy(samples: list[dict[str, Any]], scores: dict[str, float]) -> dict[str, Any]:
    correct = 0.0
    denominator = 0
    sample_ids = [sample['sample_id'] for sample in samples]
    by_id = {sample['sample_id']: sample for sample in samples}
    for left_index, left_id in enumerate(sample_ids):
        for right_id in sample_ids[left_index + 1:]:
            gap = by_id[left_id]['human_mean'] - by_id[right_id]['human_mean']
            if abs(gap) < 1:
                continue
            denominator += 1
            model_gap = scores[left_id] - scores[right_id]
            if model_gap == 0:
                correct += 0.5
            elif (gap > 0 and model_gap > 0) or (gap < 0 and model_gap < 0):
                correct += 1
    return {'accuracy': correct / denominator if denominator else None, 'denominator': denominator}


def _load_manifest(path: Path, min_holdout: int) -> tuple[dict[str, dict[str, Any]], list[str]]:
    payload = _load_json(path)
    raw_samples = payload.get('samples') if isinstance(payload, dict) else None
    errors: list[str] = []
    if not isinstance(raw_samples, list):
        return {}, ['manifest.samples must be a list']

    samples: dict[str, dict[str, Any]] = {}
    content_groups_by_role: dict[str, set[str]] = defaultdict(set)
    hashes_by_role: dict[str, set[str]] = defaultdict(set)
    for index, sample in enumerate(raw_samples):
        ref = f'samples[{index}]'
        if not isinstance(sample, dict):
            errors.append(f'{ref}: sample must be an object')
            continue
        sample_id = sample.get('sample_id')
        role = sample.get('role')
        content_group = sample.get('content_group')
        image_hash = sample.get('image_sha256')
        if not isinstance(sample_id, str) or not sample_id:
            errors.append(f'{ref}: sample_id must be a non-empty string')
            continue
        if sample_id in samples:
            errors.append(f'{sample_id}: duplicate sample_id')
        if not isinstance(role, str) or role not in {'development', 'holdout'}:
            errors.append(f'{sample_id}: role must be development or holdout')
        if not isinstance(content_group, str) or not content_group:
            errors.append(f'{sample_id}: content_group must be a non-empty string')
        if not isinstance(image_hash, str) or not image_hash:
            errors.append(f'{sample_id}: image_sha256 must be a non-empty string')
        counts = sample.get('rating_counts')
        total_votes = sample.get('total_votes')
        human_mean = sample.get('human_mean')
        if not isinstance(counts, list) or len(counts) != 10 or any(isinstance(v, bool) or not isinstance(v, int) or v < 0 for v in counts):
            errors.append(f'{sample_id}: rating_counts must contain 10 non-negative integers')
        elif type(total_votes) is not int or total_votes != sum(counts) or total_votes <= 0:
            errors.append(f'{sample_id}: total_votes must equal rating_counts sum')
        else:
            computed = sum((rating + 1) * count for rating, count in enumerate(counts)) / total_votes
            if not _finite_score(human_mean) or abs(float(human_mean) - computed) > 1e-5:
                errors.append(f'{sample_id}: human_mean must match rating_counts within 1e-5')
        if isinstance(role, str) and isinstance(content_group, str) and content_group:
            content_groups_by_role[content_group].add(role)
        if isinstance(role, str) and isinstance(image_hash, str) and image_hash:
            hashes_by_role[image_hash].add(role)
        samples[sample_id] = dict(sample)

    for group, roles in content_groups_by_role.items():
        if len(roles) > 1:
            errors.append(f'content_group {group}: cannot cross development/holdout roles')
    for image_hash, roles in hashes_by_role.items():
        if len(roles) > 1:
            errors.append(f'image_sha256 {image_hash}: cannot cross development/holdout roles')
    for field in ('content_group', 'image_sha256'):
        seen: set[str] = set()
        for sample in samples.values():
            value = sample.get(field)
            if isinstance(value, str):
                if value in seen:
                    errors.append(f'{field} {value}: duplicate content cannot count as independent samples')
                seen.add(value)
    holdout_count = sum(1 for sample in samples.values() if sample.get('role') == 'holdout')
    if holdout_count < min_holdout:
        errors.append(f'holdout needs at least {min_holdout} samples')
    holdout_bins = [sample.get('score_bin') for sample in samples.values() if sample.get('role') == 'holdout']
    if any(type(value) is not int or value not in range(4) for value in holdout_bins) or set(holdout_bins) != set(range(4)):
        errors.append('holdout requires all four valid score bins')
    return samples, errors


def _score_from_result(raw: dict[str, Any], sample: dict[str, Any], errors: list[str], ref: str) -> dict[str, Any] | None:
    sample_id = raw.get('sample_id')
    variant = raw.get('variant')
    repeat_index = raw.get('repeat_index')
    if raw.get('status') != 'completed':
        errors.append(f'{ref}: status must be completed')
    if raw.get('image_sha256') != sample.get('image_sha256'):
        errors.append(f'{ref}: image_sha256 does not match manifest')
    if variant not in {'baseline', 'candidate'}:
        errors.append(f'{ref}: variant must be baseline or candidate')
    if isinstance(repeat_index, bool) or not isinstance(repeat_index, int) or repeat_index <= 0:
        errors.append(f'{ref}: repeat_index must be a positive integer')
    result = raw.get('result')
    if not isinstance(result, dict):
        errors.append(f'{ref}: result must be an object')
        return None
    scores = result.get('scores')
    final_score = result.get('final_score')
    if not isinstance(scores, dict) or set(scores) != set(DIMENSIONS) or any(isinstance(scores[k], bool) or not isinstance(scores[k], int) or not 0 <= scores[k] <= 10 for k in DIMENSIONS):
        errors.append(f'{ref}: scores must contain the five exact integer dimensions')
        return None
    if not _finite_score(final_score):
        errors.append(f'{ref}: final_score must be a finite number from 0 to 10')
        return None
    score_value = float(final_score)
    if abs(score_value - round(sum(scores.values()) / len(DIMENSIONS), 1)) > 1e-9:
        errors.append(f'{ref}: final_score must equal rounded dimension mean')
        return None
    if not isinstance(sample_id, str) or variant not in {'baseline', 'candidate'} or not isinstance(repeat_index, int):
        return None
    return {'sample_id': sample_id, 'variant': variant, 'repeat_index': repeat_index, 'score': score_value}


def evaluate(manifest_path: Path, results_dir: Path, *, min_repeats: int = 3, min_holdout: int = 8) -> dict[str, Any]:
    errors: list[str] = []
    if min_repeats <= 0:
        errors.append('min_repeats must be positive')
    if min_holdout <= 0:
        errors.append('min_holdout must be positive')
    samples, manifest_errors = _load_manifest(manifest_path, min_holdout)
    errors.extend(manifest_errors)
    manifest = _load_json(manifest_path)
    declared_gate = manifest.get('gate', {}) if isinstance(manifest, dict) else {}
    if not isinstance(declared_gate, dict):
        errors.append('manifest.gate must be an object')
        declared_gate = {}
    mode = declared_gate.get('mode', 'ranking_gain')
    if mode not in {'ranking_gain', 'stability_noninferiority'}:
        errors.append('unknown diagnostic gate mode')
    supported = {'wide_gap_pair_accuracy_must_not_drop': True,
                 'wide_gap_min_human_mean_difference': 1.0,
                 'repeat_range_p95_must_not_worsen': True,
                 'no_missing_or_failed_samples': True,
                 'no_cherry_picking_after_scoring': True}
    supported.update({'holdout_spearman_gain_min': 0.10} if mode == 'ranking_gain' else
                     {'holdout_spearman_drop_max': 0.01, 'repeat_range_p95_reduction_min': 0.2})
    for key, value in declared_gate.items():
        if key == 'mode':
            continue
        if key not in supported or type(value) is not type(supported[key]) or value != supported[key]:
            errors.append(f'manifest.gate.{key}: differs from supported predeclared profile')
    if errors:
        return {'status': INSUFFICIENT_INVALID, 'human_calibration_status': INSUFFICIENT_INVALID,
                'sample_count': len(samples), 'holdout_count': sum(s.get('role') == 'holdout' for s in samples.values()),
                'min_repeats': min_repeats, 'variants': {}, 'gate': {}, 'errors': errors}
    prompt_source_by_variant: dict[str, set[str]] = defaultdict(set)
    runs: dict[tuple[str, str, int], float] = {}
    run_ids: dict[tuple[str, str], set[str]] = defaultdict(set)

    for path in sorted(results_dir.glob('*.json')):
        raw = _load_json(path)
        if not isinstance(raw, dict):
            errors.append(f'{path.name}: run file must be an object')
            continue
        sample_id = raw.get('sample_id')
        if not isinstance(sample_id, str) or sample_id not in samples:
            errors.append(f'{path.name}: sample_id is not in manifest')
            continue
        prompt_source = raw.get('prompt_source_sha256')
        if not isinstance(prompt_source, str) or not prompt_source:
            errors.append(f'{path.name}: prompt_source_sha256 must be a non-empty string')
        else:
            prompt_source_by_variant[str(raw.get('variant'))].add(prompt_source)
        parsed = _score_from_result(raw, samples[sample_id], errors, path.name)
        if not parsed:
            continue
        run_id = raw.get('run_id')
        identity = (parsed['sample_id'], parsed['variant'])
        if not isinstance(run_id, str) or not run_id.strip():
            errors.append(f'{path.name}: run_id must be a non-empty string')
        elif run_id in run_ids[identity]:
            errors.append(f'{path.name}: duplicate run_id within sample and variant')
        else:
            run_ids[identity].add(run_id)
        key = (parsed['sample_id'], parsed['variant'], parsed['repeat_index'])
        if parsed['repeat_index'] > min_repeats:
            errors.append(f'{path.name}: unexpected repeat index beyond fixed evaluation count')
        if key in runs:
            errors.append(f'{path.name}: duplicate run for {key}')
        runs[key] = parsed['score']

    for variant, hashes in sorted(prompt_source_by_variant.items()):
        if variant in {'baseline', 'candidate'} and len(hashes) != 1:
            errors.append(f'{variant}: prompt_source_sha256 must be invariant within variant')

    holdouts = [sample for sample in samples.values() if sample.get('role') == 'holdout']
    variants: dict[str, dict[str, Any]] = {}
    repeat_spearman: dict[str, list[float]] = {'baseline': [], 'candidate': []}
    repeat_pair_accuracy: dict[str, list[float]] = {'baseline': [], 'candidate': []}
    repeat_pair_denominators: dict[str, list[int]] = {'baseline': [], 'candidate': []}
    avg_scores_by_variant: dict[str, dict[str, float]] = {}

    for variant in ('baseline', 'candidate'):
        scores_by_sample: dict[str, list[float]] = {}
        for sample in holdouts:
            sample_id = sample['sample_id']
            repeats = [runs[(sample_id, variant, idx)] for idx in range(1, min_repeats + 1) if (sample_id, variant, idx) in runs]
            if len(repeats) != min_repeats:
                errors.append(f'{sample_id}/{variant}: needs exactly repeats 1..{min_repeats}')
            scores_by_sample[sample_id] = repeats
        avg_scores = {sample_id: _mean(scores) for sample_id, scores in scores_by_sample.items() if len(scores) == min_repeats}
        avg_scores_by_variant[variant] = avg_scores
        ranges = [max(scores) - min(scores) for scores in scores_by_sample.values() if len(scores) == min_repeats]
        human = [float(sample['human_mean']) for sample in holdouts if sample['sample_id'] in avg_scores]
        model = [avg_scores[sample['sample_id']] for sample in holdouts if sample['sample_id'] in avg_scores]
        variants[variant] = {
            'avg_score_spearman': _spearman(human, model),
            'repeat_range_p95': _nearest_rank_p95(ranges),
        }

    common_repeat_indexes = range(1, min_repeats + 1)
    for variant in ('baseline', 'candidate'):
        for repeat_index in common_repeat_indexes:
            repeat_scores = {
                sample['sample_id']: runs[(sample['sample_id'], variant, repeat_index)]
                for sample in holdouts
                if (sample['sample_id'], variant, repeat_index) in runs
            }
            if len(repeat_scores) != len(holdouts):
                continue
            human = [float(sample['human_mean']) for sample in holdouts]
            model = [repeat_scores[sample['sample_id']] for sample in holdouts]
            rho = _spearman(human, model)
            if rho is not None:
                repeat_spearman[variant].append(rho)
            pair = _pair_accuracy(holdouts, repeat_scores)
            if pair['accuracy'] is not None:
                repeat_pair_accuracy[variant].append(pair['accuracy'])
                repeat_pair_denominators[variant].append(pair['denominator'])

    for variant in ('baseline', 'candidate'):
        variants[variant].update(
            {
                'mean_repeat_spearman': _mean(repeat_spearman[variant]) if repeat_spearman[variant] else None,
                'mean_repeat_pair_accuracy': _mean(repeat_pair_accuracy[variant]) if repeat_pair_accuracy[variant] else None,
                'repeat_pair_denominators': repeat_pair_denominators[variant],
            }
        )

    status = INSUFFICIENT_INVALID
    gate: dict[str, Any] = {}
    if not errors:
        base = variants['baseline']
        cand = variants['candidate']
        required_metrics = (
            base['mean_repeat_spearman'],
            cand['mean_repeat_spearman'],
            base['mean_repeat_pair_accuracy'],
            cand['mean_repeat_pair_accuracy'],
            base['repeat_range_p95'],
            cand['repeat_range_p95'],
        )
        if any(metric is None for metric in required_metrics):
            errors.append('primary metrics are undefined; check holdout size, score variance, and wide-gap pairs')
            return {
                'status': INSUFFICIENT_INVALID,
                'human_calibration_status': 'INSUFFICIENT_INVALID',
                'sample_count': len(samples),
                'holdout_count': len(holdouts),
                'min_repeats': min_repeats,
                'variants': variants,
                'gate': gate,
                'errors': errors,
            }
        delta = cand['mean_repeat_spearman'] - base['mean_repeat_spearman']
        gate = {
            'mode': mode,
            'criteria': ({'spearman_gain_min': 0.10, 'pair_accuracy_drop_max': 0, 'range_increase_max': 0}
                         if mode == 'ranking_gain' else {'spearman_drop_max': 0.01, 'pair_accuracy_drop_max': 0, 'range_reduction_min': 0.2}),
            'spearman_delta': delta,
            'pair_accuracy_delta': cand['mean_repeat_pair_accuracy'] - base['mean_repeat_pair_accuracy'],
            'repeat_range_p95_delta': cand['repeat_range_p95'] - base['repeat_range_p95'],
        }
        tol = 1e-12
        if mode == 'ranking_gain':
            improved = delta >= 0.10 - tol and gate['pair_accuracy_delta'] >= -tol and gate['repeat_range_p95_delta'] <= tol
        else:
            improved = delta >= -0.01 - tol and gate['pair_accuracy_delta'] >= -tol and gate['repeat_range_p95_delta'] <= -0.2 + tol
        status = DIAGNOSTIC_IMPROVEMENT if improved else NO_IMPROVEMENT

    return {
        'status': status,
        'human_calibration_status': 'INSUFFICIENT_INVALID',
        'sample_count': len(samples),
        'holdout_count': len(holdouts),
        'min_repeats': min_repeats,
        'variants': variants,
        'gate': gate,
        'errors': errors,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Evaluate scorer variants against aggregate human vote histograms.')
    parser.add_argument('manifest')
    parser.add_argument('results_dir')
    parser.add_argument('--output', required=True)
    parser.add_argument('--min-repeats', type=int, default=3)
    parser.add_argument('--min-holdout', type=int, default=8)
    args = parser.parse_args(argv)
    try:
        report = evaluate(Path(args.manifest), Path(args.results_dir), min_repeats=args.min_repeats, min_holdout=args.min_holdout)
    except (OSError, ValueError, TypeError, KeyError) as exc:
        report = {'status': INSUFFICIENT_INVALID, 'human_calibration_status': INSUFFICIENT_INVALID,
                  'errors': [f'Invalid benchmark input: {type(exc).__name__}']}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    return 0 if report['status'] == DIAGNOSTIC_IMPROVEMENT else 2 if report['status'] == INSUFFICIENT_INVALID else 1


if __name__ == '__main__':
    raise SystemExit(main())
