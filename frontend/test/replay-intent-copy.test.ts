import test from 'node:test';
import assert from 'node:assert/strict';
import { getReplayIntentCopy } from '../src/lib/replay-intent-copy.ts';

test('zh replay copy requires uploading the edited file', () => {
  const copy = getReplayIntentCopy('zh');

  assert.match(copy.workspaceTitle, /上传修改后的照片/);
  assert.match(copy.workspaceBody, /修改后的新文件/);
  assert.match(copy.samePhotoPanelBody, /用新文件和原片做对比/);
  assert.match(copy.newPhotoPanelBody, /重拍比同图复评更有意义/);
});

test('en replay copy frames edit verification as a new upload', () => {
  const copy = getReplayIntentCopy('en');

  assert.match(copy.workspaceBody, /revised file/i);
  assert.match(copy.samePhotoPanelBody, /upload must be the revised file/i);
  assert.match(copy.newPhotoPanelTitle, /retake/i);
});
