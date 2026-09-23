import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPracticeReviewSemanticKey,
  buildPracticeSemanticKey,
  buildPracticeSuccessCriteria,
  clearPendingPracticeState,
  getWorkspaceTaskFlowCopy,
  makePracticeIdempotencyKey,
  readPendingPracticeState,
  resolveWorkspaceTaskStep,
  shouldReusePracticeReviewIdempotencyKey,
  writePendingPracticeState,
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
    'practice_session_id',
    'practice_kind',
  ]) {
    assert.match(workspacePageSource, new RegExp(`${metadataField}:`), `missing ${metadataField}`);
  }

  assert.match(workspacePageSource, /makePracticeIdempotencyKey\(\s*'practice_review'/);
  assert.match(workspacePageSource, /idempotency_key: idempotencyKey/);
  assert.match(workspacePageSource, /practice_session_id: session\.session_id/);
  assert.match(workspacePageSource, /practice_kind: session\.practice_kind/);
  assert.match(workspacePageSource, /session \? session\.source_review_id : sourceReviewId/);
  assert.doesNotMatch(workspacePageSource, /session\?\.source_review_id \?\? sourceReviewId/);
  assert.match(workspacePageSource, /if \(unresolvedPracticeSession\)/);
  assert.match(workspacePageSource, /photo && !savedPracticeClosed &&/);
  assert.match(workspacePageSource, /taskParams\.set\('practice_session_id', session\.session_id\)/);
  assert.match(workspacePageSource, /router\.push\(`\/reviews\/\$\{syncResult\.review_id\}`\)/);
});

test('workspace page uses the normal-flow shell without header compensation padding', () => {
  assert.match(workspacePageSource, /<WorkspaceTaskShell/);
  assert.doesNotMatch(workspacePageSource, /className="[^"]*\bpt-14\b/);
});

test('practice pending state generates unique idempotency keys and reuses saved retries', () => {
  class MemoryStorage {
    private readonly values = new Map<string, string>();
    getItem(key: string): string | null { return this.values.get(key) ?? null; }
    setItem(key: string, value: string): void { this.values.set(key, value); }
    removeItem(key: string): void { this.values.delete(key); }
  }

  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: new MemoryStorage() },
    configurable: true,
  });

  const semanticKey = buildPracticeSemanticKey({
    sourceReviewId: 'rev_1',
    goal: '  Move the subject away from the center  ',
    successCriteria: buildPracticeSuccessCriteria('Move the subject away from the center'),
    dimension: 'composition',
    practiceKind: 'capture_retake',
    locale: 'en',
  });
  const idempotency = makePracticeIdempotencyKey('practice_session', semanticKey);
  const secondIdempotency = makePracticeIdempotencyKey('practice_session', semanticKey);

  assert.match(idempotency, /^practice_session_/);
  assert.match(secondIdempotency, /^practice_session_/);
  assert.notEqual(secondIdempotency, idempotency);
  writePendingPracticeState({ semanticKey, sessionIdempotencyKey: idempotency });
  assert.equal(readPendingPracticeState()?.sessionIdempotencyKey, idempotency);
  const retryState = readPendingPracticeState();
  assert.equal(retryState?.semanticKey === semanticKey ? retryState.sessionIdempotencyKey : null, idempotency);
  clearPendingPracticeState('different');
  assert.equal(readPendingPracticeState()?.sessionIdempotencyKey, idempotency);
  clearPendingPracticeState(semanticKey);
  assert.equal(readPendingPracticeState(), null);
});

test('practice review idempotency only reuses matching request settings and session', () => {
  const key = buildPracticeReviewSemanticKey({
    sessionId: 'prs_1',
    photoId: 'photo_1',
    mode: 'flash',
    model: 'gpt-5.6-luna',
    imageType: 'portrait',
    locale: 'en',
  });
  const changedMode = buildPracticeReviewSemanticKey({
    sessionId: 'prs_1',
    photoId: 'photo_1',
    mode: 'pro',
    model: 'gpt-5.6-luna',
    imageType: 'portrait',
    locale: 'en',
  });
  const changedSession = buildPracticeReviewSemanticKey({
    sessionId: 'prs_2',
    photoId: 'photo_1',
    mode: 'flash',
    model: 'gpt-5.6-luna',
    imageType: 'portrait',
    locale: 'en',
  });
  const pending = {
    semanticKey: 'goal',
    reviewSemanticKey: key,
    sessionId: 'prs_1',
    sessionIdempotencyKey: 'practice_session_a',
    reviewIdempotencyKey: 'practice_review_a',
    photoId: 'photo_1',
  };

  assert.equal(shouldReusePracticeReviewIdempotencyKey(pending, key, []), true);
  assert.equal(shouldReusePracticeReviewIdempotencyKey(pending, changedMode, []), false);
  assert.equal(shouldReusePracticeReviewIdempotencyKey(pending, changedSession, []), false);
});

test('practice review idempotency reuses lost responses even after older completed same-photo attempts', () => {
  const key = buildPracticeReviewSemanticKey({
    sessionId: 'prs_1',
    photoId: 'photo_1',
    mode: 'flash',
    model: 'gpt-5.6-luna',
    imageType: 'portrait',
    locale: 'en',
  });

  assert.equal(
    shouldReusePracticeReviewIdempotencyKey(
      {
        semanticKey: 'goal',
        reviewSemanticKey: key,
        sessionId: 'prs_1',
        sessionIdempotencyKey: 'practice_session_a',
        reviewIdempotencyKey: 'practice_review_a',
        photoId: 'photo_1',
      },
      key,
      [{ task_id: 'old_task', review_id: 'rev_done', task_status: 'SUCCEEDED' }]
    ),
    true
  );
});

test('practice review idempotency rotates known terminal tasks and preserves unknown or open tasks', () => {
  const key = buildPracticeReviewSemanticKey({
    sessionId: 'prs_1',
    photoId: 'photo_1',
    mode: 'flash',
    model: 'gpt-5.6-luna',
    imageType: 'portrait',
    locale: 'en',
  });
  const pending = {
    semanticKey: 'goal',
    reviewSemanticKey: key,
    sessionId: 'prs_1',
    sessionIdempotencyKey: 'practice_session_a',
    reviewIdempotencyKey: 'practice_review_a',
    photoId: 'photo_1',
    taskId: 'task_1',
  };

  assert.equal(
    shouldReusePracticeReviewIdempotencyKey(pending, key, [{ task_id: 'task_1', review_id: 'rev_done', task_status: 'SUCCEEDED' }]),
    false
  );
  assert.equal(
    shouldReusePracticeReviewIdempotencyKey(pending, key, [{ task_id: 'task_1', review_id: null, task_status: 'FAILED' }]),
    false
  );
  assert.equal(
    shouldReusePracticeReviewIdempotencyKey(pending, key, [{ task_id: 'other_task', review_id: null, task_status: 'RUNNING' }]),
    true
  );
  assert.equal(
    shouldReusePracticeReviewIdempotencyKey(pending, key, [{ task_id: 'task_1', review_id: null, task_status: 'RUNNING' }]),
    true
  );
});
