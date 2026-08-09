import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getWorkspaceTaskFlowCopy,
  resolveWorkspaceTaskStep,
} from '../src/features/workspace/workspaceTaskFlow.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const workspacePageSource = readFileSync(
  path.join(TEST_DIR, '..', 'src', 'app', 'workspace', 'page.tsx'),
  'utf8'
);

test('workspace task flow keeps the image, settings and submit hierarchy localized', () => {
  assert.deepEqual(getWorkspaceTaskFlowCopy('zh').steps, {
    image: '图片',
    settings: '意图与设置',
    submit: '提交',
  });
  assert.deepEqual(getWorkspaceTaskFlowCopy('en').steps, {
    image: 'Image',
    settings: 'Intent & settings',
    submit: 'Submit',
  });
  assert.deepEqual(getWorkspaceTaskFlowCopy('ja').steps, {
    image: '画像',
    settings: '目的と設定',
    submit: '送信',
  });

  assert.equal(resolveWorkspaceTaskStep('idle', false), 'image');
  assert.equal(resolveWorkspaceTaskStep('ready', true), 'settings');
  assert.equal(resolveWorkspaceTaskStep('reviewing', true), 'submit');
  assert.equal(resolveWorkspaceTaskStep('ready', true, true), 'submit');
});

test('workspace redesign preserves critique analytics, attribution and destinations', () => {
  assert.match(workspacePageSource, /trackProductEvent\('start_review_clicked'/);
  assert.equal(workspacePageSource.match(/trackProductEvent\('review_requested'/g)?.length, 2);
  assert.match(workspacePageSource, /pagePath: '\/workspace'/);

  for (const metadataField of [
    'review_mode',
    'review_model',
    'image_type',
    'has_source_review_id',
    'retake_intent',
    'next_shoot_action',
    'next_shoot_dimension',
    'source_generation_id',
    'content_entrypoint',
    'content_slug',
    'gallery_review_id',
    'prompt_example_id',
  ]) {
    assert.match(workspacePageSource, new RegExp(`${metadataField}:`), `missing ${metadataField}`);
  }

  assert.match(workspacePageSource, /const idempotencyKey = `\$\{activePhotoId\}-\$\{reviewMode\}-\$\{selectedReviewModel\}-\$\{Date\.now\(\)\}`/);
  assert.match(workspacePageSource, /idempotency_key: idempotencyKey/);
  assert.match(workspacePageSource, /\.\.\.\(sourceReviewId \? \{ source_review_id: sourceReviewId \} : \{\}\)/);
  assert.match(workspacePageSource, /router\.push\(`\/tasks\/\$\{asyncResult\.task_id\}\?mode=\$\{reviewMode\}`\)/);
  assert.match(workspacePageSource, /router\.push\(`\/reviews\/\$\{syncResult\.review_id\}`\)/);
});

test('workspace page uses the normal-flow shell without header compensation padding', () => {
  assert.match(workspacePageSource, /<WorkspaceTaskShell/);
  assert.doesNotMatch(workspacePageSource, /className="[^"]*\bpt-14\b/);
});
