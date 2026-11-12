'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useAuth as useClerkAuth, useClerk } from '@clerk/nextjs';
import { authClerkExchange, authGuest, clearUsageCache, registerUnauthorizedHandler } from './api';
import { clearPhotoPreviewCache } from './photo-preview-cache';
import { trackProductEvent } from './product-analytics';
import { clearReviewThumbnailCache } from './review-thumbnail-cache';
import type { AuthToken } from './types';

const TOKEN_KEY = 'ps_token';
const PHOTO_UPLOAD_CACHE_KEY = 'ps_uploaded_photos_v1';
const SIGN_IN_EVENT_KEY = 'ps_sign_in_event_v1';
// Shorter than the 10s readiness wait so a hung Clerk script is classified
// before waiting callers give up.
const CLERK_LOAD_TIMEOUT_MS = 8000;

/** What the browser's Clerk cookies say when the Clerk script itself is unavailable. */
type ClerkSessionHint = { signedIn: boolean; clerkUserId: string | null };

interface AuthState {
  token: string | null;
  userInfo: AuthToken | null;
  isLoading: boolean;
  login: (tokenData: AuthToken) => void;
  logout: () => void;
  ensureToken: () => Promise<string>;
  captureAuthOwner: (expectedUserId: string | null) => () => boolean;
  syncPlan: (plan: AuthToken['plan']) => void;
}

const AuthContext = createContext<AuthState | null>(null);
const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    // ignore malformed jwt payloads
  }
  return null;
}

function isExpiredToken(token: string): boolean {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  return typeof exp !== 'number' || exp <= Math.floor(Date.now() / 1000);
}

/**
 * Reads Clerk's first-party cookies without Clerk JS. `__client_uat` is `0`
 * (or absent) for signed-out browsers; `__session` carries the signed-in
 * user's id. Instance-suffixed variants (`__client_uat_xxxx`) are accepted.
 */
function readClerkSessionHint(): ClerkSessionHint {
  let cookies = '';
  try {
    cookies = document.cookie || '';
  } catch {
    // Restricted cookie access means no evidence of a signed-in session.
  }
  let clientUat: boolean | null = null;
  let clerkUserId: string | null = null;
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    let value = part.slice(separator + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep the raw value.
    }
    if (/^__client_uat(_[\w-]+)?$/.test(name)) {
      clientUat = clientUat === true || (value !== '' && value !== '0');
    } else if (/^__session(_[\w-]+)?$/.test(name) && value) {
      const sub = decodeJwtPayload(value)?.sub;
      if (typeof sub === 'string' && sub) clerkUserId = sub;
    }
  }
  const signedIn = clientUat ?? Boolean(clerkUserId);
  return { signedIn, clerkUserId: signedIn ? clerkUserId : null };
}

/** Shaped like ApiException so error-utils maps the stable code without an import cycle. */
function authUnavailableError(): Error & { status: number; code: string } {
  return Object.assign(new Error('Sign-in service is unavailable'), {
    name: 'ApiException',
    status: 503,
    code: 'AUTH_UNAVAILABLE',
  });
}

function readSessionAuthToken(): AuthToken | null {
  try {
    const stored = window.sessionStorage.getItem(TOKEN_KEY);
    if (!stored) return null;
    const parsed: AuthToken = JSON.parse(stored);
    if (!parsed?.access_token || isExpiredToken(parsed.access_token)) {
      window.sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearLegacyReadableAuthToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore restricted storage access.
  }

  try {
    document.cookie = `${TOKEN_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // ignore legacy cookie cleanup
  }
}

function persistAuthToken(tokenData: AuthToken): void {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData));
  } catch {
    // Best-effort persistence only.
  }
}

function clearStoredAuthToken(): void {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      storage.removeItem(TOKEN_KEY);
      storage.removeItem('ps_photo_urls');
      storage.removeItem(PHOTO_UPLOAD_CACHE_KEY);
    } catch {
      // ignore
    }
  }
  try {
    document.cookie = `${TOKEN_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // ignore legacy cookie cleanup
  }
  clearUsageCache();
  void clearPhotoPreviewCache();
  void clearReviewThumbnailCache();
}

function markSignInTracked(clerkUserId: string | null | undefined): boolean {
  if (!clerkUserId) {
    return false;
  }

  try {
    const lastTracked = window.sessionStorage.getItem(SIGN_IN_EVENT_KEY);
    if (lastTracked === clerkUserId) {
      return false;
    }
    window.sessionStorage.setItem(SIGN_IN_EVENT_KEY, clerkUserId);
    return true;
  } catch {
    return true;
  }
}

function isMatchingClerkIdentity(userInfo: AuthToken | null, clerkUserId: string | null | undefined): boolean {
  return Boolean(
    userInfo &&
      userInfo.auth_provider === 'clerk' &&
      userInfo.clerk_user_id &&
      clerkUserId &&
      userInfo.clerk_user_id === clerkUserId
  );
}

function isMatchingClerkSession(userInfo: AuthToken | null, clerkUserId: string | null | undefined): boolean {
  return isMatchingClerkIdentity(userInfo, clerkUserId) && Boolean(userInfo && !isExpiredToken(userInfo.access_token));
}

function staleAuthError(): Error {
  const error = new Error('Authentication changed while refreshing the session');
  error.name = 'AbortError';
  return error;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: isClerkLoaded, isSignedIn, userId: clerkUserId, getToken } = useClerkAuth();
  const clerk = useClerk();
  const [clerkStatus, setClerkStatus] = useState<string | undefined>(() => clerk?.status);
  const [clerkLoadTimedOut, setClerkLoadTimedOut] = useState(false);
  // Clerk JS failed to load (blocked script, outage) or never finished. Public
  // and guest paths must keep working; a signed-in browser must not silently
  // become a guest.
  const clerkFailed = !isClerkLoaded && (clerkStatus === 'error' || clerkLoadTimedOut);
  const clerkFallbackRef = useRef<ClerkSessionHint | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<AuthToken | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const currentAuthRef = useRef<AuthToken | null>(null);
  const invalidatedAuthRef = useRef<AuthToken | null>(null);
  const mountedRef = useRef(true);
  const authEpochRef = useRef(0);
  const authBoundaryRef = useRef(0);
  const rejectedTokenRef = useRef<string | null>(null);
  const pendingGuestTokenRef = useRef<Promise<string> | null>(null);
  const pendingClerkTokenRef = useRef<Promise<string> | null>(null);
  const clerkSessionRef = useRef({ isClerkLoaded, isSignedIn, clerkUserId, getToken });
  clerkSessionRef.current = { isClerkLoaded, isSignedIn, clerkUserId, getToken };
  const lastClerkIdentityRef = useRef<string | null | undefined>(undefined);
  const clerkIdentity = isClerkLoaded ? (isSignedIn ? clerkUserId ?? '' : null) : undefined;
  if (clerkIdentity !== undefined) {
    const incompatibleOwner = currentAuthRef.current && (isSignedIn
      ? !isMatchingClerkIdentity(currentAuthRef.current, clerkUserId)
      : currentAuthRef.current.auth_provider === 'clerk');
    if ((lastClerkIdentityRef.current !== undefined && lastClerkIdentityRef.current !== clerkIdentity) || incompatibleOwner) {
      // Invalidate synchronously, before children can start work for the old owner.
      authEpochRef.current += 1;
      authBoundaryRef.current += 1;
      invalidatedAuthRef.current = invalidatedAuthRef.current ?? currentAuthRef.current;
      currentAuthRef.current = null;
      pendingGuestTokenRef.current = null;
      pendingClerkTokenRef.current = null;
    }
    lastClerkIdentityRef.current = clerkIdentity;
  }
  const isLoadingRef = useRef(true);
  const readyWaitersRef = useRef<Set<() => void>>(new Set());

  const resolveReadyWaiters = useCallback(() => {
    for (const resolve of readyWaitersRef.current) {
      resolve();
    }
    readyWaitersRef.current.clear();
  }, []);

  useEffect(() => {
    isLoadingRef.current = isLoading;
    if (!isLoading) resolveReadyWaiters();
  }, [isLoading, resolveReadyWaiters]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      authEpochRef.current += 1;
      authBoundaryRef.current += 1;
      pendingGuestTokenRef.current = null;
      pendingClerkTokenRef.current = null;
      resolveReadyWaiters();
    };
  }, [resolveReadyWaiters]);

  useEffect(() => {
    try {
      window.localStorage.removeItem('ps_photo_urls');
      window.sessionStorage.removeItem('ps_photo_urls');
    } catch {
      // ignore legacy cache cleanup
    }

    clearLegacyReadableAuthToken();

    const parsed = readSessionAuthToken();
    if (parsed) {
      currentAuthRef.current = parsed;
      setToken(parsed.access_token);
      setUserInfo(parsed);
    }
  }, []);

  const login = useCallback((tokenData: AuthToken) => {
    const previous = currentAuthRef.current;
    if (previous && (previous.user_id !== tokenData.user_id || previous.auth_provider !== tokenData.auth_provider)) {
      authEpochRef.current += 1;
      authBoundaryRef.current += 1;
      pendingGuestTokenRef.current = null;
      pendingClerkTokenRef.current = null;
      clearStoredAuthToken();
    } else if (!previous && tokenData.plan !== 'guest') {
      // Only ownerless guest bootstrap may continue a previously captured action.
      authEpochRef.current += 1;
    }
    currentAuthRef.current = tokenData;
    rejectedTokenRef.current = null;
    persistAuthToken(tokenData);
    setToken(tokenData.access_token);
    setUserInfo(tokenData);
    isLoadingRef.current = false;
    setIsLoading(false);
    resolveReadyWaiters();
  }, [resolveReadyWaiters]);

  const logout = useCallback(() => {
    authEpochRef.current += 1;
    authBoundaryRef.current += 1;
    currentAuthRef.current = null;
    invalidatedAuthRef.current = null;
    rejectedTokenRef.current = null;
    pendingGuestTokenRef.current = null;
    pendingClerkTokenRef.current = null;
    clearStoredAuthToken();
    setToken(null);
    setUserInfo(null);
    isLoadingRef.current = false;
    setIsLoading(false);
    resolveReadyWaiters();
  }, [resolveReadyWaiters]);

  const captureAuthOwner = useCallback((expectedUserId: string | null) => {
    const epoch = authEpochRef.current;
    const matched = (currentAuthRef.current?.user_id ?? null) === expectedUserId;
    return () => matched && mountedRef.current && authEpochRef.current === epoch && (
      expectedUserId === null
        ? !currentAuthRef.current || currentAuthRef.current.plan === 'guest'
        : currentAuthRef.current?.user_id === expectedUserId
    );
  }, []);

  const syncPlan = useCallback((plan: AuthToken['plan']) => {
    const currentAuth = currentAuthRef.current;
    if (!currentAuth || currentAuth.plan === plan) {
      return;
    }

    const nextAuth = { ...currentAuth, plan };
    currentAuthRef.current = nextAuth;
    persistAuthToken(nextAuth);
    setToken(nextAuth.access_token);
    setUserInfo(nextAuth);
  }, []);

  const waitForReady = useCallback(async (): Promise<void> => {
    if (!isLoadingRef.current) return;
    await new Promise<void>((resolve) => {
      let timeoutId: number | null = null;
      const finish = () => {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        readyWaitersRef.current.delete(finish);
        resolve();
      };

      timeoutId = window.setTimeout(finish, 10000);
      readyWaitersRef.current.add(finish);
      if (!isLoadingRef.current) finish();
    });
  }, []);

  const renewClerkToken = useCallback((guestToken?: string): Promise<string> => {
    if (pendingClerkTokenRef.current) return pendingClerkTokenRef.current;
    const session = clerkSessionRef.current;
    const previousAuth = currentAuthRef.current;
    const epoch = authEpochRef.current;
    const isCurrent = () => mountedRef.current && authEpochRef.current === epoch;
    const pending = (async () => {
      try {
        const sessionToken = await session.getToken();
        if (!isCurrent()) throw staleAuthError();
        if (!sessionToken) {
          logout();
          throw new Error('Missing Clerk session token');
        }
        const exchanged = await authClerkExchange(sessionToken, guestToken);
        if (!isCurrent()) throw staleAuthError();
        if (!isMatchingClerkIdentity(exchanged, session.clerkUserId)) {
          logout();
          throw staleAuthError();
        }
        login(exchanged);
        if (previousAuth && !isCurrent()) throw staleAuthError();
        if (markSignInTracked(exchanged.clerk_user_id)) {
          void trackProductEvent('sign_in_completed', {
            token: exchanged.access_token,
            metadata: {
              previous_plan: previousAuth?.plan ?? 'guest',
              migrated_reviews: exchanged.migrated_reviews ?? 0,
              migrated_photos: exchanged.migrated_photos ?? 0,
            },
          });
        }
        return exchanged.access_token;
      } catch (error) {
        if (isCurrent() && ((error as { status?: number })?.status === 401 || (error as { status?: number })?.status === 403)) logout();
        throw error;
      }
    })();
    pendingClerkTokenRef.current = pending;
    void pending.finally(() => {
      if (pendingClerkTokenRef.current === pending) pendingClerkTokenRef.current = null;
    }).catch(() => {});
    return pending;
  }, [login, logout]);

  useEffect(() => {
    if (!clerk || typeof clerk.on !== 'function') return;
    const onStatus = (status: string) => setClerkStatus(status);
    clerk.on('status', onStatus, { notify: true });
    return () => {
      if (typeof clerk.off === 'function') clerk.off('status', onStatus);
    };
  }, [clerk]);

  useEffect(() => {
    if (isClerkLoaded) {
      setClerkLoadTimedOut(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setClerkLoadTimedOut(true), CLERK_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isClerkLoaded]);

  useEffect(() => {
    if (!clerkFailed) {
      clerkFallbackRef.current = null;
      return;
    }
    const hint = readClerkSessionHint();
    clerkFallbackRef.current = hint;
    clearLegacyReadableAuthToken();
    const parsed = readSessionAuthToken();
    const previousAuth = currentAuthRef.current ?? invalidatedAuthRef.current;
    if (!hint.signedIn) {
      // Same as Clerk reporting a signed-out browser: guests continue.
      if (parsed?.auth_provider === 'clerk' || previousAuth?.auth_provider === 'clerk') {
        logout();
      } else if (parsed) {
        login(parsed);
      } else {
        isLoadingRef.current = false;
        setIsLoading(false);
        resolveReadyWaiters();
      }
      return;
    }
    // Signed-in browser: keep an already exchanged session for the same Clerk
    // user, otherwise stop loading and report the outage on demand.
    if (parsed && hint.clerkUserId && isMatchingClerkSession(parsed, hint.clerkUserId)) {
      login(parsed);
      return;
    }
    if (parsed?.auth_provider === 'clerk' && hint.clerkUserId && parsed.clerk_user_id !== hint.clerkUserId) {
      // The browser is signed in as someone else: the stored session is stale.
      logout();
      return;
    }
    if (currentAuthRef.current) {
      // Unverifiable owner (guest or unknown Clerk user): hide it until Clerk recovers.
      authEpochRef.current += 1;
      currentAuthRef.current = null;
      setToken(null);
      setUserInfo(null);
    }
    isLoadingRef.current = false;
    setIsLoading(false);
    resolveReadyWaiters();
  }, [clerkFailed, login, logout, resolveReadyWaiters]);

  useEffect(() => {
    if (!isClerkLoaded) return;

    let cancelled = false;
    const epoch = authEpochRef.current;
    const isCurrent = () => !cancelled && authEpochRef.current === epoch;

    const syncAuthState = async (): Promise<void> => {
      const hasCurrentOwner = currentAuthRef.current && (isSignedIn
        ? isMatchingClerkIdentity(currentAuthRef.current, clerkUserId)
        : currentAuthRef.current.auth_provider !== 'clerk');
      if (!hasCurrentOwner) {
        isLoadingRef.current = true;
        setIsLoading(true);
      }

      clearLegacyReadableAuthToken();

      const parsed = readSessionAuthToken();
      const previousAuth = currentAuthRef.current ?? invalidatedAuthRef.current;
      if (invalidatedAuthRef.current) {
        clearStoredAuthToken();
        invalidatedAuthRef.current = null;
        setToken(null);
        setUserInfo(null);
      }

      if (!isSignedIn) {
        if (parsed?.auth_provider === 'clerk' || previousAuth?.auth_provider === 'clerk') {
          if (isCurrent()) logout();
        } else if (parsed && isCurrent()) {
          login(parsed);
        }
        if (!cancelled) setIsLoading(false);
        return;
      }

      if (isMatchingClerkSession(parsed, clerkUserId) && parsed?.access_token !== rejectedTokenRef.current && !pendingClerkTokenRef.current) {
        if (isCurrent() && parsed) {
          login(parsed);
          setIsLoading(false);
        }
        return;
      }

      const guestToken = parsed?.plan === 'guest' ? parsed.access_token : undefined;
      if (!isMatchingClerkIdentity(currentAuthRef.current, clerkUserId)) {
        clearStoredAuthToken();
        currentAuthRef.current = null;
        setToken(null);
        setUserInfo(null);
      }
      await renewClerkToken(guestToken);
      if (!cancelled) setIsLoading(false);
    };

    void syncAuthState()
      .catch((error: unknown) => {
        if (isCurrent()) {
          if (!isMatchingClerkIdentity(currentAuthRef.current, clerkUserId) ||
              (error as { status?: number })?.status === 401 || (error as { status?: number })?.status === 403) logout();
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clerkUserId, getToken, isClerkLoaded, isSignedIn, login, logout, renewClerkToken]);

  const ensureToken = useCallback(async (): Promise<string> => {
    const requestedBoundary = authBoundaryRef.current;
    await waitForReady();
    if (!mountedRef.current || requestedBoundary !== authBoundaryRef.current) throw staleAuthError();
    // Initial discovery may finish while a startup read waits; it is not a
    // logout/account switch. Explicit owner-captured actions remain stricter.
    const requestedEpoch = authEpochRef.current;

    const session = clerkSessionRef.current;
    const identity: ClerkSessionHint | null = session.isClerkLoaded
      ? { signedIn: Boolean(session.isSignedIn), clerkUserId: session.clerkUserId ?? null }
      : clerkFallbackRef.current;
    if (!identity) throw authUnavailableError();
    const currentUserInfo = currentAuthRef.current ?? readSessionAuthToken();
    const currentToken = currentUserInfo?.access_token;
    const canReuse = (auth: AuthToken | null) => Boolean(auth &&
      auth.access_token !== rejectedTokenRef.current && !isExpiredToken(auth.access_token) &&
      (identity.signedIn ? isMatchingClerkIdentity(auth, identity.clerkUserId) : auth.auth_provider !== 'clerk'));
    if (canReuse(currentUserInfo) && currentUserInfo && currentToken) {
      if (!currentAuthRef.current) login(currentUserInfo);
      return currentToken;
    }

    // Expiry/rejection is a credential refresh, not an owner change. Keep the
    // established identity and private draft until logout or a new owner is known.
    const isCurrent = () => requestedEpoch === authEpochRef.current;
    if (identity.signedIn) {
      // Without Clerk JS there is no way to prove or renew this session.
      if (!session.isClerkLoaded) throw authUnavailableError();
      return renewClerkToken();
    }

    if (!pendingGuestTokenRef.current) {
      const pending = authGuest().then((data) => {
        if (!isCurrent()) throw staleAuthError();
        login(data);
        if (currentUserInfo && !isCurrent()) throw staleAuthError();
        return data.access_token;
      });
      pendingGuestTokenRef.current = pending;
      void pending.finally(() => {
        if (pendingGuestTokenRef.current === pending) pendingGuestTokenRef.current = null;
      }).catch(() => {});
    }
    return pendingGuestTokenRef.current;
  }, [login, renewClerkToken, waitForReady]);

  useEffect(() => {
    registerUnauthorizedHandler(async (failedToken) => {
      const current = currentAuthRef.current?.access_token;
      // Never replay an old owner's request with a newer account's credentials.
      if (!current || current !== failedToken) return null;
      const isCurrentOwner = captureAuthOwner(currentAuthRef.current?.user_id ?? null);
      rejectedTokenRef.current = failedToken;
      const refreshed = await ensureToken();
      return isCurrentOwner() ? refreshed : null;
    });
    return () => registerUnauthorizedHandler(null);
  }, [captureAuthOwner, ensureToken]);

  const visibleUserInfo = currentAuthRef.current?.user_id === userInfo?.user_id ? userInfo : null;

  return (
    <AuthContext.Provider value={{ token: visibleUserInfo ? token : null, userInfo: visibleUserInfo, isLoading, login, logout, ensureToken, captureAuthOwner, syncPlan }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  // A parent may restore auth before a suspended consumer hydrates. Match that
  // consumer's server snapshot, without delaying later client-only navigation.
  const hydrated = useSyncExternalStore(subscribeToHydration, getClientHydrationSnapshot, getServerHydrationSnapshot);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return hydrated ? ctx : { ...ctx, token: null, userInfo: null, isLoading: true };
}

export function planLabel(plan: string): string {
  const labels: Record<string, string> = {
    guest: 'Guest',
    free: 'Free',
    pro: 'Pro',
  };
  return labels[plan] ?? plan;
}

export function planColor(plan: string): string {
  const colors: Record<string, string> = {
    guest: 'text-ink-muted',
    free: 'text-sage',
    pro: 'text-gold',
  };
  return colors[plan] ?? 'text-ink-muted';
}
