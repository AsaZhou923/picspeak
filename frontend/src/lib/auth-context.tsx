'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth as useClerkAuth } from '@clerk/nextjs';
import { authClerkExchange, authGuest, clearUsageCache, registerUnauthorizedHandler } from './api';
import { clearPhotoPreviewCache } from './photo-preview-cache';
import { trackProductEvent } from './product-analytics';
import { clearReviewThumbnailCache } from './review-thumbnail-cache';
import { AuthToken } from './types';

const TOKEN_KEY = 'ps_token';
const PHOTO_UPLOAD_CACHE_KEY = 'ps_uploaded_photos_v1';
const SIGN_IN_EVENT_KEY = 'ps_sign_in_event_v1';

interface AuthState {
  token: string | null;
  userInfo: AuthToken | null;
  isLoading: boolean;
  login: (tokenData: AuthToken) => void;
  logout: () => void;
  ensureToken: () => Promise<string>;
  syncPlan: (plan: AuthToken['plan']) => void;
}

const AuthContext = createContext<AuthState | null>(null);

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
  return typeof exp === 'number' && exp <= Math.floor(Date.now() / 1000);
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

function readLegacyAuthToken(): AuthToken | null {
  for (const storage of [window.localStorage]) {
    try {
      const stored = storage.getItem(TOKEN_KEY);
      if (!stored) continue;
      const parsed: AuthToken = JSON.parse(stored);
      if (parsed?.access_token && !isExpiredToken(parsed.access_token)) return parsed;
      storage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore malformed or restricted storage access.
    }
  }

  try {
    const pairs = document.cookie ? document.cookie.split(';') : [];
    for (const pair of pairs) {
      const [rawKey, ...rest] = pair.trim().split('=');
      if (rawKey !== TOKEN_KEY) continue;
      const rawValue = rest.join('=');
      if (!rawValue) continue;
      const parsed: AuthToken = JSON.parse(decodeURIComponent(rawValue));
      if (parsed?.access_token && !isExpiredToken(parsed.access_token)) return parsed;
    }
  } catch {
    // ignore malformed cookie values
  }

  return null;
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

function isMatchingClerkSession(userInfo: AuthToken | null, clerkUserId: string | null | undefined): boolean {
  return Boolean(
    userInfo &&
      userInfo.auth_provider === 'clerk' &&
      userInfo.clerk_user_id &&
      clerkUserId &&
      userInfo.clerk_user_id === clerkUserId &&
      !isExpiredToken(userInfo.access_token)
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: isClerkLoaded, isSignedIn, userId: clerkUserId, getToken } = useClerkAuth();
  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<AuthToken | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pendingGuestTokenRef = useRef<Promise<string> | null>(null);
  const isLoadingRef = useRef(true);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    try {
      window.localStorage.removeItem('ps_photo_urls');
      window.sessionStorage.removeItem('ps_photo_urls');
    } catch {
      // ignore legacy cache cleanup
    }

    let parsed = readSessionAuthToken();
    if (!parsed) {
      parsed = readLegacyAuthToken();
      if (parsed) persistAuthToken(parsed);
    }
    if (parsed) {
      setToken(parsed.access_token);
      setUserInfo(parsed);
    }
  }, []);

  const login = useCallback((tokenData: AuthToken) => {
    persistAuthToken(tokenData);
    setToken(tokenData.access_token);
    setUserInfo(tokenData);
  }, []);

  const logout = useCallback(() => {
    clearStoredAuthToken();
    setToken(null);
    setUserInfo(null);
  }, []);

  const syncPlan = useCallback((plan: AuthToken['plan']) => {
    const currentAuth = userInfo ?? readSessionAuthToken();
    if (!currentAuth || currentAuth.plan === plan) {
      return;
    }

    const nextAuth = { ...currentAuth, plan };
    persistAuthToken(nextAuth);
    setToken(nextAuth.access_token);
    setUserInfo(nextAuth);
  }, [userInfo]);

  const waitForReady = useCallback(async (): Promise<void> => {
    if (!isLoadingRef.current) return;
    await new Promise<void>((resolve) => {
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        if (!isLoadingRef.current || Date.now() - startedAt > 10000) {
          window.clearInterval(timer);
          resolve();
        }
      }, 25);
    });
  }, []);

  useEffect(() => {
    if (!isClerkLoaded) return;

    let cancelled = false;

    const syncAuthState = async (): Promise<void> => {
      setIsLoading(true);

      let parsed = readSessionAuthToken();
      if (!parsed) {
        parsed = readLegacyAuthToken();
        if (parsed) persistAuthToken(parsed);
      }

      if (!isSignedIn) {
        if (parsed?.auth_provider === 'clerk') {
          clearStoredAuthToken();
          if (!cancelled) {
            setToken(null);
            setUserInfo(null);
          }
        } else if (parsed && !cancelled) {
          setToken(parsed.access_token);
          setUserInfo(parsed);
        }
        if (!cancelled) setIsLoading(false);
        return;
      }

      if (isMatchingClerkSession(parsed, clerkUserId)) {
        if (!cancelled && parsed) {
          setToken(parsed.access_token);
          setUserInfo(parsed);
          setIsLoading(false);
        }
        return;
      }

      const guestToken = parsed?.plan === 'guest' ? parsed.access_token : undefined;
      const sessionToken = await getToken();
      if (!sessionToken) {
        clearStoredAuthToken();
        if (!cancelled) {
          setToken(null);
          setUserInfo(null);
          setIsLoading(false);
        }
        return;
      }

      const exchanged = await authClerkExchange(sessionToken, guestToken);
      if (!cancelled) {
        login(exchanged);
        if (markSignInTracked(exchanged.clerk_user_id)) {
          void trackProductEvent('sign_in_completed', {
            token: exchanged.access_token,
            metadata: {
              previous_plan: parsed?.plan ?? 'guest',
              migrated_reviews: exchanged.migrated_reviews ?? 0,
              migrated_photos: exchanged.migrated_photos ?? 0,
            },
          });
        }
        setIsLoading(false);
      }
    };

    void syncAuthState()
      .catch(() => {
        clearStoredAuthToken();
        if (!cancelled) {
          setToken(null);
          setUserInfo(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clerkUserId, getToken, isClerkLoaded, isSignedIn, login]);

  const ensureToken = useCallback(async (): Promise<string> => {
    await waitForReady();

    const currentToken = token ?? readSessionAuthToken()?.access_token ?? null;
    const currentUserInfo = userInfo ?? readSessionAuthToken();

    if (currentToken && !isExpiredToken(currentToken)) {
      if (!isSignedIn) {
        return currentToken;
      }
      if (isMatchingClerkSession(currentUserInfo, clerkUserId)) {
        return currentToken;
      }
    }

    if (currentToken && isExpiredToken(currentToken)) {
      clearStoredAuthToken();
      setToken(null);
      setUserInfo(null);
    }

    const parsed = readSessionAuthToken();
    if (parsed && !isSignedIn) {
      setToken(parsed.access_token);
      setUserInfo(parsed);
      return parsed.access_token;
    }
    if (parsed && isMatchingClerkSession(parsed, clerkUserId)) {
      setToken(parsed.access_token);
      setUserInfo(parsed);
      return parsed.access_token;
    }

    if (isClerkLoaded && isSignedIn) {
      const sessionToken = await getToken();
      if (!sessionToken) {
        throw new Error('Missing Clerk session token');
      }
      const exchanged = await authClerkExchange(sessionToken);
      login(exchanged);
      if (markSignInTracked(exchanged.clerk_user_id)) {
        void trackProductEvent('sign_in_completed', {
          token: exchanged.access_token,
          metadata: {
            previous_plan: parsed?.plan ?? 'guest',
            migrated_reviews: exchanged.migrated_reviews ?? 0,
            migrated_photos: exchanged.migrated_photos ?? 0,
          },
        });
      }
      return exchanged.access_token;
    }

    if (!pendingGuestTokenRef.current) {
      pendingGuestTokenRef.current = authGuest()
        .then((data) => {
          login(data);
          return data.access_token;
        })
        .finally(() => {
          pendingGuestTokenRef.current = null;
        });
    }

    return pendingGuestTokenRef.current;
  }, [clerkUserId, getToken, isClerkLoaded, isSignedIn, login, token, userInfo, waitForReady]);

  useEffect(() => {
    registerUnauthorizedHandler(async (failedToken) => {
      const current = token ?? readSessionAuthToken()?.access_token ?? null;
      if (!current || current !== failedToken) {
        return readSessionAuthToken()?.access_token ?? null;
      }
      clearStoredAuthToken();
      setToken(null);
      setUserInfo(null);
      return ensureToken();
    });
    return () => registerUnauthorizedHandler(null);
  }, [ensureToken, token]);

  return (
    <AuthContext.Provider value={{ token, userInfo, isLoading, login, logout, ensureToken, syncPlan }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
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
