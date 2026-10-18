import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import type { LocalizationResource } from '@clerk/shared/types';
import type { ClerkAuthLocalization } from '../src/lib/clerk-auth-translations.ts';

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve('react')).href;
const jsxUrl = pathToFileURL(require.resolve('react/jsx-runtime')).href;

function moduleUrl(source: string, imports: Record<string, string> = {}): string {
  let code = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const [specifier, url] of Object.entries({ 'react/jsx-runtime': jsxUrl, ...imports })) {
    code = code.replaceAll(`from '${specifier}'`, `from ${JSON.stringify(url)}`)
      .replaceAll(`from "${specifier}"`, `from ${JSON.stringify(url)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}

const translationsUrl = moduleUrl(await readFile(new URL('../src/lib/clerk-auth-translations.ts', import.meta.url), 'utf8'));
const localizationUrl = moduleUrl(await readFile(new URL('../src/lib/clerk-localization.ts', import.meta.url), 'utf8'), {
  './clerk-auth-translations': translationsUrl,
});
const { getClerkLocalization } = await import(localizationUrl) as {
  getClerkLocalization: (locale: 'en' | 'zh' | 'ja') => ClerkAuthLocalization;
};

for (const [locale, text] of [['zh', /[\u4e00-\u9fff]/], ['ja', /[\u3040-\u30ff]/]] as const) {
  test(`${locale} localizes sign-in, sign-up, fields, buttons and authentication errors`, () => {
    const resource = getClerkLocalization(locale);
    for (const value of [
      resource.signIn?.start?.title, resource.signIn?.start?.subtitle,
      resource.signIn?.start?.actionText, resource.signIn?.start?.actionLink,
      resource.signUp?.start?.title, resource.signUp?.start?.subtitle,
      resource.signUp?.start?.actionText, resource.signUp?.start?.actionLink,
      resource.formFieldLabel__emailAddress, resource.formFieldLabel__password,
      resource.formFieldInputPlaceholder__password, resource.formFieldInputPlaceholder__signUpPassword,
      resource.formFieldAction__forgotPassword, resource.formButtonPrimary,
      resource.signIn?.password?.title, resource.signIn?.resetPassword?.title,
      resource.signIn?.emailCode?.resendButton, resource.signUp?.emailCode?.resendButton,
      resource.socialButtonsBlockButton,
      resource.unstable__errors?.form_password_incorrect,
      resource.unstable__errors?.form_password_length_too_short,
      resource.unstable__errors?.form_identifier_exists__email_address,
      resource.unstable__errors?.form_param_format_invalid__email_address,
      resource.unstable__errors?.form_code_incorrect,
      resource.unstable__errors?.form_password_pwned,
    ]) {
      assert.equal(typeof value, 'string');
      assert.match(value as string, text);
    }
    assert.match(resource.signIn?.start?.title as string, /\{\{applicationName\}\}/);
    assert.match(resource.socialButtonsBlockButton as string, /\{\{provider\|titleize\}\}/);
  });
}

test('email-delivery notes preserve localized verification headings and resend actions', () => {
  for (const [locale, note] of [['zh', '垃圾邮件'], ['en', 'spam folder'], ['ja', '迷惑メール']] as const) {
    const resource = getClerkLocalization(locale);
    assert.match(resource.signIn?.emailCode?.subtitle as string, new RegExp(note));
    assert.match(resource.signUp?.emailCode?.formSubtitle as string, new RegExp(note));
    assert.match(resource.signIn?.forgotPassword?.subtitle_email as string, new RegExp(note));
    assert.match(resource.userProfile?.emailAddressPage?.formHint as string, new RegExp(note));
    if (locale !== 'en') {
      assert.ok(resource.signIn?.emailCode?.title);
      assert.ok(resource.signUp?.emailCode?.resendButton);
    }
  }
  // English uses Clerk's built-in resource plus the existing email notes.
  assert.equal(getClerkLocalization('en').locale, 'en-US');
  assert.equal(getClerkLocalization('en').signIn?.start, undefined);
});

const harness = { locale: 'en', resource: null as LocalizationResource | null };
const globals = globalThis as typeof globalThis & { __picSpeakClerkHarness: typeof harness };
globals.__picSpeakClerkHarness = harness;
const passThroughUrl = moduleUrl('export function PassThrough({ children }) { return children; }');
const i18nUrl = moduleUrl(`export function useI18n() { return { locale: globalThis.__picSpeakClerkHarness.locale }; }
  export { PassThrough as I18nProvider } from ${JSON.stringify(passThroughUrl)};`);
const clerkUrl = moduleUrl(`export function ClerkProvider({ localization, children }) {
  globalThis.__picSpeakClerkHarness.resource = localization; return children;
}`);

for (const name of ['AppProviders', 'MarketingAuthProviders']) {
  test(`${name} passes the current site locale to Clerk across language changes`, async () => {
    const imports = {
      react: reactUrl,
      '@clerk/nextjs': clerkUrl,
      '@/lib/i18n': i18nUrl,
      '@/lib/clerk-localization': localizationUrl,
      '@/lib/auth-context': moduleUrl(`export { PassThrough as AuthProvider } from ${JSON.stringify(passThroughUrl)};`),
      '@/lib/theme-context': moduleUrl(`export { PassThrough as ThemeProvider } from ${JSON.stringify(passThroughUrl)};`),
      '@/features/notifications/NotificationProvider': moduleUrl(`export { PassThrough as NotificationProvider } from ${JSON.stringify(passThroughUrl)};`),
      '@/components/providers/AppErrorBoundary': moduleUrl(`export { PassThrough as AppErrorBoundary } from ${JSON.stringify(passThroughUrl)};`),
      '@/components/providers/ProductAnalyticsProvider': moduleUrl(`export { PassThrough as default } from ${JSON.stringify(passThroughUrl)};`),
    };
    const { default: Provider } = await import(moduleUrl(await readFile(new URL(`../src/components/providers/${name}.tsx`, import.meta.url), 'utf8'), imports));
    for (const [locale, expected] of [['zh', 'zh-CN'], ['ja', 'ja-JP'], ['en', 'en-US']]) {
      harness.locale = locale;
      renderToStaticMarkup(createElement(Provider, null, 'child'));
      assert.equal(harness.resource?.locale, expected);
      assert.equal(harness.resource, getClerkLocalization(locale as 'en' | 'zh' | 'ja'));
    }
  });
}
