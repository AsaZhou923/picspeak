from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Any


PASS = 'PASS'
FAIL = 'FAIL'
INSUFFICIENT_INVALID = 'INSUFFICIENT_INVALID'

DEFAULT_MIN_TEST_SAMPLES = 120
DEFAULT_MIN_RATERS = 2
DEFAULT_MIN_REPEATS = 3
DEFAULT_FALSE_HIGH_MAX = 0.05
DEFAULT_HIGH_RECALL_MIN = 0.80
DEFAULT_MAE_MAX = 0.60
DEFAULT_REPEAT_RANGE_P95_MAX = 0.40
VALID_IMAGE_TYPES = (
    'default',
    'landscape',
    'portrait',
    'street',
    'still_life',
    'architecture',
)


@dataclass(frozen=True)
class Thresholds:
    min_test_samples: int = DEFAULT_MIN_TEST_SAMPLES
    min_raters: int = DEFAULT_MIN_RATERS
    min_repeats: int = DEFAULT_MIN_REPEATS
    false_high_max: float = DEFAULT_FALSE_HIGH_MAX
    high_recall_min: float = DEFAULT_HIGH_RECALL_MIN
    mae_max: float = DEFAULT_MAE_MAX
    repeat_range_p95_max: float = DEFAULT_REPEAT_RANGE_P95_MAX
    diagnostic: bool = False


def _is_score(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(float(value)) and 0 <= float(value) <= 10


def _exceeds_limit(value: float, limit: float) -> bool:
    # Decimal score differences such as 6.4 - 6.0 can exceed 0.4 by float roundoff.
    return value > limit and not math.isclose(value, limit, rel_tol=0, abs_tol=1e-12)


def _load_records(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding='utf-8')
    stripped = text.strip()
    if not stripped:
        raise ValueError('input is empty')

    if path.suffix.lower() == '.jsonl':
        records: list[dict[str, Any]] = []
        for line_number, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                continue
            record = json.loads(line)
            if not isinstance(record, dict):
                raise ValueError(f'line {line_number}: record must be an object')
            records.append(record)
        return records

    payload = json.loads(text)
    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, dict) and isinstance(payload.get('records'), list):
        records = payload['records']
    else:
        raise ValueError('JSON input must be a record array or an object with records')

    if not all(isinstance(record, dict) for record in records):
        raise ValueError('each record must be an object')
    return records


def _require_text(record: dict[str, Any], field: str, sample_ref: str, errors: list[str]) -> str:
    value = record.get(field)
    if not isinstance(value, str) or not value.strip():
        errors.append(f'{sample_ref}: {field} must be a non-empty string')
        return ''
    return value.strip()


def _validate_thresholds(thresholds: Thresholds, errors: list[str]) -> None:
    count_fields = ('min_test_samples', 'min_raters', 'min_repeats')
    for field in count_fields:
        value = getattr(thresholds, field)
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            errors.append(f'{field} must be a positive integer')

    rate_fields = ('false_high_max', 'high_recall_min', 'mae_max', 'repeat_range_p95_max')
    for field in rate_fields:
        value = getattr(thresholds, field)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            errors.append(f'{field} must be a finite number')
            continue
        if field in {'false_high_max', 'high_recall_min'} and not 0 <= float(value) <= 1:
            errors.append(f'{field} must be from 0 to 1')
        elif field not in {'false_high_max', 'high_recall_min'} and float(value) < 0:
            errors.append(f'{field} must be zero or greater')

    if not isinstance(thresholds.diagnostic, bool):
        errors.append('diagnostic must be a boolean')


def _validate_human_ratings(record: dict[str, Any], sample_id: str, thresholds: Thresholds, errors: list[str]) -> list[float]:
    ratings = record.get('human_ratings')
    if not isinstance(ratings, list):
        errors.append(f'{sample_id}: human_ratings must be a list')
        return []

    scores: list[float] = []
    raters: set[str] = set()
    for index, rating in enumerate(ratings):
        ref = f'{sample_id}.human_ratings[{index}]'
        if not isinstance(rating, dict):
            errors.append(f'{ref}: rating must be an object')
            continue
        rater_id = rating.get('rater_id')
        if not isinstance(rater_id, str) or not rater_id.strip():
            errors.append(f'{ref}: rater_id must be a non-empty string')
        else:
            normalized_rater_id = rater_id.strip()
            if normalized_rater_id in raters:
                errors.append(f'{ref}: duplicate rater_id {normalized_rater_id}')
            raters.add(normalized_rater_id)

        score = rating.get('score')
        if not _is_score(score):
            errors.append(f'{ref}: score must be a finite number from 0 to 10')
        else:
            scores.append(float(score))

    if len(raters) < thresholds.min_raters:
        errors.append(f'{sample_id}: needs at least {thresholds.min_raters} distinct real human raters')
    return scores


def _validate_model_repeats(
    record: dict[str, Any],
    sample_id: str,
    thresholds: Thresholds,
    errors: list[str],
) -> dict[str, list[float]]:
    repeats = record.get('model_repeats')
    if not isinstance(repeats, list):
        errors.append(f'{sample_id}: model_repeats must be a list')
        return {}

    scores_by_version: dict[str, list[float]] = defaultdict(list)
    seen_runs: set[tuple[str, str]] = set()
    for index, repeat in enumerate(repeats):
        ref = f'{sample_id}.model_repeats[{index}]'
        if not isinstance(repeat, dict):
            errors.append(f'{ref}: repeat must be an object')
            continue

        run_id = repeat.get('run_id')
        version = repeat.get('version')
        if not isinstance(run_id, str) or not run_id.strip():
            errors.append(f'{ref}: run_id must be a non-empty string')
            run_id = ''
        if not isinstance(version, str) or not version.strip():
            errors.append(f'{ref}: version must be a non-empty string')
            version = ''

        if isinstance(run_id, str) and run_id.strip() and isinstance(version, str) and version.strip():
            normalized_run_id = run_id.strip()
            normalized_version = version.strip()
            key = (normalized_version, normalized_run_id)
            if key in seen_runs:
                errors.append(f'{ref}: duplicate run_id {normalized_run_id} for version {normalized_version}')
            seen_runs.add(key)

        score = repeat.get('score')
        if not _is_score(score):
            errors.append(f'{ref}: score must be a finite number from 0 to 10')
        elif isinstance(version, str) and version.strip():
            scores_by_version[version.strip()].append(float(score))

    for version, scores in sorted(scores_by_version.items()):
        if len(scores) < thresholds.min_repeats:
            errors.append(f'{sample_id}: version {version} needs at least {thresholds.min_repeats} independent repeats')

    return dict(scores_by_version)


def _percentile_95(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, math.ceil(0.95 * len(ordered)) - 1)
    return ordered[index]


def evaluate_records(
    records: list[dict[str, Any]],
    *,
    thresholds: Thresholds = Thresholds(),
    version_filter: str | None = None,
) -> dict[str, Any]:
    errors: list[str] = []
    _validate_thresholds(thresholds, errors)
    sample_ids: set[str] = set()
    split_by_content_group: dict[str, set[str]] = defaultdict(set)
    test_content_group_counts: Counter[str] = Counter()
    all_versions: set[str] = set()
    test_samples_by_version: dict[str, list[dict[str, Any]]] = defaultdict(list)
    split_counts: Counter[str] = Counter()
    image_type_counts: Counter[str] = Counter()

    for index, record in enumerate(records):
        sample_ref = f'record[{index}]'
        sample_id = _require_text(record, 'sample_id', sample_ref, errors)
        if sample_id:
            if sample_id in sample_ids:
                errors.append(f'{sample_id}: duplicate sample_id')
            sample_ids.add(sample_id)
        else:
            sample_id = sample_ref

        content_group = _require_text(record, 'content_group', sample_id, errors)
        image_type = _require_text(record, 'image_type', sample_id, errors)
        split = _require_text(record, 'split', sample_id, errors)
        if image_type and image_type not in VALID_IMAGE_TYPES:
            errors.append(f'{sample_id}: image_type must be one of {", ".join(VALID_IMAGE_TYPES)}')
        if split and split not in {'calibration', 'test'}:
            errors.append(f'{sample_id}: split must be calibration or test')
        if content_group and split:
            split_by_content_group[content_group].add(split)
            if split == 'test':
                test_content_group_counts[content_group] += 1
        if split:
            split_counts[split] += 1
        if image_type:
            image_type_counts[image_type] += 1

        human_scores = _validate_human_ratings(record, sample_id, thresholds, errors)
        repeats_by_version = _validate_model_repeats(record, sample_id, thresholds, errors)
        all_versions.update(repeats_by_version)

        if split == 'test' and human_scores:
            for version, model_scores in repeats_by_version.items():
                if version_filter and version != version_filter:
                    continue
                test_samples_by_version[version].append(
                    {
                        'sample_id': sample_id,
                        'content_group': content_group,
                        'image_type': image_type,
                        'human_median': float(median(human_scores)),
                        'model_scores': model_scores,
                        'model_mean': sum(model_scores) / len(model_scores),
                        'repeat_range': max(model_scores) - min(model_scores),
                    }
                )

    for content_group, splits in sorted(split_by_content_group.items()):
        if len(splits) > 1:
            errors.append(f'content_group {content_group}: same photo or derivative crosses calibration/test split')
    for content_group, count in sorted(test_content_group_counts.items()):
        if count > 1:
            errors.append(f'content_group {content_group}: appears more than once in test split')

    versions_to_report = sorted([version_filter] if version_filter else all_versions)
    version_reports: dict[str, dict[str, Any]] = {}
    insufficient: list[str] = []
    any_fail = False

    for version in versions_to_report:
        samples = test_samples_by_version.get(version, [])
        unique_content_groups = {sample['content_group'] for sample in samples}
        version_image_types = {sample['image_type'] for sample in samples}
        low_samples = [sample for sample in samples if sample['human_median'] <= 6.5]
        high_samples = [sample for sample in samples if sample['human_median'] >= 8.0]
        repeat_ranges = [sample['repeat_range'] for sample in samples]
        all_run_errors = [
            abs(score - sample['human_median'])
            for sample in samples
            for score in sample['model_scores']
        ]
        low_runs = [score for sample in low_samples for score in sample['model_scores']]
        high_runs = [score for sample in high_samples for score in sample['model_scores']]
        mae_per_run = None if not all_run_errors else sum(all_run_errors) / len(all_run_errors)
        mae_mean = None if not samples else sum(abs(sample['model_mean'] - sample['human_median']) for sample in samples) / len(samples)
        false_high_sample_rate = (
            None if not low_samples else sum(1 for sample in low_samples if max(sample['model_scores']) >= 8.0) / len(low_samples)
        )
        false_high_run_rate = None if not low_runs else sum(1 for score in low_runs if score >= 8.0) / len(low_runs)
        high_recall = None if not high_runs else sum(1 for score in high_runs if score >= 8.0) / len(high_runs)
        high_recall_sample_rate = (
            None if not high_samples else sum(1 for sample in high_samples if max(sample['model_scores']) >= 8.0) / len(high_samples)
        )
        repeat_range_p95 = _percentile_95(repeat_ranges)

        evidence_gaps: list[str] = []
        if not thresholds.diagnostic and thresholds.min_test_samples < DEFAULT_MIN_TEST_SAMPLES:
            evidence_gaps.append('reduced min_test_samples requires diagnostic=true')
        if len(unique_content_groups) < thresholds.min_test_samples:
            evidence_gaps.append(f'unique test content groups {len(unique_content_groups)} < required {thresholds.min_test_samples}')
        if not thresholds.diagnostic:
            missing_image_types = sorted(set(VALID_IMAGE_TYPES) - version_image_types)
            if missing_image_types:
                evidence_gaps.append(f'missing required image_type coverage: {", ".join(missing_image_types)}')
        if not low_samples:
            evidence_gaps.append('no test samples with human median <= 6.5 for false-high denominator')
        if not high_samples:
            evidence_gaps.append('no test samples with human median >= 8.0 for recall denominator')
        if mae_per_run is None:
            evidence_gaps.append('no MAE denominator')
        if repeat_range_p95 is None:
            evidence_gaps.append('no repeat-stability denominator')
        if errors:
            evidence_gaps.append('input has validation errors')

        threshold_failures: list[str] = []
        if false_high_sample_rate is not None and _exceeds_limit(false_high_sample_rate, thresholds.false_high_max):
            threshold_failures.append(
                f'false_high_sample_rate {false_high_sample_rate:.4f} > {thresholds.false_high_max:.4f}'
            )
        if high_recall is not None and _exceeds_limit(thresholds.high_recall_min, high_recall):
            threshold_failures.append(f'high_recall {high_recall:.4f} < {thresholds.high_recall_min:.4f}')
        if mae_per_run is not None and _exceeds_limit(mae_per_run, thresholds.mae_max):
            threshold_failures.append(f'mae_per_run {mae_per_run:.4f} > {thresholds.mae_max:.4f}')
        if repeat_range_p95 is not None and _exceeds_limit(repeat_range_p95, thresholds.repeat_range_p95_max):
            threshold_failures.append(
                f'repeat_range_p95 {repeat_range_p95:.4f} > {thresholds.repeat_range_p95_max:.4f}'
            )

        if evidence_gaps:
            status = INSUFFICIENT_INVALID
            insufficient.extend(f'{version}: {gap}' for gap in evidence_gaps)
        elif threshold_failures:
            status = FAIL
            any_fail = True
        else:
            status = PASS

        version_reports[version] = {
            'status': status,
            'sample_count': len(samples),
            'unique_content_groups': len(unique_content_groups),
            'low_human_denominator': len(low_samples),
            'low_human_run_denominator': len(low_runs),
            'high_human_denominator': len(high_samples),
            'high_human_run_denominator': len(high_runs),
            'false_high_sample_rate': false_high_sample_rate,
            'false_high_run_rate': false_high_run_rate,
            'high_recall': high_recall,
            'high_recall_sample_rate': high_recall_sample_rate,
            'mae_per_run': mae_per_run,
            'mae_mean': mae_mean,
            'repeat_range_p95': repeat_range_p95,
            'threshold_failures': threshold_failures,
            'evidence_gaps': evidence_gaps,
            'image_type_counts': dict(sorted(Counter(sample['image_type'] for sample in samples).items())),
        }

    if not records:
        errors.append('input contains no records')
    if version_filter and version_filter not in all_versions:
        errors.append(f'version {version_filter} is absent from input')
    if not versions_to_report:
        errors.append('input contains no model version evidence')

    if errors or insufficient:
        status = INSUFFICIENT_INVALID
        exit_code = 2
    elif any_fail:
        status = FAIL
        exit_code = 1
    else:
        status = PASS
        exit_code = 0

    return {
        'status': status,
        'exit_code': exit_code,
        'schema_version': 1,
        'thresholds': thresholds.__dict__,
        'coverage': {
            'records': len(records),
            'unique_samples': len(sample_ids),
            'split_counts': dict(sorted(split_counts.items())),
            'image_type_counts': dict(sorted(image_type_counts.items())),
            'valid_image_types': list(VALID_IMAGE_TYPES),
            'diagnostic': thresholds.diagnostic,
            'versions': sorted(all_versions),
            'evaluated_versions': versions_to_report,
        },
        'versions': version_reports,
        'errors': errors,
        'insufficient_evidence': insufficient,
        'notes': [
            'Human ratings are the calibration truth source; model self-ratings are never truth labels.',
            'Keep normal review and retake-comparison pools separate when preparing inputs.',
        ],
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Evaluate PicSpeak score calibration evidence offline.')
    parser.add_argument('input', help='JSON or JSONL file containing blind human ratings and model repeats.')
    parser.add_argument('--version', default=None, help='Evaluate only one model score version.')
    parser.add_argument('--output', default=None, help='Optional JSON output file. Defaults to stdout.')
    parser.add_argument('--min-test-samples', type=int, default=DEFAULT_MIN_TEST_SAMPLES)
    parser.add_argument('--min-raters', type=int, default=DEFAULT_MIN_RATERS)
    parser.add_argument('--min-repeats', type=int, default=DEFAULT_MIN_REPEATS)
    parser.add_argument('--false-high-max', type=float, default=DEFAULT_FALSE_HIGH_MAX)
    parser.add_argument('--high-recall-min', type=float, default=DEFAULT_HIGH_RECALL_MIN)
    parser.add_argument('--mae-max', type=float, default=DEFAULT_MAE_MAX)
    parser.add_argument('--repeat-range-p95-max', type=float, default=DEFAULT_REPEAT_RANGE_P95_MAX)
    parser.add_argument(
        '--diagnostic',
        action='store_true',
        help='Mark a reduced local diagnostic run. This relaxes formal six-type coverage.',
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    thresholds = Thresholds(
        min_test_samples=args.min_test_samples,
        min_raters=args.min_raters,
        min_repeats=args.min_repeats,
        false_high_max=args.false_high_max,
        high_recall_min=args.high_recall_min,
        mae_max=args.mae_max,
        repeat_range_p95_max=args.repeat_range_p95_max,
        diagnostic=args.diagnostic,
    )

    try:
        records = _load_records(Path(args.input))
        report = evaluate_records(records, thresholds=thresholds, version_filter=args.version)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        report = {
            'status': INSUFFICIENT_INVALID,
            'exit_code': 2,
            'schema_version': 1,
            'errors': [str(exc)],
            'insufficient_evidence': [],
            'versions': {},
            'coverage': {},
        }

    output = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output + '\n', encoding='utf-8')
    else:
        print(output)
    return int(report['exit_code'])


if __name__ == '__main__':
    sys.exit(main())
