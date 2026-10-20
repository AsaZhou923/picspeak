import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { prepareReviewRequest, completeReviewRequest } from '../src/features/workspace/review-request.ts';
import type { ReviewCreateRequest } from '../src/lib/types.ts';

const payload: ReviewCreateRequest = {
  photo_id: 'private-photo', mode: 'flash', review_model: 'gpt-6-sol', async: true,
  locale: 'en', image_type: 'default', analysis_type: 'single',
};

test('review response-loss retries and simultaneous preparations preserve key and exact body', async () => {
  const [first, repeated] = await Promise.all([
    prepareReviewRequest('retry-owner', payload), prepareReviewRequest('retry-owner', payload),
  ]);
  assert.equal(first.isRetry, false);
  assert.equal(repeated.isRetry, true);
  assert.deepEqual(repeated.payload, first.payload);
  assert.deepEqual((await prepareReviewRequest('retry-owner', { ...payload, locale: 'ja' })).payload, first.payload);
  completeReviewRequest(first);
  assert.notEqual((await prepareReviewRequest('retry-owner', payload)).payload.idempotency_key, first.payload.idempotency_key);
});

test('review owner, photo, mode, image intent and retake source separate pending requests', async () => {
  const first = await prepareReviewRequest('scope-owner', payload);
  for (const change of [
    { photo_id: 'different-photo' }, { mode: 'pro' }, { review_model: 'gpt-6.1-sol' },
    { image_type: 'portrait' }, { source_review_id: 'original-review', analysis_type: 'retake_compare' },
  ] as Array<Partial<ReviewCreateRequest>>) {
    assert.notEqual((await prepareReviewRequest('scope-owner', { ...payload, ...change })).payload.idempotency_key, first.payload.idempotency_key);
  }
  assert.notEqual((await prepareReviewRequest('other-owner', payload)).payload.idempotency_key, first.payload.idempotency_key);
});

test('page reload restores pending review without persisting private photo IDs or owner tokens', async () => {
  const storage = new Map<string, string>();
  const sessionStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
  const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/features/workspace/review-request.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const load = () => {
    const exports: Record<string, any> = {};
    vm.runInNewContext(compiled, { exports, crypto, TextEncoder, window: { sessionStorage } });
    return exports;
  };
  const first = await load().prepareReviewRequest('private-auth-token', payload);
  assert.ok(storage.size);
  assert.doesNotMatch(JSON.stringify([...storage]), /private-photo|private-auth-token/);
  const reloaded = load();
  const retry = await reloaded.prepareReviewRequest('private-auth-token', { ...payload, locale: 'zh' });
  assert.equal(retry.payload.idempotency_key, first.payload.idempotency_key);
  assert.equal(retry.payload.locale, 'en');
  assert.equal(retry.isRetry, true);
  reloaded.completeReviewRequest(retry);
  assert.equal(storage.size, 0);
});
