import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { prepareGenerationRequest, completeGenerationRequest } from '../src/features/generations/generation-request.ts';
import type { GenerationCreateRequest } from '../src/lib/types.ts';

const payload: GenerationCreateRequest = {
  generation_mode: 'general', intent: 'photo_inspiration', prompt: 'a private portrait prompt',
  quality: 'low', size: '1024x1024', style: 'editorial', output_format: 'webp', async: true, locale: 'en',
};

test('uncertain retries and simultaneous preparation reuse one owner and intent key', async () => {
  const [first, doubleClick] = await Promise.all([
    prepareGenerationRequest('owner-retry', payload), prepareGenerationRequest('owner-retry', payload),
  ]);
  assert.equal(doubleClick.payload.idempotency_key, first.payload.idempotency_key);
  const afterFailure = await prepareGenerationRequest('owner-retry', payload);
  assert.deepEqual(afterFailure.payload, first.payload);
  const afterLanguageChange = await prepareGenerationRequest('owner-retry', { ...payload, locale: 'ja' });
  assert.deepEqual(afterLanguageChange.payload, first.payload, 'UI language cannot accidentally create or conflict with the uncertain request');
  completeGenerationRequest(first);
  const intentionalRepeat = await prepareGenerationRequest('owner-retry', payload);
  assert.notEqual(intentionalRepeat.payload.idempotency_key, first.payload.idempotency_key);
});

test('changes to owner, prompt, source, template, mode and settings isolate requests', async () => {
  const first = await prepareGenerationRequest('owner-scope', payload);
  for (const change of [
    { prompt: 'another portrait' }, { quality: 'medium' }, { size: '1024x1536' }, { style: 'cinematic' },
    { negative_prompt: 'no text' }, { output_format: 'png' }, { template_key: 'social_visual' },
    { generation_mode: 'review_linked', source_review_id: 'review-A', source_photo_id: 'photo-A' },
  ] as Array<Partial<GenerationCreateRequest>>) {
    const changed = await prepareGenerationRequest('owner-scope', { ...payload, ...change });
    assert.notEqual(changed.payload.idempotency_key, first.payload.idempotency_key);
  }
  const anotherOwner = await prepareGenerationRequest('another-owner', payload);
  assert.notEqual(anotherOwner.payload.idempotency_key, first.payload.idempotency_key);
  assert.equal((await prepareGenerationRequest('owner-scope', { ...payload })).payload.idempotency_key, first.payload.idempotency_key);
});

test('interrupted component/page reload recovers the pending key without saving private prompt/token', async () => {
  const storage = new Map<string, string>();
  const sessionStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
  const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/features/generations/generation-request.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const load = () => {
    const exports: Record<string, any> = {};
    vm.runInNewContext(compiled, { exports, crypto, TextEncoder, window: { sessionStorage } });
    return exports;
  };
  const first = await load().prepareGenerationRequest('owner-reload', payload);
  assert.ok(storage.size > 0);
  assert.doesNotMatch(JSON.stringify([...storage]), /private portrait|owner-reload/);
  const reloaded = load();
  const retry = await reloaded.prepareGenerationRequest('owner-reload', { ...payload, locale: 'zh' });
  assert.equal(retry.payload.idempotency_key, first.payload.idempotency_key);
  assert.equal(retry.payload.locale, 'en');
  reloaded.completeGenerationRequest(retry);
  assert.equal(storage.size, 0);
  assert.notEqual((await load().prepareGenerationRequest('owner-reload', payload)).payload.idempotency_key, first.payload.idempotency_key);
});
