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
import { ProfileApiError, updateMyProfileSettings } from '../src/features/profile/api.ts';
import { getProfileCopy } from '../src/features/profile/profile-copy.ts';
import { formatUserFacingError } from '../src/lib/error-utils.ts';

const dictionaries = { en: enTranslations, zh: zhTranslations, ja: jaTranslations };
const require = createRequire(import.meta.url);
function moduleUrl(source: string, imports: Record<string, string> = {}): string {
  let code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [specifier, url] of Object.entries({
    react: pathToFileURL(require.resolve('react')).href,
    'react/jsx-runtime': pathToFileURL(require.resolve('react/jsx-runtime')).href,
    ...imports,
  })) {
    code = code.replaceAll(`from '${specifier}'`, `from ${JSON.stringify(url)}`).replaceAll(`from "${specifier}"`, `from ${JSON.stringify(url)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const icons = moduleUrl('export const AlertCircle = () => null; export const ArrowRight = AlertCircle, X = AlertCircle;');
const { QuotaModal } = await import(moduleUrl(await readFile('src/features/workspace/components/QuotaModal.tsx', 'utf8'), {
  'lucide-react': icons,
  'next/link': moduleUrl('import { createElement } from "react"; export default function Link({children, ...props}) { return createElement("a", props, children); }'),
  '@/components/auth/ClerkSignInTrigger': moduleUrl('import { createElement } from "react"; export default function ClerkSignInTrigger({children, className, fallbackRedirectUrl}) { return createElement("button", {className, "data-sign-in": fallbackRedirectUrl || "/workspace"}, children); }'),
  '@/lib/hooks/useModalFocusTrap': moduleUrl('export function useModalFocusTrap() { return {current: null}; }'),
}));

test('quota dialogs provide plan-aware, localized recovery actions rather than dead text', () => {
  for (const [locale, dictionary] of Object.entries(dictionaries)) {
    const t = (key: keyof typeof enTranslations) => dictionary[key];
    for (const plan of ['guest', 'free', 'pro']) {
      const html = renderToStaticMarkup(createElement(QuotaModal, { plan, t, onClose() {} }));
      assert.match(html, /role="dialog" aria-modal="true"/);
      if (plan === 'guest') {
        assert.match(html, /data-sign-in="\/workspace"/);
        assert.ok(html.includes(dictionary.quota_modal_body), locale);
      } else {
        assert.match(html, /<a[^>]+href="\/account\/usage"/, `${locale}/${plan}`);
        assert.doesNotMatch(html, /data-sign-in=/, `${locale}/${plan}`);
        const bodyKey = plan === 'free' ? 'quota_modal_free_body' : 'quota_modal_pro_body';
        const ctaKey = plan === 'free' ? 'quota_modal_view_plans' : 'quota_modal_view_usage';
        assert.ok(html.includes(dictionary[bodyKey]), `${locale}/${plan} body`);
        assert.ok(html.includes(dictionary[ctaKey].replaceAll('&', '&amp;')), `${locale}/${plan} action`);
        assert.ok(!html.includes(dictionary.quota_modal_body), `${locale}/${plan} must not request guest login`);
      }
    }
  }
});

test('profile errors preserve stable login guidance without exposing backend text', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: {
    code: 'PUBLIC_PROFILE_LOGIN_REQUIRED', message: 'Private backend diagnostic', request_id: 'profile-request-123',
  } }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
  process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test';
  let failure: unknown;
  try { await updateMyProfileSettings('guest-token', true); } catch (error) { failure = error; }
  assert.ok(failure instanceof ProfileApiError);
  for (const dictionary of Object.values(dictionaries)) {
    const translated = formatUserFacingError((key) => dictionary[key], failure, 'Profile unavailable');
    assert.ok(translated.includes(dictionary.err_public_profile_login_required_body));
    assert.ok(translated.includes('profile-request-123'));
    assert.doesNotMatch(translated, /Private backend diagnostic|Profile unavailable/);
  }
});

test('unrecognized structured errors still use local fallback, never arbitrary backend messages', () => {
  const t = (key: keyof typeof enTranslations) => enTranslations[key];
  const translated = formatUserFacingError(t, new ProfileApiError(500, 'UNKNOWN_PROFILE_ERROR', 'Private backend diagnostic'), 'Profile unavailable');
  assert.match(translated, /Profile unavailable/);
  assert.doesNotMatch(translated, /Private backend diagnostic/);
});

const { formatReviewModes } = await import('../src/lib/usage-review-modes.ts');
test('usage lists exactly the available modes for Guest, Free and Pro in every locale', async () => {
  for (const dictionary of Object.values(dictionaries)) {
    const t = (key: keyof typeof enTranslations) => dictionary[key];
    for (const plan of ['guest', 'free', 'pro']) {
      const modes = plan === 'guest' ? ['flash'] as const : ['flash', 'pro'] as const;
      const actual = formatReviewModes([...modes], t);
      assert.ok(actual.includes(`Flash · ${dictionary.mode_flash_desc}`));
      assert.equal(actual.includes(`Pro · ${dictionary.mode_pro_desc}`), plan !== 'guest');
      assert.ok(!actual.includes(dictionary.plan_free_feature));
    }
    assert.equal(formatReviewModes(['pro'], t), `Pro · ${dictionary.mode_pro_desc}`);
    assert.equal(formatReviewModes([], t), '');
  }
  const source = await readFile('src/app/account/usage/page.tsx', 'utf8');
  assert.match(source, /formatReviewModes\(usage\?\.features\.review_modes/);
});

type Harness = {
  cursor: number;
  states: any[];
  userInfo: { plan: string; access_token: string } | null;
  dictionary: Record<keyof typeof enTranslations, string>;
  locale: string;
  updates: boolean[];
  failure: unknown;
};
const globals = globalThis as typeof globalThis & { __profileRecoveryHarness: Harness; __ProfileApiError: typeof ProfileApiError };
globals.__ProfileApiError = ProfileApiError;
const profileModule = moduleUrl(await readFile('src/app/account/profile/page.tsx', 'utf8'), {
  react: moduleUrl(`
    export function useState(initial) {
      const h = globalThis.__profileRecoveryHarness, index = h.cursor++;
      if (!(index in h.states)) h.states[index] = initial;
      return [h.states[index], next => { h.states[index] = typeof next === 'function' ? next(h.states[index]) : next; }];
    }
    export function useRef(initial) { return { current: initial }; }
    export function useMemo(factory) { return factory(); }
    export function useEffect() {}
  `),
  'next/image': moduleUrl('export default function Image() { return null; }'),
  'next/link': moduleUrl('import {createElement} from "react"; export default function Link({children, ...props}) { return createElement("a", props, children); }'),
  'lucide-react': moduleUrl('export const AlertCircle = () => null; export const Copy = AlertCircle, Eye = AlertCircle, EyeOff = AlertCircle, RefreshCw = AlertCircle, UserRound = AlertCircle;'),
  '@/components/auth/ClerkSignInTrigger': moduleUrl('import {createElement} from "react"; export default function ClerkSignInTrigger({children, className, fallbackRedirectUrl}) { return createElement("button", {className, "data-sign-in": fallbackRedirectUrl}, children); }'),
  '@/lib/auth-context': moduleUrl('export function useAuth() { return {userInfo: globalThis.__profileRecoveryHarness.userInfo, ensureToken: async () => globalThis.__profileRecoveryHarness.userInfo?.access_token}; }'),
  '@/lib/i18n': moduleUrl('export function useI18n() { const h = globalThis.__profileRecoveryHarness; return {locale: h.locale, t: key => h.dictionary[key]}; }'),
  '@/lib/error-utils': moduleUrl(await readFile('src/lib/error-utils.ts', 'utf8')),
  '@/features/profile/profile-copy': moduleUrl(await readFile('src/features/profile/profile-copy.ts', 'utf8')),
  '@/features/profile/api': moduleUrl(`
    export const ProfileApiError = globalThis.__ProfileApiError;
    export async function getMyProfileSettings() { throw new Error('Not used in seeded render test'); }
    export async function updateMyProfileSettings(token, enabled) {
      const h = globalThis.__profileRecoveryHarness; h.updates.push(enabled);
      if (h.failure) throw h.failure;
      return {...h.states[1], public_profile_enabled: enabled, public_profile_id: enabled ? 'public-id' : null};
    }
  `),
});
const { default: AccountProfilePage } = await import(profileModule);
function createProfileHarness(locale: keyof typeof dictionaries, plan: string | null) {
  const h: Harness = {
    cursor: 0,
    // Seed the mounted page after hydration and profile settings have loaded.
    states: [true, { public_profile_enabled: false, public_profile_id: null, username: 'Test photographer', avatar_url: null, gallery_review_count: 0 }, false, false, false, '', false],
    userInfo: plan ? { plan, access_token: `${plan}-token` } : null,
    dictionary: dictionaries[locale], locale, updates: [], failure: null,
  };
  globals.__profileRecoveryHarness = h;
  return h;
}
function profileTree(h: Harness) {
  globals.__profileRecoveryHarness = h;
  h.cursor = 0;
  return AccountProfilePage();
}
function findElement(tree: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(tree)) {
    for (const child of tree) { const found = findElement(child, predicate); if (found) return found; }
    return undefined;
  }
  if (!tree || typeof tree !== 'object') return undefined;
  return predicate(tree) ? tree : findElement(tree.props?.children, predicate);
}
async function settleClick() { await new Promise<void>((resolve) => setImmediate(resolve)); }

test('guest profile uses a sign-in action and registered profiles retain publishing in EN/ZH/JA', async () => {
  for (const locale of ['en', 'zh', 'ja'] as const) {
    for (const plan of ['guest', 'free', 'pro']) {
      const h = createProfileHarness(locale, plan);
      const tree = profileTree(h);
      const html = renderToStaticMarkup(tree);
      const toggle = findElement(tree, (node) => node.type === 'button' && node.props.className.includes('ui-action-primary'));
      if (plan === 'guest') {
        assert.match(html, /data-sign-in="\/account\/profile"/);
        assert.ok(html.includes(getProfileCopy(locale).signinHint));
        assert.equal(toggle, undefined);
        assert.deepEqual(h.updates, []);
      } else {
        assert.doesNotMatch(html, /data-sign-in=/);
        assert.equal(toggle.props.disabled, false);
        toggle.props.onClick(); await settleClick();
        assert.deepEqual(h.updates, [true]);
        assert.equal(h.states[1].public_profile_enabled, true);
      }
    }
  }
});

test('profile publishing waits for hydration, confirmed identity and loaded settings', async () => {
  for (const setup of ['hydration', 'identity', 'settings', 'loading']) {
    const h = createProfileHarness('en', setup === 'identity' ? null : 'free');
    if (setup === 'hydration') h.states[0] = false;
    if (setup === 'settings') h.states[1] = null;
    if (setup === 'loading') h.states[2] = true;
    const toggle = findElement(profileTree(h), (node) => node.type === 'button' && node.props.className.includes('ui-action-primary'));
    assert.equal(toggle.props.disabled, true);
    toggle.props.onClick(); await settleClick();
    assert.deepEqual(h.updates, []);
  }
});

test('a server login-required rejection replaces repeat publishing with sign-in recovery', async () => {
  for (const locale of ['en', 'zh', 'ja'] as const) {
    const h = createProfileHarness(locale, 'free');
    h.failure = new ProfileApiError(403, 'PUBLIC_PROFILE_LOGIN_REQUIRED', 'Private backend diagnostic');
    const toggle = findElement(profileTree(h), (node) => node.type === 'button' && node.props.className.includes('ui-action-primary'));
    toggle.props.onClick(); await settleClick();
    const html = renderToStaticMarkup(profileTree(h));
    assert.match(html, /data-sign-in="\/account\/profile"/);
    assert.ok(html.includes(dictionaries[locale].err_public_profile_login_required_body));
    assert.doesNotMatch(html, /Private backend diagnostic/);
    assert.deepEqual(h.updates, [true]);
  }
});
