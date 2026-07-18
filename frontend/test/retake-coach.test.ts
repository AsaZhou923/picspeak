import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildRetakeWorkspaceHref,
  formatRetakeDelta,
  getEligibleRetakeSources,
  resolveReviewAnalysisType,
} from '../src/lib/retake-coach.ts';

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

test('normal workspace exposes GPT-5.5 while retake flow stays locked to GPT-5.6 Terra', async () => {
  const source = await readFile('src/app/workspace/page.tsx', 'utf8');
  const picker = await readFile('src/features/workspace/components/ReviewModelPicker.tsx', 'utf8');
  const settings = await readFile('src/features/workspace/components/WorkspaceSettingsPanel.tsx', 'utf8');

  assert.match(source, /review_model: selectedReviewModel/);
  assert.match(source, /isRetakeCoachFlow \? 'gpt-5\.6-terra' : reviewModel/);
  assert.match(source, /<WorkspaceSettingsPanel/);
  assert.match(settings, /<ReviewModelPicker/);
  assert.match(picker, /Qwen 3\.5/);
  assert.match(picker, /GPT-5\.5/);
});

test('retake comparison keeps original before retake and handles inaccessible source photos', async () => {
  const source = await readFile('src/features/reviews/components/RetakeComparisonPanel.tsx', 'utf8');

  assert.ok(source.indexOf('alt={copy.original}') < source.indexOf('alt={copy.retake}'));
  assert.match(source, /review\.viewer_is_owner/);
  assert.match(source, /copy\.sourceUnavailable/);
  assert.match(source, /aria-label=/);
});

test('retake progress SVG remains responsive without forced horizontal scrolling', async () => {
  const source = await readFile('src/features/reviews/components/RetakeProgressPanel.tsx', 'utf8');

  assert.doesNotMatch(source, /overflow-x-auto/);
  assert.doesNotMatch(source, /min-w-\[/);
  assert.match(source, /className="h-auto w-full"/);
});

test('review result sends the paired visual target into the existing reference generator', async () => {
  const source = await readFile('src/app/reviews/[reviewId]/page.tsx', 'utf8');

  assert.match(source, /r\.comparison\.visual_reference_prompt/);
  assert.match(source, /r\.comparison\.next_actions/);
  assert.match(source, /suggestions=\{visualReferenceBrief\}/);
  assert.match(source, /activeReview\.source_review_id && !r\.comparison/);
});
