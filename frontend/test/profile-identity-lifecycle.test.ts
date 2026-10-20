import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, settle } from './helpers/component-harness.ts';

const t = (key: string) => key;
const copy = new Proxy({}, { get: (_target, key) => String(key) });
const settings = (owner: string, enabled = false) => ({
  username: owner, avatar_url: null, gallery_review_count: 0,
  public_profile_enabled: enabled, public_profile_id: enabled ? `public-${owner}` : null,
});

function profileHarness() {
  let locale = 'en';
  let translation = t;
  let owner = 'owner-a';
  let token = `${owner}-token`;
  let tokenResult: Promise<string> | null = null;
  const writes: Array<{ token: string; enabled: boolean }> = [];
  let update = async (nextToken: string, enabled: boolean) => settings(nextToken, enabled);
  const ensureToken = () => tokenResult ?? Promise.resolve(token);
  const auth = () => ({ userInfo: { user_id: owner, plan: 'free', access_token: token }, ensureToken });
  const app = componentHarness(new URL('../src/app/account/profile/page.tsx', import.meta.url), {
    'next/image': { default: 'Image' }, 'next/link': { default: 'Link' }, 'lucide-react': {},
    '@/components/auth/ClerkSignInTrigger': { default: 'SignIn' },
    '@/lib/auth-context': { useAuth: auth }, '@/lib/i18n': { useI18n: () => ({ t: translation, locale }) },
    '@/features/profile/profile-copy': { getProfileCopy: () => copy },
    '@/lib/error-utils': { formatUserFacingError: () => 'localized-error' },
    '@/features/profile/api': {
      ProfileApiError: class extends Error {},
      getMyProfileSettings: async (nextToken: string) => settings(nextToken),
      updateMyProfileSettings: async (nextToken: string, enabled: boolean) => {
        writes.push({ token: nextToken, enabled });
        return update(nextToken, enabled);
      },
    },
  });
  return {
    ...app, writes,
    changeLocale() { locale = 'ja'; translation = (key: string) => `ja:${key}`; app.render(); },
    refreshToken() { token = `${owner}-refreshed`; app.render(); },
    holdToken(value: Promise<string> | null) { tokenResult = value; },
    changeOwner(next: string) { owner = next; token = `${owner}-token`; app.render(); },
    deferWrite(value: Promise<ReturnType<typeof settings>>) { update = () => value; },
    toggle() { return app.nodes((node) => node.type === 'button' && node.props.className.includes('ui-action-primary'))[0]; },
  };
}

async function ready(app: ReturnType<typeof profileHarness>) {
  app.render(); await settle(); app.render();
}

test('deferred authentication cannot publish a different account after switching identities', async () => {
  const app = profileHarness(); await ready(app);
  const pendingToken = deferred<string>(); app.holdToken(pendingToken.promise);
  app.toggle().props.onClick();
  app.changeOwner('owner-b');
  pendingToken.resolve('owner-b-token'); await settle(); app.render();
  assert.deepEqual(app.writes, []);
  app.holdToken(null);
  app.toggle().props.onClick(); await settle(); app.render();
  assert.deepEqual(app.writes, [{ token: 'owner-b-token', enabled: true }]);
  app.unmount();
});

test('a returned new token is rejected even before its auth update renders', async () => {
  const app = profileHarness(); await ready(app);
  app.holdToken(Promise.resolve('owner-b-token'));
  app.toggle().props.onClick(); await settle(); app.render();
  assert.deepEqual(app.writes, []);
  app.unmount();
});

test('leaving during ensureToken prevents a late profile mutation', async () => {
  const app = profileHarness(); await ready(app);
  const pendingToken = deferred<string>(); app.holdToken(pendingToken.promise);
  app.toggle().props.onClick(); app.unmount();
  pendingToken.resolve('owner-a-token'); await settle();
  assert.deepEqual(app.writes, []);
});

test('rapid publishing clicks create one mutation and late owner-a results cannot overwrite owner-b', async () => {
  const app = profileHarness(); await ready(app);
  const pendingWrite = deferred<ReturnType<typeof settings>>(); app.deferWrite(pendingWrite.promise);
  const toggle = app.toggle(); toggle.props.onClick(); toggle.props.onClick(); await settle();
  assert.deepEqual(app.writes, [{ token: 'owner-a-token', enabled: true }]);
  app.changeOwner('owner-b'); await settle(); app.render();
  pendingWrite.resolve(settings('owner-a', true)); await settle(); app.render();
  assert.doesNotMatch(app.text(), /public-owner-a/);
  assert.match(app.text(), /owner-b-token/);
  assert.equal(app.toggle().props.disabled, false);
  app.unmount();
});

for (const refresh of ['locale', 'token'] as const) {
  test(`confirmed profile publication survives a concurrent ${refresh} refresh`, async () => {
    const app = profileHarness(); await ready(app);
    const pendingWrite = deferred<ReturnType<typeof settings>>(); app.deferWrite(pendingWrite.promise);
    app.toggle().props.onClick(); await settle();
    if (refresh === 'locale') app.changeLocale();
    else app.refreshToken();
    await settle(); app.render();
    pendingWrite.resolve(settings('owner-a', true)); await settle(); app.render();
    assert.match(app.text(), /public-owner-a/);
    assert.equal(app.writes.length, 1);
    app.unmount();
  });
}
