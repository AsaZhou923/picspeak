import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, settle } from './helpers/component-harness.ts';
import { createAuthOwnerState } from './helpers/auth-owner-state.ts';
import * as reviewRequest from '../src/features/workspace/review-request.ts';
import * as workspaceTaskFlow from '../src/features/workspace/workspaceTaskFlow.ts';

class ApiException extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function harness(create: (payload: any, token: string) => Promise<any>, initialOwner?: string, createPractice?: (payload: any, token: string) => Promise<any>) {
  let locale = 'en';
  const authState = createAuthOwnerState(initialOwner ?? `workspace-${crypto.randomUUID()}`);
  let stage = 'ready';
  let errMessage = '';
  let remainingQuota: number | null = 20;
  let softReached = false;
  let currentPlan: 'guest' | 'pro' = 'pro';
  let freshUsage: any = null;
  const usageRefreshCalls: any[] = [];
  let photo: any = { photo_id: 'photo-a', status: 'READY' };
  let preview: string | null = 'local-preview';
  const pushed: string[] = [];
  const replaced: string[] = [];
  const auth = authState.read;
  const modules: Record<string, any> = {
    'next/image': { default: 'Image' }, 'next/link': { default: 'Link' }, 'lucide-react': {},
    'next/navigation': { useRouter: () => ({ push: (path: string) => pushed.push(path), replace: (path: string) => replaced.push(path) }) },
    '@/lib/auth-context': { useAuth: auth }, '@/lib/i18n': { useI18n: () => ({ locale, t: (key: string) => `${locale}:${key}` }) },
    '@/lib/api': { createReview: create, createPracticeSession: createPractice, getReview: async () => ({ photo_url: '/source' }), getPracticeConfig: async () => ({ practice_enabled: Boolean(createPractice) }), isAbortError: () => false },
    '@/lib/types': { ApiException },
    '@/lib/error-utils': { formatUserFacingError: () => 'localized-error' },
    '@/lib/product-analytics': { trackProductEvent() {} },
    '@/lib/retake-coach': { resolveReviewAnalysisType: () => 'single' },
    '@/lib/retake-coach-copy': { getRetakeCoachCopy: () => ({ dimensions: {} }) },
    '@/features/workspace/hooks/useWorkspaceUsage': { useWorkspaceUsage: () => ({ usage: { plan: currentPlan, quota: { monthly_soft_limit: 150, monthly_soft_used: softReached ? 151 : 0, monthly_soft_reached: softReached } }, async fetchUsage(options: any) { usageRefreshCalls.push(options); const result = await freshUsage; if (result?.plan === 'guest') remainingQuota = Math.min(result.quota.daily_remaining, result.quota.monthly_remaining); return result; }, currentPlan, isGuest: currentPlan === 'guest', remainingQuota, totalQuota: remainingQuota === null ? null : 20 }) },
    '@/features/workspace/hooks/useUploadFlow': { useUploadFlow: () => ({ photo, preview, stage, errMessage, setStage(value: string) { stage = value; }, setErrMessage(value: string) { errMessage = value; }, handleFileSelected() {}, handleReset() { stage = 'idle'; errMessage = ''; preview = null; photo = null; } }) },
    '@/features/workspace/hooks/useReplayContext': { useReplayContext: () => ({ clearReplay() {}, ...(createPractice ? { sourceReviewId: 'review-source', nextShootAction: 'Keep the background clear', nextShootDimension: 'composition' } : {}) }) },
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
  return { ...app, render, submit, pushed, replaced, usageRefreshCalls, get owner() { return authState.owner; }, get stage() { return stage; },
    changeOwner(value: string, rerender = true) { authState.changeOwner(value); if (rerender) render(); },
    refreshToken() { authState.refreshToken(); },
    holdToken(value: Promise<string> | null) { authState.holdToken(value); }, changeLocale(value: string) { locale = value; render(); },
    acceptPractice() { return app.nodes((node) => node.type === 'button' && node.props.children === 'Save this goal')[0].props.onClick(); },
    setQuota(value: number) { remainingQuota = value; render(); },
    reachProReminder() { remainingQuota = null; softReached = true; render(); },
    staleGuestQuota(fresh: any) { currentPlan = 'guest'; remainingQuota = 1; freshUsage = fresh; render(); },
    changeMode(value: string) { app.nodes((node) => node.type === 'WorkspaceSettingsPanel')[0].props.onReviewModeChange(value); render(); },
  };
}

test('workspace still submits a Pro critique after the server monthly reminder is reached', async () => {
  const calls: any[] = [];
  const app = harness(async (payload) => { calls.push(payload); return { task_id: 'after-soft-reminder' }; });
  app.render(); await settle(); app.render();
  app.reachProReminder();
  const quotaBanner = app.nodes((node) => node.type === 'QuotaBanner')[0];
  assert.equal(quotaBanner.props.usage.quota.monthly_soft_used, 151);
  assert.equal(quotaBanner.props.usage.quota.monthly_soft_reached, true);
  await app.submit();
  assert.equal(calls.length, 1);
  assert.deepEqual(app.pushed, ['/tasks/after-soft-reminder?mode=flash']);
  assert.equal(app.nodes((node) => node.type === 'QuotaModal').length, 0);
});

for (const code of ['RATE_LIMIT_EXCEEDED', 'QUOTA_EXCEEDED']) test(`workspace refreshes stale Guest usage after ${code} and offers Free only when exhausted`, async () => {
  const app = harness(async () => { throw new ApiException(code === 'QUOTA_EXCEEDED' ? 403 : 429, code, 'private provider reason'); });
  app.render(); await settle(); app.render();
  app.staleGuestQuota({ plan: 'guest', quota: { daily_remaining: 0, monthly_remaining: 29 } });
  await app.submit(); app.render();
  assert.equal(app.usageRefreshCalls.length, 1);
  assert.equal(app.usageRefreshCalls[0].force, true);
  assert.equal(app.nodes((node) => node.type === 'QuotaModal')[0].props.plan, 'guest');
  assert.equal(app.nodes((node) => node.type === 'QuotaBanner')[0].props.remainingQuota, 0);
  assert.equal(app.stage, 'ready');
});

for (const fresh of [null, { plan: 'guest', quota: { daily_remaining: 1, monthly_remaining: 29 } }]) test(`workspace minute limiting does not claim Guest allowance is exhausted when usage is ${fresh ? 'available' : 'unknown'}`, async () => {
  const app = harness(async () => { throw new ApiException(429, 'RATE_LIMIT_EXCEEDED', 'private provider reason'); });
  app.render(); await settle(); app.render();
  app.staleGuestQuota(fresh);
  await app.submit(); app.render();
  assert.equal(app.usageRefreshCalls.length, 1);
  assert.equal(app.nodes((node) => node.type === 'QuotaModal').length, 0);
  assert.equal(app.stage, 'ready');
});

test('workspace ignores late quota recovery after a confirmed account switch', async () => {
  const fresh = deferred<any>();
  const app = harness(async () => { throw new ApiException(429, 'RATE_LIMIT_EXCEEDED', 'private provider reason'); });
  app.render(); await settle(); app.render();
  app.staleGuestQuota(fresh.promise);
  const request = app.submit();
  await settle();
  app.changeOwner('another-account', false);
  fresh.resolve({ plan: 'guest', quota: { daily_remaining: 0, monthly_remaining: 29 } });
  await request; app.render();
  assert.equal(app.nodes((node) => node.type === 'QuotaModal').length, 0);
});

test('Pro per-minute limiting refreshes usage and keeps recovery separate from Guest sign-up', async () => {
  const app = harness(async () => { throw new ApiException(429, 'PRO_REVIEW_RATE_LIMITED', 'private provider reason'); });
  app.render(); await settle(); app.render();
  app.reachProReminder();
  await app.submit(); app.render();
  assert.equal(app.usageRefreshCalls[0].force, true);
  assert.equal(app.nodes((node) => node.type === 'QuotaModal').length, 0);
  assert.equal(app.stage, 'ready');
});

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

test('workspace retains its original request key when a matching critique is still in progress', async () => {
  const calls: any[] = [];
  const app = harness(async (payload) => {
    calls.push(payload);
    if (calls.length === 1) throw new ApiException(409, 'IDEMPOTENCY_IN_PROGRESS', 'private provider reason');
    return { task_id: 'same-request-finished' };
  });
  app.render(); await settle(); app.render();
  await app.submit(); app.render();
  assert.equal(app.stage, 'ready');
  await app.submit(); app.render();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].idempotency_key, calls[0].idempotency_key);
  assert.equal(JSON.stringify(calls[1]), JSON.stringify(calls[0]));
  assert.deepEqual(app.pushed, ['/tasks/same-request-finished?mode=flash']);
  assert.equal(app.nodes((node) => node.type === 'QuotaModal').length, 0);
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

test('workspace submits a retained photo with the same-owner renewed token', async () => {
  const tokens: string[] = [];
  const app = harness(async (_payload, token) => { tokens.push(token); return { task_id: 'renewed-review' }; });
  app.render(); await settle(); app.render();
  app.refreshToken();
  await app.submit();
  assert.deepEqual(tokens, [`${app.owner}-refreshed`]);
  assert.deepEqual(app.pushed, ['/tasks/renewed-review?mode=flash']);
  app.unmount();
});

for (const timing of ['during-auth', 'late-response'] as const) {
  test(`workspace rejects a confirmed owner switch ${timing} before React rerenders`, async () => {
    const authentication = deferred<string>();
    const result = deferred<any>(); const called = deferred<void>();
    let writes = 0;
    const app = harness(async () => { writes++; called.resolve(); return result.promise; });
    app.render(); await settle(); app.render();
    if (timing === 'during-auth') app.holdToken(authentication.promise);
    const submission = app.submit();
    if (timing === 'late-response') await called.promise;
    app.changeOwner('new-owner', false);
    authentication.resolve('new-owner-token'); result.resolve({ task_id: 'stale-review' });
    await submission;
    assert.equal(writes, timing === 'late-response' ? 1 : 0);
    assert.deepEqual(app.pushed, []);
    app.unmount();
  });
}

const practiceSession = { session_id: 'saved-goal', practice_kind: 'capture_retake', source_access: 'available', source_review_id: 'review-source', source_photo_id: 'photo-source', goal_snapshot: { goal: 'Keep the background clear', dimension: 'composition' }, success_criteria: [], attempts: [], locale: 'en' };

test('workspace goal save accepts same-owner renewed token and guards repeated clicks', async () => {
  const writes: string[] = []; const called = deferred<void>(); const saved = deferred<any>();
  const app = harness(async () => ({}), undefined, async (_payload, token) => { writes.push(token); called.resolve(); return saved.promise; });
  app.render(); await settle(); app.render(); app.refreshToken();
  app.acceptPractice(); app.acceptPractice(); await called.promise;
  assert.deepEqual(writes, [`${app.owner}-refreshed`]);
  saved.resolve(practiceSession); await settle(); app.render();
  assert.deepEqual(app.replaced, ['/workspace?practice_session_id=saved-goal']);
  app.unmount();
});

for (const timing of ['during-auth', 'late-response'] as const) {
  test(`workspace goal save rejects a confirmed owner switch ${timing} before React rerenders`, async () => {
    const authentication = deferred<string>(); const saved = deferred<any>(); const called = deferred<void>();
    let writes = 0;
    const app = harness(async () => ({}), undefined, async () => { writes++; called.resolve(); return saved.promise; });
    app.render(); await settle(); app.render();
    if (timing === 'during-auth') app.holdToken(authentication.promise);
    app.acceptPractice();
    if (timing === 'late-response') await called.promise;
    app.changeOwner('new-owner', false);
    authentication.resolve('new-owner-token'); saved.resolve({ ...practiceSession, session_id: 'old-account-session' });
    await settle();
    assert.equal(writes, timing === 'late-response' ? 1 : 0);
    assert.deepEqual(app.replaced, []);
    app.render();
    assert.doesNotMatch(app.text(), /old-account-session/);
    app.unmount();
  });
}

test('workspace review unlocks after a discarded A-to-B-to-A result without clearing a newer action', async () => {
  const result = deferred<any>(); const called = deferred<void>();
  let writes = 0;
  const app = harness(async () => { writes++; called.resolve(); return result.promise; });
  app.render(); await settle(); app.render();
  const first = app.submit(); await called.promise;
  const owner = app.owner; app.changeOwner('other-owner', false); app.changeOwner(owner, false);
  result.resolve({ task_id: 'recovered-review' }); await first; app.render();
  assert.deepEqual(app.pushed, []); assert.equal(app.stage, 'ready');
  await app.submit();
  assert.equal(writes, 2);
  assert.deepEqual(app.pushed, ['/tasks/recovered-review?mode=flash']);
  app.unmount();
});

test('workspace goal save unlocks after a discarded A-to-B-to-A result', async () => {
  const result = deferred<any>(); const called = deferred<void>(); let writes = 0;
  const app = harness(async () => ({}), undefined, async () => { writes++; called.resolve(); return result.promise; });
  app.render(); await settle(); app.render(); app.acceptPractice(); await called.promise;
  const owner = app.owner; app.changeOwner('other-owner', false); app.changeOwner(owner, false);
  result.resolve(practiceSession); await settle(); app.render();
  assert.deepEqual(app.replaced, []);
  app.acceptPractice(); await settle();
  assert.equal(writes, 2);
  assert.deepEqual(app.replaced, ['/workspace?practice_session_id=saved-goal']);
  app.unmount();
});
