import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { enTranslations } from '../src/lib/i18n-en.ts';
import { zhTranslations } from '../src/lib/i18n-zh.ts';
import { jaTranslations } from '../src/lib/i18n-ja.ts';
import { buildWorkspaceSignInReturnPath } from '../src/features/workspace/workspaceTaskFlow.ts';
import { getLlmsText } from '../src/lib/llms.ts';
import { buildAiMarkdownContent, AI_MARKDOWN_CONTENT_PAGES } from '../src/lib/ai-markdown.ts';

const require = createRequire(import.meta.url);
function moduleUrl(source: string, imports: Record<string, string> = {}): string {
  let code = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const [specifier, url] of Object.entries({
    'react/jsx-runtime': pathToFileURL(require.resolve('react/jsx-runtime')).href, ...imports,
  })) code = code.replaceAll(`from '${specifier}'`, `from ${JSON.stringify(url)}`).replaceAll(`from "${specifier}"`, `from ${JSON.stringify(url)}`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const noticeUrl = moduleUrl(await readFile(new URL('../src/components/billing/ProMonthlyUsageNotice.tsx', import.meta.url), 'utf8'));
const { default: ProMonthlyUsageNotice } = await import(noticeUrl);
const { QuotaBanner } = await import(moduleUrl(await readFile(new URL('../src/features/workspace/components/QuotaBanner.tsx', import.meta.url), 'utf8'), {
  'lucide-react': moduleUrl('export const Info = () => null;'),
  '@/lib/auth-context': moduleUrl('export const planLabel = (plan) => plan; export const planColor = () => "";'),
  '@/components/ui/Badge': moduleUrl('export default function Badge({children}) { return children; }'),
  '@/components/auth/ClerkSignInTrigger': moduleUrl('export default function ClerkSignInTrigger({children,fallbackRedirectUrl}) { return <button data-sign-in={fallbackRedirectUrl}>{children}</button>; }'),
  '@/components/billing/ProMonthlyUsageNotice': noticeUrl,
}));

test('Pro reminders explain the server minute rate at and above 150 without a hard monthly cap', () => {
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    for (const used of [149, 150, 151]) {
      const html = renderToStaticMarkup(createElement(ProMonthlyUsageNotice, {
        usage: { plan: 'pro', quota: { monthly_soft_limit: 150, monthly_soft_used: used, monthly_soft_reached: used >= 150, monthly_soft_rate_limit_per_minute: 2 } },
        t: (key: keyof typeof enTranslations) => dictionary[key],
      }));
      assert.ok(html.includes(String(used)));
      assert.ok(html.includes('150'));
      assert.ok(html.includes(dictionary[used >= 150 ? 'usage_pro_soft_reached' : 'usage_pro_soft_hint'].replace('{rate}', '2')));
      assert.equal(html.includes('role="status"'), used >= 150);
      assert.doesNotMatch(html, /disabled|<button|<a /);
    }
  }
});

test('Pro rate copy follows server configuration and does not invent a rate for old responses', () => {
  for (const rate of [2, 4, null]) {
    const html = renderToStaticMarkup(createElement(ProMonthlyUsageNotice, {
      usage: { plan: 'pro', quota: { monthly_soft_limit: 150, monthly_soft_used: 151, monthly_soft_reached: true, monthly_soft_rate_limit_per_minute: rate } },
      t: (key: keyof typeof enTranslations) => enTranslations[key],
    }));
    assert.ok(html.includes(rate === null ? enTranslations.usage_pro_soft_unknown_rate : enTranslations.usage_pro_soft_reached.replace('{rate}', String(rate))));
    assert.doesNotMatch(html, /\{rate\}/);
  }
});

test('reminder is hidden for other plans and older responses with unknown usage', () => {
  for (const usage of [
    { plan: 'pro', quota: {} },
    { plan: 'pro', quota: { monthly_soft_limit: 150, monthly_soft_used: null, monthly_soft_reached: false } },
    { plan: 'free', quota: { monthly_soft_limit: 150, monthly_soft_used: 151, monthly_soft_reached: true } },
    { plan: 'guest', quota: { monthly_soft_limit: 150, monthly_soft_used: 151, monthly_soft_reached: true } },
  ]) assert.equal(renderToStaticMarkup(createElement(ProMonthlyUsageNotice, { usage, t: (key: keyof typeof enTranslations) => enTranslations[key] })), '');
});

test('Guest exhaustion offers Free account recovery and preserves return context', () => {
  const returnPath = buildWorkspaceSignInReturnPath('?source_review_id=review-owned&next_shoot_action=Keep+space&mode=pro', 'flash', 'portrait');
  const url = new URL(returnPath, 'https://picspeak.example');
  assert.equal(url.pathname, '/workspace');
  assert.equal(url.searchParams.get('source_review_id'), 'review-owned');
  assert.equal(url.searchParams.get('next_shoot_action'), 'Keep space');
  assert.equal(url.searchParams.get('mode'), 'flash');
  assert.equal(url.searchParams.get('image_type'), 'portrait');
  for (const remainingQuota of [0, 1, null]) {
    const html = renderToStaticMarkup(createElement(QuotaBanner, {
      usage: { plan: 'guest', quota: {} }, usageError: false, remainingQuota, totalQuota: 1,
      reviewMode: 'flash', signInReturnPath: returnPath,
      t: (key: keyof typeof enTranslations) => enTranslations[key],
    }));
    assert.equal(html.includes('data-sign-in='), remainingQuota === 0);
    if (remainingQuota === 0) {
      assert.ok(html.includes(returnPath.replaceAll('&', '&amp;')));
      assert.ok(html.includes(enTranslations.quota_modal_upgrade));
      assert.doesNotMatch(html, /account\/usage|checkout|\$3\.99/);
    }
  }
});

test('AI search surfaces agree on Guest allowance, retained originals and the Pro minute rate', async () => {
  const staticText = await readFile(new URL('../public/llms.txt', import.meta.url), 'utf8');
  assert.equal(staticText, getLlmsText());
  const page = AI_MARKDOWN_CONTENT_PAGES.find((item) => item.slug === 'home');
  assert.ok(page);
  for (const text of [staticText, buildAiMarkdownContent(page)]) {
    assert.match(text, /1 critique per day, 30 per month/);
    assert.match(text, /150 critiques/);
    assert.match(text, /2 per minute until the next UTC month/);
    assert.match(text, /monthly critique total remains unlimited/);
    assert.match(text, /originals while subscribed/);
    assert.doesNotMatch(text, /Guest: 3|3 critiques per day/);
  }
});
