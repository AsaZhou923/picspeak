import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, settle } from './helpers/component-harness.ts';
import { createAuthOwnerState } from './helpers/auth-owner-state.ts';
import * as generationRequest from '../src/features/generations/generation-request.ts';

function harness(kind: 'general' | 'reference', create: (payload: any, token: string) => Promise<any>, initialOwner?: string) {
  let locale = 'en';
  const authState = createAuthOwnerState(initialOwner ?? `submit-${kind}-${crypto.randomUUID()}`);
  let auth = authState.read();
  let t = (key: string) => `${locale}:${key}`;
  const pushed: string[] = [];
  let failNavigation = false;
  const templateCopyKey = (key: string) => ({ prompt: `${key}.prompt`, label: `${key}.label` });
  const modules: Record<string, any> = {
    'next/image': { default: 'Image' }, 'next/link': { default: 'Link' }, 'lucide-react': {},
    'next/navigation': { useRouter: () => ({ push: (path: string) => { if (failNavigation) { failNavigation = false; throw Error('navigation failed'); } pushed.push(path); } }) },
    '@clerk/nextjs': { SignInButton: 'SignInButton' },
    '@/components/auth/ClerkSignInTrigger': { default: 'SignInButton' },
    '@/lib/auth-context': { useAuth: () => auth }, '@/lib/i18n': { useI18n: () => ({ t, locale }) },
    '@/lib/api': { createGeneration: create, getGenerationTemplates: async () => ({ credits_table: { medium: { '1024x1536': 2, '1024x1024': 2 } } }), getMyGenerations: async () => ({ items: [] }) },
    '@/lib/types': { ApiException: class extends Error {} }, '@/lib/error-utils': { formatUserFacingError: () => 'localized-error' },
    '@/lib/product-analytics': { trackProductEvent() {}, readProductAttributionSource: () => undefined },
    '@/lib/hooks/useCreditPackCheckout': { useCreditPackCheckout: () => ({ busy: false }) }, '@/lib/pro-checkout': {},
    '@/features/generations/generation-request': generationRequest,
    '@/features/generations/generation-config': { getTemplateByKey: (key: string) => ({ key, intent: key }), estimateGenerationCredits: () => 2, formatGenerationOutputSpec: () => 'output' },
    '@/features/generations/generation-page-copy': { templateCopyKey, TEMPLATE_COPY_KEYS: { photo_inspiration: templateCopyKey('photo_inspiration') }, QUALITY_COPY_KEYS: { medium: { label: 'medium' }, low: { label: 'low' }, high: { label: 'high' } }, generationCtaKey: () => 'generate', interpolateGenerationCopy: (value: string) => value },
    '@/content/generation/prompt-examples': { getGenerationPromptExample() {} },
    '@/features/generations/components/PromptExampleGallery': { PromptExampleGallery: 'PromptExampleGallery' },
  };
  for (const component of ['GenerateFormPanel', 'GenerationPricingGrid', 'GeneratePageHeader']) modules[`@/features/generations/components/${component}`] = { default: component };
  const app = componentHarness(new URL(kind === 'general' ? '../src/app/generate/GeneratePageClient.tsx' : '../src/features/reviews/components/ReviewReferenceGenerationPanel.tsx', import.meta.url), modules);
  let props = { reviewId: 'review', photoId: 'photo', imageType: 'default', suggestions: 'isolate subject', plan: 'pro', locale };
  const render = () => app.render(props, kind === 'general' ? 'default' : 'ReviewReferenceGenerationPanel');
  const submit = () => app.nodes((node) => node.type === 'button' && JSON.stringify(node.props.children).includes(kind === 'general' ? ':generate' : 'review_reference_submit_cta'))[0].props.onClick();
  const prompt = () => kind === 'general'
    ? app.nodes((node) => node.type === 'GenerateFormPanel')[0].props.prompt
    : app.nodes((node) => node.type === 'textarea')[0].props.value;
  const edit = (value: string) => {
    if (kind === 'general') app.nodes((node) => node.type === 'GenerateFormPanel')[0].props.onPromptChange(value);
    else app.nodes((node) => node.type === 'textarea')[0].props.onChange({ target: { value } });
    render();
  };
  return { ...app, render, submit, prompt, edit, pushed, get owner() { return authState.owner; },
    failNextNavigation() { failNavigation = true; },
    changeOwner(id: string, rerender = true) { authState.changeOwner(id); auth = authState.read(); if (rerender) render(); },
    refreshToken(rerender = false) { authState.refreshToken(); auth = authState.read(); if (rerender) render(); },
    holdToken(value: Promise<string> | null) { authState.holdToken(value); },
    changeLocale(value: string) { locale = value; t = (key) => `${locale}:${key}`; props = { ...props, locale }; render(); },
    changeSource() { props = { ...props, reviewId: 'new-review', photoId: 'new-photo' }; render(); },
  };
}

for (const kind of ['general', 'reference'] as const) {
  test(`${kind} handler guards repeated clicks and retries an uncertain request with its original key/body`, async () => {
    const first = deferred<any>();
    const started = deferred<void>();
    const calls: any[] = [];
    const app = harness(kind, async (payload) => { calls.push(payload); started.resolve(); if (calls.length === 1) return first.promise; return { task_id: 'confirmed' }; });
    app.render(); await settle(); app.render();
    app.edit('my intentionally written prompt');
    const one = app.submit(); const repeated = app.submit();
    await started.promise;
    assert.equal(calls.length, 1);
    first.reject(Error('response lost'));
    await Promise.all([one, repeated]); app.render();
    app.changeLocale('ja');
    await app.submit();
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], calls[0]);
    assert.deepEqual(app.pushed, ['/generation-tasks/confirmed']);
    assert.equal(app.prompt(), 'my intentionally written prompt');
    // router.push does not unmount this harness: navigation is deliberately delayed.
    await app.submit();
    assert.equal(calls.length, 2, 'accepted navigation stays locked until the page actually leaves');
  });

  test(`${kind} handler ignores old-owner late outcomes even after switching away and back`, async () => {
    const response = deferred<any>();
    const called = deferred<void>();
    const app = harness(kind, async () => { called.resolve(); return response.promise; });
    app.render(); await settle(); app.render(); app.edit('private old owner intent');
    const first = app.submit(); await called.promise;
    const owner = app.owner;
    app.changeOwner('other-user'); app.changeOwner(owner);
    response.resolve({ task_id: 'stale-owner-task' });
    await first; app.render();
    assert.deepEqual(app.pushed, []);
  });
}

test('reference prompt translates untouched defaults but retains edited and cleared drafts; source/intent resets are deliberate', async () => {
  const app = harness('reference', async () => ({ task_id: 'task' }));
  app.render(); await settle(); app.render();
  assert.match(app.prompt(), /^en:/);
  app.changeLocale('ja'); assert.match(app.prompt(), /^ja:/);
  app.edit('user-authored reference'); app.changeLocale('zh'); assert.equal(app.prompt(), 'user-authored reference');
  app.edit(''); app.changeLocale('en'); assert.equal(app.prompt(), '');
  app.changeSource(); assert.match(app.prompt(), /^en:/);
  app.edit('other custom text');
  app.nodes((node) => node.type === 'button' && node.props['aria-pressed'] === false)[0].props.onClick();
  app.render(); assert.match(app.prompt(), /^en:/);
});


for (const kind of ['general', 'reference'] as const) {
  for (const reason of ['unmount', 'owner-switch'] as const) {
    test(`${kind}: discarded late success after ${reason} preserves the original paid request on return`, async () => {
      const accepted = deferred<any>();
      const called = deferred<void>();
      const calls: any[] = [];
      const create = async (payload: any) => {
        calls.push(payload);
        called.resolve();
        return calls.length === 1 ? accepted.promise : { task_id: 'same-paid-task' };
      };
      const first = harness(kind, create);
      first.render(); await settle(); first.render(); first.edit('keep this accepted private intent');
      const owner = first.owner;
      const pending = first.submit(); await called.promise;
      if (reason === 'unmount') first.unmount();
      else first.changeOwner('replacement-owner');
      accepted.resolve({ task_id: 'same-paid-task' }); await pending;
      assert.deepEqual(first.pushed, []);
      if (reason === 'owner-switch') first.unmount();

      const returned = harness(kind, create);
      returned.changeOwner(owner); await settle(); returned.render(); returned.edit('keep this accepted private intent');
      await returned.submit();
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[1], calls[0], 'a response never shown to this owner must not end the retry intent');
      assert.deepEqual(returned.pushed, ['/generation-tasks/same-paid-task']);
      returned.unmount();
    });
  }
}


for (const kind of ['general', 'reference'] as const) {
  test(`${kind}: a failed navigation leaves the accepted request recoverable and retry unlocked`, async () => {
    const calls: any[] = [];
    const app = harness(kind, async (payload) => { calls.push(payload); return { task_id: 'accepted-task' }; });
    app.render(); await settle(); app.render(); app.edit('navigate this intent once');
    app.failNextNavigation();
    await app.submit(); app.render();
    assert.deepEqual(app.pushed, []);
    await app.submit();
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], calls[0]);
    assert.deepEqual(app.pushed, ['/generation-tasks/accepted-task']);
    app.unmount();
  });
}

for (const kind of ['general', 'reference'] as const) {
  test(`${kind}: same-owner token renewal submits once with the fresh bearer before auth rerenders`, async () => {
    const tokens: string[] = [];
    const app = harness(kind, async (_payload, token) => { tokens.push(token); return { task_id: 'renewed-task' }; });
    app.render(); await settle(); app.render(); app.edit('retain my private prompt');
    app.refreshToken();
    await app.submit();
    assert.deepEqual(tokens, [`${app.owner}-refreshed`]);
    assert.deepEqual(app.pushed, ['/generation-tasks/renewed-task']);
    assert.equal(app.prompt(), 'retain my private prompt');
    app.unmount();
  });

  for (const timing of ['before-click', 'during-auth', 'late-response'] as const) {
    test(`${kind}: confirmed owner changes ${timing} abort even before the auth rerender`, async () => {
      const pendingToken = deferred<string>();
      const response = deferred<any>();
      const called = deferred<void>();
      let writes = 0;
      const app = harness(kind, async () => { writes++; called.resolve(); return response.promise; });
      app.render(); await settle(); app.render(); app.edit('old account decision');
      if (timing === 'before-click') app.changeOwner('new-owner', false);
      if (timing === 'during-auth') app.holdToken(pendingToken.promise);
      const submitting = app.submit();
      if (timing === 'late-response') await called.promise;
      const owner = app.owner;
      if (timing !== 'before-click') {
        app.changeOwner('new-owner', false);
        // Returning to A still represents a distinct session epoch.
        app.changeOwner(owner, false);
      }
      pendingToken.resolve(`${app.owner}-token`);
      response.resolve({ task_id: 'obsolete-task' });
      await submitting;
      assert.equal(writes, timing === 'late-response' ? 1 : 0);
      assert.deepEqual(app.pushed, []);
      if (timing !== 'before-click') {
        app.holdToken(null); app.render();
        await app.submit();
        assert.equal(writes, timing === 'late-response' ? 2 : 1, 'the surviving owner can retry after its old epoch is discarded');
      }
      app.unmount();
    });
  }
}

test('generation private prompt and negative prompt are cleared on registered account replacement, not bearer renewal', async () => {
  const app = harness('general', async () => ({ task_id: 'task' }));
  app.render(); await settle(); app.render(); app.edit('private user draft');
  app.nodes((node) => node.type === 'GenerateFormPanel')[0].props.onNegativePromptChange('private exclusion draft'); app.render();
  app.refreshToken(true);
  assert.equal(app.prompt(), 'private user draft');
  assert.equal(app.nodes((node) => node.type === 'GenerateFormPanel')[0].props.negativePrompt, 'private exclusion draft');
  app.changeOwner('different-registered-account');
  assert.doesNotMatch(app.text(), /private user draft|private exclusion draft/);
  assert.equal(app.nodes((node) => node.type === 'GenerateFormPanel')[0].props.negativePrompt, '');
  app.unmount();
});

test('generation guest draft survives deliberate initial sign-in', async () => {
  const app = harness('general', async () => ({ task_id: 'task' }), 'guest');
  app.render(); await settle(); app.render(); app.edit('guest draft to finish after sign-in');
  app.nodes((node) => node.type === 'GenerateFormPanel')[0].props.onNegativePromptChange('guest exclusions'); app.render();
  app.changeOwner('newly-signed-in-owner');
  assert.equal(app.prompt(), 'guest draft to finish after sign-in');
  assert.equal(app.nodes((node) => node.type === 'GenerateFormPanel')[0].props.negativePrompt, 'guest exclusions');
  app.unmount();
});
