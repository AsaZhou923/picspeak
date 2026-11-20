import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLERK_LOAD_TIMEOUT_MS,
  CLERK_SIGNED_OUT_LOAD_TIMEOUT_MS,
  getClerkLoadTimeoutMs,
  isClerkJsScriptElement,
  isClerkScriptLoadError,
  parseClerkSessionHint,
  resolveClerkFallbackAction,
} from '../src/lib/clerk-fallback.ts';

const jwt = (sub: string, exp = 9_999_999_999) =>
  `header.${Buffer.from(JSON.stringify({ sub, exp })).toString('base64url')}.signature`;

test('parseClerkSessionHint treats missing or zero __client_uat as signed out', () => {
  assert.deepEqual(parseClerkSessionHint(''), { signedIn: false, clerkUserId: null });
  assert.deepEqual(parseClerkSessionHint('__client_uat=0'), { signedIn: false, clerkUserId: null });
  assert.deepEqual(parseClerkSessionHint('__client_uat_abc=0; other=1'), { signedIn: false, clerkUserId: null });
  assert.deepEqual(parseClerkSessionHint(`__client_uat=0; __session=${jwt('user_stale')}`), {
    signedIn: false,
    clerkUserId: null,
  });
});

test('parseClerkSessionHint detects signed-in cookies including suffixed variants', () => {
  assert.deepEqual(
    parseClerkSessionHint(`__client_uat=1700000000; __session=${jwt('user_123')}`),
    { signedIn: true, clerkUserId: 'user_123' },
  );
  assert.deepEqual(
    parseClerkSessionHint(`__client_uat_prod=1700000000; __session_prod=${jwt('user_456')}`),
    { signedIn: true, clerkUserId: 'user_456' },
  );
  assert.deepEqual(parseClerkSessionHint('__client_uat=1700000000'), {
    signedIn: true,
    clerkUserId: null,
  });
  assert.deepEqual(parseClerkSessionHint(`__session=${jwt('user_only_session')}`), {
    signedIn: true,
    clerkUserId: 'user_only_session',
  });
});

test('getClerkLoadTimeoutMs uses a short timeout for signed-out browsers and preserves 8s for signed-in', () => {
  assert.equal(getClerkLoadTimeoutMs({ signedIn: false }), CLERK_SIGNED_OUT_LOAD_TIMEOUT_MS);
  assert.ok(CLERK_SIGNED_OUT_LOAD_TIMEOUT_MS <= 2000);
  assert.equal(getClerkLoadTimeoutMs({ signedIn: true }), CLERK_LOAD_TIMEOUT_MS);
  assert.equal(CLERK_LOAD_TIMEOUT_MS, 8000);
});

test('isClerkScriptLoadError recognizes Clerk failed_to_load_clerk_js codes and messages', () => {
  assert.equal(isClerkScriptLoadError({ code: 'failed_to_load_clerk_js', message: 'Failed' }), true);
  assert.equal(
    isClerkScriptLoadError(new Error('Clerk: Failed to load Clerk JS (code="failed_to_load_clerk_js")')),
    true,
  );
  assert.equal(
    isClerkScriptLoadError({ errors: [{ code: 'failed_to_load_clerk_js' }] }),
    true,
  );
  assert.equal(
    isClerkScriptLoadError({ cause: { code: 'failed_to_load_clerk_js' } }),
    true,
  );
  assert.equal(isClerkScriptLoadError('failed_to_load_clerk_js'), true);
  assert.equal(isClerkScriptLoadError(new Error('ordinary network error')), false);
  assert.equal(isClerkScriptLoadError(null), false);
});

test('isClerkJsScriptElement matches SSR data-clerk-js-script and hotloaded clerk.browser.js tags only', () => {
  const makeScript = (attrs: Record<string, string>, src = '') => ({
    tagName: 'SCRIPT',
    src,
    hasAttribute: (name: string) => Object.prototype.hasOwnProperty.call(attrs, name),
    getAttribute: (name: string) => attrs[name] ?? null,
  });

  assert.equal(isClerkJsScriptElement(makeScript({ 'data-clerk-js-script': '' })), true);
  assert.equal(
    isClerkJsScriptElement(
      makeScript(
        { 'data-clerk-publishable-key': 'pk_live_123' },
        'https://clerk.example.com/npm/@clerk/clerk-js@6/dist/clerk.browser.js',
      ),
    ),
    true,
  );
  assert.equal(
    isClerkJsScriptElement(
      makeScript(
        { 'data-clerk-publishable-key': 'pk_live_123', 'data-clerk-ui-script': '' },
        'https://clerk.example.com/npm/@clerk/ui@1/dist/ui.browser.js',
      ),
    ),
    false,
  );
  assert.equal(
    isClerkJsScriptElement(makeScript({}, 'https://cdn.example.com/analytics.js')),
    false,
  );
  assert.equal(isClerkJsScriptElement({ tagName: 'IMG' }), false);
  assert.equal(isClerkJsScriptElement(null), false);
});

test('resolveClerkFallbackAction never downgrades a signed-in browser to guest', () => {
  assert.equal(
    resolveClerkFallbackAction({
      hint: { signedIn: true, clerkUserId: 'user_1' },
      persistedAuth: null,
      previousAuth: null,
      isPersistedMatchingClerkSession: false,
    }),
    'auth_unavailable',
  );
  assert.equal(
    resolveClerkFallbackAction({
      hint: { signedIn: true, clerkUserId: 'user_1' },
      persistedAuth: { auth_provider: 'guest' },
      previousAuth: null,
      isPersistedMatchingClerkSession: false,
    }),
    'auth_unavailable',
  );
  assert.equal(
    resolveClerkFallbackAction({
      hint: { signedIn: true, clerkUserId: 'user_1' },
      persistedAuth: { auth_provider: 'clerk', clerk_user_id: 'user_1' },
      previousAuth: null,
      isPersistedMatchingClerkSession: true,
    }),
    'reuse_persisted',
  );
  assert.equal(
    resolveClerkFallbackAction({
      hint: { signedIn: true, clerkUserId: 'user_2' },
      persistedAuth: { auth_provider: 'clerk', clerk_user_id: 'user_1' },
      previousAuth: null,
      isPersistedMatchingClerkSession: false,
    }),
    'logout',
  );
});

test('resolveClerkFallbackAction lets signed-out browsers continue as guest or clear stale Clerk sessions', () => {
  assert.equal(
    resolveClerkFallbackAction({
      hint: { signedIn: false, clerkUserId: null },
      persistedAuth: null,
      previousAuth: null,
      isPersistedMatchingClerkSession: false,
    }),
    'guest_ready',
  );
  assert.equal(
    resolveClerkFallbackAction({
      hint: { signedIn: false, clerkUserId: null },
      persistedAuth: { auth_provider: 'guest' },
      previousAuth: null,
      isPersistedMatchingClerkSession: false,
    }),
    'reuse_persisted',
  );
  assert.equal(
    resolveClerkFallbackAction({
      hint: { signedIn: false, clerkUserId: null },
      persistedAuth: { auth_provider: 'clerk', clerk_user_id: 'user_1' },
      previousAuth: null,
      isPersistedMatchingClerkSession: false,
    }),
    'logout',
  );
});
