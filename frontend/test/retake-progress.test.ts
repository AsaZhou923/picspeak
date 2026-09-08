import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLatestRetakeChainSnapshot, latestRetakeChain } from '../src/lib/retake-progress.ts';
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
      overall_delta: (options.after ?? 7) - (options.before ?? 6),
      strongest_improvement: 'composition',
      next_actions: [],
      visual_reference_prompt: '',
      openai_response_id: '',
    },
  } as ReviewHistoryItem;
}

test('latestRetakeChain connects only comparable attempts from the same source chain', () => {
  const items = [
    item('rev_root', '2026-07-10T00:00:00Z'),
    item('rev_second', '2026-07-11T00:00:00Z', { source: 'rev_root', comparable: true }),
    item('rev_third', '2026-07-12T00:00:00Z', { source: 'rev_second', comparable: true }),
    item('rev_unrelated', '2026-07-14T00:00:00Z', { source: 'rev_other', comparable: true }),
    item('rev_rejected', '2026-07-15T00:00:00Z', { source: 'rev_third', comparable: false }),
  ];

  assert.deepEqual(latestRetakeChain(items).map((entry) => entry.review_id), [
    'rev_second',
    'rev_third',
  ]);
});

test('latestRetakeChain uses the most recent chain when lengths are equal', () => {
  const items = [
    item('rev_old', '2026-07-10T00:00:00Z', { source: 'root_old', comparable: true }),
    item('rev_new', '2026-07-15T00:00:00Z', { source: 'root_new', comparable: true }),
  ];

  assert.deepEqual(latestRetakeChain(items).map((entry) => entry.review_id), ['rev_new']);
});

test('latestRetakeChain returns no progress for non-comparable results', () => {
  const items = [item('rev_rejected', '2026-07-15T00:00:00Z', { source: 'root', comparable: false })];

  assert.deepEqual(latestRetakeChain(items), []);
});

test('latestRetakeChain excludes low-confidence comparisons from progress', () => {
  const items = [item('rev_uncertain', '2026-07-15T00:00:00Z', {
    source: 'root',
    comparable: true,
    confidence: 'low',
  })];

  assert.deepEqual(latestRetakeChain(items), []);
});

test('latestRetakeChain isolates the latest retake score version', () => {
  const items = [
    item('rev_v1_old', '2026-07-10T00:00:00Z', { source: 'root', comparable: true, scoreVersion: 'retake-paired-v1' }),
    item('rev_v2_new', '2026-07-11T00:00:00Z', { source: 'root', comparable: true, scoreVersion: 'retake-paired-v2' }),
  ];
  const snapshot = buildLatestRetakeChainSnapshot(items);

  assert.deepEqual(snapshot.chain.map((entry) => entry.review_id), ['rev_v2_new']);
  assert.equal(snapshot.scoreVersion, 'retake-paired-v2');
  assert.equal(snapshot.excludedVersionCount, 1);
});

test('latestRetakeChain returns no progress when the latest comparable retake lacks a version', () => {
  const snapshot = buildLatestRetakeChainSnapshot([
    item('rev_unknown', '2026-07-12T00:00:00Z', { source: 'root', comparable: true, scoreVersion: '' }),
    item('rev_v1', '2026-07-11T00:00:00Z', { source: 'root', comparable: true }),
  ]);

  assert.deepEqual(snapshot.chain, []);
  assert.equal(snapshot.scoreVersion, null);
  assert.equal(snapshot.excludedVersionCount, 2);
});

test('latestRetakeChain does not connect legacy or unknown retake versions', () => {
  const snapshot = buildLatestRetakeChainSnapshot([
    item('rev_legacy_new', '2026-07-12T00:00:00Z', { source: 'rev_legacy_old', comparable: true, scoreVersion: 'legacy' }),
    item('rev_legacy_old', '2026-07-11T00:00:00Z', { source: 'root', comparable: true, scoreVersion: 'legacy' }),
    item('rev_unknown', '2026-07-10T00:00:00Z', { source: 'root', comparable: true, scoreVersion: 'unknown' }),
  ]);

  assert.deepEqual(snapshot.chain, []);
  assert.equal(snapshot.scoreVersion, null);
  assert.equal(snapshot.excludedVersionCount, 3);
});

test('latestRetakeChain shares the history score-version normalizer', () => {
  const snapshot = buildLatestRetakeChainSnapshot([
    item('rev_v5_new', '2026-07-12T00:00:00Z', { source: 'rev_v5_old', comparable: true, scoreVersion: ' SCORE-V5-EVIDENCE-CALIBRATED ' }),
    item('rev_v5_old', '2026-07-11T00:00:00Z', { source: 'root', comparable: true, scoreVersion: 'score-v5-evidence-calibrated' }),
  ]);

  assert.deepEqual(snapshot.chain.map((entry) => entry.review_id), ['rev_v5_old', 'rev_v5_new']);
  assert.equal(snapshot.scoreVersion, 'score-v5-evidence-calibrated');
});

test('latestRetakeChain does not connect sibling retakes as one continuous curve', () => {
  const items = [
    item('rev_first', '2026-07-10T00:00:00Z', { source: 'root', comparable: true }),
    item('rev_second', '2026-07-11T00:00:00Z', { source: 'root', comparable: true }),
  ];

  assert.deepEqual(latestRetakeChain(items).map((entry) => entry.review_id), ['rev_second']);
});

test('latestRetakeChain requires paired comparison scores', () => {
  const items = [
    {
      ...item('rev_missing_pair', '2026-07-15T00:00:00Z', { source: 'root', comparable: true }),
      comparison: {
        ...item('rev_missing_pair', '2026-07-15T00:00:00Z', { source: 'root', comparable: true }).comparison!,
        overall_after: Number.NaN,
      },
    } as ReviewHistoryItem,
  ];

  assert.deepEqual(latestRetakeChain(items), []);
});
