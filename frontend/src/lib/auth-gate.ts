import type { AuthToken } from './types';

/**
 * What an auth-required action may render. `loading` covers every undetermined
 * state (not hydrated, Clerk still loading, fallback not yet decided) so a
 * signed-in browser never briefly sees the guest sign-in instruction (#108).
 */
export type AuthGate = 'loading' | 'unavailable' | 'sign_in' | 'ready';

export function resolveAuthGate(auth: {
  isLoading: boolean;
  userInfo: Pick<AuthToken, 'plan'> | null;
  authUnavailable?: boolean;
}): AuthGate {
  if (auth.isLoading) return 'loading';
  if (auth.userInfo && auth.userInfo.plan !== 'guest') return 'ready';
  if (auth.authUnavailable) return 'unavailable';
  return 'sign_in';
}
