from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts import evaluate_scoring_rank_benchmark as script  # noqa: E402


def _counts_for(mean: int) -> list[int]:
    counts = [0] * 10
    counts[mean - 1] = 5
    return counts


def _manifest() -> dict:
    samples = []
    for mean in range(2, 10):
        samples.append(
            {
                'sample_id': f's{mean}',
                'content_group': f'g{mean}',
                'role': 'holdout',
                'score_bin': min(3, max(0, (mean - 2) // 2)),
                'human_mean': float(mean),
                'total_votes': 5,
                'rating_counts': _counts_for(mean),
                'image_sha256': f'hash-{mean}',
            }
        )
    samples.append(
        {
            'sample_id': 'dev',
            'content_group': 'dev-group',
            'role': 'development',
            'score_bin': 1,
            'human_mean': 5.0,
            'total_votes': 5,
            'rating_counts': _counts_for(5),
            'image_sha256': 'hash-dev',
        }
    )
    return {'samples': samples}


def _scores_for_final(final_score: float) -> dict[str, int]:
    total = int(round(final_score * 5))
    base = total // 5
    remainder = total - base * 5
    values = [base + (1 if index < remainder else 0) for index in range(5)]
    return dict(zip(script.DIMENSIONS, values))


def _run(sample: dict, variant: str, repeat_index: int, score: float, *, prompt_hash: str | None = None) -> dict:
    return {
        'sample_id': sample['sample_id'],
        'variant': variant,
        'run_id': f'{variant}-{sample["sample_id"]}-{repeat_index}',
        'repeat_index': repeat_index,
        'status': 'completed',
        'result': {'scores': _scores_for_final(score), 'final_score': score},
        'image_sha256': sample['image_sha256'],
        'prompt_sha256': f'prompt-{variant}-{sample["sample_id"]}-{repeat_index}',
        'prompt_source_sha256': prompt_hash or f'source-{variant}',
        'version': f'{variant}-version',
    }


def _write_case(manifest: dict, runs: list[dict]) -> tuple[tempfile.TemporaryDirectory, Path, Path]:
    tmp = tempfile.TemporaryDirectory()
    root = Path(tmp.name)
    manifest_path = root / 'manifest.json'
    results_dir = root / 'results'
    results_dir.mkdir()
    manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
    for index, run in enumerate(runs):
        (results_dir / f'run-{index}.json').write_text(json.dumps(run), encoding='utf-8')
    return tmp, manifest_path, results_dir


def _evaluate(runs: list[dict], manifest: dict | None = None) -> dict:
    tmp, manifest_path, results_dir = _write_case(manifest or _manifest(), runs)
    try:
        return script.evaluate(manifest_path, results_dir, min_repeats=3, min_holdout=8)
    finally:
        tmp.cleanup()


def _score_for(sample: dict, repeat_index: int, *, reversed_rank: bool = False, unstable: bool = False) -> float:
    human = sample['human_mean']
    if reversed_rank:
        human = 11 - human
    if unstable:
        return {1: human, 2: 11 - human, 3: human}[repeat_index]
    delta = {1: 0.0, 2: 0.2, 3: -0.2}[repeat_index]
    return max(0.0, min(10.0, round(human + delta, 1)))


def _runs(
    *,
    baseline_reversed: bool = False,
    candidate_reversed: bool = False,
    baseline_unstable: bool = False,
    candidate_unstable: bool = False,
) -> list[dict]:
    runs: list[dict] = []
    holdouts = [sample for sample in _manifest()['samples'] if sample['role'] == 'holdout']
    for sample in holdouts:
        for repeat in (1, 2, 3):
            runs.append(_run(sample, 'baseline', repeat, _score_for(sample, repeat, reversed_rank=baseline_reversed, unstable=baseline_unstable)))
            runs.append(_run(sample, 'candidate', repeat, _score_for(sample, repeat, reversed_rank=candidate_reversed, unstable=candidate_unstable)))
    return runs


class ScoringRankBenchmarkTests(unittest.TestCase):
    def test_known_candidate_improvement_passes_diagnostic_gate(self) -> None:
        report = _evaluate(_runs(baseline_reversed=True))

        self.assertEqual(report['status'], script.DIAGNOSTIC_IMPROVEMENT)
        self.assertEqual(report['human_calibration_status'], script.INSUFFICIENT_INVALID)
        self.assertGreaterEqual(report['gate']['spearman_delta'], 0.10)
        self.assertEqual(report['variants']['candidate']['repeat_pair_denominators'], [28, 28, 28])

    def test_wrong_or_reversed_candidate_is_no_improvement(self) -> None:
        report = _evaluate(_runs(candidate_reversed=True))

        self.assertEqual(report['status'], script.NO_IMPROVEMENT)
        self.assertLess(report['gate']['spearman_delta'], 0)

    def test_identical_repeats_are_valid_stability_not_invalid_data(self) -> None:
        runs = _runs(baseline_reversed=True)
        for run in runs:
            if run['variant'] == 'candidate':
                mean = float(run['sample_id'][1:])
                run['result'] = {'scores': _scores_for_final(mean), 'final_score': mean}
        report = _evaluate(runs)
        self.assertEqual(report['status'], script.DIAGNOSTIC_IMPROVEMENT)
        self.assertEqual(report['variants']['candidate']['repeat_range_p95'], 0)

    def test_constant_scores_across_different_images_are_invalid(self) -> None:
        runs = _runs()
        for run in runs:
            run['result'] = {'scores': _scores_for_final(7), 'final_score': 7}
        self.assertEqual(_evaluate(runs)['status'], script.INSUFFICIENT_INVALID)

    def test_duplicate_content_within_holdout_cannot_inflate_sample_count(self) -> None:
        manifest = _manifest()
        manifest['samples'][1]['content_group'] = manifest['samples'][0]['content_group']
        report = _evaluate(_runs(), manifest)
        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        self.assertIn('duplicate content', '\n'.join(report['errors']))

    def test_declared_profile_mismatch_is_rejected(self) -> None:
        manifest = _manifest()
        manifest['gate'] = {'mode': 'stability_noninferiority', 'holdout_spearman_drop_max': 0.20}
        report = _evaluate(_runs(), manifest)
        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        self.assertIn('predeclared profile', '\n'.join(report['errors']))

    def test_run_ids_are_unique_within_sample_and_variant(self) -> None:
        runs = _runs()
        runs[2]['run_id'] = runs[0]['run_id']
        report = _evaluate(runs)
        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        self.assertIn('duplicate run_id', '\n'.join(report['errors']))

    def test_stability_gate_requires_improvement_without_ranking_loss(self) -> None:
        manifest = _manifest()
        manifest['gate'] = {'mode': 'stability_noninferiority'}
        runs = _runs()
        for run in runs:
            if run['variant'] == 'candidate':
                mean = float(run['sample_id'][1:])
                run['result'] = {'scores': _scores_for_final(mean), 'final_score': mean}
        report = _evaluate(runs, manifest)
        self.assertEqual(report['status'], script.DIAGNOSTIC_IMPROVEMENT)
        for run in runs:
            if run['variant'] == 'candidate':
                mean = 11 - float(run['sample_id'][1:])
                run['result'] = {'scores': _scores_for_final(mean), 'final_score': mean}
        self.assertEqual(_evaluate(runs, manifest)['status'], script.NO_IMPROVEMENT)

    def test_tied_pair_scores_count_as_half_credit(self) -> None:
        manifest = _manifest()
        runs = []
        for sample in [s for s in manifest['samples'] if s['role'] == 'holdout']:
            for repeat in (1, 2, 3):
                baseline_score = _score_for(sample, repeat, reversed_rank=True)
                bucket = 4.0 if sample['human_mean'] <= 5 else 7.0
                candidate_score = bucket + {1: 0.0, 2: 0.2, 3: -0.2}[repeat]
                runs.append(_run(sample, 'baseline', repeat, baseline_score))
                runs.append(_run(sample, 'candidate', repeat, candidate_score))

        report = _evaluate(runs, manifest)

        self.assertEqual(report['status'], script.DIAGNOSTIC_IMPROVEMENT)
        self.assertEqual(report['variants']['candidate']['mean_repeat_pair_accuracy'], 22 / 28)

    def test_missing_repeats_failed_status_and_duplicate_runs_are_invalid(self) -> None:
        runs = _runs(baseline_reversed=True)
        runs.pop()
        runs[0]['status'] = 'failed'
        runs.append(dict(runs[1]))

        report = _evaluate(runs)

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        joined = '\n'.join(report['errors'])
        self.assertIn('status must be completed', joined)
        self.assertIn('duplicate run', joined)
        self.assertIn('needs exactly repeats 1..3', joined)

    def test_hash_mismatch_and_prompt_source_variance_are_invalid(self) -> None:
        runs = _runs(baseline_reversed=True)
        runs[0]['image_sha256'] = 'different'
        runs[2]['prompt_source_sha256'] = 'other-source-baseline'

        report = _evaluate(runs)

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        joined = '\n'.join(report['errors'])
        self.assertIn('image_sha256 does not match manifest', joined)
        self.assertIn('prompt_source_sha256 must be invariant', joined)

    def test_bad_final_score_reports_invalid_instead_of_crashing(self) -> None:
        runs = _runs(baseline_reversed=True)
        runs[0]['result']['final_score'] = 'bad'

        report = _evaluate(runs)

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        self.assertIn('final_score must be a finite number', '\n'.join(report['errors']))

    def test_manifest_uses_aggregate_histograms_not_fake_individual_raters(self) -> None:
        manifest = _manifest()
        manifest['samples'][0]['human_mean'] = 2.2

        report = _evaluate(_runs(baseline_reversed=True), manifest)

        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)
        self.assertIn('human_mean must match rating_counts', '\n'.join(report['errors']))

    def test_per_repeat_primary_metric_catches_unstable_average_counterexample(self) -> None:
        report = _evaluate(_runs(candidate_unstable=True))

        self.assertEqual(report['status'], script.NO_IMPROVEMENT)
        self.assertEqual(report['variants']['candidate']['avg_score_spearman'], 1.0)
        self.assertLess(report['variants']['candidate']['mean_repeat_spearman'], 1.0)

    def test_cli_writes_report_and_returns_invalid_exit_code(self) -> None:
        tmp, manifest_path, results_dir = _write_case(_manifest(), [])
        try:
            output_path = Path(tmp.name) / 'report.json'
            exit_code = script.main([str(manifest_path), str(results_dir), '--output', str(output_path)])
            report = json.loads(output_path.read_text(encoding='utf-8'))
        finally:
            tmp.cleanup()

        self.assertEqual(exit_code, 2)
        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)

    def test_cli_malformed_run_writes_invalid_report(self) -> None:
        tmp, manifest_path, results_dir = _write_case(_manifest(), _runs())
        try:
            (results_dir / 'bad.json').write_text('{', encoding='utf-8')
            output = Path(tmp.name) / 'report.json'
            code = script.main([str(manifest_path), str(results_dir), '--output', str(output)])
            report = json.loads(output.read_text(encoding='utf-8'))
        finally:
            tmp.cleanup()
        self.assertEqual(code, 2)
        self.assertEqual(report['status'], script.INSUFFICIENT_INVALID)


if __name__ == '__main__':
    unittest.main()
