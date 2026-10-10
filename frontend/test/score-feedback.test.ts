import test from 'node:test';
import assert from 'node:assert/strict';
import { withdrawScoreFeedback, type ScoreFeedback } from '../src/lib/score-feedback.ts';

const feedback: ScoreFeedback = { feedback_id: 'my-record', verdict: 'too_low', state: 'active', feedback_version: 2 };

test('withdrawal recovers a newer personal version without needing the review or its score', async () => {
  const calls: unknown[] = [];
  await withdrawScoreFeedback(feedback, async (id, version) => {
    calls.push(['delete', id, version]);
    if (version === 2) throw { status: 409, code: 'SCORE_FEEDBACK_VERSION_CONFLICT' };
  }, async (id) => {
    calls.push(['get', id]);
    return { ...feedback, feedback_version: 5 };
  });
  assert.deepEqual(calls, [['delete', 'my-record', 2], ['get', 'my-record'], ['delete', 'my-record', 5]]);
});

test('a missing or already withdrawn personal record completes without rebuilding a snapshot', async () => {
  for (const alreadyMissing of [true, false]) {
    let attempts = 0;
    await withdrawScoreFeedback(feedback, async () => {
      attempts++;
      throw alreadyMissing ? { status: 404 } : { status: 409, code: 'SCORE_FEEDBACK_VERSION_CONFLICT' };
    }, async () => ({ ...feedback, state: 'withdrawn', feedback_version: 3 }));
    assert.equal(attempts, 1);
  }
});

test('withdrawal keeps authentication, aborted requests and repeated conflicts as failures', async () => {
  for (const failure of [{ status: 401 }, { name: 'AbortError' }, { status: 429 }]) {
    await assert.rejects(withdrawScoreFeedback(feedback, async () => { throw failure; }, async () => {
      assert.fail('unrelated failures must not trigger metadata recovery');
    }), (error) => error === failure);
  }
  let attempts = 0;
  const conflict = { status: 409, code: 'SCORE_FEEDBACK_VERSION_CONFLICT' };
  await assert.rejects(withdrawScoreFeedback(feedback, async () => { attempts++; throw conflict; }, async () => ({ ...feedback, feedback_version: 4 })), (error) => error === conflict);
  assert.equal(attempts, 2);
});
