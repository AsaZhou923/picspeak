import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, settle } from './helpers/component-harness.ts';
import { createAuthOwnerState } from './helpers/auth-owner-state.ts';

const snapshot = (plan = 'pro') => ({ plan, quota: { daily_total: null, daily_remaining: null, monthly_total: null, monthly_remaining: null, pro_monthly_total: null, pro_monthly_remaining: null } });

for (const outcome of ['success', 'error']) test(`usage hook discards a forced ${outcome} from the previous account before any state or plan write`, async () => {
  const owner = createAuthOwnerState('first');
  const pending = deferred<any>();
  const plans: string[] = [];
  const errors: any[] = [];
  let calls = 0;
  const syncPlan = (plan: string) => plans.push(plan);
  const app = componentHarness(new URL('../src/features/workspace/hooks/useWorkspaceUsage.ts', import.meta.url), {
    '@/lib/auth-context': { useAuth: () => ({ ...owner.read(), syncPlan }) },
    '@/lib/api': { getUsage: async () => ++calls === 1 ? snapshot() : pending.promise, isAbortError: () => false },
    '@/lib/client-log': { logClientError: (...args: any[]) => errors.push(args) },
  });
  app.render('flash', 'useWorkspaceUsage'); await settle();
  const view: any = app.render('flash', 'useWorkspaceUsage');
  assert.equal(view.usage.plan, 'pro');
  const refresh = view.fetchUsage({ force: true }); await settle();
  owner.changeOwner('second');
  if (outcome === 'success') pending.resolve(snapshot('guest'));
  else pending.reject(Error('obsolete request failed'));
  assert.equal(await refresh, null);
  assert.deepEqual(plans, ['pro']);
  assert.deepEqual(errors, []);
  const changed: any = app.render('flash', 'useWorkspaceUsage');
  assert.equal(changed.usage, null);
  assert.equal(changed.usageError, false);
  app.unmount();
});

test('usage hook accepts a same-account token renewal while its forced refresh is pending', async () => {
  const owner = createAuthOwnerState('same');
  const pending = deferred<any>();
  const plans: string[] = [];
  let calls = 0;
  const syncPlan = (plan: string) => plans.push(plan);
  const app = componentHarness(new URL('../src/features/workspace/hooks/useWorkspaceUsage.ts', import.meta.url), {
    '@/lib/auth-context': { useAuth: () => ({ ...owner.read(), syncPlan }) },
    '@/lib/api': { getUsage: async () => ++calls === 1 ? snapshot() : pending.promise, isAbortError: () => false },
    '@/lib/client-log': { logClientError() {} },
  });
  app.render('flash', 'useWorkspaceUsage'); await settle();
  const view: any = app.render('flash', 'useWorkspaceUsage');
  const refresh = view.fetchUsage({ force: true }); await settle();
  owner.refreshToken();
  pending.resolve(snapshot('free'));
  assert.equal((await refresh).plan, 'free');
  assert.deepEqual(plans, ['pro', 'free']);
  app.unmount();
});

test('initial Guest token creation can finish the first usage request', async () => {
  let userInfo: any = null;
  const plans: string[] = [];
  const ensureToken = async () => { userInfo = { user_id: 'guest-created', plan: 'guest', access_token: 'guest-token' }; return 'guest-token'; };
  const captureAuthOwner = (expected: string | null) => {
    const matches = (userInfo?.user_id ?? null) === expected;
    return () => matches && (expected === null ? !userInfo || userInfo.plan === 'guest' : userInfo?.user_id === expected);
  };
  const syncPlan = (plan: string) => plans.push(plan);
  const app = componentHarness(new URL('../src/features/workspace/hooks/useWorkspaceUsage.ts', import.meta.url), {
    '@/lib/auth-context': { useAuth: () => ({ userInfo, ensureToken, captureAuthOwner, isLoading: false, syncPlan }) },
    '@/lib/api': { getUsage: async () => snapshot('guest'), isAbortError: () => false },
    '@/lib/client-log': { logClientError() {} },
  });
  app.render('flash', 'useWorkspaceUsage'); await settle();
  assert.deepEqual(plans, ['guest']);
  const view: any = app.render('flash', 'useWorkspaceUsage'); await settle();
  assert.equal(view.currentPlan, 'guest');
  app.unmount();
});
