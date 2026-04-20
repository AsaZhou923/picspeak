import type { AuthToken } from '@/lib/types';

export interface HeaderVisibilityState {
  userInfo: AuthToken | null;
  showUsageNav: boolean;
  showAuthenticatedControls: boolean;
  showMobileTabs: boolean;
}

export function getHeaderVisibilityState({
  hasHydrated,
  userInfo,
}: {
  hasHydrated: boolean;
  userInfo: AuthToken | null;
}): HeaderVisibilityState {
  const safeUserInfo = hasHydrated ? userInfo : null;

  return {
    userInfo: safeUserInfo,
    showUsageNav: Boolean(safeUserInfo),
    showAuthenticatedControls: Boolean(safeUserInfo),
    showMobileTabs: Boolean(safeUserInfo),
  };
}
