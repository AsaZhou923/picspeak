# Scoring calibration benchmark

This document defines the offline gate for PicSpeak scoring calibration. It is a local diagnostic tool only: it does not call model APIs, does not connect to the database, and does not rewrite historical reviews.

## Data contract

Use `backend/scripts/evaluate_score_calibration.py` with a JSON array, a JSON object containing `records`, or JSONL with one record per line.

```json
{
  "records": [
    {
      "sample_id": "blind-001",
      "content_group": "original-001",
      "image_type": "architecture",
      "split": "test",
      "human_ratings": [
        {"rater_id": "human-a", "score": 6.0},
        {"rater_id": "human-b", "score": 6.4}
      ],
      "model_repeats": [
        {"run_id": "run-001", "version": "score-v5-evidence-calibrated", "score": 6.4},
        {"run_id": "run-002", "version": "score-v5-evidence-calibrated", "score": 6.5},
        {"run_id": "run-003", "version": "score-v5-evidence-calibrated", "score": 6.6}
      ]
    }
  ]
}
```

`image_type` must be one of the six repository categories: `default`, `landscape`, `portrait`, `street`, `still_life`, or `architecture`. Do not use generic labels such as `normal`.

`content_group` is the leakage guard for the same photo and its derivatives. The same group must not appear in both `calibration` and `test`, and the `test` split cannot contain the same group more than once. Keep ordinary review and retake-comparison samples in separate files or separate runs; their scores are different measurement contexts and must not be pooled into one trend.

Human labels must come from real blind raters. The script rejects samples with fewer than two distinct `rater_id` values, repeated rater IDs, missing scores, booleans, NaN, or values outside 0-10. Model evidence must contain at least three independent repeats per evaluated version and sample; duplicate `run_id` values for the same version are invalid.

## Gate

The default candidate gate is intentionally sized for a formal holdout benchmark:

- at least 120 independent `test` content groups
- coverage across all six image types
- low human denominator: human median `<= 6.5`
- high human denominator: human median `>= 8.0`
- false high sample rate: human median `<= 6.5` and any single model repeat `>= 8.0` must be `<= 5%`
- high recall: per-run rate where human median `>= 8.0` and the single model repeat is `>= 8.0` must be `>= 80%`
- per-run MAE between each model repeat and human median must be `<= 0.6`
- repeat range P95 across three independent runs must be `<= 0.4`

The report also includes false high run rate and mean-score MAE as diagnostics, but the gate uses the stricter per-run/single-repeat view. This prevents a low human sample with runs such as `6.4, 6.4, 8.2` from being hidden by an acceptable mean.

The report always includes denominators, unique content-group coverage, image-type coverage, and evidence gaps. Missing human labels, missing repeats, no low-score denominator, no high-score denominator, duplicate test derivatives, too few independent test groups, or missing six-type coverage returns `INSUFFICIENT_INVALID`, not `PASS`. Threshold misses with otherwise valid evidence return `FAIL`.

## Usage

Formal gate:

```powershell
python backend/scripts/evaluate_score_calibration.py .local-calibration/scoring-v5-blind.json --version score-v5-evidence-calibrated
```

Small local diagnostic with explicit reduced denominator:

```powershell
python backend/scripts/evaluate_score_calibration.py backend/tests/fixtures/scoring/synthetic-pass.json --version score-v5-evidence-calibrated --min-test-samples 5 --diagnostic
```

`--diagnostic` is required for reduced-denominator local checks and relaxes the formal six-type coverage requirement. A diagnostic `PASS` is not a formal calibration pass.

Exit codes are stable for automation:

- `0`: `PASS`
- `1`: `FAIL`
- `2`: `INSUFFICIENT_INVALID`

Use `--output path/to/report.json` to write the JSON report instead of printing it to stdout.
