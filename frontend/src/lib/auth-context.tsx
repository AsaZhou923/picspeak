'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { authGuest } from './api';
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<AuthToken | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      try {
        const parsed: AuthToken = JSON.parse(stored);
        setToken(parsed.access_token);
        setUserInfo(parsed);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((tokenData: AuthToken) => {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData));
    setToken(tokenData.access_token);
    setUserInfo(tokenData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUserInfo(null);
  }, []);

  const ensureToken = useCallback(async (): Promise<string> => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      const parsed: AuthToken = JSON.parse(stored);
      return parsed.access_token;
    }
    // Auto-create guest session
    const data = await authGuest();
    login(data);
    return data.access_token;
  }, [login]);

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
