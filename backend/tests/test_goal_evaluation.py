from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services import goal_evaluation as service  # noqa: E402
from scripts import evaluate_goal_assessment, evaluate_practice_beta  # noqa: E402


VERSION = 'goal-assessment-v1'


def _human(status: str, comparable: bool = True) -> list[dict]:
    return [
        {'rater_id': 'rater-a', 'status': status, 'comparable': comparable, 'blind': True, 'assignment_ref': 'assignments/rater-a'},
        {'rater_id': 'rater-b', 'status': status, 'comparable': comparable, 'blind': True, 'assignment_ref': 'assignments/rater-b'},
    ]


def _runs(status: str, comparable: bool = True, directional_delta: float = 1.0, claims_improvement: bool | None = None) -> list[dict]:
    improvement_claim = abs(directional_delta) > service.AA_DIRECTIONAL_DELTA_TOLERANCE if claims_improvement is None else claims_improvement
    return [
        {
            'run_id': f'run-{index}',
            'version': VERSION,
            'preprocess_version': 'paired-image-high-v1',
            'prompt_version': 'retake-coach-goal-v1',
            'rubric_version': 'goal-rubric-v1',
            'status': status,
            'is_comparable': comparable,
            'comparison_confidence': 'high',
            'directional_delta': directional_delta,
            'claims_improvement': improvement_claim,
        }
        for index in range(1, 4)
    ]


def _record(index: int, status: str, case_type: str, *, comparable: bool = True, control_type: str = 'none') -> dict:
    original_content_id = f'content-original-{index:03d}'
    retake_content_id = original_content_id if control_type == 'aa' else f'content-retake-{index:03d}'
    return {
        'sample_id': f'sample-{index:03d}',
        'content_group': f'group-{index:03d}',
        'original_content_id': original_content_id,
        'retake_content_id': retake_content_id,
        'split': 'holdout',
        'case_type': case_type,
        'expected_status': status,
        'control_type': control_type,
        'human_ratings': _human(status, comparable=comparable),
        'model_runs': _runs(status, comparable=comparable, directional_delta=0.0 if control_type == 'aa' else 1.0),
    }


def _provenance() -> dict:
    return {
        'data_origin': 'authorized_real_photos',
        'real_human_attestation': True,
        'synthetic': False,
        'photo_authorization_ref': 'docs://photo-authorization-2026-09',
        'dataset_manifest_ref': 'docs://goal-dataset-manifest-v1',
        'blind_rating_protocol_ref': 'docs://blind-rating-protocol-v1',
        'rater_assignment_ref': 'docs://rater-assignments-v1',
        'holdout_freeze_ref': 'docs://holdout-freeze-v1',
        'freeze': {
            'diagnostic_manifest_ref': 'docs://diagnostic-freeze-v1',
            'holdout_manifest_ref': 'docs://holdout-freeze-v1',
            'threshold_config_ref': 'docs://threshold-config-v1',
            'frozen_at': '2026-09-19T00:00:00Z',
            'thresholds_frozen_before_holdout': True,
        },
        'run_manifest': {
            'run_manifest_ref': 'docs://run-manifest-v1',
            'model_version': 'gpt-5.6-luna-2026-09',
            'prompt_version': 'retake-coach-goal-v1',
            'preprocess_version': 'paired-image-high-v1',
        },
    }


def _formal_pass_records() -> list[dict]:
    records: list[dict] = []
    index = 0
    plan = [
        (30, 'achieved', 'clear_improvement', True, 'none'),
        (10, 'partial', 'goal_improved_other_dimension_worse', True, 'none'),
        (10, 'not_achieved', 'better_photo_goal_not_met', True, 'none'),
        (30, 'indeterminate', 'incomparable_scene', False, 'none'),
        (5, 'partial', 'no_change', True, 'aa'),
        (5, 'achieved', 'valid_special_technique', True, 'none'),
        (5, 'achieved', 'edit_revision', True, 'ab_swap'),
        (5, 'indeterminate', 'generated_reference', False, 'none'),
    ]
    for count, status, case_type, comparable, control_type in plan:
        for _ in range(count):
            index += 1
            records.append(_record(index, status, case_type, comparable=comparable, control_type=control_type))
    swaps = [record for record in records if record['control_type'] == 'ab_swap']
    originals = [record for record in records if record['control_type'] == 'none' and record['expected_status'] == 'achieved']
    for swap, original in zip(swaps, originals):
        swap['source_sample_id'] = original['sample_id']
        swap['swap_group_id'] = f"swap-{original['sample_id']}"
        original['swap_group_id'] = swap['swap_group_id']
        swap['content_group'] = original['content_group']
        swap['original_content_id'] = original['retake_content_id']
        swap['retake_content_id'] = original['original_content_id']
        swap['model_runs'] = _runs(swap['expected_status'], directional_delta=-1.0)
    for _ in range(len(swaps)):
        index += 1
        records.append(_record(index, 'achieved', 'clear_improvement'))
    return records


def _formal_payload() -> dict:
    return {'provenance': _provenance(), 'records': _formal_pass_records()}


def _beta_payload() -> dict:
    return {
        'participants': [
            {
                'participant_id': f'p-{index}',
                'completed_independently': index <= 5,
                'picspeak_task_seconds': 60,
                'chatgpt_baseline_seconds': 100,
                'understanding_delta': 0,
                'paired_with_chatgpt_baseline': True,
                'session_ref': f'sessions/p-{index}',
                'consent_ref': f'consent/p-{index}',
            }
            for index in range(1, 8)
        ],
        'resources': {
            'data_origin': 'real_usability_session',
            'real_participant_attestation': True,
            'usability_protocol_ref': 'docs://usability-protocol-v1',
            'participant_consent_ref': 'docs://participant-consent-v1',
            'baseline_prompt_ref': 'docs://strong-chatgpt-baseline-v1',
        },
        'operator': {
            'operator_id': 'operator-local-001',
            'name': 'Local Test Operator',
            'contact': 'operator@example.invalid',
            'scope': 'restricted local usability validation',
            'quota_plan_ref': 'docs://beta-quota-plan-v1',
        },
        'feature_flag': {
            'flag_name': 'practice_training_enabled',
            'environment': 'local',
            'intended_state': 'restricted_off_until_launch',
            'owner': 'backend-config-owner',
            'switch_off_verified_ref': 'checks://switch-off-local',
            'old_result_readable_verified_ref': 'checks://old-result-readable-local',
        },
        'quality_gates': {
            'local_contracts_passed': True,
            'local_contracts_ref': 'checks://local-contracts-2026-09-19',
            'code_revision': 'local-working-tree',
            'goal_evaluation_report_ref': 'reports://goal-evaluation-local',
        },
    }


class GoalEvaluationTests(unittest.TestCase):
    def test_formal_goal_evaluation_passes_with_complete_holdout_evidence(self) -> None:
        report = service.evaluate_goal_records(_formal_payload())

        self.assertEqual(report['status'], service.PASS)
        self.assertTrue(report['formal_pass_eligible'])
        version = report['versions'][VERSION]
        self.assertEqual(version['sample_count'], 105)
        self.assertEqual(version['unique_content_groups'], 100)
        self.assertEqual(version['negative_denominator'], 60)
        self.assertEqual(version['incomparable_denominator'], 35)
        self.assertEqual(version['four_state_agreement'], 1)
        self.assertEqual(version['false_achieved_rate'], 0)
        self.assertEqual(version['incomparable_recall'], 1)
        self.assertEqual(version['class_denominators']['achieved'], 45)
        self.assertIn('paired-image-high-v1', version['preprocess_versions'])
        self.assertIsNotNone(version['four_state_agreement_ci']['low'])

    def test_aa_allows_achieved_when_human_agrees_and_zero_gain(self) -> None:
        payload = _formal_payload()
        for record in payload['records']:
            if record['control_type'] == 'aa':
                record['expected_status'] = 'achieved'
                record['human_ratings'] = _human('achieved')
                record['model_runs'] = _runs('achieved', directional_delta=0.0, claims_improvement=False)

        report = service.evaluate_goal_records(payload)

        self.assertEqual(report['status'], service.PASS)
        version = report['versions'][VERSION]
        self.assertEqual(version['aa_control_failures'], 0)
        self.assertFalse(any('aa controls' in item for item in version['threshold_failures']))

    def test_aa_catches_positive_gain_even_when_status_not_achieved(self) -> None:
        payload = _formal_payload()
        for record in payload['records']:
            if record['control_type'] == 'aa':
                record['expected_status'] = 'not_achieved'
                record['human_ratings'] = _human('not_achieved')
                record['model_runs'] = _runs('not_achieved', directional_delta=0.25, claims_improvement=True)

        report = service.evaluate_goal_records(payload)

        self.assertEqual(report['status'], service.FAIL)
        version = report['versions'][VERSION]
        self.assertEqual(version['aa_control_failures'], 5)
        self.assertTrue(any('clear improvement' in item for item in version['threshold_failures']))

    def test_false_achieved_rate_above_threshold_fails_with_denominators(self) -> None:
        payload = _formal_payload()
        records = payload['records']
        changed = 0
        for record in records:
            if record['expected_status'] in {'partial', 'not_achieved', 'indeterminate'} and changed < 7:
                record['model_runs'] = _runs('achieved', comparable=True)
                changed += 1

        report = service.evaluate_goal_records(payload)

        self.assertEqual(report['status'], service.FAIL)
        version = report['versions'][VERSION]
        self.assertEqual(version['negative_denominator'], 60)
        self.assertGreater(version['false_achieved_rate'], 0.10)
        self.assertTrue(any('false_achieved_rate' in item for item in version['threshold_failures']))

    def test_content_group_leakage_is_insufficient_invalid(self) -> None:
        payload = _formal_payload()
        records = payload['records']
        diagnostic = dict(records[0])
        diagnostic['sample_id'] = 'diagnostic-copy'
        diagnostic['split'] = 'diagnostic'
        records.append(diagnostic)

        report = service.evaluate_goal_records(payload)

        self.assertEqual(report['status'], service.INSUFFICIENT_INVALID)
        self.assertEqual(report['exit_code'], 2)
        self.assertTrue(any('crosses diagnostic/holdout' in error for error in report['errors']))

    def test_goal_cli_empty_template_returns_exit_2(self) -> None:
        template = BACKEND_ROOT / 'evaluation' / 'templates' / 'goal-evaluation-records.template.json'

        exit_code = evaluate_goal_assessment.main([str(template)])

        self.assertEqual(exit_code, 2)

    def test_goal_cli_writes_json_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = Path(tmpdir) / 'records.json'
            output_path = Path(tmpdir) / 'report.json'
            input_path.write_text(json.dumps(_formal_payload()), encoding='utf-8')

            exit_code = evaluate_goal_assessment.main([str(input_path), '--output', str(output_path)])
            report = json.loads(output_path.read_text(encoding='utf-8'))

        self.assertEqual(exit_code, 0)
        self.assertEqual(report['status'], service.PASS)

    def test_missing_provenance_is_insufficient_invalid(self) -> None:
        report = service.evaluate_goal_records(_formal_pass_records())

        self.assertEqual(report['status'], service.INSUFFICIENT_INVALID)
        self.assertTrue(any('provenance' in error for error in report['errors']))

    def test_synthetic_or_placeholder_provenance_is_insufficient_invalid(self) -> None:
        payload = _formal_payload()
        payload['provenance']['synthetic'] = True
        payload['provenance']['dataset_manifest_ref'] = 'placeholder'

        report = service.evaluate_goal_records(payload)

        self.assertEqual(report['status'], service.INSUFFICIENT_INVALID)
        joined = '\n'.join(report['errors'])
        self.assertIn('synthetic must be false', joined)
        self.assertIn('dataset_manifest_ref', joined)

    def test_missing_control_coverage_is_insufficient_invalid(self) -> None:
        payload = _formal_payload()
        for record in payload['records']:
            record['control_type'] = 'none'
            record.pop('source_sample_id', None)
            record.pop('swap_group_id', None)

        report = service.evaluate_goal_records(payload)

        self.assertEqual(report['status'], service.INSUFFICIENT_INVALID)
        gaps = '\n'.join(report['insufficient_evidence'])
        self.assertIn('aa control count 0', gaps)
        self.assertIn('validated ab_swap control count 0', gaps)

    def test_swap_controls_require_reversed_ids_and_directional_evidence(self) -> None:
        payload = _formal_payload()
        for record in payload['records']:
            if record['control_type'] == 'ab_swap':
                record['model_runs'] = _runs(record['expected_status'], directional_delta=1.0)

        report = service.evaluate_goal_records(payload)

        self.assertEqual(report['status'], service.FAIL)
        version = report['versions'][VERSION]
        self.assertGreater(version['ab_swap_failures'], 0)
        self.assertTrue(any('ab_swap directional failures' in item for item in version['threshold_failures']))

    def test_swap_source_sample_id_must_exist(self) -> None:
        payload = _formal_payload()
        for record in payload['records']:
            if record['control_type'] == 'ab_swap':
                record['source_sample_id'] = 'sample-does-not-exist'

        report = service.evaluate_goal_records(payload)

        self.assertEqual(report['status'], service.INSUFFICIENT_INVALID)
        version = report['versions'][VERSION]
        self.assertEqual(version['ab_swap_control_count'], 0)
        self.assertTrue(any('validated ab_swap control count 0' in item for item in version['evidence_gaps']))

    def test_swap_source_sample_id_must_match_group_and_content_group(self) -> None:
        payload = _formal_payload()
        wrong_source = next(record for record in payload['records'] if record['control_type'] == 'none' and not record.get('swap_group_id'))
        for record in payload['records']:
            if record['control_type'] == 'ab_swap':
                record['source_sample_id'] = wrong_source['sample_id']
                break

        report = service.evaluate_goal_records(payload)

        self.assertEqual(report['status'], service.INSUFFICIENT_INVALID)
        version = report['versions'][VERSION]
        self.assertEqual(version['ab_swap_control_count'], 4)
        self.assertGreater(version['ab_swap_failures'], 0)
        self.assertTrue(any('validated ab_swap control count 4' in item for item in version['evidence_gaps']))

    def test_swap_source_sample_id_cannot_self_link(self) -> None:
        payload = _formal_payload()
        for record in payload['records']:
            if record['control_type'] == 'ab_swap':
                record['source_sample_id'] = record['sample_id']
                break

        report = service.evaluate_goal_records(payload)

        self.assertEqual(report['status'], service.INSUFFICIENT_INVALID)
        version = report['versions'][VERSION]
        self.assertEqual(version['ab_swap_control_count'], 4)
        self.assertGreater(version['ab_swap_failures'], 0)

    def test_beta_readiness_passes_with_complete_local_evidence(self) -> None:
        report = service.evaluate_beta_readiness(_beta_payload())

        self.assertEqual(report['status'], service.PASS)
        self.assertTrue(report['beta_ready'])
        self.assertGreaterEqual(report['metrics']['independent_completion_rate'], 0.70)
        self.assertGreaterEqual(report['metrics']['median_time_reduction'], 0.30)

    def test_beta_placeholder_objects_are_insufficient_invalid(self) -> None:
        payload = _beta_payload()
        payload['resources'] = {'x': 'y'}
        payload['operator'] = {'x': 'y'}
        payload['feature_flag'] = {'x': 'y'}
        payload['quality_gates'] = {'x': 'y'}

        report = service.evaluate_beta_readiness(payload)

        self.assertEqual(report['status'], service.INSUFFICIENT_INVALID)
        joined = '\n'.join(report['errors'])
        self.assertIn('resources: usability_protocol_ref', joined)
        self.assertIn('operator: operator_id', joined)
        self.assertIn('feature_flag: flag_name', joined)
        self.assertIn('quality_gates: local_contracts_ref', joined)

    def test_beta_participants_require_pairing_and_consent_refs(self) -> None:
        payload = _beta_payload()
        payload['participants'][0].pop('paired_with_chatgpt_baseline')
        payload['participants'][1]['consent_ref'] = 'todo'

        report = service.evaluate_beta_readiness(payload)

        self.assertEqual(report['status'], service.INSUFFICIENT_INVALID)
        joined = '\n'.join(report['errors'])
        self.assertIn('paired_with_chatgpt_baseline', joined)
        self.assertIn('consent_ref', joined)

    def test_beta_readiness_empty_template_returns_exit_2(self) -> None:
        template = BACKEND_ROOT / 'evaluation' / 'templates' / 'beta-readiness.template.json'

        exit_code = evaluate_practice_beta.main([str(template)])

        self.assertEqual(exit_code, 2)

    def test_beta_readiness_missing_material_is_insufficient(self) -> None:
        report = service.evaluate_beta_readiness({'participants': []})

        self.assertEqual(report['status'], service.INSUFFICIENT_INVALID)
        self.assertFalse(report['beta_ready'])
        self.assertTrue(report['evidence_gaps'])


if __name__ == '__main__':
    unittest.main()
