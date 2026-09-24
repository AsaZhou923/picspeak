import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildReviewExportCardModel,
  buildReviewExportFileStem,
  buildReviewPrintMarkdown,
  buildCardExcerpt,
  compactExportSentence,
  getReviewExportCardCopy,
  stripPrivateExportText,
} from '../src/features/reviews/helpers/reviewExportPresentation.ts';
import {
  getReviewExportCanvasLayout,
  getWrappedLines,
  shouldAttachBearerForImageFetch,
  shouldDrawEvidenceBadge,
} from '../src/features/reviews/helpers/reviewExportCanvas.ts';
import type { ReviewExportResponse, ReviewGetResponse } from '../src/lib/types.ts';

const baseReview: ReviewGetResponse = {
  review_id: 'review-123456789',
  photo_id: 'photo-1',
  photo_url: 'https://example.test/photo.jpg',
  mode: 'pro',
  status: 'SUCCEEDED',
  image_type: 'portrait',
  viewer_is_owner: true,
  created_at: '2026-09-22T10:00:00Z',
  note: 'private user note should stay out',
  exif_data: { GPSLatitude: 35.6 },
  result: {
    schema_version: '1',
    prompt_version: 'p',
    score_prompt_version: 'sp',
    model_name: 'writer',
    model_version: '1',
    scorer_model_name: 'scorer',
    scorer_model_version: '1',
    writer_model_name: 'writer',
    writer_model_version: '1',
    scorer_preprocess_version: 'pre',
    score_cache_hit: false,
    scores: { composition: 6, lighting: 7, color: 8, impact: 5, technical: 6 },
    final_score: 6.4,
    advantage: 'Strong shape.',
    critique: 'The frame is not calm enough. Contact me at person@example.com. GPS: 35.0, 139.0',
    suggestions: 'Keep the face clear and do not crop the hand.',
    image_type: 'portrait',
    billing_info: {},
    visual_analysis: {},
    tonal_analysis: {},
    issue_marks: [],
    exif_info: {},
    share_info: {},
  },
};

function createMeasureContext(): CanvasRenderingContext2D {
  return {
    font: '',
    measureText(text: string) {
      const fontSize = Number.parseInt(String(this.font).match(/(\d+)px/)?.[1] ?? '24', 10);
      return { width: [...text].length * fontSize * 0.62 } as TextMetrics;
    },
  } as CanvasRenderingContext2D;
}

test('card wrapping preserves complete words and rejects overflow instead of dropping negatives', () => {
  const context = { measureText: (text: string) => ({ width: [...text].length } as TextMetrics) };
  const text = 'Do not crop the subject.';
  const lines = getWrappedLines(context, text, 12, 3);
  assert.ok(lines);
  assert.equal(lines.join(' ').replace(/\s+/g, ' '), text);
  assert.ok(lines.every((line) => line.length <= 12));
  assert.equal(getWrappedLines(context, text, 5, 1), null);
  assert.deepEqual(getWrappedLines(context, '主体を切らない', 4, 2), ['主体を切', 'らない']);
});

test('card wrapping keeps numeric Chinese prefixes with their following phrase', () => {
  const context = { measureText: (text: string) => ({ width: [...text].length } as TextMetrics) };
  const lines = getWrappedLines(context, '1. 中文长段需要继续换行，同时不要把编号单独放一行。', 6, 20);
  assert.ok(lines);
  assert.match(lines[0], /^1\. 中文/u);
  assert.doesNotMatch(lines[0], /^\s*\d+[.、]\s*$/u);

  const english = getWrappedLines(context, 'Do not crop the subject near the edge.', 12, 10);
  assert.ok(english);
  assert.equal(english.join(' ').replace(/\s+/g, ' '), 'Do not crop the subject near the edge.');
});

test('review export helpers redact private text without rewriting meaningful negatives', () => {
  const redacted = stripPrivateExportText('Email x@example.com. GPS: 35.0,139.0. Do not crop the hand.');
  assert.doesNotMatch(redacted, /x@example\.com|35\.0,139\.0/);
  assert.match(redacted, /Do not crop the hand/);
  const longText = 'Do not remove the shadow. '.repeat(20);
  assert.equal(compactExportSentence(longText, 80), longText.trim());
});

test('export filenames use user-facing review dates and safe titles', () => {
  assert.equal(
    buildReviewExportFileStem({ createdAt: '2026-09-24T12:10:22Z', title: 'PicSpeak 评图 / Keep light' }),
    'picspeak-review-2026-09-24-picspeak-评图-keep-light'
  );
  assert.match(buildReviewExportFileStem({ createdAt: 'bad-date', title: '***' }), /^picspeak-review-\d{4}-\d{2}-\d{2}$/);
});


test('default card excerpts handle the real short-Chinese regression shape', () => {
  const critique = '1. 画面上缘那片亮云目前比主体受光面更早抢到视线，尤其在深色窗框与墙面纹理旁形成了偏硬的亮度跳跃；结果是主体虽然占据大面积，视觉重心却被抬到画外。';
  const suggestions = '1. 观察：上缘亮云是画面里最强的亮斑，主体的轮廓与暖色墙面才承担主要识别信息；原因：亮斑与主体之间的明暗差过大，先截走注意力，但天空又是轮廓和侧光的必要对照；可执行动作：只在上缘高亮区域做轻微局部压暗，停在云层仍有层次、天空仍通透而主体重新成为第一落点的位置，保留暖亮天空与主体之间的明暗关系。';
  const review: ReviewGetResponse = {
    ...baseReview,
    result: {
      ...baseReview.result,
      critique,
      suggestions,
    },
  };
  const model = buildReviewExportCardModel({ review, locale: 'zh' });

  assert.equal(model.fullSummary, critique);
  assert.equal(model.fullSuggestion, suggestions);
  assert.equal(model.summary, critique);
  assert.equal(model.suggestion, suggestions);
  const layout = getReviewExportCanvasLayout(createMeasureContext(), model, getReviewExportCardCopy('zh'));
  assert.equal(layout.finalHeight, 1500);
  assert.ok(layout.footerY > layout.textEnd);
});

test('long image card text keeps full content and grows the canvas without overlap', () => {
  const longChinese = '不要删除暗部。观察画面左侧高光仍然抢眼，但主体边缘不能被压成一团。'.repeat(24);
  const review: ReviewGetResponse = {
    ...baseReview,
    result: {
      ...baseReview.result,
      critique: longChinese,
      suggestions: `${longChinese} 下一次只压暗高光，不要改变建筑立面的暖色关系。`,
    },
  };

  const model = buildReviewExportCardModel({ review, locale: 'zh' });
  assert.equal(model.summary, model.fullSummary);
  assert.equal(model.suggestion, model.fullSuggestion);
  assert.match(model.fullSuggestion, /不要改变建筑立面的暖色关系/);
  assert.equal(buildCardExcerpt('Do not crop the hand. '.repeat(80), 90), 'Do not crop the hand. '.repeat(80).trim());
  const layout = getReviewExportCanvasLayout(createMeasureContext(), model, getReviewExportCardCopy('zh'));
  assert.ok(layout.finalHeight > 1500);
  assert.ok(layout.footerY > layout.textEnd);
  assert.ok(layout.finalHeight > layout.footerY + layout.footerHeight);
});

test('single-card model omits notes and EXIF while allowing score hiding', () => {
  const model = buildReviewExportCardModel({ review: baseReview, locale: 'en', showScore: false });

  assert.equal(model.mode, 'single');
  assert.equal(model.evidenceState, 'unassessed');
  assert.equal(model.evidenceLabel, 'No recorded goal assessment');
  assert.equal(shouldDrawEvidenceBadge(model), false);
  assert.equal(model.showScore, false);
  assert.equal(model.imageUrl, baseReview.photo_url);
  assert.doesNotMatch(JSON.stringify(model), /private user note|GPSLatitude|person@example\.com/);
  assert.match(model.summary, /redacted-email/);
});

test('export model accepts user-edited safe excerpts without cutting negations', () => {
  const model = buildReviewExportCardModel({
    review: baseReview,
    locale: 'en',
    summary: 'Do not crop the hand; keep the face clear.',
    suggestion: 'Move closer, but do not remove the shadow.',
    target: 'Keep the same pose.',
    evidenceLines: ['The retake does not yet separate the subject.'],
  });

  assert.equal(model.summary, 'Do not crop the hand; keep the face clear.');
  assert.equal(model.suggestion, 'Move closer, but do not remove the shadow.');
  assert.deepEqual(model.evidenceLines, ['The retake does not yet separate the subject.']);
});

test('top-level goal assessment beats nested comparison fallback and frozen goal beats next action', () => {
  const review: ReviewGetResponse = {
    ...baseReview,
    goal_assessment: {
      goal_version: 'top',
      status: 'achieved',
      evidence: [{
        success_criterion: 'criterion',
        before_observation: 'before',
        after_observation: 'after',
        conclusion: 'Top-level evidence wins.',
      }],
      limitations: [],
      next_action: 'This is a next action, not the target.',
    },
    result: {
      ...baseReview.result,
      comparison: {
        original_review_id: 'source-review',
        original_photo_id: 'source-photo',
        retake_photo_id: 'photo-1',
        is_comparable: true,
        comparison_confidence: 'high',
        comparison_caveat: '',
        summary: 'Nested comparison.',
        dimensions: {
          composition: { before_score: 6, after_score: 6, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
          lighting: { before_score: 6, after_score: 7, delta: 1, trend: 'improved', evidence: [], remaining_gap: '' },
          color: { before_score: 7, after_score: 7, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
          impact: { before_score: 5, after_score: 5, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
          technical: { before_score: 6, after_score: 6, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
        },
        overall_before: 6,
        overall_after: 6.2,
        overall_delta: 0.2,
        strongest_improvement: 'lighting',
        next_actions: [],
        visual_reference_prompt: '',
        openai_response_id: '',
        goal_assessment: {
          goal_version: 'nested',
          status: 'indeterminate',
          evidence: [{ success_criterion: 'nested', before_observation: '', after_observation: '', conclusion: 'Nested only.' }],
          limitations: [],
          next_action: 'Nested next action.',
        },
      },
    },
  };

  const model = buildReviewExportCardModel({ review, locale: 'en', frozenGoal: 'Frozen goal from PracticeSession.' });
  assert.equal(model.evidenceState, 'achieved');
  assert.equal(model.target, 'Frozen goal from PracticeSession.');
  assert.deepEqual(model.evidenceLines, ['Top-level evidence wins.']);

  const withoutFrozenGoal = buildReviewExportCardModel({ review, locale: 'en' });
  assert.equal(withoutFrozenGoal.target, null);
});

test('export payload top-level goal assessment is honored when nested comparison is absent', () => {
  const payload = {
    photo: { photo_id: 'photo-1', photo_url: 'https://example.test/photo.jpg', photo_thumbnail_url: null },
    review: {
      review_id: 'review-1',
      source_review_id: null,
      mode: 'flash',
      status: 'SUCCEEDED',
      image_type: 'default',
      model_name: 'writer',
      model_version: '1',
      scorer_model_name: 'scorer',
      scorer_model_version: '1',
      writer_model_name: 'writer',
      writer_model_version: '1',
      final_score: 7,
      scores: { composition: 7, lighting: 7, color: 7, impact: 7, technical: 7 },
      advantage: 'Clean.',
      critique: 'Stable.',
      suggestions: 'Keep going.',
      comparison: null,
      goal_assessment: {
        goal_version: 'top-export',
        status: 'achieved',
        evidence: [{ success_criterion: 'c', before_observation: '', after_observation: '', conclusion: 'Export top evidence.' }],
        limitations: [],
        next_action: 'Next action.',
      },
      favorite: false,
      tags: [],
      note: null,
      created_at: '2026-09-22T10:00:00Z',
      exported_at: '2026-09-22T10:01:00Z',
    },
  } satisfies ReviewExportResponse & { review: ReviewExportResponse['review'] & { goal_assessment: NonNullable<ReviewGetResponse['goal_assessment']> } };

  const model = buildReviewExportCardModel({ review: payload, locale: 'en' });
  assert.equal(model.evidenceState, 'achieved');
  assert.equal(shouldDrawEvidenceBadge(model), true);
  assert.deepEqual(model.evidenceLines, ['Export top evidence.']);
});

test('retake mode is explicit and does not silently replace unavailable source images', () => {
  const review: ReviewGetResponse = {
    ...baseReview,
    result: {
      ...baseReview.result,
      comparison: {
        original_review_id: 'source-review',
        original_photo_id: 'source-photo',
        retake_photo_id: 'photo-1',
        is_comparable: true,
        comparison_confidence: 'medium',
        comparison_caveat: '',
        summary: 'Retake evidence is present.',
        dimensions: {
          composition: { before_score: 6, after_score: 6, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
          lighting: { before_score: 6, after_score: 7, delta: 1, trend: 'improved', evidence: [], remaining_gap: '' },
          color: { before_score: 7, after_score: 7, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
          impact: { before_score: 5, after_score: 5, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
          technical: { before_score: 6, after_score: 6, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
        },
        overall_before: 6,
        overall_after: 6.2,
        overall_delta: 0.2,
        strongest_improvement: 'lighting',
        next_actions: [],
        visual_reference_prompt: '',
        openai_response_id: '',
      },
    },
  };

  assert.equal(buildReviewExportCardModel({
    review,
    locale: 'en',
    mode: 'retake',
    sourceImageUrl: null,
  }).mode, 'single');

  assert.equal(buildReviewExportCardModel({
    review,
    locale: 'en',
    mode: 'retake',
    sourceImageUrl: 'https://example.test/source.jpg',
    sourceAvailable: true,
  }).mode, 'retake');
});

test('retake-card model requires an available source image and preserves low-confidence caveats', () => {
  const review: ReviewGetResponse = {
    ...baseReview,
    result: {
      ...baseReview.result,
      comparison: {
        original_review_id: 'source-review',
        original_photo_id: 'source-photo',
        retake_photo_id: 'photo-1',
        is_comparable: false,
        comparison_confidence: 'low',
        comparison_caveat: 'Different subject, so do not claim a score gain.',
        summary: 'The retake changed the lighting but not the pose.',
        dimensions: {
          composition: { before_score: 6, after_score: 6, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
          lighting: { before_score: 6, after_score: 7, delta: 1, trend: 'improved', evidence: [], remaining_gap: '' },
          color: { before_score: 7, after_score: 7, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
          impact: { before_score: 5, after_score: 5, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
          technical: { before_score: 6, after_score: 6, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
        },
        overall_before: 6,
        overall_after: 6.2,
        overall_delta: 0.2,
        strongest_improvement: 'lighting',
        next_actions: [],
        visual_reference_prompt: '',
        openai_response_id: '',
        goal_assessment: {
          goal_version: 'v1',
          status: 'not_achieved',
          evidence: [],
          limitations: [],
          next_action: 'Keep the same pose and light direction.',
        },
      },
    },
  };

  const hiddenSource = buildReviewExportCardModel({
    review,
    locale: 'en',
    sourceImageUrl: 'https://example.test/source.jpg',
    sourceAvailable: false,
  });
  assert.equal(hiddenSource.mode, 'single');
  assert.equal(hiddenSource.sourceImageUrl, null);

  const model = buildReviewExportCardModel({
    review,
    locale: 'en',
    mode: 'retake',
    sourceImageUrl: 'https://example.test/source.jpg',
  });
  assert.equal(model.mode, 'retake');
  assert.equal(model.evidenceState, 'not_achieved');
  assert.match(model.caveat ?? '', /do not claim a score gain/);
});

test('print markdown is based on export payload and excludes user note fields', () => {
  const payload: ReviewExportResponse = {
    photo: { photo_id: 'photo-1', photo_url: null, photo_thumbnail_url: null },
    review: {
      review_id: 'review-1',
      source_review_id: null,
      mode: 'flash',
      status: 'SUCCEEDED',
      image_type: 'default',
      model_name: 'writer',
      model_version: '1',
      scorer_model_name: 'scorer',
      scorer_model_version: '1',
      writer_model_name: 'writer',
      writer_model_version: '1',
      final_score: 5.2,
      scores: { composition: 5, lighting: 5, color: 6, impact: 5, technical: 5 },
      advantage: 'Clean color.',
      critique: 'No private fields.',
      suggestions: 'Keep the subject centered.',
      comparison: null,
      favorite: false,
      tags: [],
      note: 'must not be printed by new print markdown',
      created_at: '2026-09-22T10:00:00Z',
      exported_at: '2026-09-22T10:01:00Z',
    },
  };
  const markdown = buildReviewPrintMarkdown({ payload, locale: 'en' });
  assert.match(markdown, /## Strengths\nClean color\./);
  assert.match(markdown, /## Issues\nNo private fields\./);
  assert.match(markdown, /## Improvements\nKeep the subject centered\./);
  assert.match(markdown, /Keep the subject centered/);
  assert.doesNotMatch(markdown, /No recorded goal assessment/);
  assert.doesNotMatch(markdown, /Review: review-1/);
  assert.doesNotMatch(markdown, /must not be printed/);
});

test('export UI files keep local privacy boundaries and avoid public link generation', async () => {
  const [panel, printPage, canvas, copyText] = await Promise.all([
    readFile('src/features/reviews/components/ReviewExportPanel.tsx', 'utf8'),
    readFile('src/app/reviews/[reviewId]/print/page.tsx', 'utf8'),
    readFile('src/features/reviews/helpers/reviewExportCanvas.ts', 'utf8'),
    Promise.resolve(JSON.stringify(getReviewExportCardCopy('zh'))),
  ]);

  assert.doesNotMatch(panel, /createReviewShare|share_token|\/share\//);
  assert.match(panel, /getReview\(sourceReviewId, authToken/);
  assert.doesNotMatch(panel, /sourcePhotoUrl\?:/);
  assert.match(panel, /setCardMode\(mode\)/);
  assert.match(panel, /review\.practice\s*\?\s*review\.practice\.source_review_id\s*:/);
  assert.doesNotMatch(panel, /review\.practice\?\.source_review_id \?\?/);
  assert.match(panel, /getPracticeSession\(practiceSessionId, authToken/);
  assert.match(panel, /excerptDirtyRef/);
  assert.match(panel, /setTargetExcerpt\(\(current\) => \(excerptDirtyRef\.current \|\| current \? current : goal\)\)/);
  assert.doesNotMatch(panel, /copy\.cardTitle, frozenGoal, locale, review/);
  assert.match(panel, /readOnly/);
  assert.doesNotMatch(panel, /copy\.noFrozenGoal/);
  assert.match(panel, /excerptEdited: excerptDirty/);
  assert.match(panel, /previewRequestRef/);
  assert.match(panel, /URL\.revokeObjectURL\(result\.url\)/);
  assert.match(panel, /buildPreview\(false\)/);
  assert.match(panel, /copy\.editExcerpts/);
  assert.match(panel, /copy\.quickCardNote/);
  assert.match(panel, /text-action-ink/);
  assert.match(panel, /buildReviewExportFileStem/);
  assert.match(panel, /copy\.summaryInput/);
  assert.match(panel, /copy\.suggestionInput/);
  assert.match(panel, /copy\.targetInput/);
  assert.match(panel, /copy\.evidenceInput/);
  assert.match(panel, /message === copy\.textTooLong/);
  assert.doesNotMatch(panel, /setError\(err instanceof Error \? err\.message/);
  assert.match(printPage, /exportReview\(reviewId, token\)/);
  assert.match(printPage, /const sourceReviewId = detail\.practice/);
  assert.match(printPage, /getReview\(sourceReviewId, token\)/);
  assert.match(printPage, /source\.photo_url && source\.viewer_is_owner/);
  assert.match(printPage, /getPracticeSession\(detail\.practice\.session_id, token\)/);
  assert.doesNotMatch(printPage, /<main|<\/main>|createReview|generation|PDF|pdf/i);
  assert.doesNotMatch(printPage, /<pre/);
  assert.match(printPage, /downloadMarkdown/);
  assert.match(printPage, /buildReviewExportFileStem/);
  assert.match(printPage, /hasGoalEvidence/);
  assert.match(printPage, /copy\.printAdvantageTitle/);
  assert.match(printPage, /copy\.printIssueTitle/);
  assert.match(printPage, /copy\.printImprovementTitle/);
  assert.match(printPage, /\{hasGoalEvidence && \(/);
  assert.match(printPage, /model\.evidenceLabel/);
  assert.doesNotMatch(printPage, /copy\.suggestionInput/);
  assert.match(canvas, /Math\.min\(width \/ image\.naturalWidth, height \/ image\.naturalHeight\)/);
  assert.doesNotMatch(canvas, /crossOrigin/);
  assert.match(canvas, /shouldAttachBearerForImageFetch/);
  assert.match(canvas, /getReviewExportCanvasLayout/);
  assert.match(canvas, /shouldDrawEvidenceBadge/);
  assert.doesNotMatch(canvas, /const badgeY = 1320/);
  assert.doesNotMatch(canvas, /reviewId\.slice/);
  assert.match(canvas, /model\.evidenceLines/);
  assert.match(canvas, /copy\.editedExcerptNotice/);
  assert.match(copyText, /保存这次点评/);
  assert.match(copyText, /标签和私人备注不会导出/);
  assert.match(copyText, /优点/);
  assert.match(copyText, /问题/);
  assert.match(copyText, /改进建议/);
});

test('authorized image fetch only attaches bearer to trusted API paths', () => {
  const originalWindow = globalThis.window;
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;
  Object.defineProperty(globalThis, 'window', {
    value: { location: { origin: 'https://app.example.test' } },
    configurable: true,
  });
  process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test';
  try {
    assert.equal(shouldAttachBearerForImageFetch('https://api.example.test/api/v1/photos/private'), true);
    assert.equal(shouldAttachBearerForImageFetch('https://cdn.example.test/api/v1/photos/private'), false);
    assert.equal(shouldAttachBearerForImageFetch('https://api.example.test/public/image.jpg'), false);
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    process.env.NEXT_PUBLIC_API_URL = originalEnv;
  }
});
