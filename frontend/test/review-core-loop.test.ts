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

test('review first-reading DOM order is photo, result, strongest finding, evidence, then growth loop', async () => {
  const source = await readFile('src/app/reviews/[reviewId]/page.tsx', 'utf8');
  const photo = source.indexOf('<ReviewPhotoPanel');
  const result = source.indexOf("<ReviewResultHeading className=\"mt-2 text-3xl");
  const strongest = source.indexOf('review-strongest-finding-title');
  const evidence = source.indexOf('review-evidence-title');
  const growthLoop = source.indexOf('<ReviewGrowthLoopPanel');

  assert.ok(photo >= 0 && photo < result);
  assert.ok(result < strongest);
  assert.ok(strongest < evidence);
  assert.ok(evidence < growthLoop);
  assert.doesNotMatch(source, /<ReviewNextActionPanel/);
  assert.doesNotMatch(source, /className="pt-14 min-h-screen"/);
});

test('review secondary tools keep quick actions visible and mount export only after expansion', async () => {
  const source = await readFile('src/app/reviews/[reviewId]/page.tsx', 'utf8');
  const accountReviews = await readFile('src/app/account/reviews/page.tsx', 'utf8');
  const ownerTools = await readFile('src/features/reviews/components/ReviewOwnerTools.tsx', 'utf8');
  const organizationPanel = await readFile('src/features/reviews/components/ReviewOrganizationPanel.tsx', 'utf8');
  const growthLoopPanel = await readFile('src/features/reviews/components/ReviewGrowthLoopPanel.tsx', 'utf8');

  assert.match(source, /<details id="review-reference-generator"/);
  assert.ok(source.indexOf('<ReviewActionBar') < source.indexOf('hierarchyCopy.metaTool'));
  assert.match(source, /onExportSummary=\{handleOpenExportTools\}/);
  assert.match(source, /<details[\s\S]*\{exportToolsOpen && \(/);
  assert.ok(source.indexOf('hierarchyCopy.metaTool') < source.indexOf('hierarchyCopy.exportTool'));
  assert.doesNotMatch(source, /hierarchyCopy\.ownerTool/);
  assert.match(ownerTools, /showItemSelect=\{false\}/);
  assert.match(ownerTools, /标签与备注/);
  assert.ok(ownerTools.indexOf('<ReviewVisibilityPanel') < ownerTools.indexOf('<details'));
  assert.match(ownerTools, /onAddGallery=\{onAddGallery\}/);
  assert.match(accountReviews, /<GalleryConfirmDialog/);
  assert.match(accountReviews, /galleryConfirmReviewId/);
  assert.match(accountReviews, /updateOrganizedReviewMeta\(reviewId, \{ gallery_visible: true \}, token\)/);
  assert.match(accountReviews, /selectedReviewIdRef\.current === reviewId/);
  assert.match(accountReviews, /onAddGallery=\{\(\) => \{/);
  assert.ok(source.indexOf('<ReviewActionBar') < source.indexOf('review-evidence-title'));
  assert.doesNotMatch(source, /<ReviewGalleryPanel/);
  assert.match(source, /const showOwnerActions = canManageReview;/);
  assert.match(organizationPanel, /showItemSelect = true/);
  assert.match(organizationPanel, /\{showItemSelect && \(/);
  assert.doesNotMatch(growthLoopPanel, /这 3 件事|three things|この 3 つ/);
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
  assert.match(source, /trigger: practiceKind === 'edit_revision' \? 'edited_photo_panel' : 'new_photo_panel'/);
  assert.match(source, /trigger: 'checklist_item'/);
  assert.match(source, /practice_kind: practiceKind/);
  assert.match(source, /onUploadEdited=\{handleUploadEditedRound\}/);
  assert.doesNotMatch(source, /onReplayReview/);
  assert.match(source, /source_review_id: activeReview\.review_id/);
  assert.match(source, /router\.push\(`\/workspace\?\$\{nextParams\.toString\(\)\}`\)/);
});

test('practice results link back to the saved practice record', async () => {
  const source = await readFile('src/app/reviews/[reviewId]/page.tsx', 'utf8');
  const practiceRecord = source.indexOf('practiceRecordHref && (');
  const goalComparison = source.indexOf('{isGoalPracticeReview && r.comparison && (');

  assert.match(source, /practiceRecordSessionId = activeReview\.practice\?\.session_id \?\? activeReview\.practice_session_id/);
  assert.match(source, /\/account\/reviews\?view=practice&session_id=/);
  assert.match(source, /已保存到练习记录/);
  assert.ok(practiceRecord >= 0 && practiceRecord < goalComparison);
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

test('comparison panel switches edit revisions away from retake wording', async () => {
  const comparison = await readFile('src/features/reviews/components/RetakeComparisonPanel.tsx', 'utf8');

  assert.match(comparison, /practiceKind !== 'edit_revision'/);
  assert.match(comparison, /title: '修改前后对比'/);
  assert.match(comparison, /retake: '修改版照片'/);
  assert.match(comparison, /title: 'Before vs\. edited version'/);
  assert.match(comparison, /retake: 'Edited photo'/);
  assert.match(comparison, /title: '変更前と変更後を比較'/);
  assert.match(comparison, /retake: '編集後の写真'/);
  assert.doesNotMatch(comparison, /goalAssessment\.goal_version\}<\/span>/);
  assert.match(comparison, /getReviewExportCardCopy\(locale\)\.confidenceLevels/);
  assert.match(comparison, /confidenceLevels\[comparison\.comparison_confidence\]/);
});
