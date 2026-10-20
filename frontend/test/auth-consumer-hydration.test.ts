import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AuthToken } from '../src/lib/types.ts';

type AuthValue = {
  token: string | null; userInfo: AuthToken | null; isLoading: boolean;
  ensureToken(): Promise<string>; login(value: AuthToken): void; logout(): void;
  captureAuthOwner(id: string | null): () => boolean; syncPlan(plan: AuthToken['plan']): void;
};
const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/auth-context.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function authValue(plan: AuthToken['plan'] | null, id = 'owner'): AuthValue {
  return {
    token: plan ? `${id}-token` : null,
    userInfo: plan ? { user_id: id, access_token: `${id}-token`, token_type: 'bearer', plan } : null,
    isLoading: plan === null,
    ensureToken: async () => `${id}-token`, login() {}, logout() {}, captureAuthOwner: () => () => true, syncPlan() {},
  };
}
function loadAuth(react: Record<string, any>) {
  const output: Record<string, any> = {};
  vm.runInNewContext(source, {
    exports: output,
    require(name: string) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return jsxRuntime;
      if (['@clerk/nextjs', './api', './photo-preview-cache', './product-analytics', './review-thumbnail-cache'].includes(name)) return {};
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  return output as { useAuth(): AuthValue };
}
function consumerHarness(initial: AuthValue) {
  let context = initial;
  let phase: 'server' | 'hydrating' | 'client' = 'hydrating';
  const subscriptions: Array<() => () => void> = [];
  const snapshots: Array<{ client: () => boolean; server: () => boolean }> = [];
  const auth = loadAuth({
    ...React, useContext: () => context,
    useSyncExternalStore(subscribe: () => () => void, client: () => boolean, server: () => boolean) {
      subscriptions.push(subscribe); snapshots.push({ client, server });
      return phase === 'client' ? client() : server();
    },
  });
  return { read: () => auth.useAuth(), subscriptions, snapshots,
    setPhase(value: typeof phase) { phase = value; }, setContext(value: AuthValue) { context = value; },
  };
}

for (const plan of ['guest', 'free', 'pro'] as const) {
  test(`actual useAuth SSR remains the loading snapshot when parent already restored ${plan}`, () => {
    const context = authValue(plan);
    const auth = loadAuth({ ...React, useContext: () => context });
    let actual: AuthValue | undefined;
    function Consumer() {
      actual = auth.useAuth();
      return React.createElement('div', { 'data-owner': actual.userInfo?.user_id ?? 'none', 'data-token': actual.token ?? 'none' }, actual.isLoading ? 'loading' : actual.userInfo?.plan);
    }
    assert.equal(renderToStaticMarkup(React.createElement(Consumer)), '<div data-owner="none" data-token="none">loading</div>');
    assert.equal(actual?.ensureToken, context.ensureToken);
    assert.equal(actual?.captureAuthOwner, context.captureAuthOwner);
  });

  test(`delayed ${plan} consumer matches SSR then reveals current auth without changing callbacks`, () => {
    const context = authValue(plan), app = consumerHarness(context);
    app.setPhase('server'); const server = app.read();
    app.setPhase('hydrating'); const firstClient = app.read();
    assert.equal(firstClient.userInfo, null); assert.equal(firstClient.token, null); assert.equal(firstClient.isLoading, true);
    assert.deepEqual(firstClient, server);
    for (const method of ['ensureToken', 'login', 'logout', 'captureAuthOwner', 'syncPlan'] as const) assert.equal(firstClient[method], context[method]);
    app.setPhase('client'); assert.equal(app.read(), context, 'interactive consumers receive the live context object');
  });
}

test('client-only navigation sees current auth immediately instead of replaying a hydration gate', () => {
  const context = authValue('pro'), app = consumerHarness(context);
  app.setPhase('client'); assert.equal(app.read(), context);
});

test('hydrated consumers follow logout/account changes synchronously and never retain the prior owner', () => {
  const app = consumerHarness(authValue('pro', 'first')); app.setPhase('client');
  assert.equal(app.read().userInfo?.user_id, 'first');
  const loggedOut = { ...authValue(null), isLoading: false }; app.setContext(loggedOut);
  assert.equal(app.read(), loggedOut); assert.equal(app.read().userInfo, null);
  const second = authValue('free', 'second'); app.setContext(second);
  assert.equal(app.read(), second); assert.equal(app.read().userInfo?.user_id, 'second');
});

test('same-owner token renewal does not re-mask an already hydrated consumer', () => {
  const context = authValue('pro'), app = consumerHarness(context); app.setPhase('client'); app.read();
  const renewed = { ...context, token: 'renewed-token', userInfo: { ...context.userInfo!, access_token: 'renewed-token' } };
  app.setContext(renewed);
  assert.equal(app.read(), renewed); assert.equal(app.read().isLoading, false);
  assert.equal(app.read().ensureToken, context.ensureToken); assert.equal(app.read().captureAuthOwner, context.captureAuthOwner);
});

test('hydration discriminator uses stable subscription/snapshot functions with cached boolean values', () => {
  const app = consumerHarness(authValue('guest')); app.read(); app.setPhase('client'); app.read();
  assert.equal(app.subscriptions[0], app.subscriptions[1]);
  assert.equal(app.snapshots[0].client, app.snapshots[1].client); assert.equal(app.snapshots[0].server, app.snapshots[1].server);
  assert.equal(app.snapshots[0].server(), false); assert.equal(app.snapshots[0].client(), true);
  assert.equal(typeof app.subscriptions[0](), 'function');
});
