import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReviewOrganizationPayload,
  buildReviewOrganizationHistoryPath,
  draftFromReviewOrganization,
  normalizeReviewOrganizationNote,
  normalizeReviewOrganizationTags,
  normalizeReviewSearchTags,
  normalizeReviewSearchText,
  reviewOrganizationDraftIsDirty,
  reviewOrganizationTagDraftStats,
} from '../src/features/reviews/reviewOrganization.ts';

test('review organization tags dedupe, trim, and cap private labels', () => {
  const tags = normalizeReviewOrganizationTags(`  Street, street
Night%_Literal # Portrait # Travel # Film # BW # City # Extra # Dropped  `);

  assert.deepEqual(tags, ['Street', 'Night%_Literal', 'Portrait', 'Travel', 'Film', 'BW', 'City', 'Extra']);
});

test('review organization note preserves explicit empty clear and enforces max length', () => {
  assert.equal(normalizeReviewOrganizationNote(`  Keep
more   shadow detail  `), 'Keep more shadow detail');
  assert.equal(buildReviewOrganizationPayload({ tagsText: '', note: '   ' }).note, '');
  assert.equal(normalizeReviewOrganizationNote('x'.repeat(1200)).length, 1000);
});

test('draft cancellation can restore persisted tags and note', () => {
  const persisted = draftFromReviewOrganization(['Street', 'Night'], 'Saved private note');
  const dirty = { ...persisted, tagsText: 'Other', note: 'Unsaved' };

  assert.notDeepEqual(dirty, persisted);
  assert.deepEqual(draftFromReviewOrganization(['Street', 'Night'], 'Saved private note'), persisted);
  assert.equal(reviewOrganizationDraftIsDirty(dirty, ['Street', 'Night'], 'Saved private note'), true);
  assert.equal(reviewOrganizationDraftIsDirty(persisted, ['Street', 'Night'], 'Saved private note'), false);
});

test('tag draft stats expose overflow instead of silently hiding dropped input', () => {
  const stats = reviewOrganizationTagDraftStats('one,two,three,four,five,six,seven,eight,nine,very-long-tag-name-that-exceeds-thirty-two-chars');

  assert.equal(stats.accepted.length, 8);
  assert.equal(stats.overLimitCount, 2);
  assert.equal(stats.tooLongCount, 1);
  assert.equal(stats.hasOverflow, true);
});

test('organized history path keeps cursor pagination and literal q/tag values', () => {
  const path = buildReviewOrganizationHistoryPath({
    limit: 20,
    cursor: 'cursor-1',
    q: '  100%_match  ',
    tag: normalizeReviewSearchTags('Street, Night%_Literal'),
  });

  assert.ok(path.startsWith('/me/reviews?'));
  assert.match(path, /cursor=cursor-1/);
  assert.match(path, /q=100%25_match/);
  assert.match(path, /tag=Street/);
  assert.match(path, /tag=Night%25_Literal/);
  assert.equal(normalizeReviewSearchText('x'.repeat(120)).length, 100);
});
