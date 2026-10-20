import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { componentHarness, settle } from './helpers/component-harness.ts';
import { enTranslations } from '../src/lib/i18n-en.ts';
import { zhTranslations } from '../src/lib/i18n-zh.ts';
import { jaTranslations } from '../src/lib/i18n-ja.ts';
import * as notificationState from '../src/features/notifications/notification-state.ts';
import type { AuthToken } from '../src/lib/types.ts';

type Locale = 'en' | 'zh' | 'ja';
type Plan = 'guest' | 'free' | 'pro';
const translations = { en: enTranslations, zh: zhTranslations, ja: jaTranslations };
const pages = ['NotificationsPageClient', 'NotificationSettingsClient', 'NotificationDetailClient'] as const;
const source = (name: string) => new URL(`../src/features/notifications/${name}.tsx`, import.meta.url);
const user = (plan: Plan): AuthToken => ({ user_id: `owner-${plan}`, access_token: `${plan}-token`, plan, token_type: 'bearer' });

function loadComponent(name: string, modules: Record<string, any>) {
  const output: Record<string, any> = {};
  const code = ts.transpileModule(fs.readFileSync(source(name), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports: output, AbortController,
    require(specifier: string) {
      if (specifier === 'react') return React;
      if (specifier === 'react/jsx-runtime') return jsxRuntime;
      assert.ok(specifier in modules, `missing module ${specifier}`);
      return modules[specifier];
    },
  });
  return output;
}

// Load the real consumer hook, replacing only its context with the state an
// already-mounted parent provider would expose. Real React selects the server
// snapshot during SSR and the first hydration render. Settled component tests
// select the client snapshot explicitly, without changing the adapter itself.
function loadAuthAdapter(auth: { token: string | null; userInfo: AuthToken | null; isLoading: boolean }, hydrated = false) {
  const output: Record<string, any> = {};
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/lib/auth-context.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports: output,
    require(specifier: string) {
      if (specifier === 'react') return {
        ...React,
        useContext: () => auth,
        ...(hydrated ? { useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot() } : {}),
      };
      if (specifier === 'react/jsx-runtime') return jsxRuntime;
      assert.ok(['@clerk/nextjs', './api', './photo-preview-cache', './product-analytics', './review-thumbnail-cache'].includes(specifier), `unexpected auth dependency ${specifier}`);
      return {};
    },
  });
  return { useAuth: output.useAuth };
}

function context(locale: Locale, plan: Plan | null) {
  const auth = { token: plan ? `${plan}-token` : null, userInfo: plan ? user(plan) : null, isLoading: plan === null };
  const calls: string[] = [];
  const t = (key: keyof typeof enTranslations) => translations[locale][key];
  const notifications = { unread: null, applyUnreadCount() {}, refreshUnreadCount: async () => {} };
  const modules: Record<string, any> = {
    'next/link': { default: 'a' },
    'lucide-react': Object.fromEntries(['Archive', 'ArrowLeft', 'Bell', 'CheckCheck', 'ChevronRight', 'Heart', 'Inbox', 'RefreshCw', 'Settings'].map(name => [name, 'svg'])),
    '@/lib/auth-context': loadAuthAdapter(auth),
    '@/lib/i18n': { useI18n: () => ({ locale, t }) },
    '@/lib/locale': { localeToIntlLocale: (value: string) => value },
    '@/lib/error-utils': { formatUserFacingError: () => 'error' },
    '@/lib/types': { ApiException: class extends Error {} },
    '@/lib/product-analytics': { trackProductEvent: () => { calls.push('analytics'); } },
    './NotificationProvider': { useNotifications: () => notifications },
    './notification-state': notificationState,
    '@/lib/api': {
      getNotifications: async () => { calls.push('inbox'); return { items: [], next_cursor: null }; },
      getNotificationDetail: async () => { calls.push('detail'); return { notification_id: 'notification-test', category: 'system', type: 'system', title: 'Private notice', summary: 'Private summary', body: 'Private body', occurred_at: '2026-10-20T00:00:00Z', read_at: '2026-10-20T00:00:00Z', target: null }; },
      getNotificationPreferences: async () => { calls.push('preferences'); return { likes_enabled: false, announcements_enabled: false }; },
    },
  };
  return { auth, calls, modules };
}

// Auth can restore session storage before a delayed account Suspense boundary
// hydrates. Compare the actual initial HTML, without running passive effects.
for (const locale of ['en', 'zh', 'ja'] as const) {
  for (const page of pages) {
    for (const plan of ['guest', 'free', 'pro'] as const) {
      test(`${page}: restored ${plan}/${locale} first render matches loading SSR`, () => {
        const server = context(locale, null), client = context(locale, plan);
        const render = (modules: Record<string, any>) => renderToStaticMarkup(React.createElement(loadComponent(page, modules).default, { notificationId: 'notification-test' }));
        assert.equal(render(client.modules), render(server.modules));
        assert.deepEqual(client.calls, [], 'initial rendering does not request private data or record analytics');
      });
    }
  }
}

for (const locale of ['en', 'zh', 'ja'] as const) {
  for (const page of pages) {
    for (const plan of ['guest', 'free', 'pro'] as const) {
      test(`${page}: hydrated ${plan}/${locale} preserves access and owner isolation`, async () => {
        const app = context(locale, plan);
        app.modules['@/lib/auth-context'] = loadAuthAdapter(app.auth, true);
        const events = { addEventListener() {}, removeEventListener() {} };
        const harness = componentHarness(source(page), app.modules, {
          window: events, document: { ...events, visibilityState: 'visible' }, navigator: { onLine: true },
        });
        try {
          harness.render({ notificationId: 'notification-test' });
          await settle();
          harness.render({ notificationId: 'notification-test' });
          if (plan === 'guest') {
            assert.ok(harness.text().includes(translations[locale].notifications_auth_title));
            assert.deepEqual(app.calls, [], 'guests do not fetch private notifications or record authenticated events');
          } else {
            const request = page === 'NotificationsPageClient' ? 'inbox' : page === 'NotificationDetailClient' ? 'detail' : 'preferences';
            assert.equal(app.calls.filter(call => call === request).length, 1, 'authorized data loads after hydration');
            assert.ok(!harness.text().includes(translations[locale].notifications_auth_title));
            const priorCalls = [...app.calls];
            app.auth.userInfo = user('guest');
            app.auth.token = 'guest-token';
            harness.render({ notificationId: 'notification-test' });
            assert.ok(harness.text().includes(translations[locale].notifications_auth_title));
            assert.doesNotMatch(harness.text(), /Private notice|Private summary|Private body/);
            assert.deepEqual(app.calls, priorCalls, 'account changes hide private data without new guest requests');
          }
        } finally {
          harness.unmount();
        }
      });
    }
  }
}
