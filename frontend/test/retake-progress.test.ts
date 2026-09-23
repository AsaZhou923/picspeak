import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLatestRetakeChainSnapshot,
  buildRetakePracticeSnapshot,
  latestRetakeChain,
} from '../src/lib/retake-progress.ts';
import type { RetakeComparisonResult, ReviewHistoryItem } from '../src/lib/types.ts';

function item(
  reviewId: string,
  createdAt: string,
  options: {
    source?: string;
    comparable?: boolean;
    confidence?: 'low' | 'medium' | 'high';
    scoreVersion?: string;
    before?: number;
    after?: number;
    delta?: number;
    savedGoal?: boolean;
  } = {}
): ReviewHistoryItem {
  return {
    review_id: reviewId,
    source_review_id: options.source,
    created_at: createdAt,
    score_version: options.scoreVersion ?? 'retake-paired-v1',
    comparison: options.comparable === undefined ? undefined : {
      original_review_id: options.source ?? `source-${reviewId}`,
      original_photo_id: `original-photo-${reviewId}`,
      retake_photo_id: `retake-photo-${reviewId}`,
      is_comparable: options.comparable,
      comparison_confidence: options.confidence ?? 'high',
      comparison_caveat: '',
      summary: '',
      dimensions: {} as RetakeComparisonResult['dimensions'],
      overall_before: options.before ?? 6,
      overall_after: options.after ?? 7,
      overall_delta: options.delta ?? ((options.after ?? 7) - (options.before ?? 6)),
      strongest_improvement: 'composition',
      next_actions: [],
      visual_reference_prompt: '',
      openai_response_id: '',
    },
    ...(options.savedGoal ? { practice_session_id: `session-${reviewId}` } : {}),
  } as ReviewHistoryItem;
}

test('buildRetakePracticeSnapshot returns independent newest-first practice records', () => {
  const snapshot = buildRetakePracticeSnapshot([
    item('rev_first', '2026-07-10T00:00:00Z', { source: 'root', comparable: true, before: 6.04, after: 7.06 }),
    item('rev_second', '2026-07-11T00:00:00Z', { source: 'rev_first', comparable: true, before: 5.2, after: 5.2 }),
  ]);

  assert.deepEqual(snapshot.records.map((record) => record.reviewId), ['rev_second', 'rev_first']);
  assert.equal(snapshot.records[0].before, 5.2);
  assert.equal(snapshot.records[0].after, 5.2);
  assert.equal(snapshot.records[0].delta, 0);
  assert.equal(snapshot.records[0].trend, 'flat');
  assert.equal(snapshot.records[1].before, 6);
  assert.equal(snapshot.records[1].after, 7.1);
  assert.equal(snapshot.records[1].delta, 1);
  assert.equal(snapshot.comparableCount, 2);
  assert.equal(snapshot.nonComparableCount, 0);
});

test('buildRetakePracticeSnapshot does not accumulate deltas across A to B and B to C requests', () => {
  const snapshot = buildRetakePracticeSnapshot([
    item('rev_b', '2026-07-10T00:00:00Z', { source: 'rev_a', comparable: true, before: 6, after: 8 }),
    item('rev_c', '2026-07-11T00:00:00Z', { source: 'rev_b', comparable: true, before: 5, after: 5.5 }),
  ]);

  assert.deepEqual(
    snapshot.records.map((record) => [record.reviewId, record.before, record.after, record.delta]),
    [
      ['rev_c', 5, 5.5, 0.5],
      ['rev_b', 6, 8, 2],
    ],
  );
});

test('buildRetakePracticeSnapshot preserves negative and tie outcomes', () => {
  const snapshot = buildRetakePracticeSnapshot([
    item('rev_down', '2026-07-12T00:00:00Z', { source: 'root', comparable: true, before: 7, after: 6.5 }),
    item('rev_tie', '2026-07-11T00:00:00Z', { source: 'root', comparable: true, before: 7, after: 7 }),
  ]);

  assert.equal(snapshot.records[0].delta, -0.5);
  assert.equal(snapshot.records[0].trend, 'declined');
  assert.equal(snapshot.records[1].delta, 0);
  assert.equal(snapshot.records[1].trend, 'flat');
});

test('buildRetakePracticeSnapshot keeps low-confidence and incomparable records visible', () => {
  const snapshot = buildRetakePracticeSnapshot([
    item('rev_low', '2026-07-15T00:00:00Z', { source: 'root', comparable: true, confidence: 'low' }),
    item('rev_rejected', '2026-07-14T00:00:00Z', { source: 'root', comparable: false }),
  ]);

  assert.deepEqual(snapshot.records.map((record) => record.comparability), ['low_confidence', 'incomparable']);
  assert.equal(snapshot.comparableCount, 0);
  assert.equal(snapshot.nonComparableCount, 2);
});

test('buildRetakePracticeSnapshot marks unknown versions and missing paired scores', () => {
  const missingPair = item('rev_missing_pair', '2026-07-15T00:00:00Z', { source: 'root', comparable: true });
  missingPair.comparison = {
    ...missingPair.comparison!,
    overall_after: Number.NaN,
  };

  const snapshot = buildRetakePracticeSnapshot([
    item('rev_unknown', '2026-07-16T00:00:00Z', { source: 'root', comparable: true, scoreVersion: 'legacy' }),
    missingPair,
  ]);

  assert.deepEqual(snapshot.records.map((record) => record.comparability), ['unknown_version', 'missing_pair_scores']);
  assert.equal(snapshot.unknownVersionCount, 1);
  assert.equal(snapshot.records[1].after, null);
  assert.equal(snapshot.records[1].delta, null);
});

test('buildRetakePracticeSnapshot reports missing saved goals without hiding old retake records', () => {
  const snapshot = buildRetakePracticeSnapshot([
    item('rev_old', '2026-07-15T00:00:00Z', { source: 'root', comparable: true }),
    item('rev_session', '2026-07-16T00:00:00Z', { source: 'root', comparable: true, savedGoal: true }),
  ]);

  assert.deepEqual(snapshot.records.map((record) => [record.reviewId, record.goalMissing]), [
    ['rev_session', false],
    ['rev_old', true],
  ]);
});

test('compatibility helpers expose comparable records without rebuilding a continuous score path', () => {
  const items = [
    item('rev_first', '2026-07-10T00:00:00Z', { source: 'root', comparable: true }),
    item('rev_second', '2026-07-11T00:00:00Z', { source: 'rev_first', comparable: true }),
    item('rev_low', '2026-07-12T00:00:00Z', { source: 'rev_second', comparable: true, confidence: 'low' }),
  ];
  const snapshot = buildLatestRetakeChainSnapshot(items);

  assert.deepEqual(latestRetakeChain(items).map((entry) => entry.review_id), ['rev_second', 'rev_first']);
  assert.deepEqual(snapshot.chain.map((entry) => entry.review_id), ['rev_second', 'rev_first']);
  assert.equal(snapshot.excludedVersionCount, 1);
});
