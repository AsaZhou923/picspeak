import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { enTranslations } from '../src/lib/i18n-en.ts';
import type { UsageResponse } from '../src/lib/types.ts';

const require = createRequire(import.meta.url);
const jsxUrl = pathToFileURL(require.resolve('react/jsx-runtime')).href;
const iconUrl = `data:text/javascript;base64,${Buffer.from('export function ArrowRight() { return null; }').toString('base64')}`;
const source = await readFile(new URL('../src/components/account/UsageBillingActions.tsx', import.meta.url), 'utf8');
let compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
for (const [specifier, url] of Object.entries({ 'react/jsx-runtime': jsxUrl, 'lucide-react': iconUrl })) {
  compiled = compiled.replaceAll(`from '${specifier}'`, `from ${JSON.stringify(url)}`)
    .replaceAll(`from "${specifier}"`, `from ${JSON.stringify(url)}`);
}
const { default: UsageBillingActions } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

type BillingUsage = Pick<UsageResponse, 'plan' | 'billing_portal_available' | 'subscription'>;
function props(usage: BillingUsage) {
  return {
    usage,
    locale: 'en',
    checkoutLoading: false,
    portalLoading: false,
    onCheckout: () => {},
    onManageSubscription: () => {},
    t: (key: keyof typeof enTranslations) => enTranslations[key],
  };
}

test('active and downgraded billing customers see a usable management action', () => {
  for (const status of ['active', 'past_due', 'unpaid', 'expired']) {
    const usage: BillingUsage = {
      plan: status === 'active' ? 'pro' : 'free',
      billing_portal_available: true,
      subscription: null,
    };
    const calls: string[] = [];
    const inputs = {
      ...props(usage),
      onCheckout: () => calls.push('checkout'),
      onManageSubscription: () => calls.push('portal'),
    };
    const html = renderToStaticMarkup(createElement(UsageBillingActions, inputs));
    assert.match(html, new RegExp(enTranslations.usage_manage_subscription));
    assert.doesNotMatch(html, new RegExp(enTranslations.usage_checkout_pro));
    UsageBillingActions(inputs).props.onClick();
    assert.deepEqual(calls, ['portal']);
  }
});

test('a Free account without billing history keeps its checkout action', () => {
  const calls: string[] = [];
  const inputs = {
    ...props({ plan: 'free', billing_portal_available: false, subscription: null }),
    onCheckout: () => calls.push('checkout'),
    onManageSubscription: () => calls.push('portal'),
  };
  const html = renderToStaticMarkup(createElement(UsageBillingActions, inputs));
  assert.match(html, new RegExp(enTranslations.usage_checkout_pro));
  assert.doesNotMatch(html, new RegExp(enTranslations.usage_manage_subscription));
  UsageBillingActions(inputs).props.onClick();
  assert.deepEqual(calls, ['checkout']);
});

test('guest and activation-only accounts are not shown a provider portal action', () => {
  for (const plan of ['guest', 'pro'] as const) {
    const html = renderToStaticMarkup(createElement(UsageBillingActions, props({
      plan, billing_portal_available: plan === 'guest', subscription: null,
    })));
    assert.equal(html, '');
  }
  const activation: BillingUsage = {
    plan: 'pro', billing_portal_available: false,
    subscription: {
      provider: 'activation_code', status: 'active', cancelled: true,
      renews_at: null, ends_at: null, current_period_ends_at: null,
    },
  };
  const html = renderToStaticMarkup(createElement(UsageBillingActions, { ...props(activation), locale: 'zh' }));
  assert.match(html, new RegExp(enTranslations.usage_checkout_pro));
  assert.doesNotMatch(html, new RegExp(enTranslations.usage_manage_subscription));
});

test('a prior Lemon Squeezy record remains manageable alongside activation access', () => {
  const html = renderToStaticMarkup(createElement(UsageBillingActions, {
    ...props({
      plan: 'pro', billing_portal_available: true,
      subscription: {
        provider: 'activation_code', status: 'active', cancelled: true,
        renews_at: null, ends_at: null, current_period_ends_at: null,
      },
    }),
    locale: 'zh',
  }));
  assert.match(html, new RegExp(enTranslations.usage_manage_subscription));
});

test('pending portal and checkout actions are disabled to prevent repeated clicks', () => {
  for (const canManage of [true, false]) {
    const inputs = {
      ...props({ plan: 'free', billing_portal_available: canManage, subscription: null }),
      portalLoading: canManage,
      checkoutLoading: !canManage,
    };
    const html = renderToStaticMarkup(createElement(UsageBillingActions, inputs));
    assert.match(html, /disabled=""/);
    assert.match(html, new RegExp(canManage ? enTranslations.usage_manage_loading : enTranslations.usage_checkout_loading));
  }
});

test('the usage page connects the billing control to the server response and portal handler', async () => {
  const page = await readFile(new URL('../src/app/account/usage/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /<UsageBillingActions\s+t=\{t\}\s+usage=\{usage\}/);
  assert.match(page, /onManageSubscription=\{handleManageSubscription\}/);
  assert.match(page, /const response: BillingPortalResponse = await getBillingPortal\(token\)/);
});
