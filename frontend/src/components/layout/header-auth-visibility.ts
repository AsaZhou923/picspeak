import type { AuthToken } from '@/lib/types';

export interface HeaderVisibilityState {
  userInfo: AuthToken | null;
  showUsageNav: boolean;
  showAuthenticatedControls: boolean;
  showMobileTabs: boolean;
}

function isAuthenticatedHeaderUser(userInfo: AuthToken | null): userInfo is AuthToken {
  return Boolean(userInfo && userInfo.plan !== 'guest');
}

export function getHeaderVisibilityState({
  hasHydrated,
  userInfo,
}: {
  hasHydrated: boolean;
  userInfo: AuthToken | null;
}): HeaderVisibilityState {
  const safeUserInfo = hasHydrated && isAuthenticatedHeaderUser(userInfo) ? userInfo : null;

  return {
    userInfo: safeUserInfo,
    showUsageNav: Boolean(safeUserInfo),
    showAuthenticatedControls: Boolean(safeUserInfo),
    showMobileTabs: Boolean(safeUserInfo),
  };
}
