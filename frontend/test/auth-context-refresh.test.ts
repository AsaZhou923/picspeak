import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { deferred, settle } from './helpers/component-harness.ts';
import type { AuthToken } from '../src/lib/types.ts';

const jwt = (id: string, exp = 200) => `header.${Buffer.from(JSON.stringify({ sub: id, exp })).toString('base64url')}.signature`;
const owner = (id = 'owner', exp = 200): AuthToken => ({ user_id: id, access_token: jwt(id, exp), token_type: 'bearer', plan: 'free', auth_provider: 'clerk', clerk_user_id: `clerk-${id}` });
const guest = (id = 'guest', exp = 200): AuthToken => ({ user_id: id, access_token: jwt(id, exp), token_type: 'bearer', plan: 'guest', auth_provider: 'guest' });
type AuthValue = {
  token: string | null; userInfo: AuthToken | null; isLoading: boolean;
  ensureToken(): Promise<string>; login(value: AuthToken): void; logout(): void;
  captureAuthOwner(id: string | null): () => boolean;
};
type Slot = { value?: any; deps?: unknown[]; cleanup?: () => void; effect?: () => void | (() => void) };

/** Runs the actual provider with deterministic hook renders and deferred API responses. */
function authHarness(initial: AuthToken | null = owner(), signedIn = true, initialExchange?: (token: string) => Promise<AuthToken>, options: { loaded?: boolean; waitTimeoutMs?: number } = {}) {
  let now = 100_000, cursor = 0, dirty = false;
  let effects: Array<() => void> = [];
  let unauthorized: ((token: string) => Promise<string | null>) | null = null;
  let exchange: (token: string) => Promise<AuthToken> = initialExchange ?? (async () => owner('owner', 400));
  let createGuest: () => Promise<AuthToken> = async () => guest();
  let value: AuthValue;
  let cacheClears = 0, exchangeCalls = 0, guestCalls = 0;
  const slots: Slot[] = [];
  const snapshots: Array<{ owner: string | null; token: string | null; loading: boolean }> = [];
  const session = new Map<string, string>(initial ? [['ps_token', JSON.stringify(initial)]] : []);
  const storage = (map: Map<string, string>) => ({ getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, val: string) => map.set(key, val), removeItem: (key: string) => map.delete(key) });
  const clerk = { isLoaded: options.loaded ?? true, isSignedIn: signedIn, userId: signedIn ? 'clerk-owner' : null as string | null, getToken: async (): Promise<string | null> => `session-${clerk.userId}` };
  const memo = (factory: () => any, deps: unknown[]) => {
    const index = cursor++;
    if (!slots[index]?.deps || deps.some((dep, i) => !Object.is(dep, slots[index].deps?.[i]))) slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const exports: Record<string, any> = {};
  const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/auth-context.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, atob, document: { cookie: '' }, Date: class extends Date { static now() { return now; } },
    window: { sessionStorage: storage(session), localStorage: storage(new Map()), setTimeout: (fn: () => void, delay: number) => setTimeout(fn, options.waitTimeoutMs ?? delay), clearTimeout },
    require(name: string) {
      if (name === 'react/jsx-runtime') return { jsx: (type: unknown, props: any) => ({ type, props }) };
      if (name === 'react') return {
        createContext: () => ({ Provider: 'Provider' }), useContext: () => value,
        useState(initialValue: any) {
          const index = cursor++;
          slots[index] ??= { value: initialValue };
          return [slots[index].value, (next: any) => { const result = typeof next === 'function' ? next(slots[index].value) : next; dirty ||= !Object.is(slots[index].value, result); slots[index].value = result; }];
        },
        useRef: (initialValue: any) => memo(() => ({ current: initialValue }), []), useCallback: (fn: any, deps: unknown[]) => memo(() => fn, deps),
        useEffect(fn: () => void | (() => void), deps: unknown[]) {
          const index = cursor++, previous = slots[index];
          if (!previous?.deps || deps.some((dep, i) => !Object.is(dep, previous.deps?.[i]))) {
            const slot: Slot = { deps, effect: fn }; slots[index] = slot;
            effects.push(() => { previous?.cleanup?.(); slot.cleanup = fn() ?? undefined; });
          }
        },
      };
      if (name === '@clerk/nextjs') return { useAuth: () => clerk };
      if (name === './api') return {
        authClerkExchange: (token: string) => { exchangeCalls++; return exchange(token); },
        authGuest: () => { guestCalls++; return createGuest(); },
        clearUsageCache: () => { cacheClears++; },
        registerUnauthorizedHandler: (handler: typeof unauthorized) => { unauthorized = handler; },
      };
      if (name === './photo-preview-cache') return { clearPhotoPreviewCache() {} };
      if (name === './review-thumbnail-cache') return { clearReviewThumbnailCache() {} };
      if (name === './product-analytics') return { trackProductEvent() {} };
      throw Error(`Unexpected module ${name}`);
    },
  });
  const render = (runEffects = true) => {
    let turns = 0;
    do {
      dirty = false; cursor = 0; effects = [];
      value = exports.AuthProvider({ children: null }).props.value;
      snapshots.push({ owner: value.userInfo?.user_id ?? null, token: value.token, loading: value.isLoading });
      if (!runEffects) break;
      effects.forEach((effect) => effect());
      assert.ok(++turns < 30, 'provider settles');
    } while (dirty);
    return value;
  };
  render();
  return {
    render, snapshots, session, clerk,
    get value() { return value; }, get cacheClears() { return cacheClears; }, get exchangeCalls() { return exchangeCalls; }, get guestCalls() { return guestCalls; },
    expire() { now = 201_000; },
    exchange(fn: typeof exchange) { exchange = fn; }, createGuest(fn: typeof createGuest) { createGuest = fn; },
    recover(token: string) { assert.ok(unauthorized); return unauthorized(token); },
    unmount() { slots.forEach((slot) => slot.cleanup?.()); },
    replayMountEffects() {
      slots.forEach((slot) => slot.cleanup?.());
      slots.forEach((slot) => { if (slot.effect) slot.cleanup = slot.effect() ?? undefined; });
    },
  };
}

test('actual AuthProvider preserves identity, draft lifetime and caches during an expired same-owner renewal', async () => {
  const app = authHarness();
  const deferredExchange = deferred<AuthToken>();
  app.exchange(() => deferredExchange.promise);
  const guard = app.value.captureAuthOwner('owner'), ensure = app.value.ensureToken;
  const baselineClears = app.cacheClears, start = app.snapshots.length;
  app.expire();
  const first = ensure(), second = ensure();
  await settle(); app.render();
  assert.equal(app.exchangeCalls, 1, 'concurrent renewal uses one exchange');
  assert.equal(app.value.userInfo?.user_id, 'owner');
  assert.equal(guard(), true);
  assert.equal(app.cacheClears, baselineClears);
  deferredExchange.resolve(owner('owner', 400));
  assert.deepEqual(await Promise.all([first, second]), [jwt('owner', 400), jwt('owner', 400)]);
  app.render();
  assert.equal(app.value.ensureToken, ensure, 'token refresh does not restart dependent data effects');
  assert.equal(guard(), true);
  assert.ok(app.snapshots.slice(start).every((snapshot) => snapshot.owner === 'owner' && !snapshot.loading), 'there is no transient anonymous/loading identity to reset a draft');
  assert.equal(app.cacheClears, baselineClears);
  app.unmount();
});

test('401 recovery really renews an unexpired token without clearing owner and stays single-flight', async () => {
  const app = authHarness(), response = deferred<AuthToken>();
  app.exchange(() => response.promise);
  const guard = app.value.captureAuthOwner('owner'), baselineClears = app.cacheClears;
  const first = app.recover(jwt('owner')), second = app.recover(jwt('owner'));
  await settle(); app.render();
  assert.equal(app.exchangeCalls, 1); assert.equal(guard(), true); assert.equal(app.value.userInfo?.user_id, 'owner');
  response.resolve(owner('owner', 400));
  assert.deepEqual(await Promise.all([first, second]), [jwt('owner', 400), jwt('owner', 400)]);
  app.render(); assert.equal(app.cacheClears, baselineClears); assert.equal(guard(), true);
  app.unmount();
});

for (const reason of ['logout', 'new-owner', 'same-owner-relogin', 'unmount'] as const) test(`late exchange cannot revive an invalidated owner after ${reason}`, async () => {
  const app = authHarness(), response = deferred<AuthToken>();
  app.exchange(() => response.promise); app.expire();
  const guard = app.value.captureAuthOwner('owner');
  const pending = app.value.ensureToken(); await settle();
  if (reason === 'unmount') app.unmount();
  else if (reason === 'new-owner') app.value.login({ ...owner('other', 400), clerk_user_id: 'clerk-owner' });
  else { app.value.logout(); if (reason === 'same-owner-relogin') app.value.login(owner('owner', 500)); }
  assert.equal(guard(), false, 'invalidation is synchronous without a React rerender');
  if (reason === 'new-owner') assert.equal(app.value.captureAuthOwner('owner')(), false, 'stale rendered owner cannot capture the new session');
  response.resolve(owner('owner', 400));
  await assert.rejects(pending, { name: 'AbortError' });
  if (reason !== 'unmount') {
    app.render();
    assert.equal(app.value.userInfo?.user_id ?? null, reason === 'logout' ? null : reason === 'new-owner' ? 'other' : 'owner');
    if (reason === 'same-owner-relogin') assert.equal(app.value.token, jwt('owner', 500));
    app.unmount();
  }
});

test('old unauthorized response neither renews nor returns a different account token', async () => {
  const app = authHarness();
  app.value.login({ ...owner('other', 400), clerk_user_id: 'clerk-owner' });
  const cleared = app.cacheClears;
  assert.equal(await app.recover(jwt('owner')), null);
  app.render();
  assert.equal(app.value.userInfo?.user_id, 'other');
  assert.equal(app.exchangeCalls, 0); assert.equal(app.cacheClears, cleared);
  app.unmount();
});

test('temporary same-owner renewal failure preserves identity, while confirmed revoked auth clears it', async () => {
  const app = authHarness(); app.expire();
  const guard = app.value.captureAuthOwner('owner'), cleared = app.cacheClears;
  app.exchange(async () => { throw Error('temporary network failure'); });
  await assert.rejects(app.value.ensureToken(), /temporary/); app.render();
  assert.equal(app.value.userInfo?.user_id, 'owner'); assert.equal(guard(), true); assert.equal(app.cacheClears, cleared);
  app.exchange(async () => { throw Object.assign(Error('revoked'), { status: 401 }); });
  await assert.rejects(app.value.ensureToken(), /revoked/); app.render();
  assert.equal(app.value.userInfo, null); assert.equal(guard(), false); assert.ok(app.cacheClears > cleared);
  app.unmount();
});

test('initial ownerless guest bootstrap is permitted, but a registered login and a guest replacement invalidate it', async () => {
  const app = authHarness(null, false);
  const guard = app.value.captureAuthOwner(null);
  const token = await app.value.ensureToken(); app.render();
  assert.equal(token, jwt('guest')); assert.equal(guard(), true); assert.equal(app.guestCalls, 1);
  app.value.login(guest('another-guest')); assert.equal(guard(), false);
  app.value.logout(); const beforeRegistered = app.value.captureAuthOwner(null);
  app.value.login(owner()); assert.equal(beforeRegistered(), false);
  app.unmount();
});

test('cancelled initial Clerk synchronization cannot clear the newer owner caches', async () => {
  const app = authHarness(owner());
  const old = deferred<AuthToken>();
  app.exchange((token) => token === 'session-clerk-other' ? old.promise : Promise.resolve(owner('third', 400)));
  const guard = app.value.captureAuthOwner('owner');
  app.clerk.userId = 'clerk-other'; app.render(); await settle();
  assert.equal(guard(), false); assert.equal(app.value.userInfo, null);
  app.clerk.userId = 'clerk-third'; app.render(); await settle(); app.render();
  assert.equal(app.render().userInfo?.user_id, 'third');
  const cleared = app.cacheClears;
  old.reject(Object.assign(Error('old account exchange rejected'), { status: 401 }));
  await settle(); app.render();
  assert.equal(app.render().userInfo?.user_id, 'third'); assert.equal(app.cacheClears, cleared);
  app.unmount();
});

test('unauthorized recovery cannot replay with a replacement backend owner under the same Clerk identity', async () => {
  const app = authHarness();
  app.exchange(async () => ({ ...owner('replacement', 400), clerk_user_id: 'clerk-owner' }));
  const guard = app.value.captureAuthOwner('owner');
  await assert.rejects(app.recover(jwt('owner')), { name: 'AbortError' });
  assert.equal(guard(), false);
  app.render(); assert.equal(app.value.userInfo?.user_id, 'replacement');
  app.unmount();
});

test('startup ensureToken waits for initial registered discovery without aborting one-shot readers', async () => {
  const response = deferred<AuthToken>();
  const app = authHarness(null, true, () => response.promise);
  const guard = app.value.captureAuthOwner(null);
  const pending = app.value.ensureToken();
  await settle(); response.resolve(owner('owner', 400)); await settle(); app.render();
  assert.equal(await pending, jwt('owner', 400));
  assert.equal(app.value.isLoading, false); assert.equal(app.value.userInfo?.user_id, 'owner');
  assert.equal(guard(), false, 'ownerless actions do not gain registered account authority');
  app.unmount();
});

test('logout during initial auth discovery releases waiting reads and rejects stale exchange', async () => {
  const response = deferred<AuthToken>();
  const app = authHarness(null, true, () => response.promise);
  const pending = app.value.ensureToken();
  await settle(); app.value.logout();
  await assert.rejects(pending, { name: 'AbortError' });
  response.resolve(owner('owner', 400)); await settle(); app.render();
  assert.equal(app.value.userInfo, null); assert.equal(app.value.isLoading, false);
  app.unmount();
});

test('a startup ready-wait timeout joins the initializer exchange and cannot strand loading', async () => {
  const response = deferred<AuthToken>();
  const app = authHarness(null, true, () => response.promise, { waitTimeoutMs: 1 });
  const pending = app.value.ensureToken();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(app.exchangeCalls, 1, 'startup and timeout continuation share one in-flight exchange');
  response.resolve(owner('owner', 400));
  assert.equal(await pending, jwt('owner', 400));
  await settle(); app.render();
  assert.equal(app.value.userInfo?.user_id, 'owner'); assert.equal(app.value.isLoading, false);
  app.unmount();
});

test('a same-owner SDK callback refresh and explicit action share one exchange without loading churn', async () => {
  const response = deferred<AuthToken>(), app = authHarness();
  app.exchange(() => response.promise); app.expire();
  const start = app.snapshots.length, guard = app.value.captureAuthOwner('owner');
  app.clerk.getToken = async () => 'new-clerk-session'; app.render();
  const pending = app.value.ensureToken(); await settle(); app.render();
  assert.equal(app.exchangeCalls, 1); assert.equal(guard(), true);
  response.resolve(owner('owner', 400)); await pending; await settle(); app.render();
  assert.ok(app.snapshots.slice(start).every((snapshot) => snapshot.owner === 'owner' && !snapshot.loading));
  app.unmount();
});

test('first loaded Clerk state synchronously hides an incompatible persisted owner before effects', () => {
  const app = authHarness(owner(), true, undefined, { loaded: false });
  const guard = app.value.captureAuthOwner('owner');
  app.clerk.isLoaded = true; app.clerk.isSignedIn = false; app.clerk.userId = null;
  app.render(false);
  assert.equal(app.value.userInfo, null); assert.equal(app.value.token, null); assert.equal(guard(), false);
  app.unmount();
});

test('expired guest renewal preserves its owner, but logout blocks a late guest response', async () => {
  const app = authHarness(guest(), false), response = deferred<AuthToken>();
  app.createGuest(() => response.promise); app.expire();
  const guard = app.value.captureAuthOwner('guest'), cleared = app.cacheClears;
  const pending = app.value.ensureToken(); await settle(); app.render();
  assert.equal(app.value.userInfo?.user_id, 'guest'); assert.equal(guard(), true); assert.equal(app.cacheClears, cleared);
  app.value.logout(); assert.equal(guard(), false);
  response.resolve(guest('guest', 400)); await assert.rejects(pending, { name: 'AbortError' });
  app.render(); assert.equal(app.value.userInfo, null);
  app.unmount();
});

test('missing Clerk session confirms logout instead of retaining a private identity', async () => {
  const app = authHarness(); app.expire();
  const guard = app.value.captureAuthOwner('owner');
  app.clerk.getToken = async () => null; app.render();
  await assert.rejects(app.value.ensureToken(), /Missing Clerk|Authentication changed/);
  await settle(); app.render();
  assert.equal(app.value.userInfo, null); assert.equal(app.value.isLoading, false); assert.equal(guard(), false);
  app.unmount();
});

test('StrictMode setup-cleanup-setup does not join an invalidated initializer promise', async () => {
  const response = deferred<AuthToken>();
  const app = authHarness(null, true, () => response.promise);
  app.replayMountEffects(); await settle();
  assert.equal(app.exchangeCalls, 1, 'only the live initializer reaches the API');
  response.resolve(owner('owner', 400)); await settle(); app.render();
  assert.equal(app.value.userInfo?.user_id, 'owner'); assert.equal(app.value.isLoading, false);
  app.unmount();
});
