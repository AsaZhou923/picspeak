import test from 'node:test';
import assert from 'node:assert/strict';
import { getHeaderVisibilityState } from '../src/components/layout/header-auth-visibility.ts';
import type { AuthToken } from '../src/lib/types.ts';

const signedInUser: AuthToken = {
  access_token: 'token',
  token_type: 'bearer',
  user_id: 'usr_123',
  plan: 'free',
  auth_provider: 'clerk',
  clerk_user_id: 'clerk_123',
};

test('keeps auth-only header branches hidden before hydration even when user info exists', () => {
  const state = getHeaderVisibilityState({
    hasHydrated: false,
    userInfo: signedInUser,
  });

  assert.equal(state.showUsageNav, false);
  assert.equal(state.showAuthenticatedControls, false);
  assert.equal(state.showMobileTabs, false);
  assert.equal(state.userInfo, null);
});

test('shows auth-only header branches after hydration when user info exists', () => {
  const state = getHeaderVisibilityState({
    hasHydrated: true,
    userInfo: signedInUser,
  });

  assert.equal(state.showUsageNav, true);
  assert.equal(state.showAuthenticatedControls, true);
  assert.equal(state.showMobileTabs, true);
  assert.equal(state.userInfo?.user_id, 'usr_123');
});

test('stays in guest shell when there is no user info', () => {
  const state = getHeaderVisibilityState({
    hasHydrated: true,
    userInfo: null,
  });

  assert.equal(state.showUsageNav, false);
  assert.equal(state.showAuthenticatedControls, false);
  assert.equal(state.showMobileTabs, false);
});
