import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildRetakeWorkspaceHref,
  formatRetakeDelta,
  getEligibleRetakeSources,
  resolveReviewAnalysisType,
} from '../src/lib/retake-coach.ts';
import { getStoredRetakeModelLabel } from '../src/lib/retake-model-label.ts';

test('new uploads with a source review use paired analysis while same-photo reruns stay single', () => {
  assert.equal(resolveReviewAnalysisType('rev_source', true), 'retake_compare');
  assert.equal(resolveReviewAnalysisType('rev_source', false), 'single');
  assert.equal(resolveReviewAnalysisType(null, true), 'single');
});

test('retake delta formatting exposes positive, negative, zero, and unavailable states without color', () => {
  assert.equal(formatRetakeDelta(2), '+2.0');
  assert.equal(formatRetakeDelta(-1), '-1.0');
  assert.equal(formatRetakeDelta(0), '0.0');
  assert.equal(formatRetakeDelta(3, false), 'N/A');
});

test('retake entry keeps only completed sources and carries the selected review into workspace', () => {
  const sources = getEligibleRetakeSources([
    { review_id: 'rev_ok', status: 'SUCCEEDED', photo_url: 'https://example.com/a.jpg', image_type: 'portrait' },
    { review_id: 'rev_pending', status: 'PENDING', photo_url: 'https://example.com/b.jpg', image_type: 'street' },
    { review_id: 'rev_missing', status: 'SUCCEEDED', photo_url: null, image_type: 'default' },
  ] as never);

  assert.deepEqual(sources.map((item) => item.review_id), ['rev_ok']);
  assert.equal(
    buildRetakeWorkspaceHref(sources[0]),
    '/workspace?source_review_id=rev_ok&retake_intent=retake_coach&image_type=portrait'
  );
});

test('normal workspace and retake flow both route to GPT-6 Sol while preserving legacy result labels', async () => {
  const source = await readFile('src/app/workspace/page.tsx', 'utf8');
  const picker = await readFile('src/features/workspace/components/ReviewModelPicker.tsx', 'utf8');
  const settings = await readFile('src/features/workspace/components/WorkspaceSettingsPanel.tsx', 'utf8');
  const header = await readFile('src/components/layout/Header.tsx', 'utf8');
  const headerControls = await readFile('src/components/layout/HeaderControls.tsx', 'utf8');
  const coachCopy = await readFile('src/lib/retake-coach-copy.ts', 'utf8');
  const comparisonPanel = await readFile('src/features/reviews/components/RetakeComparisonPanel.tsx', 'utf8');

  assert.match(source, /review_model: selectedReviewModel/);
  assert.match(source, /isRetakeCoachFlow \|\| isPracticePairedFlow \? 'gpt-6-sol' : reviewModel/);
  assert.match(source, /showReviewModel=\{!isRetakeCoachFlow && !isPracticePairedFlow\}/);
  assert.match(source, /<WorkspaceSettingsPanel/);
  assert.match(settings, /<ReviewModelPicker/);
  assert.match(source, /useState<ReviewModel>\('gpt-6-sol'\)/);
  assert.doesNotMatch(picker, /qwen|Qwen|千问/);
  assert.match(picker, /GPT-6 Sol/);
  assert.doesNotMatch(picker, /GPT-5\.5/);
  assert.match(header, /href="\/account\/practice"/);
  assert.match(headerControls, /href: '\/retake'/);
  assert.doesNotMatch(header, />Terra<\/span>/);
  assert.doesNotMatch(coachCopy, /Terra/);
  assert.match(coachCopy, /GPT-6 Sol/);
  assert.match(comparisonPanel, /getStoredRetakeModelLabel/);
});

test('retake result model labels prefer stored result metadata before score-version fallback', () => {
  const legacyResultWithNewerGoalMetadata = {
    result: {
      model_name: 'gpt-5.6-luna',
      scorer_model_name: 'gpt-5.6-luna',
      writer_model_name: 'gpt-5.6-luna',
      score_version: 'retake-paired-v1',
    },
    goal_assessment: {
      model_name: 'gpt-6-luna',
    },
  } as Parameters<typeof getStoredRetakeModelLabel>[0];

  assert.equal(getStoredRetakeModelLabel(legacyResultWithNewerGoalMetadata), 'GPT-5.6');
  assert.equal(
    getStoredRetakeModelLabel({
      result: {
        model_name: 'gpt-5.6-luna',
        scorer_model_name: 'gpt-5.6-luna',
        writer_model_name: 'gpt-5.6-luna',
        score_version: 'retake-paired-v2',
      },
    }),
    'GPT-5.6',
  );
  assert.equal(
    getStoredRetakeModelLabel({
      result: {
        model_name: 'gpt-6-sol',
        scorer_model_name: null,
        writer_model_name: null,
        score_version: 'retake-paired-v2',
      },
    }),
    'GPT-6 Sol',
  );
  assert.equal(
    getStoredRetakeModelLabel({
      result: {
        model_name: 'gpt-6-luna',
        scorer_model_name: null,
        writer_model_name: null,
        score_version: 'retake-paired-v2',
      },
    }),
    'GPT-6 Luna',
  );
  assert.equal(
    getStoredRetakeModelLabel({
      result: {
        model_name: null,
        scorer_model_name: null,
        writer_model_name: null,
        score_version: 'retake-paired-v2',
      },
    }),
    'GPT-6',
  );
  assert.equal(
    getStoredRetakeModelLabel({
      result: {
        model_name: 'unknown-model',
        scorer_model_name: null,
        writer_model_name: null,
        score_version: 'retake-paired-v1',
      },
    }),
    'GPT-5.6',
  );
});

test('retake comparison keeps original before retake and handles inaccessible source photos', async () => {
  const source = await readFile('src/features/reviews/components/RetakeComparisonPanel.tsx', 'utf8');

  assert.ok(source.indexOf('alt={copy.original}') < source.indexOf('alt={copy.retake}'));
  assert.match(source, /review\.viewer_is_owner/);
  assert.match(source, /copy\.sourceUnavailable/);
  assert.match(source, /aria-label=/);
});

test('retake progress records remain responsive without forced horizontal scrolling', async () => {
  const source = await readFile('src/features/reviews/components/RetakeProgressPanel.tsx', 'utf8');

  assert.doesNotMatch(source, /overflow-x-auto/);
  assert.doesNotMatch(source, /min-w-\[/);
  assert.doesNotMatch(source, /<svg/);
  assert.match(source, /grid gap-3 lg:grid-cols-2/);
});

test('review result sends the paired visual target into the existing reference generator', async () => {
  const source = await readFile('src/app/reviews/[reviewId]/page.tsx', 'utf8');

  assert.match(source, /r\.comparison\.visual_reference_prompt/);
  assert.match(source, /r\.comparison\.next_actions/);
  assert.match(source, /suggestions=\{visualReferenceBrief\}/);
  assert.match(source, /activeReview\.source_review_id && !r\.comparison/);
});
