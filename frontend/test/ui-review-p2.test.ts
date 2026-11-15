import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatGenerationModelName } from '../src/features/generations/generation-config.ts';
import {
  buildGalleryReviewHeading,
  buildGalleryReviewVisibleHeading,
  summarizeGalleryCritique,
} from '../src/lib/gallery-review-page.ts';
import { getProUpgradeTriggerCopy } from '../src/lib/pro-conversion.ts';
import { stripSoleListMarker } from '../src/lib/critique-text.ts';
import { getWorkspaceTaskFlowCopy } from '../src/features/workspace/workspaceTaskFlow.ts';
import { enTranslations } from '../src/lib/i18n-en.ts';
import { jaTranslations } from '../src/lib/i18n-ja.ts';
import { zhTranslations } from '../src/lib/i18n-zh.ts';

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('a critique with one point loses its lone list marker, longer lists keep theirs', () => {
  assert.equal(stripSoleListMarker('1. 右下方的枝叶连成一片。'), '右下方的枝叶连成一片。');
  assert.equal(stripSoleListMarker('1、只有一条'), '只有一条');
  assert.equal(stripSoleListMarker('1. first 2. second'), '1. first 2. second');
  assert.equal(stripSoleListMarker('No marker here'), 'No marker here');
  assert.equal(stripSoleListMarker(null), '');
});

test('gallery cards show the observation instead of the raw structured suggestion', () => {
  assert.equal(summarizeGalleryCritique('观察：行人上身清楚；原因：深色线条交叠；可执行动作：右移一步'), '行人上身清楚');
  assert.equal(summarizeGalleryCritique('1. Observation: The peak enters as a fragment; Reason: its edge is cut'), 'The peak enters as a fragment');
  assert.equal(summarizeGalleryCritique('観察：橋の線が重なる；理由：暗部がつながる'), '橋の線が重なる');
  assert.equal(summarizeGalleryCritique('A plain sentence.'), 'A plain sentence.');
  assert.match(read('src/components/gallery/GalleryCard.tsx'), /summarizeGalleryCritique\(summary\)/);
});

test('the public critique H1 leaves the score to the figure below it', () => {
  const review = { image_type: 'landscape', final_score: 7.8, review_locale: 'zh', advantage: '', critique: '', suggestions: '' };
  assert.equal(buildGalleryReviewVisibleHeading(review), '风景摄影点评');
  assert.equal(buildGalleryReviewHeading(review), '风景摄影点评：7.8/10');
  assert.equal(buildGalleryReviewVisibleHeading({ ...review, image_type: 'default', review_locale: 'en' }), 'AI photo critique');
  const view = read('src/components/gallery/PublicGalleryReviewView.tsx');
  assert.match(view, /buildGalleryReviewVisibleHeading\(review\)/);
  assert.match(view, /stripSoleListMarker\(body\)/);
});

test('generated image details show a readable model name', () => {
  assert.equal(formatGenerationModelName('gpt-image-2-2026-04-21'), 'GPT Image 2');
  assert.equal(formatGenerationModelName('gpt-image-2'), 'GPT Image 2');
  assert.equal(formatGenerationModelName('other-model-2026-01-02'), 'other-model');
  assert.equal(formatGenerationModelName(undefined), '-');
  const page = read('src/app/generations/[generationId]/page.tsx');
  assert.match(page, /formatGenerationModelName\(generation\.model_name\)/);
  assert.doesNotMatch(page, /<p className="mt-1 text-ink">\{generation\.quality\}<\/p>/);
  assert.match(page, /t\('generation_detail_prompt'\)/);
});

test('workspace names its second step after what it contains and summarises with field names', () => {
  assert.equal(getWorkspaceTaskFlowCopy('zh').steps.settings, '类型与模式');
  const submit = read('src/features/workspace/components/WorkspaceSubmitPanel.tsx');
  assert.match(submit, /t\('filter_image_type'\)/);
  assert.doesNotMatch(submit, /t\('select_(?:mode|image_type)'\)/);
  // The quota line lives in the submit step only.
  assert.doesNotMatch(read('src/features/workspace/components/WorkspaceSettingsPanel.tsx'), /quotaImpact/);
});

test('waiting pages hide internal ids and raw status while work is in progress', () => {
  const critique = read('src/app/tasks/[taskId]/page.tsx');
  const generation = read('src/app/generation-tasks/[taskId]/page.tsx');
  assert.match(critique, /\{isFinal && <p[^>]*>\{t\('task_id_label'\)\}/);
  assert.match(generation, /\{failed && \(\s*<p[^>]*>\s*\{t\('generation_task_id_label'\)\}/);
  assert.doesNotMatch(generation, /task\?\.status \?\? 'PENDING'\}/);
});

test('account and result surfaces use plain wording', () => {
  assert.equal(zhTranslations.usage_headline, '额度与套餐');
  assert.equal(zhTranslations.notifications_enabled, '已开启');
  assert.equal(zhTranslations.notifications_disabled, '已关闭');
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    assert.ok(dictionary.review_exif_missing);
    assert.doesNotMatch(dictionary.usage_headline, /决策|Decision|判断/);
    // Free can only generate Low, so a credit pack unlocks neither Medium nor High.
    assert.match(dictionary.usage_credit_pack_body, /Medium|中画質/);
  }
  assert.doesNotMatch(read('src/app/account/usage/page.tsx'), /\{userInfo\.user_id\}/);
  const scorePanel = read('src/features/reviews/components/ReviewScorePanel.tsx');
  assert.doesNotMatch(scorePanel, />↓ ?</);
  assert.match(scorePanel, /t\('review_exif_missing'\)/);
  assert.match(read('src/features/reviews/components/ImageZoomOverlay.tsx'), /bg-black\/90/);
  assert.match(read('src/features/reviews/components/ReviewOrganizationPanel.tsx'), /disabled=\{!item \|\| busy \|\| !dirty/);
});

test('prompt examples page through the list instead of trapping scroll', () => {
  const gallery = read('src/features/generations/components/PromptExampleGallery.tsx');
  assert.doesNotMatch(gallery, /overflow-y-auto/);
  assert.match(gallery, /examples\.slice\(0, visibleCount\)/);
});

test('home buttons mount into the slot that is laid out', () => {
  const widgets = read('src/components/home/HomeAuthWidgets.tsx');
  assert.match(widgets, /getClientRects\(\)\.length > 0/);
  assert.doesNotMatch(widgets, /getElementById\('home-/);
});

test('the retake upgrade card leads with the Pro reason in every locale', () => {
  for (const locale of ['zh', 'en', 'ja'] as const) {
    const card = getProUpgradeTriggerCopy(locale, 'retake_compare');
    assert.match(card.title, /Pro/);
    assert.match(card.body, /Free/);
  }
});
