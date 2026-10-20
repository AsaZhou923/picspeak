import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, settle } from './helpers/component-harness.ts';
import * as reviewRequest from '../src/features/workspace/review-request.ts';
import * as workspaceTaskFlow from '../src/features/workspace/workspaceTaskFlow.ts';

function harness(create: (payload: any, token: string) => Promise<any>, initialOwner?: string) {
  let locale = 'en';
  let owner = initialOwner ?? `workspace-${crypto.randomUUID()}`;
  let stage = 'ready';
  let errMessage = '';
  let remainingQuota = 20;
  let photo: any = { photo_id: 'photo-a', status: 'READY' };
  let preview: string | null = 'local-preview';
  const pushed: string[] = [];
  const auth = () => ({ token: owner, userInfo: { user_id: owner, plan: 'pro' }, ensureToken: async () => owner });
  const modules: Record<string, any> = {
    'next/image': { default: 'Image' }, 'next/link': { default: 'Link' }, 'lucide-react': {},
    'next/navigation': { useRouter: () => ({ push: (path: string) => pushed.push(path), replace() {} }) },
    '@/lib/auth-context': { useAuth: auth }, '@/lib/i18n': { useI18n: () => ({ locale, t: (key: string) => `${locale}:${key}` }) },
    '@/lib/api': { createReview: create, getPracticeConfig: async () => ({ practice_enabled: false }), isAbortError: () => false },
    '@/lib/types': { ApiException: class extends Error {} },
    '@/lib/error-utils': { formatUserFacingError: () => 'localized-error' },
    '@/lib/product-analytics': { trackProductEvent() {} },
    '@/lib/retake-coach': { resolveReviewAnalysisType: () => 'single' },
    '@/lib/retake-coach-copy': { getRetakeCoachCopy: () => ({ dimensions: {} }) },
    '@/features/workspace/hooks/useWorkspaceUsage': { useWorkspaceUsage: () => ({ usage: {}, fetchUsage() {}, currentPlan: 'pro', isGuest: false, remainingQuota, totalQuota: 20 }) },
    '@/features/workspace/hooks/useUploadFlow': { useUploadFlow: () => ({ photo, preview, stage, errMessage, setStage(value: string) { stage = value; }, setErrMessage(value: string) { errMessage = value; }, handleFileSelected() {}, handleReset() { stage = 'idle'; errMessage = ''; preview = null; photo = null; } }) },
    '@/features/workspace/hooks/useReplayContext': { useReplayContext: () => ({ clearReplay() {} }) },
    '@/features/workspace/review-request': reviewRequest,
    '@/features/workspace/workspaceTaskFlow': workspaceTaskFlow,
    '@/features/reviews/hooks/usePracticeExposure': { usePracticeExposure: () => null },
    '@/features/practice/journal': { canContinuePractice: () => true },
    '@/features/workspace/components/WorkspaceTaskShell': { WorkspaceTaskShell: (props: any) => ({ type: 'section', props: { children: [props.image, props.settings, props.submit] } }) },
  };
  for (const name of ['QuotaModal', 'QuotaBanner', 'RetakeWorkspaceIntro', 'WorkspaceSettingsPanel', 'WorkspaceSubmitPanel']) modules[`@/features/workspace/components/${name}`] = { [name]: name };
  for (const [path, name] of [['upload/ImageUploader', 'ImageUploader'], ['ui/LoadingSpinner', 'LoadingSpinner'], ['marketing/ProPromoCard', 'ProPromoCard']]) modules[`@/components/${path}`] = { default: name };
  const app = componentHarness(new URL('../src/app/workspace/page.tsx', import.meta.url), modules);
  const render = () => app.render();
  const submit = () => app.nodes((node) => node.type === 'WorkspaceSubmitPanel')[0].props.onSubmit();
  return { ...app, render, submit, pushed, get owner() { return owner; }, get stage() { return stage; },
    changeOwner(value: string) { owner = value; render(); }, changeLocale(value: string) { locale = value; render(); },
    setQuota(value: number) { remainingQuota = value; render(); },
    changeMode(value: string) { app.nodes((node) => node.type === 'WorkspaceSettingsPanel')[0].props.onReviewModeChange(value); render(); },
  };
}

test('workspace actual handler guards rapid clicks, preserves uncertain retry body, and locks accepted navigation', async () => {
  const response = deferred<any>();
  const called = deferred<void>();
  const calls: any[] = [];
  const app = harness(async (payload) => { calls.push(payload); called.resolve(); return calls.length === 1 ? response.promise : { task_id: 'confirmed' }; });
  app.render(); await settle(); app.render();
  const first = app.submit(); const duplicate = app.submit();
  await called.promise;
  assert.equal(calls.length, 1);
  response.reject(Error('committed response lost'));
  await Promise.all([first, duplicate]); app.render();
  assert.equal(app.stage, 'ready');
  app.changeLocale('ja');
  await app.submit(); app.render();
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(calls[1]), JSON.stringify(calls[0]));
  assert.deepEqual(app.pushed, ['/tasks/confirmed?mode=flash']);
  app.changeLocale('zh');
  await app.submit();
  assert.equal(calls.length, 2, 'accepted navigation remains locked across re-renders until unmount');
});

for (const reason of ['unmount', 'owner-switch'] as const) test(`workspace ignores a late request result after ${reason}`, async () => {
  const response = deferred<any>(); const called = deferred<void>();
  const app = harness(async () => { called.resolve(); return response.promise; });
  app.render(); await settle(); app.render();
  const first = app.submit(); await called.promise;
  if (reason === 'unmount') app.unmount();
  else {
    const original = app.owner;
    app.changeOwner('other-owner'); app.render();
    assert.equal(app.stage, 'idle', 'new owner is not stuck reviewing');
    assert.equal(app.nodes((node) => node.type === 'ImageUploader')[0].props.disabled, false, 'new owner can select their own photo');
    assert.equal(app.nodes((node) => node.type === 'WorkspaceSubmitPanel').length, 0, 'previous private photo is abandoned');
    app.changeOwner(original);
  }
  response.resolve({ task_id: 'stale-task' }); await first;
  assert.deepEqual(app.pushed, []);
});


test('workspace deliberate mode change after an uncertain request gets its own key', async () => {
  const calls: any[] = [];
  const app = harness(async (payload) => {
    calls.push(payload);
    if (calls.length === 1) throw Error('response lost');
    return { task_id: 'new-intent' };
  });
  app.render(); await settle(); app.render();
  await app.submit(); app.render();
  app.changeMode('pro');
  await app.submit();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].mode, 'pro');
  assert.equal(calls[1].review_model, 'gpt-6.1-sol');
  assert.notEqual(calls[1].idempotency_key, calls[0].idempotency_key);
  assert.deepEqual(app.pushed, ['/tasks/new-intent?mode=pro']);
});


test('workspace abandoned late success remains recoverable on remount with the original key', async () => {
  const response = deferred<any>(); const called = deferred<void>();
  const calls: any[] = [];
  const firstApp = harness(async (payload) => { calls.push(payload); called.resolve(); return response.promise; });
  firstApp.render(); await settle(); firstApp.render();
  const submission = firstApp.submit(); await called.promise;
  firstApp.unmount(); response.resolve({ task_id: 'accepted-before-leaving' }); await submission;
  assert.deepEqual(firstApp.pushed, []);
  const returnedApp = harness(async (payload) => { calls.push(payload); return { task_id: 'accepted-before-leaving' }; }, firstApp.owner);
  returnedApp.render(); await settle(); returnedApp.render();
  await returnedApp.submit();
  assert.equal(JSON.stringify(calls[1]), JSON.stringify(calls[0]));
  assert.deepEqual(returnedApp.pushed, ['/tasks/accepted-before-leaving?mode=flash']);
});


test('workspace can replay its persisted uncertain request after the last quota is consumed', async () => {
  const calls: any[] = [];
  const firstApp = harness(async (payload) => { calls.push(payload); throw Error('accepted response lost'); });
  firstApp.render(); await settle(); firstApp.render();
  await firstApp.submit(); firstApp.unmount();
  const returnedApp = harness(async (payload) => { calls.push(payload); return { task_id: 'already-charged' }; }, firstApp.owner);
  returnedApp.render(); await settle(); returnedApp.render(); returnedApp.setQuota(0);
  await returnedApp.submit();
  assert.equal(calls.length, 2, 'quota exhaustion must not stop a matching idempotent replay');
  assert.equal(JSON.stringify(calls[1]), JSON.stringify(calls[0]));
  assert.deepEqual(returnedApp.pushed, ['/tasks/already-charged?mode=flash']);
});

test('workspace exhausted quota blocks genuinely new intents even after repeated clicks', async () => {
  const calls: any[] = [];
  const app = harness(async (payload) => { calls.push(payload); return { task_id: 'should-not-submit' }; });
  app.render(); await settle(); app.render(); app.setQuota(0);
  await app.submit(); app.render(); await app.submit(); app.render();
  assert.equal(calls.length, 0);
  assert.equal(app.nodes((node) => node.type === 'QuotaModal').length, 1);
});

test('workspace exhausted quota cannot reuse an uncertain Flash intent for a new Pro request', async () => {
  const calls: any[] = [];
  const app = harness(async (payload) => { calls.push(payload); throw Error('response lost'); });
  app.render(); await settle(); app.render(); await app.submit(); app.render();
  app.changeMode('pro'); app.setQuota(0);
  await app.submit(); app.render(); await app.submit(); app.render();
  assert.equal(calls.length, 1);
  assert.equal(app.nodes((node) => node.type === 'QuotaModal').length, 1);
});
