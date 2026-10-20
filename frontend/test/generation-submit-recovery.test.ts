import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, settle } from './helpers/component-harness.ts';
import * as generationRequest from '../src/features/generations/generation-request.ts';

function harness(kind: 'general' | 'reference', create: (payload: any, token: string) => Promise<any>) {
  let locale = 'en';
  let owner = `submit-${kind}-${crypto.randomUUID()}`;
  const authFor = () => ({ userInfo: { user_id: owner, plan: 'pro' }, token: owner, isLoading: false, ensureToken: async () => owner });
  let auth = authFor();
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
  return { ...app, render, submit, prompt, edit, pushed, get owner() { return owner; },
    failNextNavigation() { failNavigation = true; },
    changeOwner(id: string) { owner = id; auth = authFor(); render(); },
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
