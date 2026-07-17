import test from 'node:test';
import assert from 'node:assert/strict';
import { latestRetakeChain } from '../src/lib/retake-progress.ts';
import type { ReviewHistoryItem } from '../src/lib/types.ts';

function item(
  reviewId: string,
  createdAt: string,
  options: { source?: string; comparable?: boolean; confidence?: 'low' | 'medium' | 'high' } = {}
): ReviewHistoryItem {
  return {
    review_id: reviewId,
    source_review_id: options.source,
    created_at: createdAt,
    comparison: options.comparable === undefined ? undefined : {
      is_comparable: options.comparable,
      comparison_confidence: options.confidence ?? 'high',
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
