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

test('usage hook exposes AUTH_UNAVAILABLE without falling back to guest when Clerk is unreachable (#108)', async () => {
  let getUsageCalled = false;
  const ensureToken = async () => {
    throw Object.assign(new Error('Sign-in service is unavailable'), {
      name: 'ApiException',
      status: 503,
      code: 'AUTH_UNAVAILABLE',
    });
  };
  const captureAuthOwner = () => () => true;
  const syncPlan = () => {};
  const app = componentHarness(new URL('../src/features/workspace/hooks/useWorkspaceUsage.ts', import.meta.url), {
    '@/lib/auth-context': { useAuth: () => ({ userInfo: null, ensureToken, captureAuthOwner, isLoading: false, syncPlan }) },
    '@/lib/api': {
      getUsage: async () => {
        getUsageCalled = true;
        return snapshot('guest');
      },
      isAbortError: () => false,
    },
    '@/lib/client-log': { logClientError() {} },
  });
  app.render('flash', 'useWorkspaceUsage');
  await settle();
  const view: any = app.render('flash', 'useWorkspaceUsage');
  assert.equal(getUsageCalled, false);
  assert.equal(view.usage, null);
  assert.equal(view.usageError, true);
  assert.equal(view.usageErrorCode, 'AUTH_UNAVAILABLE');
  app.unmount();
});

test('QuotaBanner shows localized AUTH_UNAVAILABLE message and retry button instead of quota load error (#108)', async () => {
  const { enTranslations } = await import('../src/lib/i18n-en.ts');
  const { zhTranslations } = await import('../src/lib/i18n-zh.ts');
  const { jaTranslations } = await import('../src/lib/i18n-ja.ts');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');
  const { readFile } = await import('node:fs/promises');
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const ts = (await import('typescript')).default;
  const req = createRequire(import.meta.url);
  const toUrl = (src: string, imports: Record<string, string> = {}) => {
    let code = ts.transpileModule(src, {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    for (const [spec, url] of Object.entries({
      'react/jsx-runtime': pathToFileURL(req.resolve('react/jsx-runtime')).href,
      ...imports,
    })) {
      code = code.replaceAll(`from '${spec}'`, `from ${JSON.stringify(url)}`).replaceAll(`from "${spec}"`, `from ${JSON.stringify(url)}`);
    }
    return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  };

  const { QuotaBanner } = await import(
    toUrl(await readFile(new URL('../src/features/workspace/components/QuotaBanner.tsx', import.meta.url), 'utf8'), {
      'lucide-react': toUrl('export const Info = () => null;'),
      '@/lib/auth-context': toUrl('export const planLabel = (plan) => plan; export const planColor = () => "";'),
      '@/components/ui/Badge': toUrl('export default function Badge({ children }) { return children; }'),
      '@/components/auth/ClerkSignInTrigger': toUrl('export default function ClerkSignInTrigger() { return null; }'),
      '@/components/auth/AuthUnavailableNotice': toUrl(
        await readFile(new URL('../src/components/auth/AuthUnavailableNotice.tsx', import.meta.url), 'utf8'),
      ),
      '@/components/billing/ProMonthlyUsageNotice': toUrl('export default function ProMonthlyUsageNotice() { return null; }'),
    }),
  );

  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    const t = (key: keyof typeof enTranslations) => dictionary[key];
    const outageHtml = renderToStaticMarkup(
      createElement(QuotaBanner, {
        usage: null,
        usageError: true,
        usageErrorCode: 'AUTH_UNAVAILABLE',
        remainingQuota: null,
        totalQuota: null,
        reviewMode: 'flash',
        t,
      }),
    );
    assert.ok(outageHtml.includes('role="alert"'));
    assert.ok(outageHtml.includes(dictionary.err_auth_unavailable_body));
    assert.ok(outageHtml.includes(`<button`), 'AUTH_UNAVAILABLE banner must render a retry button');
    assert.ok(outageHtml.includes(dictionary.app_error_retry));
    assert.ok(!outageHtml.includes(dictionary.usage_error), 'must not show generic quota load error');

    const genericErrorHtml = renderToStaticMarkup(
      createElement(QuotaBanner, {
        usage: null,
        usageError: true,
        usageErrorCode: 'INTERNAL_ERROR',
        remainingQuota: null,
        totalQuota: null,
        reviewMode: 'flash',
        t,
      }),
    );
    assert.ok(genericErrorHtml.includes(dictionary.usage_error));
    assert.ok(!genericErrorHtml.includes(dictionary.err_auth_unavailable_body));
  }
});
