from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from statistics import median
from typing import Any, Literal


PASS = 'PASS'
FAIL = 'FAIL'
INSUFFICIENT_INVALID = 'INSUFFICIENT_INVALID'

GOAL_STATUSES = ('achieved', 'partial', 'not_achieved', 'indeterminate')
NEGATIVE_STATUSES = {'partial', 'not_achieved', 'indeterminate'}
AA_DIRECTIONAL_DELTA_TOLERANCE = 1e-6
REQUIRED_CASE_TYPES = (
    'clear_improvement',
    'no_change',
    'goal_improved_other_dimension_worse',
    'better_photo_goal_not_met',
    'incomparable_scene',
    'valid_special_technique',
    'edit_revision',
    'generated_reference',
)


@dataclass(frozen=True)
class GoalEvaluationThresholds:
    min_holdout_pairs: int = 100
    min_raters: int = 2
    min_repeats: int = 3
    four_state_agreement_min: float = 0.80
    false_achieved_max: float = 0.10
    min_negative_consensus: int = 40
    incomparable_recall_min: float = 0.90
    min_incomparable_consensus: int = 30
    min_aa_controls: int = 5
    min_ab_swap_controls: int = 5
    diagnostic: bool = False


def _is_finite_rate(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _wilson_ci(successes: int, total: int, z: float = 1.959963984540054) -> dict[str, float | None]:
    if total <= 0:
        return {'low': None, 'high': None}
    phat = successes / total
    denominator = 1 + z * z / total
    centre = phat + z * z / (2 * total)
    margin = z * math.sqrt((phat * (1 - phat) + z * z / (4 * total)) / total)
    return {
        'low': max(0.0, (centre - margin) / denominator),
        'high': min(1.0, (centre + margin) / denominator),
    }


def _require_text(record: dict[str, Any], field: str, ref: str, errors: list[str]) -> str:
    value = record.get(field)
    if not isinstance(value, str) or not value.strip():
        errors.append(f'{ref}: {field} must be a non-empty string')
        return ''
    return value.strip()


def _status(value: Any, ref: str, errors: list[str]) -> str:
    if not isinstance(value, str) or value not in GOAL_STATUSES:
        errors.append(f'{ref}: status must be one of {", ".join(GOAL_STATUSES)}')
        return ''
    return value


def _declared_swap_pair_is_valid(members: list[dict[str, Any]]) -> bool:
    if len(members) != 2:
        return False
    originals = [member for member in members if member.get('control_type') == 'none']
    swaps = [member for member in members if member.get('control_type') == 'ab_swap']
    if len(originals) != 1 or len(swaps) != 1:
        return False
    original = originals[0]
    swap = swaps[0]
    swap_group_id = swap.get('swap_group_id')
    source_sample_id = swap.get('source_sample_id')
    if not isinstance(swap_group_id, str) or not swap_group_id.strip():
        return False
    if not isinstance(source_sample_id, str) or source_sample_id != original.get('sample_id'):
        return False
    if source_sample_id == swap.get('sample_id'):
        return False
    if original.get('swap_group_id') != swap_group_id:
        return False
    return (
        original.get('original_content_id') == swap.get('retake_content_id')
        and original.get('retake_content_id') == swap.get('original_content_id')
    )


def _bool_or_none(value: Any, ref: str, field: str, errors: list[str]) -> bool | None:
    if value is None:
        return None
    if not isinstance(value, bool):
        errors.append(f'{ref}: {field} must be a boolean when present')
        return None
    return value


def _mode(values: list[str]) -> tuple[str | None, bool]:
    if not values:
        return None, False
    counts = Counter(values)
    most_common = counts.most_common()
    if len(most_common) > 1 and most_common[0][1] == most_common[1][1]:
        return most_common[0][0], False
    return most_common[0][0], True


def _validate_thresholds(thresholds: GoalEvaluationThresholds, errors: list[str]) -> None:
    for field in (
        'min_holdout_pairs',
        'min_raters',
        'min_repeats',
        'min_negative_consensus',
        'min_incomparable_consensus',
        'min_aa_controls',
        'min_ab_swap_controls',
    ):
        value = getattr(thresholds, field)
        if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
            errors.append(f'{field} must be a positive integer')
    for field in ('four_state_agreement_min', 'false_achieved_max', 'incomparable_recall_min'):
        value = getattr(thresholds, field)
        if not _is_finite_rate(value) or not 0 <= float(value) <= 1:
            errors.append(f'{field} must be a finite rate from 0 to 1')
    if not isinstance(thresholds.diagnostic, bool):
        errors.append('diagnostic must be a boolean')


def _is_placeholder_text(value: str) -> bool:
    normalized = value.strip().lower()
    return normalized in {'x', 'todo', 'tbd', 'placeholder', 'test', 'synthetic', 'fake', 'n/a', 'na'}


def _require_truthy_bool(payload: dict[str, Any], field: str, ref: str, errors: list[str]) -> bool:
    value = payload.get(field)
    if value is not True:
        errors.append(f'{ref}: {field} must be true')
        return False
    return True


def _require_reference(payload: dict[str, Any], field: str, ref: str, errors: list[str]) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip() or _is_placeholder_text(value):
        errors.append(f'{ref}: {field} must be a concrete non-placeholder reference')
        return ''
    return value.strip()


def _validate_goal_provenance(payload: dict[str, Any], errors: list[str]) -> dict[str, Any]:
    provenance = payload.get('provenance')
    if not isinstance(provenance, dict):
        errors.append('provenance must be an object')
        return {}

    data_origin = provenance.get('data_origin')
    if data_origin != 'authorized_real_photos':
        errors.append('provenance.data_origin must be authorized_real_photos')
    _require_truthy_bool(provenance, 'real_human_attestation', 'provenance', errors)
    if provenance.get('synthetic') is not False:
        errors.append('provenance.synthetic must be false')
    for field in ('photo_authorization_ref', 'dataset_manifest_ref', 'blind_rating_protocol_ref', 'rater_assignment_ref', 'holdout_freeze_ref'):
        _require_reference(provenance, field, 'provenance', errors)

    freeze = provenance.get('freeze')
    if not isinstance(freeze, dict):
        errors.append('provenance.freeze must be an object')
    else:
        for field in ('diagnostic_manifest_ref', 'holdout_manifest_ref', 'threshold_config_ref', 'frozen_at'):
            _require_reference(freeze, field, 'provenance.freeze', errors)
        _require_truthy_bool(freeze, 'thresholds_frozen_before_holdout', 'provenance.freeze', errors)

    run_manifest = provenance.get('run_manifest')
    if not isinstance(run_manifest, dict):
        errors.append('provenance.run_manifest must be an object')
    else:
        for field in ('run_manifest_ref', 'model_version', 'prompt_version', 'preprocess_version'):
            _require_reference(run_manifest, field, 'provenance.run_manifest', errors)

    return provenance


def _human_consensus(
    record: dict[str, Any],
    sample_id: str,
    thresholds: GoalEvaluationThresholds,
    errors: list[str],
) -> dict[str, Any]:
    ratings = record.get('human_ratings')
    if not isinstance(ratings, list):
        errors.append(f'{sample_id}: human_ratings must be a list')
        return {'status': None, 'has_consensus': False, 'comparable': None, 'rater_count': 0}

    statuses: list[str] = []
    comparable_values: list[bool] = []
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
            normalized = rater_id.strip()
            if normalized in raters:
                errors.append(f'{ref}: duplicate rater_id {normalized}')
            raters.add(normalized)
        status = _status(rating.get('status'), ref, errors)
        if status:
            statuses.append(status)
        comparable = _bool_or_none(rating.get('comparable'), ref, 'comparable', errors)
        if comparable is not None:
            comparable_values.append(comparable)
        if rating.get('blind') is not True:
            errors.append(f'{ref}: blind must be true')
        _require_reference(rating, 'assignment_ref', ref, errors)

    if len(raters) < thresholds.min_raters:
        errors.append(f'{sample_id}: needs at least {thresholds.min_raters} distinct blind human raters')
    consensus_status, has_consensus = _mode(statuses)
    comparable_consensus = None
    if comparable_values:
        comparable_counts = Counter(comparable_values)
        comparable_consensus = comparable_counts.most_common(1)[0][0]
    return {
        'status': consensus_status,
        'has_consensus': has_consensus,
        'comparable': comparable_consensus,
        'rater_count': len(raters),
    }


def _model_consensus(
    record: dict[str, Any],
    sample_id: str,
    thresholds: GoalEvaluationThresholds,
    errors: list[str],
    version_filter: str | None,
) -> dict[str, dict[str, Any]]:
    runs = record.get('model_runs')
    if not isinstance(runs, list):
        errors.append(f'{sample_id}: model_runs must be a list')
        return {}

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen_runs: set[tuple[str, str]] = set()
    for index, run in enumerate(runs):
        ref = f'{sample_id}.model_runs[{index}]'
        if not isinstance(run, dict):
            errors.append(f'{ref}: run must be an object')
            continue
        version = _require_text(run, 'version', ref, errors)
        run_id = _require_text(run, 'run_id', ref, errors)
        if version_filter and version != version_filter:
            continue
        if version and run_id:
            key = (version, run_id)
            if key in seen_runs:
                errors.append(f'{ref}: duplicate run_id {run_id} for version {version}')
            seen_runs.add(key)
        status = _status(run.get('status'), ref, errors)
        is_comparable = _bool_or_none(run.get('is_comparable'), ref, 'is_comparable', errors)
        confidence = run.get('comparison_confidence')
        if confidence is not None and confidence not in {'low', 'medium', 'high'}:
            errors.append(f'{ref}: comparison_confidence must be low, medium, or high')
        preprocess_version = run.get('preprocess_version')
        if preprocess_version is not None and (not isinstance(preprocess_version, str) or not preprocess_version.strip()):
            errors.append(f'{ref}: preprocess_version must be a non-empty string when present')
        for field in ('prompt_version', 'rubric_version'):
            value = run.get(field)
            if not isinstance(value, str) or not value.strip() or _is_placeholder_text(value):
                errors.append(f'{ref}: {field} must be a concrete non-placeholder string')
        directional_delta = run.get('directional_delta')
        if directional_delta is None or not _is_finite_rate(directional_delta):
            errors.append(f'{ref}: directional_delta must be a finite number')
        claims_improvement = run.get('claims_improvement')
        if claims_improvement is not None and not isinstance(claims_improvement, bool):
            errors.append(f'{ref}: claims_improvement must be a boolean when present')
        if version and status:
            grouped[version].append({
                'status': status,
                'is_comparable': is_comparable,
                'comparison_confidence': confidence,
                'preprocess_version': preprocess_version,
                'directional_delta': float(directional_delta) if _is_finite_rate(directional_delta) else None,
                'claims_improvement': claims_improvement if isinstance(claims_improvement, bool) else None,
            })

    result: dict[str, dict[str, Any]] = {}
    for version, version_runs in grouped.items():
        if len(version_runs) < thresholds.min_repeats:
            errors.append(f'{sample_id}: version {version} needs at least {thresholds.min_repeats} independent runs')
        statuses = [run['status'] for run in version_runs]
        status, stable_status = _mode(statuses)
        comparable_votes = [run['is_comparable'] for run in version_runs if run['is_comparable'] is not None]
        comparable = Counter(comparable_votes).most_common(1)[0][0] if comparable_votes else None
        result[version] = {
            'status': status,
            'stable_status': stable_status,
            'runs': version_runs,
            'run_count': len(version_runs),
            'is_comparable': comparable,
            'preprocess_versions': sorted({run['preprocess_version'] for run in version_runs if run['preprocess_version']}),
        }
    return result


def evaluate_goal_records(
    records: list[dict[str, Any]] | dict[str, Any],
    *,
    thresholds: GoalEvaluationThresholds = GoalEvaluationThresholds(),
    version_filter: str | None = None,
) -> dict[str, Any]:
    errors: list[str] = []
    _validate_thresholds(thresholds, errors)
    provenance: dict[str, Any] = {}
    if isinstance(records, dict):
        provenance = _validate_goal_provenance(records, errors)
        raw_records = records.get('records')
        if not isinstance(raw_records, list):
            errors.append('records must be a list')
            raw_records = []
        records = raw_records
    elif isinstance(records, list):
        errors.append('formal evaluation input must include provenance and records')
    else:
        errors.append('input must be an object with provenance and records')
        records = []

    sample_ids: set[str] = set()
    split_by_content_group: dict[str, set[str]] = defaultdict(set)
    holdout_records_by_content_group: dict[str, list[dict[str, Any]]] = defaultdict(list)
    split_counts: Counter[str] = Counter()
    case_type_counts: Counter[str] = Counter()
    all_versions: set[str] = set()
    evaluated: dict[str, list[dict[str, Any]]] = defaultdict(list)
    failure_cases: dict[str, list[dict[str, Any]]] = defaultdict(list)
    disagreement_count = 0

    for index, record in enumerate(records):
        ref = f'record[{index}]'
        if not isinstance(record, dict):
            errors.append(f'{ref}: record must be an object')
            continue
        sample_id = _require_text(record, 'sample_id', ref, errors) or ref
        if sample_id in sample_ids:
            errors.append(f'{sample_id}: duplicate sample_id')
        sample_ids.add(sample_id)

        content_group = _require_text(record, 'content_group', sample_id, errors)
        split = _require_text(record, 'split', sample_id, errors)
        case_type = _require_text(record, 'case_type', sample_id, errors)
        expected_status = _status(record.get('expected_status'), sample_id, errors)
        control_type = record.get('control_type') or 'none'
        original_content_id = _require_text(record, 'original_content_id', sample_id, errors)
        retake_content_id = _require_text(record, 'retake_content_id', sample_id, errors)
        if split and split not in {'diagnostic', 'holdout'}:
            errors.append(f'{sample_id}: split must be diagnostic or holdout')
        if control_type not in {'none', 'aa', 'ab_swap'}:
            errors.append(f'{sample_id}: control_type must be none, aa, or ab_swap')
        if control_type == 'aa' and original_content_id and retake_content_id and original_content_id != retake_content_id:
            errors.append(f'{sample_id}: aa control must use the same original_content_id and retake_content_id')
        if control_type == 'ab_swap':
            _require_text(record, 'source_sample_id', sample_id, errors)
            _require_text(record, 'swap_group_id', sample_id, errors)
            if original_content_id and retake_content_id and original_content_id == retake_content_id:
                errors.append(f'{sample_id}: ab_swap control requires different original/retake content IDs')
        if case_type:
            case_type_counts[case_type] += 1
        if split:
            split_counts[split] += 1
        if content_group and split:
            split_by_content_group[content_group].add(split)
            if split == 'holdout':
                holdout_records_by_content_group[content_group].append({
                    'sample_id': sample_id,
                    'control_type': control_type,
                    'original_content_id': original_content_id,
                    'retake_content_id': retake_content_id,
                    'source_sample_id': record.get('source_sample_id'),
                    'swap_group_id': record.get('swap_group_id'),
                })

        human = _human_consensus(record, sample_id, thresholds, errors)
        if not human['has_consensus']:
            disagreement_count += 1
        model_by_version = _model_consensus(record, sample_id, thresholds, errors, version_filter)
        all_versions.update(model_by_version)

        if split != 'holdout' or not human['has_consensus']:
            continue
        for version, model in model_by_version.items():
            evaluated[version].append({
                'sample_id': sample_id,
                'content_group': content_group,
                'case_type': case_type,
                'expected_status': expected_status,
                'human_status': human['status'],
                'human_comparable': human['comparable'],
                'model_status': model['status'],
                'model_is_comparable': model['is_comparable'],
                'model_stable': model['stable_status'],
                'control_type': control_type,
                'original_content_id': original_content_id,
                'retake_content_id': retake_content_id,
                'source_sample_id': record.get('source_sample_id'),
                'swap_group_id': record.get('swap_group_id'),
                'directional_deltas': [run['directional_delta'] for run in model['runs'] if run['directional_delta'] is not None],
                'claims_improvement_votes': [run['claims_improvement'] for run in model['runs'] if run['claims_improvement'] is not None],
                'preprocess_versions': model['preprocess_versions'],
            })

    for content_group, splits in sorted(split_by_content_group.items()):
        if len(splits) > 1:
            errors.append(f'content_group {content_group}: crosses diagnostic/holdout split')
    for content_group, members in sorted(holdout_records_by_content_group.items()):
        if len(members) > 1 and not _declared_swap_pair_is_valid(members):
            errors.append(f'content_group {content_group}: duplicate holdout entries must be one declared ab_swap pair with an exact source link')

    versions_to_report = sorted([version_filter] if version_filter else all_versions)
    version_reports: dict[str, Any] = {}
    insufficient: list[str] = []
    any_fail = False

    for version in versions_to_report:
        samples = evaluated.get(version, [])
        unique_groups = {sample['content_group'] for sample in samples}
        consensus_total = len(samples)
        agreement_successes = sum(1 for sample in samples if sample['model_status'] == sample['human_status'])
        negative_samples = [sample for sample in samples if sample['human_status'] in NEGATIVE_STATUSES]
        false_achieved = [sample for sample in negative_samples if sample['model_status'] == 'achieved']
        incomparable_samples = [
            sample for sample in samples
            if sample['human_status'] == 'indeterminate' or sample['human_comparable'] is False or sample['case_type'] == 'incomparable_scene'
        ]
        incomparable_caught = [
            sample for sample in incomparable_samples
            if sample['model_status'] == 'indeterminate' or sample['model_is_comparable'] is False
        ]
        stable_samples = [sample for sample in samples if sample['model_stable']]
        aa_samples = [sample for sample in samples if sample['control_type'] == 'aa']
        aa_missing_outcome = [
            sample for sample in aa_samples
            if not sample['directional_deltas'] or len(sample['claims_improvement_votes']) < thresholds.min_repeats
        ]
        aa_failures = [
            sample for sample in aa_samples
            if (
                any(abs(delta) > AA_DIRECTIONAL_DELTA_TOLERANCE for delta in sample['directional_deltas'])
                or any(sample['claims_improvement_votes'])
            )
        ]
        swap_samples = [sample for sample in samples if sample['control_type'] == 'ab_swap']
        swap_failures: list[dict[str, Any]] = []
        swap_failure_ids: set[str] = set()

        def add_swap_failure(sample: dict[str, Any]) -> None:
            sample_id = sample['sample_id']
            if sample_id not in swap_failure_ids:
                swap_failure_ids.add(sample_id)
                swap_failures.append(sample)

        for sample in swap_samples:
            if sample['model_status'] != sample['human_status']:
                add_swap_failure(sample)

        sample_by_id = {sample['sample_id']: sample for sample in samples}
        validated_swap_pair_ids: set[str] = set()
        for swap in swap_samples:
            source_sample_id = swap.get('source_sample_id')
            original = sample_by_id.get(source_sample_id) if isinstance(source_sample_id, str) else None
            if original is None or original is swap:
                add_swap_failure(swap)
                continue
            if original['control_type'] != 'none':
                add_swap_failure(swap)
                continue
            if original.get('swap_group_id') != swap.get('swap_group_id'):
                add_swap_failure(swap)
                continue
            if original.get('content_group') != swap.get('content_group'):
                add_swap_failure(swap)
                continue
            if (
                original['original_content_id'] != swap['retake_content_id']
                or original['retake_content_id'] != swap['original_content_id']
            ):
                add_swap_failure(swap)
                continue
            validated_swap_pair_ids.add(swap['sample_id'])
            original_delta = median(original['directional_deltas']) if original['directional_deltas'] else None
            swap_delta = median(swap['directional_deltas']) if swap['directional_deltas'] else None
            if original_delta is None or swap_delta is None or original_delta * swap_delta >= 0:
                add_swap_failure(swap)
                continue

        agreement_rate = agreement_successes / consensus_total if consensus_total else None
        false_achieved_rate = len(false_achieved) / len(negative_samples) if negative_samples else None
        incomparable_recall = len(incomparable_caught) / len(incomparable_samples) if incomparable_samples else None
        stability_rate = len(stable_samples) / consensus_total if consensus_total else None

        evidence_gaps: list[str] = []
        if thresholds.diagnostic:
            evidence_gaps.append('diagnostic mode cannot pass the formal CORE-07 gate')
        if len(unique_groups) < thresholds.min_holdout_pairs:
            evidence_gaps.append(f'unique holdout content groups {len(unique_groups)} < required {thresholds.min_holdout_pairs}')
        if len(negative_samples) < thresholds.min_negative_consensus:
            evidence_gaps.append(f'negative consensus denominator {len(negative_samples)} < required {thresholds.min_negative_consensus}')
        if len(incomparable_samples) < thresholds.min_incomparable_consensus:
            evidence_gaps.append(f'incomparable consensus denominator {len(incomparable_samples)} < required {thresholds.min_incomparable_consensus}')
        if len(aa_samples) < thresholds.min_aa_controls:
            evidence_gaps.append(f'aa control count {len(aa_samples)} < required {thresholds.min_aa_controls}')
        if aa_missing_outcome:
            evidence_gaps.append(f'aa controls missing directional_delta or claims_improvement evidence: {len(aa_missing_outcome)}')
        if len(validated_swap_pair_ids) < thresholds.min_ab_swap_controls:
            evidence_gaps.append(f'validated ab_swap control count {len(validated_swap_pair_ids)} < required {thresholds.min_ab_swap_controls}')
        missing_case_types = sorted(set(REQUIRED_CASE_TYPES) - {sample['case_type'] for sample in samples})
        if missing_case_types:
            evidence_gaps.append(f'missing required case_type coverage: {", ".join(missing_case_types)}')
        if errors:
            evidence_gaps.append('input has validation errors')

        threshold_failures: list[str] = []
        if agreement_rate is not None and agreement_rate < thresholds.four_state_agreement_min:
            threshold_failures.append(f'four_state_agreement {agreement_rate:.4f} < {thresholds.four_state_agreement_min:.4f}')
        if false_achieved_rate is not None and false_achieved_rate > thresholds.false_achieved_max:
            threshold_failures.append(f'false_achieved_rate {false_achieved_rate:.4f} > {thresholds.false_achieved_max:.4f}')
        if incomparable_recall is not None and incomparable_recall < thresholds.incomparable_recall_min:
            threshold_failures.append(f'incomparable_recall {incomparable_recall:.4f} < {thresholds.incomparable_recall_min:.4f}')
        if aa_failures:
            threshold_failures.append(f'aa controls claim clear improvement or non-zero directional gain: {len(aa_failures)}')
        if swap_failures:
            threshold_failures.append(f'ab_swap directional failures: {len(swap_failures)}')

        failure_cases[version].extend(
            {'sample_id': sample['sample_id'], 'reason': 'status_mismatch', 'human_status': sample['human_status'], 'model_status': sample['model_status']}
            for sample in samples if sample['model_status'] != sample['human_status']
        )
        failure_cases[version].extend({'sample_id': sample['sample_id'], 'reason': 'aa_control_clear_improvement_claim'} for sample in aa_failures)
        failure_cases[version].extend({'sample_id': sample['sample_id'], 'reason': 'aa_control_missing_outcome_evidence'} for sample in aa_missing_outcome)

        if evidence_gaps:
            status = INSUFFICIENT_INVALID
            insufficient.extend(f'{version}: {gap}' for gap in evidence_gaps)
        elif threshold_failures:
            status = FAIL
            any_fail = True
        else:
            status = PASS

        class_denominators = Counter(sample['human_status'] for sample in samples)
        valid_swap_successes = sum(1 for sample_id in validated_swap_pair_ids if sample_id not in swap_failure_ids)
        version_reports[version] = {
            'status': status,
            'sample_count': consensus_total,
            'unique_content_groups': len(unique_groups),
            'human_disagreement_excluded': disagreement_count,
            'class_denominators': {key: class_denominators.get(key, 0) for key in GOAL_STATUSES},
            'negative_denominator': len(negative_samples),
            'incomparable_denominator': len(incomparable_samples),
            'four_state_agreement': agreement_rate,
            'four_state_agreement_ci': _wilson_ci(agreement_successes, consensus_total),
            'false_achieved_rate': false_achieved_rate,
            'false_achieved_ci': _wilson_ci(len(false_achieved), len(negative_samples)),
            'incomparable_recall': incomparable_recall,
            'incomparable_recall_ci': _wilson_ci(len(incomparable_caught), len(incomparable_samples)),
            'repeat_run_stability': stability_rate,
            'aa_control_failures': len(aa_failures),
            'ab_swap_failures': len(swap_failures),
            'aa_control_count': len(aa_samples),
            'ab_swap_control_count': len(validated_swap_pair_ids),
            'aa_control_ci': _wilson_ci(len(aa_samples) - len(aa_failures), len(aa_samples)),
            'ab_swap_ci': _wilson_ci(valid_swap_successes, len(validated_swap_pair_ids)),
            'threshold_failures': threshold_failures,
            'evidence_gaps': evidence_gaps,
            'case_type_counts': dict(sorted(Counter(sample['case_type'] for sample in samples).items())),
            'preprocess_versions': sorted({version for sample in samples for version in sample['preprocess_versions']}),
            'failure_cases': failure_cases[version][:50],
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
        'schema_version': 1,
        'status': status,
        'exit_code': exit_code,
        'formal_pass_eligible': status == PASS and not thresholds.diagnostic,
        'thresholds': thresholds.__dict__,
        'coverage': {
            'records': len(records),
            'unique_samples': len(sample_ids),
            'split_counts': dict(sorted(split_counts.items())),
            'case_type_counts': dict(sorted(case_type_counts.items())),
            'required_case_types': list(REQUIRED_CASE_TYPES),
            'versions': sorted(all_versions),
            'evaluated_versions': versions_to_report,
            'provenance_refs': {
                'dataset_manifest_ref': provenance.get('dataset_manifest_ref'),
                'holdout_manifest_ref': (provenance.get('freeze') or {}).get('holdout_manifest_ref') if isinstance(provenance.get('freeze'), dict) else None,
                'run_manifest_ref': (provenance.get('run_manifest') or {}).get('run_manifest_ref') if isinstance(provenance.get('run_manifest'), dict) else None,
            },
        },
        'versions': version_reports,
        'errors': errors,
        'insufficient_evidence': insufficient,
        'notes': [
            'Goal evaluation is separate from single-image score calibration.',
            'Human blind consensus is the truth source; diagnostic samples cannot pass the formal gate.',
            'This tool validates declared evidence structure and thresholds; it does not authenticate real humans or photo rights.',
        ],
    }


def _validate_beta_references(payload: dict[str, Any], errors: list[str]) -> None:
    resources = payload.get('resources')
    operator = payload.get('operator')
    feature_flag = payload.get('feature_flag')
    quality_gates = payload.get('quality_gates')
    if not isinstance(resources, dict):
        errors.append('resources must be an object')
    else:
        for field in ('usability_protocol_ref', 'participant_consent_ref', 'baseline_prompt_ref', 'data_origin'):
            _require_reference(resources, field, 'resources', errors)
        if resources.get('data_origin') != 'real_usability_session':
            errors.append('resources.data_origin must be real_usability_session')
        _require_truthy_bool(resources, 'real_participant_attestation', 'resources', errors)
    if not isinstance(operator, dict):
        errors.append('operator must be an object')
    else:
        for field in ('operator_id', 'name', 'contact', 'scope', 'quota_plan_ref'):
            _require_reference(operator, field, 'operator', errors)
    if not isinstance(feature_flag, dict):
        errors.append('feature_flag must be an object')
    else:
        for field in ('flag_name', 'environment', 'intended_state', 'owner', 'switch_off_verified_ref', 'old_result_readable_verified_ref'):
            _require_reference(feature_flag, field, 'feature_flag', errors)
        if feature_flag.get('intended_state') != 'restricted_off_until_launch':
            errors.append('feature_flag.intended_state must be restricted_off_until_launch')
    if not isinstance(quality_gates, dict):
        errors.append('quality_gates must be an object')
    else:
        for field in ('local_contracts_ref', 'code_revision', 'goal_evaluation_report_ref'):
            _require_reference(quality_gates, field, 'quality_gates', errors)
        if quality_gates.get('local_contracts_passed') is not True:
            errors.append('quality_gates.local_contracts_passed must be true')


def evaluate_beta_readiness(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    participants = payload.get('participants')
    if not isinstance(participants, list):
        errors.append('participants must be a list')
        participants = []
    _validate_beta_references(payload, errors)

    participant_ids: set[str] = set()
    completion: list[bool] = []
    picspeak_times: list[float] = []
    baseline_times: list[float] = []
    understanding_deltas: list[float] = []
    for index, participant in enumerate(participants):
        ref = f'participants[{index}]'
        if not isinstance(participant, dict):
            errors.append(f'{ref}: participant must be an object')
            continue
        participant_id = participant.get('participant_id')
        if not isinstance(participant_id, str) or not participant_id.strip():
            errors.append(f'{ref}: participant_id must be a non-empty string')
        elif participant_id.strip() in participant_ids:
            errors.append(f'{ref}: duplicate participant_id {participant_id.strip()}')
        else:
            participant_ids.add(participant_id.strip())
        completed = participant.get('completed_independently')
        if not isinstance(completed, bool):
            errors.append(f'{ref}: completed_independently must be boolean')
        else:
            completion.append(completed)
        for field, bucket in (('picspeak_task_seconds', picspeak_times), ('chatgpt_baseline_seconds', baseline_times)):
            value = participant.get(field)
            if not _is_finite_rate(value) or float(value) <= 0:
                errors.append(f'{ref}: {field} must be a positive finite number')
            else:
                bucket.append(float(value))
        delta = participant.get('understanding_delta')
        if not _is_finite_rate(delta):
            errors.append(f'{ref}: understanding_delta must be a finite number')
        else:
            understanding_deltas.append(float(delta))
        if participant.get('paired_with_chatgpt_baseline') is not True:
            errors.append(f'{ref}: paired_with_chatgpt_baseline must be true')
        for field in ('session_ref', 'consent_ref'):
            _require_reference(participant, field, ref, errors)

    evidence_gaps: list[str] = []
    if len(participant_ids) < 6 or len(participant_ids) > 10:
        evidence_gaps.append(f'participant count {len(participant_ids)} must be from 6 to 10')
    if errors:
        evidence_gaps.append('input has validation errors')

    completion_rate = sum(1 for value in completion if value) / len(completion) if completion else None
    median_picspeak = median(picspeak_times) if picspeak_times else None
    median_baseline = median(baseline_times) if baseline_times else None
    time_reduction = (
        None
        if median_picspeak is None or median_baseline is None
        else (median_baseline - median_picspeak) / median_baseline
    )
    understanding_median_delta = median(understanding_deltas) if understanding_deltas else None

    threshold_failures: list[str] = []
    if completion_rate is not None and completion_rate < 0.70:
        threshold_failures.append(f'independent_completion_rate {completion_rate:.4f} < 0.7000')
    if time_reduction is not None and time_reduction < 0.30:
        threshold_failures.append(f'median_time_reduction {time_reduction:.4f} < 0.3000')
    if understanding_median_delta is not None and understanding_median_delta < 0:
        threshold_failures.append(f'understanding_median_delta {understanding_median_delta:.4f} < 0')

    if errors or evidence_gaps:
        status = INSUFFICIENT_INVALID
        exit_code = 2
    elif threshold_failures:
        status = FAIL
        exit_code = 1
    else:
        status = PASS
        exit_code = 0

    return {
        'schema_version': 1,
        'status': status,
        'exit_code': exit_code,
        'beta_ready': status == PASS,
        'metrics': {
            'participant_count': len(participant_ids),
            'independent_completion_rate': completion_rate,
            'median_picspeak_task_seconds': median_picspeak,
            'median_chatgpt_baseline_seconds': median_baseline,
            'median_time_reduction': time_reduction,
            'understanding_median_delta': understanding_median_delta,
        },
        'threshold_failures': threshold_failures,
        'evidence_gaps': evidence_gaps,
        'errors': errors,
        'notes': [
            'This validator checks readiness evidence only; it does not launch Beta.',
            'A strong ChatGPT paired baseline is required for the time-reduction denominator.',
        ],
    }
