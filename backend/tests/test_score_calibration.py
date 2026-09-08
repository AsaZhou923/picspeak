from __future__ import annotations

import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts import evaluate_score_calibration as script  # noqa: E402


VERSION = 'score-v5-evidence-calibrated'


def _record(
    sample_id: str,
    human_scores: list[float],
    model_scores: list[float],
    *,
    split: str = 'test',
    image_type: str = 'architecture',
) -> dict:
    return {
        'sample_id': sample_id,
        'content_group': f'group-{sample_id}',
        'image_type': image_type,
        'split': split,
        'human_ratings': [
            {'rater_id': f'rater-{index}', 'score': score}
            for index, score in enumerate(human_scores, start=1)
        ],
        'model_repeats': [
            {'run_id': f'run-{index}', 'version': VERSION, 'score': score}
            for index, score in enumerate(model_scores, start=1)
        ],
    }


def _thresholds(min_test_samples: int = 5) -> script.Thresholds:
    return script.Thresholds(min_test_samples=min_test_samples, diagnostic=True)


class ScoreCalibrationTests(unittest.TestCase):
    def test_repeat_range_boundary_ignores_only_float_roundoff(self) -> None:
        for maximum, expected in [(6.4, script.PASS), (6.400001, script.FAIL)]:
            with self.subTest(maximum=maximum):
                records = [
                    _record('low', [6.0, 6.4], [6.0, 6.2, maximum]),
                    _record('high', [8.1, 8.3], [8.0, 8.1, 8.2]),
                ]
                report = script.evaluate_records(records, thresholds=_thresholds(2))
                self.assertEqual(report['status'], expected)

    def test_mae_boundary_ignores_float_roundoff(self) -> None:
        records = [
            _record('low', [5.8, 5.8], [6.4, 6.4, 6.4]),
            _record('high', [8.0, 8.0], [8.6, 8.6, 8.6]),
        ]
        report = script.evaluate_records(records, thresholds=_thresholds(2))
        self.assertEqual(report['status'], script.PASS)

    def test_evaluate_records_passes_when_test_evidence_meets_thresholds(self) -> None:
        records = [
            _record('low-1', [6.0, 6.4], [6.4, 6.5, 6.6]),
            _record('low-2', [5.7, 6.1], [6.0, 6.1, 6.2]),
            _record('low-3', [6.2, 6.5], [6.6, 6.7, 6.7]),
            _record('high-1', [8.1, 8.3], [8.0, 8.1, 8.2]),
            _record('high-2', [8.4, 8.6], [8.4, 8.5, 8.6]),
        ]

        report = script.evaluate_records(records, thresholds=_thresholds())

        self.assertEqual(report['status'], script.PASS)
        self.assertEqual(report['exit_code'], 0)
        version_report = report['versions'][VERSION]
        self.assertEqual(version_report['sample_count'], 5)
        self.assertEqual(version_report['low_human_denominator'], 3)
        self.assertEqual(version_report['high_human_denominator'], 2)
        self.assertEqual(version_report['false_high_sample_rate'], 0)
        self.assertEqual(version_report['false_high_run_rate'], 0)
        self.assertEqual(version_report['high_recall'], 1)
        self.assertLessEqual(version_report['mae_per_run'], 0.6)
        self.assertLessEqual(version_report['mae_mean'], 0.6)
        self.assertLessEqual(version_report['repeat_range_p95'], 0.4)

    def test_single_high_repeat_counts_as_false_high_threshold_failure(self) -> None:
        records = [
            _record('low-1', [6.0, 6.4], [6.4, 6.4, 8.2]),
            _record('low-2', [5.7, 6.1], [6.0, 6.1, 6.2]),
            _record('low-3', [6.2, 6.5], [6.6, 6.7, 6.7]),
            _record('high-1', [8.1, 8.3], [8.0, 8.1, 8.2]),
            _record('high-2', [8.4, 8.6], [8.4, 8.5, 8.6]),
        ]

        report = script.evaluate_records(records, thresholds=_thresholds())

        self.assertEqual(report['status'], script.FAIL)
        self.assertEqual(report['exit_code'], 1)
        self.assertIn('false_high_sample_rate', report['versions'][VERSION]['threshold_failures'][0])
        self.assertEqual(report['versions'][VERSION]['false_high_sample_rate'], 1 / 3)
        self.assertEqual(report['versions'][VERSION]['false_high_run_rate'], 1 / 9)

    def test_invalid_numbers_booleans_and_duplicate_runs_are_hard_errors(self) -> None:
        record = _record('bad', [6.0, 6.2], [6.0, 6.1, 6.2])
        record['human_ratings'][0]['score'] = True
        record['human_ratings'][1]['score'] = math.nan
        record['model_repeats'][0]['score'] = 10.1
        record['model_repeats'][1]['run_id'] = 'run-1'

        report = script.evaluate_records([record], thresholds=_thresholds(min_test_samples=1))

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        self.assertEqual(report['exit_code'], 2)
        joined_errors = '\n'.join(report['errors'])
        self.assertIn('finite number from 0 to 10', joined_errors)
        self.assertIn('duplicate run_id', joined_errors)

    def test_image_type_must_be_one_of_six_repository_types(self) -> None:
        record = _record('bad-type', [6.0, 6.2], [6.0, 6.1, 6.2], image_type='normal')

        report = script.evaluate_records([record], thresholds=_thresholds(min_test_samples=1))

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        self.assertEqual(report['versions'][VERSION]['status'], script.INSUFFICIENT_INVALID)
        self.assertTrue(any('image_type must be one of' in error for error in report['errors']))

    def test_content_group_cannot_cross_calibration_and_test(self) -> None:
        calibration = _record('same-original-a', [6.0, 6.2], [6.0, 6.1, 6.2], split='calibration')
        test = _record('same-original-b', [8.0, 8.2], [8.0, 8.1, 8.2], split='test')
        calibration['content_group'] = 'same-original'
        test['content_group'] = 'same-original'

        report = script.evaluate_records([calibration, test], thresholds=_thresholds(min_test_samples=1))

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        self.assertTrue(any('crosses calibration/test split' in error for error in report['errors']))

    def test_test_split_content_group_duplicates_are_rejected(self) -> None:
        first = _record('derived-a', [6.0, 6.2], [6.0, 6.1, 6.2])
        second = _record('derived-b', [8.0, 8.2], [8.0, 8.1, 8.2])
        first['content_group'] = 'same-original'
        second['content_group'] = 'same-original'

        report = script.evaluate_records([first, second], thresholds=_thresholds(min_test_samples=1))

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        self.assertTrue(any('appears more than once in test split' in error for error in report['errors']))

    def test_missing_human_and_repeat_evidence_cannot_pass(self) -> None:
        record = _record('thin', [8.0], [8.0, 8.1])

        report = script.evaluate_records([record], thresholds=_thresholds(min_test_samples=1))

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        joined_errors = '\n'.join(report['errors'])
        self.assertIn('distinct real human raters', joined_errors)
        self.assertIn('independent repeats', joined_errors)
        self.assertEqual(report['versions'][VERSION]['status'], script.INSUFFICIENT_INVALID)

    def test_formal_gate_requires_all_six_image_types_and_default_holdout_size(self) -> None:
        records = [_record(f'sample-{index}', [8.0, 8.2], [8.0, 8.1, 8.2]) for index in range(120)]

        report = script.evaluate_records(records, thresholds=script.Thresholds())

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        version_report = report['versions'][VERSION]
        self.assertEqual(version_report['status'], script.INSUFFICIENT_INVALID)
        self.assertEqual(version_report['unique_content_groups'], 120)
        self.assertIn('missing required image_type coverage', '\n'.join(version_report['evidence_gaps']))

    def test_reduced_sample_threshold_requires_diagnostic_mode(self) -> None:
        records = [
            _record('low-1', [6.0, 6.4], [6.4, 6.5, 6.6]),
            _record('high-1', [8.1, 8.3], [8.0, 8.1, 8.2]),
        ]

        report = script.evaluate_records(records, thresholds=script.Thresholds(min_test_samples=2))

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        self.assertIn('diagnostic=true', '\n'.join(report['insufficient_evidence']))

    def test_rater_and_run_ids_are_stripped_before_duplicate_checks(self) -> None:
        record = _record('stripped', [6.0, 6.2], [6.0, 6.1, 6.2])
        record['human_ratings'][1]['rater_id'] = ' rater-1 '
        record['model_repeats'][1]['run_id'] = ' run-1 '

        report = script.evaluate_records([record], thresholds=_thresholds(min_test_samples=1))

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        joined_errors = '\n'.join(report['errors'])
        self.assertIn('duplicate rater_id', joined_errors)
        self.assertIn('duplicate run_id', joined_errors)

    def test_invalid_threshold_values_return_invalid_status(self) -> None:
        records = [_record('sample', [6.0, 6.2], [6.0, 6.1, 6.2])]

        report = script.evaluate_records(records, thresholds=script.Thresholds(min_test_samples=-1, mae_max=math.nan))

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        self.assertTrue(any('min_test_samples' in error for error in report['errors']))
        self.assertTrue(any('mae_max' in error for error in report['errors']))

    def test_cli_writes_json_and_returns_exit_code(self) -> None:
        records = [
            _record('low-1', [6.0, 6.4], [6.4, 6.5, 6.6]),
            _record('low-2', [5.7, 6.1], [6.0, 6.1, 6.2]),
            _record('low-3', [6.2, 6.5], [6.6, 6.7, 6.7]),
            _record('high-1', [8.1, 8.3], [8.0, 8.1, 8.2]),
            _record('high-2', [8.4, 8.6], [8.4, 8.5, 8.6]),
        ]
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = Path(tmpdir) / 'records.json'
            output_path = Path(tmpdir) / 'report.json'
            input_path.write_text(json.dumps({'records': records}), encoding='utf-8')

            exit_code = script.main(
                [
                    str(input_path),
                    '--output',
                    str(output_path),
                    '--min-test-samples',
                    '5',
                    '--diagnostic',
                ]
            )

            report = json.loads(output_path.read_text(encoding='utf-8'))

        self.assertEqual(exit_code, 0)
        self.assertEqual(report['status'], script.PASS)

    def test_cli_accepts_jsonl_records(self) -> None:
        records = [
            _record('low-1', [6.0, 6.4], [6.4, 6.5, 6.6]),
            _record('low-2', [5.7, 6.1], [6.0, 6.1, 6.2]),
            _record('low-3', [6.2, 6.5], [6.6, 6.7, 6.7]),
            _record('high-1', [8.1, 8.3], [8.0, 8.1, 8.2]),
            _record('high-2', [8.4, 8.6], [8.4, 8.5, 8.6]),
        ]
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = Path(tmpdir) / 'records.jsonl'
            input_path.write_text(
                '\n'.join(json.dumps(record) for record in records),
                encoding='utf-8',
            )

            exit_code = script.main([str(input_path), '--min-test-samples', '5', '--diagnostic'])

        self.assertEqual(exit_code, 0)


if __name__ == '__main__':
    unittest.main()
