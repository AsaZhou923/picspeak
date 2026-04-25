import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryGrowthSnapshot, buildNextShootChecklist } from '../src/lib/review-growth.ts';
import type { ReviewHistoryItem, ReviewScores } from '../src/lib/types.ts';

function makeScores(values: Partial<ReviewScores>): ReviewScores {
  return {
    composition: values.composition ?? 6,
    lighting: values.lighting ?? 6,
    color: values.color ?? 6,
    impact: values.impact ?? 6,
    technical: values.technical ?? 6,
  };
}

function makeHistoryItem(
  reviewId: string,
  createdAt: string,
  finalScore: number,
  scores: ReviewScores,
): ReviewHistoryItem {
  return {
    review_id: reviewId,
    photo_id: `photo-${reviewId}`,
    photo_url: `https://example.com/${reviewId}.jpg`,
    photo_thumbnail_url: `https://example.com/${reviewId}.webp`,
    mode: 'flash',
    status: 'SUCCEEDED',
    image_type: 'street',
    source_review_id: null,
    final_score: finalScore,
    scores,
    model_name: 'test-model',
    model_version: '2026-04',
    favorite: false,
    gallery_visible: false,
    gallery_audit_status: 'none',
    gallery_added_at: null,
    tags: [],
    note: null,
    is_shared: false,
    created_at: createdAt,
  };
}

test('buildNextShootChecklist extracts short actionable titles from structured suggestions', () => {
  const checklist = buildNextShootChecklist(
    [
      '1. Observation: Foreground support is thin; Reason: the camera height removes near-frame layering; Action: Lower the camera and place a curb edge in the bottom 15% of frame.',
      '2. Observation: Highlights clip on the face; Reason: the backlight is stronger than the fill; Action: Dial exposure compensation to -0.7 EV and keep skin below the histogram peak.',
      '3. Observation: Subject separation is weak; Reason: the background brightness matches the coat; Action: Take two steps left so a darker wall sits behind the subject.',
    ].join('\n'),
  );

  assert.deepEqual(
    checklist.map((item) => item.title),
    [
      'Lower the camera',
      'Dial exposure compensation to -0.7 EV',
      'Take two steps left',
    ],
  );
  assert.match(checklist[0].detail, /bottom 15% of frame/i);
  assert.equal(checklist.length, 3);
});

test('buildHistoryGrowthSnapshot summarizes recent average trend and frequent weak dimensions', () => {
  const snapshot = buildHistoryGrowthSnapshot([
    makeHistoryItem('rev-6', '2026-04-18T10:00:00Z', 7.9, makeScores({ composition: 8, lighting: 6, color: 8, impact: 8, technical: 7 })),
    makeHistoryItem('rev-5', '2026-04-17T10:00:00Z', 7.4, makeScores({ composition: 7, lighting: 6, color: 7, impact: 8, technical: 7 })),
    makeHistoryItem('rev-4', '2026-04-16T10:00:00Z', 7.7, makeScores({ composition: 8, lighting: 7, color: 7, impact: 7, technical: 6 })),
    makeHistoryItem('rev-3', '2026-04-10T10:00:00Z', 6.4, makeScores({ composition: 6, lighting: 5, color: 6, impact: 7, technical: 6 })),
    makeHistoryItem('rev-2', '2026-04-08T10:00:00Z', 6.2, makeScores({ composition: 6, lighting: 5, color: 6, impact: 6, technical: 6 })),
    makeHistoryItem('rev-1', '2026-04-06T10:00:00Z', 5.8, makeScores({ composition: 5, lighting: 4, color: 6, impact: 6, technical: 5 })),
  ]);

  assert.equal(snapshot.recentItems.length, 3);
  assert.equal(snapshot.recentAverage, 7.7);
  assert.equal(snapshot.previousAverage, 6.1);
  assert.equal(snapshot.averageDelta, 1.6);
  assert.equal(snapshot.trend, 'up');
  assert.deepEqual(
    snapshot.weakDimensions.map((item) => item.key),
    ['lighting', 'technical', 'composition'],
  );
});
