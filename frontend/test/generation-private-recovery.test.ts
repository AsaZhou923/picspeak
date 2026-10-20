import test from 'node:test';
import assert from 'node:assert/strict';
import * as generationRequest from '../src/features/generations/generation-request.ts';
import { componentHarness, deferred, settle } from './helpers/component-harness.ts';

import { createAuthOwnerState } from './helpers/auth-owner-state.ts';
const t = (key: string) => key;
const baseModules = {
  'next/image': { default: 'Image' }, 'next/link': { default: 'Link' },
  '@/features/generations/generation-request': generationRequest,
  'lucide-react': {}, '@/lib/i18n': { useI18n: () => ({ t, locale: 'en' }) },
  '@/lib/error-utils': { formatUserFacingError: () => 'localized-error' },
  '@/features/generations/generation-config': { formatGenerationOutputSpec: () => 'output' },
  '@/lib/locale': { localeToIntlLocale: () => 'en-US' },
};
const item = (id: string) => ({ generation_id: id, prompt: `private-${id}`, image_url: `https://example.test/${id}.webp`, created_at: '2026-10-20T00:00:00Z', metadata: {} });

function historyHarness(api: (token: string, query: { cursor?: string }) => Promise<any>) {
  const authState = createAuthOwnerState('owner');
  let auth = authState.read();
  const app = componentHarness(new URL('../src/app/account/generations/page.tsx', import.meta.url), {
    ...baseModules, '@/lib/api': { getMyGenerations: api }, '@/lib/auth-context': { useAuth: () => auth },
  });
  return { ...app,
    changeOwner(id: string, rerender = true) { authState.changeOwner(id); auth = authState.read(); if (rerender) app.render(); },
    refreshToken() { authState.refreshToken(); },
    holdToken(value: Promise<string> | null) { authState.holdToken(value); },
  };
}
const cards = (app: ReturnType<typeof historyHarness>) => app.nodes((node) => node.type === 'Link' && node.props.href?.startsWith('/generations/'));
const button = (app: { nodes: ReturnType<typeof componentHarness>['nodes'] }, label: string) => app.nodes((node) => node.type === 'button' && JSON.stringify(node.props.children).includes(label))[0];

test('pagination failure preserves cards/cursor; same-cursor retry is guarded and deduplicated', async () => {
  const calls: Array<string | undefined> = [];
  const second = deferred<any>();
  let fail = true;
  const app = historyHarness(async (_token, query) => {
    calls.push(query.cursor);
    if (!query.cursor) return { items: [item('one'), item('two')], next_cursor: 'cursor-2' };
    if (fail) { fail = false; throw Error('503'); }
    return second.promise;
  });
  app.render(); await settle(); app.render();
  assert.equal(cards(app).length, 2);
  button(app, 'generation_load_more').props.onClick(); await settle(); app.render();
  assert.equal(cards(app).length, 2);
  const retry = button(app, 'app_error_retry');
  assert.ok(retry);
  retry.props.onClick(); retry.props.onClick();
  await settle();
  assert.deepEqual(calls, [undefined, 'cursor-2', 'cursor-2']);
  second.resolve({ items: [item('two'), item('three')], next_cursor: null });
  await settle(); app.render();
  assert.equal(cards(app).length, 3);
  assert.equal(button(app, 'app_error_retry'), undefined);
});

test('first-page failure has a working inline retry and never claims the collection is empty', async () => {
  let calls = 0;
  const app = historyHarness(async () => { if (++calls === 1) throw Error('offline'); return { items: [item('recovered')], next_cursor: null }; });
  app.render(); await settle(); app.render();
  assert.doesNotMatch(app.text(), /generation_history_empty/);
  button(app, 'app_error_retry').props.onClick(); await settle(); app.render();
  assert.equal(cards(app).length, 1);
  assert.equal(calls, 2);
});

test('identity switch removes history immediately and ignores an old-owner late page', async () => {
  const oldPage = deferred<any>();
  const app = historyHarness(async (token, query) => token === 'owner-token'
    ? query.cursor ? oldPage.promise : { items: [item('old-owner')], next_cursor: 'later' }
    : { items: [item('new-owner')], next_cursor: null });
  app.render(); await settle(); app.render();
  button(app, 'generation_load_more').props.onClick(); await settle();
  app.changeOwner('other');
  assert.doesNotMatch(app.text(), /private-old-owner/);
  await settle(); app.render();
  oldPage.resolve({ items: [item('late-private-owner')], next_cursor: null });
  await settle(); app.render();
  assert.equal(cards(app).length, 1);
  assert.match(app.text(), /private-new-owner/);
  assert.doesNotMatch(app.text(), /late-private-owner|private-old-owner/);
});

function detailHarness(api: Record<string, any>) {
  const authState = createAuthOwnerState('owner');
  let auth = authState.read();
  let locale = 'en';
  let translation = t;
  const pushed: string[] = [];
  let failNavigation = false;
  let downloads = 0;
  const app = componentHarness(new URL('../src/app/generations/[generationId]/page.tsx', import.meta.url), {
    ...baseModules,
    'next/navigation': { useParams: () => ({ generationId: 'private-result' }), useRouter: () => ({ push: (path: string) => { if (failNavigation) { failNavigation = false; throw Error('navigation failed'); } pushed.push(path); } }) },
    '@/lib/api': api, '@/lib/auth-context': { useAuth: () => auth },
    '@/lib/i18n': { useI18n: () => ({ t: translation, locale }) },
    '@/lib/product-analytics': { readProductAttributionSource() {}, trackProductEvent() {} },
  }, {
    URL: { createObjectURL: () => { downloads++; return 'blob:test'; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
  });
  return { ...app, pushed, failNextNavigation() { failNavigation = true; }, get downloads() { return downloads; }, changeOwner: (id: string, rerender = true) => { authState.changeOwner(id); auth = authState.read(); if (rerender) app.render(); }, refreshToken() { authState.refreshToken(); }, holdToken(value: Promise<string> | null) { authState.holdToken(value); }, changeLocale: () => { locale = 'ja'; translation = (key: string) => key; app.render(); } };
}

test('private detail disappears on guest/owner change and rejects late responses', async () => {
  const late = deferred<any>();
  let calls = 0;
  const app = detailHarness({ getGeneration: async (_id: string, token: string) => {
    if (token === 'guest-token') throw Error('404');
    if (++calls > 1) return late.promise;
    return item('old-owner');
  } });
  app.render(); await settle(); app.render();
  assert.match(app.text(), /private-old-owner/);
  app.changeLocale(); await settle();
  app.changeOwner('guest');
  assert.doesNotMatch(app.text(), /private-old-owner/);
  late.resolve(item('stale-owner-response'));
  await settle(); app.render();
  assert.doesNotMatch(app.text(), /private-old-owner|stale-owner-response|generation_detail_download"/);
  assert.match(app.text(), /generation_detail_fetch_error/);
});

test('pending private downloads/reuse cannot act after identity changes; repeated clicks are guarded', async () => {
  const download = deferred<any>();
  const reuse = deferred<any>();
  const downloadStarted = deferred<void>();
  const reuseStarted = deferred<void>();
  let downloadCalls = 0;
  let reuseCalls = 0;
  const app = detailHarness({
    getGeneration: async (_id: string, token: string) => { if (token === 'guest-token') throw Error('404'); return item('old-owner'); },
    downloadGeneration: async () => { downloadCalls++; downloadStarted.resolve(); return download.promise; },
    reuseGeneration: async () => { reuseCalls++; reuseStarted.resolve(); return reuse.promise; },
  });
  app.render(); await settle(); app.render();
  const downloadButton = button(app, 'generation_detail_download');
  const reuseButton = button(app, 'generation_detail_reuse');
  downloadButton.props.onClick(); downloadButton.props.onClick();
  reuseButton.props.onClick(); reuseButton.props.onClick();
  await Promise.all([downloadStarted.promise, reuseStarted.promise]);
  assert.equal(downloadCalls, 1); assert.equal(reuseCalls, 1);
  app.changeOwner('guest');
  download.resolve({ blob: new Blob(['private']), filename: 'private.webp' });
  reuse.resolve({ task_id: 'old-owner-task' });
  await settle(); app.render();
  assert.equal(app.downloads, 0); assert.deepEqual(app.pushed, []);
});

test('reuse survives repeated response loss and remount with one key; confirmed navigation stays locked', async () => {
  const keys: string[] = [];
  const api = {
    getGeneration: async () => ({ ...item('repeat-source'), generation_mode: 'general', intent: 'photo_inspiration', quality: 'low', size: '1024x1024', output_format: 'webp', model_name: 'gpt-image-2' }),
    reuseGeneration: async (_id: string, _token: string, _source: string, key: string) => {
      keys.push(key);
      if (keys.length < 3) throw Error('committed response lost');
      return { task_id: 'one-paid-task' };
    },
  };
  const first = detailHarness(api);
  first.render(); await settle(); first.render();
  await button(first, 'generation_detail_reuse').props.onClick();
  first.render();
  await button(first, 'generation_detail_reuse').props.onClick();
  first.unmount();
  const returned = detailHarness(api);
  returned.render(); await settle(); returned.render();
  const reuse = button(returned, 'generation_detail_reuse');
  await reuse.props.onClick();
  await reuse.props.onClick();
  assert.equal(keys.length, 3);
  assert.ok(keys[0]?.startsWith('generation_'));
  assert.equal(new Set(keys).size, 1);
  assert.deepEqual(returned.pushed, ['/generation-tasks/one-paid-task']);
});


for (const reason of ['unmount', 'owner-switch'] as const) {
  test(`reuse: discarded late success after ${reason} retains the original key on return`, async () => {
    const accepted = deferred<any>();
    const called = deferred<void>();
    const keys: string[] = [];
    const api = {
      getGeneration: async () => ({ ...item(`abandoned-${reason}`), generation_mode: 'general', intent: 'photo_inspiration', quality: 'low', size: '1024x1024', output_format: 'webp', model_name: 'gpt-image-2' }),
      reuseGeneration: async (_id: string, _token: string, _source: string, key: string) => {
        keys.push(key); called.resolve();
        return keys.length === 1 ? accepted.promise : { task_id: 'same-reuse-task' };
      },
    };
    const first = detailHarness(api);
    first.render(); await settle(); first.render();
    const pending = button(first, 'generation_detail_reuse').props.onClick(); await called.promise;
    if (reason === 'unmount') first.unmount();
    else first.changeOwner('replacement-owner');
    accepted.resolve({ task_id: 'same-reuse-task' }); await pending;
    assert.deepEqual(first.pushed, []);
    if (reason === 'owner-switch') first.unmount();

    const returned = detailHarness(api);
    returned.render(); await settle(); returned.render();
    await button(returned, 'generation_detail_reuse').props.onClick();
    assert.equal(keys.length, 2);
    assert.equal(keys[1], keys[0], 'discarding an abandoned response must not permit a second paid task');
    assert.deepEqual(returned.pushed, ['/generation-tasks/same-reuse-task']);
    returned.unmount();
  });
}


test('reuse: failed navigation retains the accepted request key and unlocks retry', async () => {
  const keys: string[] = [];
  const app = detailHarness({
    getGeneration: async () => ({ ...item('navigation-failure'), generation_mode: 'general', intent: 'photo_inspiration', quality: 'low', size: '1024x1024', output_format: 'webp', model_name: 'gpt-image-2' }),
    reuseGeneration: async (_id: string, _token: string, _source: string, key: string) => { keys.push(key); return { task_id: 'accepted-reuse-task' }; },
  });
  app.render(); await settle(); app.render();
  app.failNextNavigation();
  await button(app, 'generation_detail_reuse').props.onClick(); app.render();
  assert.deepEqual(app.pushed, []);
  await button(app, 'generation_detail_reuse').props.onClick();
  assert.equal(keys.length, 2); assert.equal(keys[1], keys[0]);
  assert.deepEqual(app.pushed, ['/generation-tasks/accepted-reuse-task']);
  app.unmount();
});

test('generation history pagination accepts same-owner token renewal without losing existing cards', async () => {
  const tokens: string[] = [];
  const app = historyHarness(async (token, query) => {
    tokens.push(token);
    return query.cursor ? { items: [item('second')], next_cursor: null } : { items: [item('first')], next_cursor: 'next' };
  });
  app.render(); await settle(); app.render();
  app.refreshToken();
  button(app, 'generation_load_more').props.onClick(); await settle(); app.render();
  assert.deepEqual(tokens, ['owner-token', 'owner-refreshed']);
  assert.equal(cards(app).length, 2);
  app.unmount();
});

for (const action of ['download', 'reuse'] as const) {
  test(`${action} accepts same-owner bearer renewal before the auth rerender`, async () => {
    const tokens: string[] = [];
    const app = detailHarness({
      getGeneration: async () => ({ ...item('refresh-result'), generation_mode: 'general' }),
      downloadGeneration: async (_id: string, token: string) => { tokens.push(token); return { blob: new Blob(['private']), filename: 'private.webp' }; },
      reuseGeneration: async (_id: string, token: string) => { tokens.push(token); return { task_id: 'renewed-reuse' }; },
    });
    app.render(); await settle(); app.render(); app.refreshToken();
    await button(app, `generation_detail_${action}`).props.onClick();
    assert.deepEqual(tokens, ['owner-refreshed']);
    assert.equal(app.downloads, action === 'download' ? 1 : 0);
    assert.deepEqual(app.pushed, action === 'reuse' ? ['/generation-tasks/renewed-reuse'] : []);
    app.unmount();
  });

  for (const timing of ['during-auth', 'late-response'] as const) {
    test(`${action} rejects a confirmed owner switch ${timing} before React rerenders`, async () => {
      const authentication = deferred<string>(); const result = deferred<any>(); const called = deferred<void>();
      let requests = 0;
      const start = async () => { requests++; called.resolve(); return result.promise; };
      const app = detailHarness({ getGeneration: async () => ({ ...item('old-result'), generation_mode: 'general' }), downloadGeneration: start, reuseGeneration: start });
      app.render(); await settle(); app.render();
      if (timing === 'during-auth') app.holdToken(authentication.promise);
      const pending = button(app, `generation_detail_${action}`).props.onClick();
      if (timing === 'late-response') await called.promise;
      app.changeOwner('other-owner', false);
      authentication.resolve('other-owner-token');
      result.resolve(action === 'download' ? { blob: new Blob(['private']), filename: 'private.webp' } : { task_id: 'stale-task' });
      await pending;
      assert.equal(requests, timing === 'late-response' ? 1 : 0);
      assert.equal(app.downloads, 0); assert.deepEqual(app.pushed, []);
      app.unmount();
    });
  }
}

for (const action of ['download', 'reuse'] as const) {
  test(`${action} unlocks after a discarded A-to-B-to-A result`, async () => {
    const result = deferred<any>(); const called = deferred<void>(); let requests = 0;
    const start = async () => { requests++; called.resolve(); return result.promise; };
    const app = detailHarness({ getGeneration: async () => ({ ...item('retry-result'), generation_mode: 'general' }), downloadGeneration: start, reuseGeneration: start });
    app.render(); await settle(); app.render();
    const pending = button(app, `generation_detail_${action}`).props.onClick(); await called.promise;
    app.changeOwner('other-owner', false); app.changeOwner('owner', false);
    result.resolve(action === 'download' ? { blob: new Blob(['private']), filename: 'private.webp' } : { task_id: 'retry-task' });
    await pending; app.render();
    assert.equal(app.downloads, 0); assert.deepEqual(app.pushed, []);
    assert.equal(button(app, `generation_detail_${action}`).props.disabled, false);
    await button(app, `generation_detail_${action}`).props.onClick();
    assert.equal(requests, 2);
    app.unmount();
  });
}
