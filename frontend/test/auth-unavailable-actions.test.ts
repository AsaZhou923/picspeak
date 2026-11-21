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

const require = createRequire(import.meta.url);
const globals = globalThis as typeof globalThis & {
  __authOutageHarness: { authUnavailable: boolean; t: (key: string) => string };
};

function moduleUrl(source: string, imports: Record<string, string> = {}): string {
  let code = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const [specifier, url] of Object.entries({
    react: pathToFileURL(require.resolve('react')).href,
    'react/jsx-runtime': pathToFileURL(require.resolve('react/jsx-runtime')).href,
    ...imports,
  })) {
    code = code.replaceAll(`from '${specifier}'`, `from ${JSON.stringify(url)}`).replaceAll(`from "${specifier}"`, `from ${JSON.stringify(url)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}

const noticeUrl = moduleUrl(await readFile(new URL('../src/components/auth/AuthUnavailableNotice.tsx', import.meta.url), 'utf8'));
const { default: HomeCheckoutButton } = await import(
  moduleUrl(await readFile(new URL('../src/components/home/HomeCheckoutButton.tsx', import.meta.url), 'utf8'), {
    'lucide-react': moduleUrl('export const ArrowRight = () => null;'),
    '@/components/auth/AuthUnavailableNotice': noticeUrl,
    '@/components/auth/ClerkSignInTrigger': moduleUrl('export default function ClerkSignInTrigger() { return "GUEST_SIGN_IN"; }'),
    '@/components/billing/ActivationCodeModal': moduleUrl('export default function ActivationCodeModal() { return null; }'),
    '@/lib/auth-context': moduleUrl(
      'export function useAuth() { return { ensureToken: async () => "", isLoading: false, userInfo: null, authUnavailable: globalThis.__authOutageHarness.authUnavailable }; }',
    ),
    '@/lib/i18n': moduleUrl('export function useI18n() { return { t: globalThis.__authOutageHarness.t, locale: "en" }; }'),
    '@/lib/pro-checkout': moduleUrl('export const CN_PRO_CHECKOUT_TIP = ""; export async function startProCheckout() {}'),
  })
);

test('home checkout shows the localized auth-unavailable retry state during a signed-in Clerk outage', () => {
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    const t = (key: string) => dictionary[key as keyof typeof dictionary];

    globals.__authOutageHarness = { authUnavailable: true, t };
    const outageHtml = renderToStaticMarkup(createElement(HomeCheckoutButton));
    assert.ok(outageHtml.includes('role="alert"'));
    assert.ok(outageHtml.includes(dictionary.err_auth_unavailable_body));
    assert.ok(outageHtml.includes(dictionary.app_error_retry));
    assert.ok(!outageHtml.includes('GUEST_SIGN_IN'), 'outage must not fall back to the guest sign-in prompt');

    globals.__authOutageHarness = { authUnavailable: false, t };
    const guestHtml = renderToStaticMarkup(createElement(HomeCheckoutButton));
    assert.ok(guestHtml.includes('GUEST_SIGN_IN'));
    assert.ok(!guestHtml.includes(dictionary.err_auth_unavailable_body));
  }
});
