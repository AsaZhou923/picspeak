import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Model the first render separately from passive effects: an outer auth provider
// may already be ready when React hydrates a delayed Gallery Suspense boundary.
function promo() {
  let cursor = 0;
  const states: any[] = [];
  const effects: (() => void)[] = [];
  const output: Record<string, any> = {};
  const jsx = (type: any, props: any) => ({ type, props });
  const copy = { title: 'Default public title', body: 'Default public description' };
  const modules: Record<string, any> = {
    react: {
      useState(initial: any) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (next: any) => { states[index] = next; }]; },
      useEffect(effect: () => void) { effects.push(effect); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'Link' }, 'lucide-react': {},
    '@/components/auth/ClerkSignInTrigger': { default: 'ClerkSignInTrigger' }, '@/components/billing/ActivationCodeModal': { default: 'ActivationCodeModal' },
    '@/lib/auth-context': { useAuth: () => ({ ensureToken: async () => 'free-token' }) },
    '@/lib/i18n': { useI18n: () => ({ locale: 'ja', t: (key: string) => key }) },
    '@/lib/pro-checkout': { startProCheckout: async () => {}, CN_PRO_CHECKOUT_TIP: '' },
    '@/lib/pro-conversion': { getProPlanBoundaryCopy: () => ({ pro: { features: ['feature'] } }), getProUpgradeTriggerCopy: () => copy },
  };
  const source = fs.readFileSync(new URL('../src/components/marketing/ProPromoCard.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: output, require: (name: string) => modules[name] });
  return {
    render(plan: string) { cursor = 0; return JSON.stringify(output.default({ plan, scene: 'gallery' })); },
    hydrate() { effects.splice(0).forEach(effect => effect()); },
  };
}
for (const plan of ['guest', 'free', 'pro']) {
  test(`Pro promo: initial ${plan} hydration matches guest SSR even when parent auth is already restored`, () => {
    const server = promo().render('guest');
    const client = promo();
    assert.equal(client.render(plan), server);
    assert.doesNotMatch(server, /ClerkSignInTrigger|今すぐ Pro にアップグレード|サブスクリプションを管理/);
    client.hydrate();
    const hydrated = client.render(plan);
    if (plan === 'guest') assert.match(hydrated, /ClerkSignInTrigger/);
    if (plan === 'free') assert.match(hydrated, /今すぐ Pro にアップグレード/);
    if (plan === 'pro') assert.match(hydrated, /サブスクリプションを管理/);
  });
}
