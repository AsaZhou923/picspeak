'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { authGuest } from './api';
import { AuthToken } from './types';

const TOKEN_KEY = 'ps_token';
const TOKEN_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 3600;

interface AuthState {
  token: string | null;
  userInfo: AuthToken | null;
  isLoading: boolean;
  login: (tokenData: AuthToken) => void;
  logout: () => void;
  ensureToken: () => Promise<string>;
}

const AuthContext = createContext<AuthState | null>(null);

function readTokenFromCookie(): AuthToken | null {
  try {
    const pairs = document.cookie ? document.cookie.split(';') : [];
    for (const pair of pairs) {
      const [rawKey, ...rest] = pair.trim().split('=');
      if (rawKey !== TOKEN_KEY) continue;
      const rawValue = rest.join('=');
      if (!rawValue) continue;
      const parsed: AuthToken = JSON.parse(decodeURIComponent(rawValue));
      if (parsed?.access_token) return parsed;
    }
  } catch {
    // ignore malformed cookie values
  }
  return null;
}

function persistTokenToCookie(tokenData: AuthToken): void {
  try {
    const encoded = encodeURIComponent(JSON.stringify(tokenData));
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${TOKEN_KEY}=${encoded}; Max-Age=${TOKEN_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // ignore
  }
}

function clearTokenCookie(): void {
  try {
    document.cookie = `${TOKEN_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

function readStoredAuthToken(): AuthToken | null {
  // localStorage may be restricted on some iOS/WebKit contexts; fallback to sessionStorage/cookie.
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const stored = storage.getItem(TOKEN_KEY);
      if (!stored) continue;
      const parsed: AuthToken = JSON.parse(stored);
      if (parsed?.access_token) return parsed;
      storage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore malformed storage or restricted storage access.
    }
  }
  return readTokenFromCookie();
}

function persistAuthToken(tokenData: AuthToken): void {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      storage.setItem(TOKEN_KEY, JSON.stringify(tokenData));
    } catch {
      // Best-effort persistence only.
    }
  }
  persistTokenToCookie(tokenData);
}

function clearStoredAuthToken(): void {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      storage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  }
  clearTokenCookie();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<AuthToken | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pendingGuestTokenRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    const parsed = readStoredAuthToken();
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
    if (token) return token;

    const parsed = readStoredAuthToken();
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
