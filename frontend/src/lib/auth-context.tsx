'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { authGuest, registerUnauthorizedHandler } from './api';
import { AuthToken } from './types';

const TOKEN_KEY = 'ps_token';

interface AuthState {
  token: string | null;
  userInfo: AuthToken | null;
  isLoading: boolean;
  login: (tokenData: AuthToken) => void;
  logout: () => void;
  ensureToken: () => Promise<string>;
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
    } catch {
      // ignore
    }
  }
  try {
    document.cookie = `${TOKEN_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // ignore legacy cookie cleanup
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<AuthToken | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pendingGuestTokenRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    let parsed = readSessionAuthToken();
    if (!parsed) {
      parsed = readLegacyAuthToken();
      if (parsed) {
        persistAuthToken(parsed);
      }
    }
    if (parsed) {
      setToken(parsed.access_token);
      setUserInfo(parsed);
    }
    setIsLoading(false);
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

  const ensureToken = useCallback(async (): Promise<string> => {
    if (token && !isExpiredToken(token)) return token;
    if (token && isExpiredToken(token)) {
      clearStoredAuthToken();
      setToken(null);
      setUserInfo(null);
    }

    const parsed = readSessionAuthToken();
    if (parsed) {
      // Keep in-memory state consistent when caller asks token before provider hydrate settles.
      setToken(parsed.access_token);
      setUserInfo(parsed);
      return parsed.access_token;
    }

    // Deduplicate concurrent guest-session creation to avoid generating multiple guest users.
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
  }, [login, token]);

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
    <AuthContext.Provider value={{ token, userInfo, isLoading, login, logout, ensureToken }}>
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
