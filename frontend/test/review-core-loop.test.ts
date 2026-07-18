import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getReviewContinuationPlan } from '../src/features/reviews/hooks/reviewContinuationSupport.ts';

test('review continuation availability is deterministic from structured capability state', () => {
  assert.deepEqual(getReviewContinuationPlan({
    viewerIsOwner: false,
    hasSourceReview: true,
    isComparison: true,
    retakeAvailable: true,
    generateAvailable: true,
  }), {
    context: 'readonly',
    actions: [],
    recommendation: 'none',
  });

  assert.deepEqual(getReviewContinuationPlan({
    viewerIsOwner: true,
    hasSourceReview: false,
    isComparison: false,
    retakeAvailable: true,
    generateAvailable: true,
  }), {
    context: 'standard',
    actions: ['retake', 'generate'],
    recommendation: 'choice',
  });

  assert.deepEqual(getReviewContinuationPlan({
    viewerIsOwner: true,
    hasSourceReview: true,
    isComparison: true,
    retakeAvailable: false,
    generateAvailable: true,
  }), {
    context: 'comparison',
    actions: ['generate'],
    recommendation: 'generate',
  });
});

test('review first-reading DOM order is photo, result, strongest finding, then next action', async () => {
  const source = await readFile('src/app/reviews/[reviewId]/page.tsx', 'utf8');
  const photo = source.indexOf('<ReviewPhotoPanel');
  const result = source.indexOf("<h1 className=\"mt-2 text-3xl");
  const strongest = source.indexOf('review-strongest-finding-title');
  const nextAction = source.indexOf('<ReviewNextActionPanel');

  assert.ok(photo >= 0 && photo < result);
  assert.ok(result < strongest);
  assert.ok(strongest < nextAction);
  assert.doesNotMatch(source, /className="pt-14 min-h-screen"/);
});

test('review score controls use native buttons with focus and touch-readable descriptions', async () => {
  const source = await readFile('src/features/reviews/components/ReviewScorePanel.tsx', 'utf8');

  assert.match(source, /aria-label=\{t\('img_zoom_label'\)\}/);
  assert.match(source, /aria-describedby=\{descriptionId\}/);
  assert.match(source, /group-focus-within:block/);
  assert.match(source, /aria-pressed=\{isActive\}/);
  assert.doesNotMatch(source, /<div[\s\S]{0,180}onClick=/);
});

test('review transitions preserve analytics metadata and source-review query continuity', async () => {
  const source = await readFile('src/app/reviews/[reviewId]/page.tsx', 'utf8');

  assert.match(source, /trackProductEvent\('next_shoot_action_clicked'/);
  assert.match(source, /trigger: 'new_photo_panel'/);
  assert.match(source, /trigger: 'checklist_item'/);
  assert.match(source, /source_review_id: activeReview\.review_id/);
  assert.match(source, /router\.push\(`\/workspace\?\$\{nextParams\.toString\(\)\}`\)/);
});

test('retake surfaces expose original, target, retake, compare and visible trend labels', async () => {
  const [page, comparison, copy] = await Promise.all([
    readFile('src/app/retake/page.tsx', 'utf8'),
    readFile('src/features/reviews/components/RetakeComparisonPanel.tsx', 'utf8'),
    readFile('src/lib/retake-coach-copy.ts', 'utf8'),
  ]);

  assert.match(copy, /steps: \['Original', 'Target', 'Retake', 'Compare'\]/);
  assert.ok(comparison.indexOf('01 · {copy.original}') < comparison.indexOf('02 · {copy.target}'));
  assert.ok(comparison.indexOf('02 · {copy.target}') < comparison.indexOf('03 · {copy.retake}'));
  assert.ok(comparison.indexOf('03 · {copy.retake}') < comparison.indexOf('04 · {copy.compare}'));
  assert.match(comparison, /<span>\{direction\}<\/span>/);
  assert.match(page, /copy\.currentStep/);
  assert.match(page, /copy\.upcomingStep/);
  assert.doesNotMatch(page, /min-h-screen pt-14/);
});
