import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import type { UsageSubscription } from '../src/lib/types.ts';

const source = await readFile(new URL('../src/lib/usage-page-copy.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace("'@/lib/locale'", JSON.stringify(new URL('../src/lib/locale.ts', import.meta.url).href));
const { getBillingStatusNotice, getSubscriptionTermCopy, formatSubscriptionDate } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

function subscription(overrides: Partial<UsageSubscription> = {}): UsageSubscription {
  return {
    provider: 'lemonsqueezy', status: 'active', cancelled: false,
    renews_at: '2026-11-30T00:00:00Z', ends_at: null,
    current_period_ends_at: '2026-11-30T00:00:00Z', ...overrides,
  };
}

test('only server billing state produces payment notices, with no guest or missing-state notices', () => {
  assert.equal(getBillingStatusNotice({ plan: 'free' }, 'en'), null);
  assert.equal(getBillingStatusNotice({ plan: 'guest', billing_subscription: subscription({ status: 'past_due' }) }, 'en'), null);
  assert.equal(getBillingStatusNotice({ plan: 'pro', billing_subscription: subscription() }, 'en'), null);
  assert.equal(getBillingStatusNotice({ plan: 'pro', billing_subscription: subscription({ status: 'unrecognized-provider-text' }) }, 'en'), null);
});

test('failed payments and ended access explain the current account plan', () => {
  for (const status of ['past_due', 'unpaid']) {
    const notice = getBillingStatusNotice({ plan: 'free', billing_subscription: subscription({ status }) }, 'en');
    assert.match(notice, /payment failed/);
    assert.match(notice, /currently on Free/);
  }
  assert.match(getBillingStatusNotice({ plan: 'pro', billing_subscription: subscription({ last_payment_status: 'failed' }) }, 'en'), /still has valid Pro access/);
  for (const status of ['expired', 'refunded', 'cancelled']) {
    assert.match(getBillingStatusNotice({ plan: 'free', billing_subscription: subscription({ status }) }, 'en'), /has ended/);
  }
});

test('invoice refunds do not claim that a valid subscription has ended', () => {
  for (const last_payment_status of ['refunded', 'partial_refund']) {
    const notice = getBillingStatusNotice({ plan: 'pro', billing_subscription: subscription({ last_payment_status }) }, 'en');
    assert.match(notice, /refund/);
    assert.match(notice, /still has valid Pro access/);
    assert.doesNotMatch(notice, /has ended|downgrade/);
  }
});

test('all supported locales distinguish failed, refunded, partial, ended and pending states', () => {
  for (const locale of ['zh', 'en', 'ja'] as const) {
    const messages = [
      subscription({ last_payment_status: 'failed' }),
      subscription({ last_payment_status: 'refunded' }),
      subscription({ last_payment_status: 'partial_refund' }),
      subscription({ status: 'expired' }),
      subscription({ status: 'pending' }),
    ].map((billing_subscription) => getBillingStatusNotice({ plan: 'free', billing_subscription }, locale));
    assert.equal(messages.every((message) => typeof message === 'string' && message.length > 10), true);
    assert.equal(new Set(messages).size, 5);
  }
});

test('recurring subscriptions show renewal while passes and activation access show a fixed term', () => {
  assert.equal(getSubscriptionTermCopy(subscription(), 'en').label, 'Next renewal');
  assert.match(getSubscriptionTermCopy(subscription({ cancelled: true }), 'en').hint, /Auto-renew is off/);
  for (const provider of ['activation_code', 'lemonsqueezy']) {
    const term = getSubscriptionTermCopy(subscription({ provider, renews_at: null, ends_at: '2026-11-30T00:00:00Z', cancelled: true }), 'en');
    assert.equal(term.label, 'Pro expires on');
    assert.match(term.hint, /fixed term/);
    assert.doesNotMatch(term.hint, /downgrade/);
  }
  assert.equal(getSubscriptionTermCopy(null, 'en').hint, null);
  assert.equal(formatSubscriptionDate('invalid', 'en'), null);
});

test('usage page renders the server-derived billing notice and term label', async () => {
  const page = await readFile(new URL('../src/app/account/usage/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /getBillingStatusNotice\(usage, locale\)/);
  assert.match(page, /getSubscriptionTermCopy\(usage\?\.subscription, locale\)/);
  assert.match(page, /role="status"[^>]*>\{billingStatusNotice\}/);
});
