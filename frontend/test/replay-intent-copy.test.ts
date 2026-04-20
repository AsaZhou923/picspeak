import test from 'node:test';
import assert from 'node:assert/strict';
import { getReplayIntentCopy } from '../src/lib/replay-intent-copy.ts';

test('zh replay copy makes same-photo rerun conditional on actual edits', () => {
  const copy = getReplayIntentCopy('zh');

  assert.match(copy.workspaceTitle, /如果你已经改过这张图/);
  assert.match(copy.workspaceBody, /如果这张图还没改过/);
  assert.match(copy.samePhotoPanelBody, /已经调过/);
  assert.match(copy.newPhotoPanelBody, /重拍比同图复评更有意义/);
});

test('en replay copy frames same-photo rerun as edit verification only', () => {
  const copy = getReplayIntentCopy('en');

  assert.match(copy.workspaceBody, /only useful/i);
  assert.match(copy.workspaceBody, /after you already changed/i);
  assert.match(copy.newPhotoPanelTitle, /retake/i);
});
