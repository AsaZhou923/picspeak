import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { enTranslations } from '../src/lib/i18n-en.ts';

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve('react')).href;
const jsxUrl = pathToFileURL(require.resolve('react/jsx-runtime')).href;

interface BellHarness {
  notifications: {
    canReadNotifications: boolean;
    unreadTotal: number | null;
    error: boolean;
  };
}

interface ProviderHarness {
  auth: {
    token: string | null;
    userInfo: { user_id: string; access_token: string; plan: 'free' | 'guest' } | null;
    isLoading: boolean;
  };
  cursor: number;
  states: unknown[];
  refs: Array<{ current: unknown }>;
  effects: Array<() => void | (() => void)>;
  contextValue: {
    canReadNotifications: boolean;
    unreadTotal: number | null;
    error: boolean;
    refreshUnreadCount: () => Promise<void>;
    applyUnreadCount: (next: { total: number; by_category: Record<string, number>; as_of: string } | null) => void;
  } | null;
  getUnreadCount: (token: string) => Promise<{ total: number; by_category: Record<string, number>; as_of: string }>;
  calls: string[];
}

interface QuickLinksHarness {
  auth: {
    userInfo: { user_id: string; access_token: string; plan: 'free' | 'guest' } | null;
  };
  notifications: {
    canReadNotifications: boolean;
  };
  pathname: string;
}

const globals = globalThis as typeof globalThis & {
  __picSpeakBellHarness: BellHarness;
  __picSpeakNotificationProviderHarness: ProviderHarness;
  __picSpeakQuickLinksHarness: QuickLinksHarness;
};

function moduleUrl(source: string, imports: Record<string, string> = {}): string {
  let code = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const [specifier, url] of Object.entries({ 'react/jsx-runtime': jsxUrl, ...imports })) {
    code = code
      .replaceAll(`from '${specifier}'`, `from ${JSON.stringify(url)}`)
      .replaceAll(`from "${specifier}"`, `from ${JSON.stringify(url)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}

const i18nUrl = moduleUrl(`export function useI18n() {
  return { t: (key) => globalThis.__picSpeakBellHarness?.translations?.[key] ?? ${JSON.stringify(enTranslations)}[key] ?? key };
}`);
const linkUrl = moduleUrl(`import { createElement } from ${JSON.stringify(reactUrl)};
export default function Link({ href, children, ...props }) {
  return createElement('a', { href, ...props }, children);
}`);
const bellIconUrl = moduleUrl(`import { createElement } from ${JSON.stringify(reactUrl)};
export function Bell(props) { return createElement('svg', { ...props, 'data-icon': 'bell' }); }
`);
const notificationContextUrl = moduleUrl(`export function useNotifications() {
  return globalThis.__picSpeakBellHarness.notifications;
}`);
const bellUrl = moduleUrl(await readFile(new URL('../src/features/notifications/NotificationBell.tsx', import.meta.url), 'utf8'), {
  react: reactUrl,
  'next/link': linkUrl,
  'lucide-react': bellIconUrl,
  '@/lib/i18n': i18nUrl,
  '@/lib/i18n-en': moduleUrl('export {};'),
  './NotificationProvider': notificationContextUrl,
});
const { default: NotificationBell } = await import(bellUrl);

function renderBell(notifications: BellHarness['notifications']): string {
  globals.__picSpeakBellHarness = { notifications };
  return renderToStaticMarkup(createElement(NotificationBell));
}

test('hides the bell before read access is confirmed', () => {
  const html = renderBell({ canReadNotifications: false, unreadTotal: null, error: false });
  assert.equal(html, '');
});

test('hides the bell when notifications are disabled even if an error is present', () => {
  const html = renderBell({ canReadNotifications: false, unreadTotal: null, error: true });
  assert.equal(html, '');
});

test('shows the bell when read access succeeds with zero unread notifications', () => {
  const html = renderBell({ canReadNotifications: true, unreadTotal: 0, error: false });
  assert.match(html, /href="\/account\/notifications"/);
  assert.match(html, /aria-label="Open message center"/);
  assert.doesNotMatch(html, /99\+/);
});

test('keeps the bell entry when the count is unavailable after read access was confirmed', () => {
  const html = renderBell({ canReadNotifications: true, unreadTotal: null, error: true });
  assert.match(html, /href="\/account\/notifications"/);
  assert.match(html, /aria-hidden="true"/);
});

test('caps the unread badge at ninety-nine plus', () => {
  const html = renderBell({ canReadNotifications: true, unreadTotal: 142, error: false });
  assert.match(html, />99\+<\/span>/);
  assert.match(html, /aria-label="Open message center, 142 unread"/);
});

const quickReactUrl = moduleUrl(`
export function useState() { return [true, () => {}]; }
export function useRef() { return { current: null }; }
export function useEffect() {}
`);
const quickI18nUrl = moduleUrl(`const translations = ${JSON.stringify(enTranslations)};
export const LOCALE_LABELS = { zh: '中文', en: 'English', ja: '日本語' };
export function useI18n() {
  return { locale: 'en', setLocale: () => {}, t: (key) => translations[key] ?? key };
}
`);
const quickAuthUrl = moduleUrl(`export function useAuth() {
  return { userInfo: globalThis.__picSpeakQuickLinksHarness.auth.userInfo, logout: () => {} };
}
export function planColor() { return ''; }
export function planLabel(plan) { return plan; }
`);
const quickNavigationUrl = moduleUrl(`export function usePathname() {
  return globalThis.__picSpeakQuickLinksHarness.pathname;
}
export function useRouter() {
  return { push: () => {}, refresh: () => {} };
}
`);
const quickNotificationsUrl = moduleUrl(`export function useNotifications() {
  return globalThis.__picSpeakQuickLinksHarness.notifications;
}
`);
const quickIconsUrl = moduleUrl(`import { createElement } from ${JSON.stringify(reactUrl)};
function Icon(props) { return createElement('svg', { ...props, 'data-icon': true }); }
export const BadgeDollarSign = Icon;
export const Bell = Icon;
export const ChevronDown = Icon;
export const ChevronRight = Icon;
export const Clock = Icon;
export const Heart = Icon;
export const Moon = Icon;
export const Repeat2 = Icon;
export const Sun = Icon;
export const UserRound = Icon;
export const Wand2 = Icon;
`);
const quickClerkUrl = moduleUrl(`export function Show({ children }) { return children ?? null; }
export function SignInButton({ children }) { return children ?? null; }
export function SignUpButton({ children }) { return children ?? null; }
export function UserButton() { return null; }
`);
const quickLinksUrl = moduleUrl(
  `${await readFile(new URL('../src/components/layout/HeaderControls.tsx', import.meta.url), 'utf8')}
export { QuickLinksMenu };`,
  {
    react: quickReactUrl,
    'next/link': linkUrl,
    '@clerk/nextjs': quickClerkUrl,
    'lucide-react': quickIconsUrl,
    'next/navigation': quickNavigationUrl,
    '@/lib/auth-context': quickAuthUrl,
    '@/lib/hooks/useOnClickOutside': moduleUrl('export default function useOnClickOutside() {}'),
    '@/lib/i18n': quickI18nUrl,
    '@/lib/theme-context': moduleUrl('export function useTheme() { return { theme: "dark", toggleTheme: () => {} }; }'),
    '@/lib/retake-coach-copy': moduleUrl('export function getRetakeCoachCopy() { return { nav: "Retake Coach" }; }'),
    '@/features/notifications/NotificationBell': moduleUrl('export default function NotificationBell() { return null; }'),
    '@/features/notifications/NotificationProvider': quickNotificationsUrl,
  },
);
const { QuickLinksMenu } = await import(quickLinksUrl);

function renderQuickLinks(userInfo: QuickLinksHarness['auth']['userInfo'], canReadNotifications: boolean): string {
  globals.__picSpeakQuickLinksHarness = {
    auth: { userInfo },
    notifications: { canReadNotifications },
    pathname: '/workspace',
  };
  return renderToStaticMarkup(createElement(QuickLinksMenu));
}

test('quick links menu hides notifications before read access is confirmed', () => {
  const html = renderQuickLinks(signedInUser(), false);
  assert.match(html, /id="header-quick-links"/);
  assert.doesNotMatch(html, /href="\/account\/notifications"/);
});

test('quick links menu hides notifications when no formal user is present', () => {
  const html = renderQuickLinks(null, false);
  assert.match(html, /id="header-quick-links"/);
  assert.doesNotMatch(html, /href="\/account\/notifications"/);
});

test('quick links menu shows notifications after a formal user confirms read access', () => {
  const html = renderQuickLinks(signedInUser(), true);
  assert.match(html, /href="\/account\/notifications"/);
  assert.match(html, />Message center<\/span>/);
});

test('quick links menu hides notifications for guests even when context is stale true', () => {
  const html = renderQuickLinks({ user_id: 'guest', access_token: 'guest-token', plan: 'guest' }, true);
  assert.match(html, /id="header-quick-links"/);
  assert.doesNotMatch(html, /href="\/account\/notifications"/);
});

const fakeReactUrl = moduleUrl(`
export function createContext(defaultValue) {
  const context = { defaultValue };
  context.Provider = function Provider({ value, children }) {
    globalThis.__picSpeakNotificationProviderHarness.contextValue = value;
    return children ?? null;
  };
  return context;
}
export function useContext(context) {
  return globalThis.__picSpeakNotificationProviderHarness.contextValue ?? context.defaultValue;
}
export function useState(initialValue) {
  const harness = globalThis.__picSpeakNotificationProviderHarness;
  const index = harness.cursor++;
  if (!(index in harness.states)) harness.states[index] = initialValue;
  return [harness.states[index], (next) => {
    harness.states[index] = typeof next === 'function' ? next(harness.states[index]) : next;
  }];
}
export function useRef(initialValue) {
  const harness = globalThis.__picSpeakNotificationProviderHarness;
  const index = harness.cursor++;
  if (!harness.refs[index]) harness.refs[index] = { current: initialValue };
  return harness.refs[index];
}
export function useCallback(callback) { return callback; }
export function useMemo(factory) { return factory(); }
export function useEffect(effect) {
  globalThis.__picSpeakNotificationProviderHarness.effects.push(effect);
}
`);
const fakeJsxUrl = moduleUrl(`export function jsx(type, props) {
  return typeof type === 'function' ? type(props ?? {}) : { type, props };
}
export const jsxs = jsx;
export const Fragment = function Fragment({ children }) { return children ?? null; };
`);
const authUrl = moduleUrl(`export function useAuth() {
  return globalThis.__picSpeakNotificationProviderHarness.auth;
}`);
const apiUrl = moduleUrl(`export async function getNotificationUnreadCount(token) {
  globalThis.__picSpeakNotificationProviderHarness.calls.push(token);
  return globalThis.__picSpeakNotificationProviderHarness.getUnreadCount(token);
}
export function isAbortError(error) { return error?.name === 'AbortError'; }
`);
const typesUrl = moduleUrl(`export class ApiException extends Error {
  constructor(status, code) {
    super(code ?? String(status));
    this.status = status;
    this.code = code;
  }
}
`);
const stateUrl = moduleUrl(await readFile(new URL('../src/features/notifications/notification-state.ts', import.meta.url), 'utf8'), {
  '@/lib/types': moduleUrl('export {};'),
});
const providerUrl = moduleUrl(await readFile(new URL('../src/features/notifications/NotificationProvider.tsx', import.meta.url), 'utf8'), {
  react: fakeReactUrl,
  'react/jsx-runtime': fakeJsxUrl,
  '@/lib/api': apiUrl,
  '@/lib/auth-context': authUrl,
  '@/lib/types': typesUrl,
  './notification-state': stateUrl,
});
const { NotificationProvider } = await import(providerUrl);
const { ApiException } = await import(typesUrl);

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  },
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    setTimeout: () => 1,
    clearTimeout: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  },
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { onLine: true },
});

function signedInUser(user_id = 'usr_a', access_token = 'token-a') {
  return { user_id, access_token, plan: 'free' as const };
}

function createProviderHarness(overrides: Partial<ProviderHarness> = {}): ProviderHarness {
  return {
    auth: { token: 'token-a', userInfo: signedInUser(), isLoading: false },
    cursor: 0,
    states: [],
    refs: [],
    effects: [],
    contextValue: null,
    getUnreadCount: async () => ({ total: 0, by_category: {}, as_of: '2026-10-10T00:00:00Z' }),
    calls: [],
    ...overrides,
  };
}

function renderProvider(harness: ProviderHarness): NonNullable<ProviderHarness['contextValue']> {
  globals.__picSpeakNotificationProviderHarness = harness;
  harness.cursor = 0;
  harness.effects = [];
  NotificationProvider({ children: null });
  assert.ok(harness.contextValue);
  return harness.contextValue;
}

async function flushProviderMount(harness: ProviderHarness): Promise<NonNullable<ProviderHarness['contextValue']>> {
  renderProvider(harness);
  for (const effect of harness.effects) effect();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  return renderProvider(harness);
}

test('provider grants read access after unread count succeeds with zero items', async () => {
  const context = await flushProviderMount(createProviderHarness());
  assert.equal(context.canReadNotifications, true);
  assert.equal(context.unreadTotal, 0);
});

test('provider clears read access when the disabled rollout gate returns a 503', async () => {
  const harness = createProviderHarness({
    getUnreadCount: async () => {
      throw new ApiException(503, 'NOTIFICATIONS_DISABLED');
    },
  });
  const context = await flushProviderMount(harness);
  assert.equal(context.canReadNotifications, false);
  assert.equal(context.error, true);
});

test('provider clears read access when the unread count request is unauthorized', async () => {
  const harness = createProviderHarness({
    getUnreadCount: async () => {
      throw new ApiException(401, 'UNAUTHORIZED');
    },
  });
  const context = await flushProviderMount(harness);
  assert.equal(context.canReadNotifications, false);
  assert.equal(context.error, false);
});

test('provider clears read access when the unread count request is forbidden', async () => {
  const harness = createProviderHarness({
    getUnreadCount: async () => {
      throw new ApiException(403, 'FORBIDDEN');
    },
  });
  const context = await flushProviderMount(harness);
  assert.equal(context.canReadNotifications, false);
  assert.equal(context.error, true);
});

test('provider keeps read access when a later count invalidation clears only unread state', async () => {
  const harness = createProviderHarness();
  let context = await flushProviderMount(harness);
  assert.equal(context.canReadNotifications, true);
  context.applyUnreadCount(null);
  context = renderProvider(harness);
  assert.equal(context.canReadNotifications, true);
  assert.equal(context.unreadTotal, null);
});

test('provider hides stale read access while a new signed-in identity loads', async () => {
  const harness = createProviderHarness({
    getUnreadCount: async () => ({ total: 4, by_category: {}, as_of: '2026-10-10T00:00:00Z' }),
  });
  let context = await flushProviderMount(harness);
  assert.equal(context.canReadNotifications, true);
  harness.auth = { token: 'token-b', userInfo: signedInUser('usr_b', 'token-b'), isLoading: false };
  context = renderProvider(harness);
  assert.equal(context.canReadNotifications, false);
  assert.equal(context.unreadTotal, null);
});

test('provider hides stale read access when the same user receives a new token', async () => {
  const harness = createProviderHarness({
    getUnreadCount: async () => ({ total: 3, by_category: {}, as_of: '2026-10-10T00:00:00Z' }),
  });
  let context = await flushProviderMount(harness);
  assert.equal(context.canReadNotifications, true);
  harness.auth = { token: 'token-b', userInfo: signedInUser('usr_a', 'token-b'), isLoading: false };
  context = renderProvider(harness);
  assert.equal(context.canReadNotifications, false);
  assert.equal(context.unreadTotal, null);
});
