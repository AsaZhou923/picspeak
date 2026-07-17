# OpenAI Build Week 2026 Contribution Log

This document distinguishes PicSpeak's pre-existing product from the work performed during the OpenAI Build Week submission window.

## Time boundary

- Submission-window start: 2026-07-13 09:00 PDT / 2026-07-14 01:00 JST
- Development plan created: 2026-07-15 JST
- Pre-event baseline: `b74ddfb88ae32e37965ba8b29f40c9ebcbbf77fc`
- Baseline subject: `Keep usage navigation reachable across header states`

## Primary Codex task

The current Codex task is the primary task for planning, core implementation, integration, and final verification of GPT-5.6 Retake Coach.

- `/feedback` Session ID: pending until the core feature is implemented and verified
- Core implementation started: 2026-07-15 JST
- Verification status: full local automation and model-picker browser QA passed; live routing now verifies GPT-5.5 for normal critique and GPT-5.6 Terra for paired comparison on 2026-07-17 JST

## Product and engineering decisions

### True paired analysis instead of a model rename

The existing single-photo critique remains intact. Retake Coach sends the original and retake to GPT-5.6 in one request so the Build Week contribution has a distinct user outcome and an auditable model path.

### One scoring system per comparison

The original's stored score may have come from an older provider. GPT-5.6 therefore scores both original and retake inside the paired request. This prevents a Qwen score and a GPT-5.6 score from being presented as a meaningful delta.

### Deterministic arithmetic

GPT-5.6 returns before/after scores and visible evidence. Python calculates dimension deltas, overall means, and overall delta. The UI never trusts model-generated arithmetic.

### Existing Review relationship and JSONB

The comparison review uses the existing `Review.source_review_id` relationship and stores the structured comparison in `Review.result_json.comparison`. The existing source-review index supports the query path, so a new table and migration would add deadline risk without improving the P0 experience.

### Official Responses API without a new dependency

`backend/app/services/retake_comparison.py` uses the existing pooled HTTP client to call `POST /v1/responses`. The active request uses `model=gpt-5.6-terra`, two `input_image` blocks, and `text.format.type=json_schema` with `strict=true`. No OpenAI SDK dependency was added.

### Explicit model choice for normal critique

The existing workspace now offers Qwen 3.5 and GPT-5.5 as explicit normal-critique options. Qwen remains the compatibility default; choosing GPT-5.5 routes the real photo through a separate two-pass Responses API path that locks the five scores before generating critique copy. Existing-review reuse is isolated by model so a GPT selection cannot silently return an older Qwen result. Retake requests are normalized server-side to GPT-5.6 Terra.

### A visible product entry, not a hidden query parameter

Retake Coach now has a dedicated `/retake` page and stable links in desktop/mobile navigation, the home page, review history, and the standard workspace. The entry first asks the user to select a completed original critique, then hands that source into the existing retake workspace.

### Non-comparable inputs do not become progress

The schema always includes `is_comparable`, confidence, and a caveat. Non-comparable results remain reviewable but display no improvement badge and are excluded from the retake progress curve.

### GPT Image 2 remains a visual target

The comparison's `visual_reference_prompt` enters the existing `review_linked` / `retake_reference` generation flow. Generated images do not affect progress scores.

## GPT-5.6 implementation path

```text
frontend/src/app/workspace/page.tsx
  -> ReviewCreateRequest.analysis_type = retake_compare
  -> backend/app/api/routers/review_create.py
  -> ReviewTask.request_payload
  -> backend/app/services/review_task_processor.py
  -> backend/app/services/retake_comparison.py
  -> https://api.openai.com/v1/responses
  -> model gpt-5.6-terra
  -> strict paired-comparison JSON
  -> Review.result_json.comparison
```

## Build Week commit ledger

Fill this table with immutable SHAs after each commit is created.

| Commit | Timestamp | Contribution | Codex evidence | Verification |
|---|---|---|---|---|
| Pending | 2026-07-15 to 2026-07-17 JST | GPT-5.6 paired backend, visible entry, GPT-5.5 normal-review choice, and product integration | Primary Codex task | 208 backend tests, 11 subtests, 97 frontend tests, typecheck, lint, 121-page production build, desktop/mobile browser checks, and live GPT-5.5/Terra paths passed |
| Pending | Pending | Test and hardening pass | Primary Codex task | Pending |
| Pending | Pending | README, demo, and submission evidence | Primary Codex task | Pending |

Candidate commits can be audited with:

```powershell
git log --since='2026-07-13T09:00:00-07:00' --date=iso-strict --pretty=format:'%H%x09%aI%x09%s'
```

## Verification evidence

Executed locally through 2026-07-17 JST:

| Check | Result |
|---|---|
| `python -m pytest -q` | 206 passed, 11 subtests passed |
| `npm test` | 97 passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Next.js production build passed; 121 static pages generated, including `/retake` |
| `python -m compileall -q app` | Passed |
| Live GPT-5.6 paired-image call | Passed with `gpt-5.6-sol` on 2026-07-16 JST |
| Live GPT-5.6 normal-photo call | Passed with `gpt-5.6-sol`, one real image input, strict schema, and two-pass score locking on 2026-07-17 JST |
| Live active-model routing call | Normal critique passed with `gpt-5.5`; paired comparison passed with `gpt-5.6-terra` on 2026-07-17 JST |
| Local Playwright browser check | Dedicated entry, normal-review Qwen/GPT picker, checked GPT state, and 390 × 844 mobile layout passed; a theme hydration mismatch found during QA was fixed and rechecked with zero console errors |

### Live GPT-5.6 evidence

The live control call sent the same real portrait file twice as two ordered Base64 `input_image` blocks. This deliberately tests the no-visible-change boundary without relying on public object-storage access.

| Field | Observed result |
|---|---|
| Model | `gpt-5.6-sol` |
| Latency | 27,800 ms |
| Input / output tokens | 3,198 / 1,413 |
| Response ID | Present |
| Comparable | `false`, confidence `low` |
| Overall before / after / delta | 7.4 / 7.4 / 0.0 |
| Five dimension deltas | All `0` |
| Next-shoot actions | 5 structured actions |
| GPT Image visual-reference prompt | Present |

The configured gateway rejected the generic `gpt-5.6` alias with `unknown provider for model gpt-5.6`. Its authenticated model catalog exposed explicit GPT-5.6 variants, so the initial implementation used `gpt-5.6-sol`; the active paired-comparison default was later changed to the explicitly requested `gpt-5.6-terra` model ID.

On 2026-07-17, the normal review path resolved to `gpt-5.6-sol`, returned a final score of 6.6 with all five dimensions, used 3,600 input / 337 output tokens, and completed in 10,583 ms. A fresh identical-image retake boundary call returned non-comparable/low confidence, zero overall delta, all five dimensions, and five next actions in 36,444 ms. The redacted record is stored at `docs/build-week/evidence/live-gpt56-model-choice-test-2026-07-17.json`.

After the requested model split, a second live test verified the active routing: normal critique resolved to `gpt-5.5`, returned all five dimensions and a 5.4 final score in 13,014 ms; paired comparison resolved to `gpt-5.6-terra`, returned all five dimensions, zero delta for the identical-image boundary, and four next actions in 28,872 ms. The redacted record is stored at `docs/build-week/evidence/live-gpt55-terra-routing-test-2026-07-17.json`.

The hardening pass added mocked contract tests for the official Responses API payload, ordered original/retake image inputs, strict JSON Schema output, deterministic server-side deltas, missing-key handling, invalid structured output, and comparable-only progress-chain selection. It also corrected a timezone-sensitive quota test fixture to use the product's UTC quota date.

## Files introduced for Retake Coach

- `backend/app/services/retake_comparison.py`
- `backend/tests/test_openai_photo_review.py`
- `frontend/src/app/retake/page.tsx`
- `frontend/src/features/workspace/components/ReviewModelPicker.tsx`
- `frontend/src/features/reviews/components/RetakeComparisonPanel.tsx`
- `frontend/src/features/reviews/components/RetakeProgressPanel.tsx`
- `docs/build-week/BUILD-WEEK-LOG.md`

Existing files modified by the feature are listed by the Build Week commits and final submission README.
