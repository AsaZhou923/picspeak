import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildReviewExportCardModel,
  buildReviewPrintMarkdown,
  compactExportSentence,
  getReviewExportCardCopy,
  stripPrivateExportText,
} from '../src/features/reviews/helpers/reviewExportPresentation.ts';
import { getWrappedLines, shouldAttachBearerForImageFetch } from '../src/features/reviews/helpers/reviewExportCanvas.ts';
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

test('review export helpers redact private text without rewriting meaningful negatives', () => {
  const redacted = stripPrivateExportText('Email x@example.com. GPS: 35.0,139.0. Do not crop the hand.');
  assert.doesNotMatch(redacted, /x@example\.com|35\.0,139\.0/);
  assert.match(redacted, /Do not crop the hand/);
  const longText = 'Do not remove the shadow. '.repeat(20);
  assert.equal(compactExportSentence(longText, 80), longText.trim());
});

test('single-card model omits notes and EXIF while allowing score hiding', () => {
  const model = buildReviewExportCardModel({ review: baseReview, locale: 'en', showScore: false });

  assert.equal(model.mode, 'single');
  assert.equal(model.evidenceState, 'unassessed');
  assert.equal(model.evidenceLabel, 'No recorded goal assessment');
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
  assert.match(markdown, /Keep the subject centered/);
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
  assert.match(panel, /readOnly/);
  assert.match(panel, /copy\.noFrozenGoal/);
  assert.match(panel, /excerptEdited: true/);
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
  assert.match(canvas, /Math\.min\(width \/ image\.naturalWidth, height \/ image\.naturalHeight\)/);
  assert.doesNotMatch(canvas, /crossOrigin/);
  assert.match(canvas, /shouldAttachBearerForImageFetch/);
  assert.match(canvas, /throw new Error\(copy\.textTooLong\)/);
  assert.match(canvas, /model\.evidenceLines/);
  assert.match(canvas, /copy\.editedExcerptNotice/);
  assert.match(copyText, /不自动创建公开分享链接/);
  assert.match(copyText, /摘录/);
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
