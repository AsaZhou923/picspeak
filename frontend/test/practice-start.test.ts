import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPracticeStartRequest } from '../src/features/practice/start.ts';

const input = { sourceReviewId: 'review-original', goal: 'Keep detail in the bright sky', dimension: 'lighting' as const, kind: 'edit_revision' as const, locale: 'en' as const };

test('starting practice persists the chosen original, goal and new-photo path', () => {
  const payload = buildPracticeStartRequest(input);
  assert.equal(payload.source_review_id, 'review-original');
  assert.equal(payload.practice_kind, 'edit_revision');
  assert.deepEqual(payload.goal_snapshot, { goal_version: 'goal-assessment-v1', goal: input.goal, dimension: 'lighting' });
  assert.deepEqual(payload.success_criteria, [{ key: 'goal', label: input.goal }]);
  const capture = buildPracticeStartRequest({ ...input, kind: 'capture_retake', criteria: [{ key: 'edge', label: 'The subject edge remains separate' }] });
  assert.equal(capture.practice_kind, 'capture_retake');
  assert.equal(capture.success_criteria[0].key, 'edge');
});

test('practice start rejects a missing original, empty goal and unchanged-image retry', () => {
  assert.throws(() => buildPracticeStartRequest({ ...input, sourceReviewId: '' }));
  assert.throws(() => buildPracticeStartRequest({ ...input, goal: '  ' }));
  assert.throws(() => buildPracticeStartRequest({ ...input, goal: 'x'.repeat(501) }));
  // Runtime guard protects old/injected values as well as the two-option UI.
  assert.throws(() => buildPracticeStartRequest({ ...input, kind: 'same_image_recheck' as 'edit_revision' }));
});
