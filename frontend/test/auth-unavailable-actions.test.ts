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
  __authOutageHarness: { authUnavailable: boolean; isLoading?: boolean; userInfo?: { plan: string } | null; t: (key: string) => string };
  __modalHooks: { cursor: number; hooks: Array<{ value?: unknown; dependencies?: unknown[] }>; effects: Array<() => void>; dirty: boolean };
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

const authGateUrl = moduleUrl(await readFile(new URL('../src/lib/auth-gate.ts', import.meta.url), 'utf8'));
const noticeUrl = moduleUrl(await readFile(new URL('../src/components/auth/AuthUnavailableNotice.tsx', import.meta.url), 'utf8'));
const { default: HomeCheckoutButton } = await import(
  moduleUrl(await readFile(new URL('../src/components/home/HomeCheckoutButton.tsx', import.meta.url), 'utf8'), {
    'lucide-react': moduleUrl('export const ArrowRight = () => null;'),
    '@/components/auth/AuthUnavailableNotice': noticeUrl,
    '@/components/auth/ClerkSignInTrigger': moduleUrl('export default function ClerkSignInTrigger() { return "GUEST_SIGN_IN"; }'),
    '@/components/billing/ActivationCodeModal': moduleUrl('export default function ActivationCodeModal() { return null; }'),
    '@/lib/auth-context': moduleUrl(
      'export function useAuth() { const h = globalThis.__authOutageHarness; return { ensureToken: async () => "", isLoading: Boolean(h.isLoading), userInfo: h.userInfo ?? null, authUnavailable: h.authUnavailable }; }',
    ),
    '@/lib/auth-gate': authGateUrl,
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

test('home checkout shows a neutral loading state, not the guest sign-in, while auth is undetermined', () => {
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    const t = (key: string) => dictionary[key as keyof typeof dictionary];
    for (const authUnavailable of [false, true]) {
      globals.__authOutageHarness = { authUnavailable, isLoading: true, t };
      const html = renderToStaticMarkup(createElement(HomeCheckoutButton));
      assert.ok(html.includes(dictionary.generation_auth_loading_cta));
      assert.ok(!html.includes('GUEST_SIGN_IN'));
      assert.ok(!html.includes(dictionary.err_auth_unavailable_body));
    }
  }
});

// The activation dialog portals only after mount, so drive it with minimal
// dependency-aware hooks and a JSX tree instead of server rendering.
const modalHooksUrl = moduleUrl(`
const h = () => globalThis.__modalHooks;
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
export function useState(initial) {
  const s = h(), i = s.cursor++;
  if (!s.hooks[i]) s.hooks[i] = { value: typeof initial === 'function' ? initial() : initial };
  return [s.hooks[i].value, (next) => {
    const value = typeof next === 'function' ? next(s.hooks[i].value) : next;
    if (!Object.is(value, s.hooks[i].value)) { s.hooks[i].value = value; s.dirty = true; }
  }];
}
export function useRef(initial) { return useState(() => ({ current: initial }))[0]; }
export function useId() { return 'modal-id'; }
export function useEffect(effect, dependencies) {
  const s = h(), i = s.cursor++, old = s.hooks[i];
  if (!old || !same(old.dependencies, dependencies)) { s.hooks[i] = { dependencies }; s.effects.push(effect); }
}
`);
const treeJsxUrl = moduleUrl('export function jsx(type, props) { return { type, props }; } export const jsxs = jsx; export const Fragment = "fragment";');
const stubComponent = (name: string) => moduleUrl(`export default function ${name}() { return null; }`);
const { default: ActivationCodeModal } = await import(
  moduleUrl(await readFile(new URL('../src/components/billing/ActivationCodeModal.tsx', import.meta.url), 'utf8'), {
    react: modalHooksUrl,
    'react/jsx-runtime': treeJsxUrl,
    'react-dom': moduleUrl('export function createPortal(node) { return node; }'),
    'lucide-react': moduleUrl('export const X = () => null;'),
    '@/components/auth/AuthUnavailableNotice': stubComponent('AuthUnavailableNotice'),
    '@/components/auth/ClerkSignInTrigger': stubComponent('ClerkSignInTrigger'),
    '@/lib/auth-context': moduleUrl(
      'export function useAuth() { const h = globalThis.__authOutageHarness; return { ensureToken: async () => "", syncPlan() {}, isLoading: Boolean(h.isLoading), userInfo: h.userInfo ?? null, authUnavailable: h.authUnavailable }; }',
    ),
    '@/lib/auth-gate': authGateUrl,
    '@/lib/api': moduleUrl('export async function redeemActivationCode() {}'),
    '@/lib/error-utils': moduleUrl('export function formatUserFacingError(t, e, fallback) { return fallback; }'),
    '@/lib/hooks/useModalFocusTrap': moduleUrl('export function useModalFocusTrap() { return { current: null }; }'),
    '@/lib/i18n': moduleUrl('export function useI18n() { return { t: globalThis.__authOutageHarness.t, locale: "zh" }; }'),
    '@/lib/locale': moduleUrl('export function localeToIntlLocale() { return "zh-CN"; }'),
    '@/lib/types': moduleUrl('export {};'),
  })
);

type ModalNode = { type?: unknown; props?: Record<string, unknown> };
function renderModal(): ModalNode {
  const hooks: typeof globals.__modalHooks = { cursor: 0, hooks: [], effects: [], dirty: true };
  globals.__modalHooks = hooks;
  const scope = globalThis as { document?: unknown };
  const prevDocument = scope.document;
  scope.document = { body: {} };
  try {
    let tree: ModalNode = {};
    for (let pass = 0; pass < 5 && hooks.dirty; pass++) {
      hooks.dirty = false;
      hooks.cursor = 0;
      tree = ActivationCodeModal({ open: true, onClose: () => {} });
      for (const effect of hooks.effects.splice(0)) effect();
    }
    return tree;
  } finally {
    if (prevDocument === undefined) delete scope.document;
    else scope.document = prevDocument;
  }
}
function hasComponent(tree: unknown, name: string): boolean {
  if (!tree || typeof tree !== 'object') return false;
  if (Array.isArray(tree)) return tree.some((child) => hasComponent(child, name));
  const node = tree as ModalNode;
  if (typeof node.type === 'function' && (node.type as { name?: string }).name === name) return true;
  return hasComponent(node.props?.children, name);
}

test('activation dialog stays neutral while auth is undetermined, then shows outage, guest or form', () => {
  const dictionary = zhTranslations;
  const t = (key: string) => dictionary[key as keyof typeof dictionary];
  const cases = [
    { name: 'loading', auth: { isLoading: true, authUnavailable: true, userInfo: null } },
    { name: 'loading-guest', auth: { isLoading: true, authUnavailable: false, userInfo: { plan: 'guest' } } },
    { name: 'unavailable', auth: { isLoading: false, authUnavailable: true, userInfo: null } },
    { name: 'sign_in', auth: { isLoading: false, authUnavailable: false, userInfo: null } },
    { name: 'ready', auth: { isLoading: false, authUnavailable: false, userInfo: { plan: 'free' } } },
  ];
  for (const { name, auth } of cases) {
    globals.__authOutageHarness = { ...auth, t };
    const tree = renderModal();
    const text = JSON.stringify(tree);
    const loading = name.startsWith('loading');
    assert.equal(text.includes(dictionary.generation_auth_loading_cta), loading, `${name}: loading copy`);
    assert.equal(text.includes(dictionary.activation_code_signin_hint), name === 'sign_in', `${name}: guest instruction`);
    assert.equal(hasComponent(tree, 'ClerkSignInTrigger'), name === 'sign_in', `${name}: sign-in trigger`);
    assert.equal(hasComponent(tree, 'AuthUnavailableNotice'), name === 'unavailable', `${name}: outage notice`);
    assert.equal(text.includes(dictionary.activation_code_submit), name === 'ready', `${name}: redeem form`);
  }
});
