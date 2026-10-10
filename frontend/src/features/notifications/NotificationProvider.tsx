'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getNotificationUnreadCount, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ApiException, type NotificationUnreadCountResponse } from '@/lib/types';
import {
  canUseNotifications,
  getUnreadTotal,
  nextNotificationRetryDelayMs,
  NOTIFICATION_POLL_INTERVAL_MS,
} from './notification-state';

interface NotificationContextValue {
  canReadNotifications: boolean;
  unread: NotificationUnreadCountResponse | null;
  unreadTotal: number | null;
  loading: boolean;
  error: boolean;
  refreshUnreadCount: () => Promise<void>;
  applyUnreadCount: (next: NotificationUnreadCountResponse | null) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  canReadNotifications: false,
  unread: null,
  unreadTotal: null,
  loading: false,
  error: false,
  refreshUnreadCount: async () => {},
  applyUnreadCount: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token, userInfo, isLoading } = useAuth();
  const [unread, setUnread] = useState<NotificationUnreadCountResponse | null>(null);
  const [unreadIdentity, setUnreadIdentity] = useState('');
  const [readAccessIdentity, setReadAccessIdentity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const generationRef = useRef(0);
  const failureRef = useRef(0);
  const retryAfterUntilRef = useRef(0);
  const unauthorizedRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const identityKey = canUseNotifications(userInfo) ? `${userInfo.user_id}:${userInfo.access_token}` : '';
  const accountEnabled = canUseNotifications(userInfo);
  const identityRef = useRef(identityKey);
  identityRef.current = identityKey;
  const visibleUnread = !isLoading && unread && identityKey && unreadIdentity === identityKey ? unread : null;
  const canReadNotifications = Boolean(!isLoading && identityKey && readAccessIdentity === identityKey);

  const applyUnreadCount = useCallback((next: NotificationUnreadCountResponse | null) => {
    setUnread(next);
    setUnreadIdentity(next ? identityRef.current : '');
    if (next) {
      setError(false);
      failureRef.current = 0;
      retryAfterUntilRef.current = 0;
      setReadAccessIdentity(identityRef.current);
    }
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    if (Date.now() < retryAfterUntilRef.current || inFlightRef.current) return;
    if (isLoading || !accountEnabled || !token || unauthorizedRef.current) {
      controllerRef.current?.abort();
      setUnread(null);
      setReadAccessIdentity('');
      setLoading(false);
      setError(false);
      return;
    }

    const requestGeneration = generationRef.current;
    const requestIdentity = identityKey;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    inFlightRef.current = true;
    setLoading(true);

    try {
      if (controller.signal.aborted || generationRef.current !== requestGeneration || identityRef.current !== requestIdentity) return;
      const next = await getNotificationUnreadCount(token, controller.signal);
      if (controller.signal.aborted || controllerRef.current !== controller || generationRef.current !== requestGeneration || identityRef.current !== requestIdentity) return;
      failureRef.current = 0;
      retryAfterUntilRef.current = 0;
      setUnread(next);
      setUnreadIdentity(requestIdentity);
      setReadAccessIdentity(requestIdentity);
      setError(false);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted || generationRef.current !== requestGeneration || identityRef.current !== requestIdentity) return;
      if (err instanceof ApiException && err.status === 401) {
        setUnread(null);
        setReadAccessIdentity('');
        setError(false);
        failureRef.current = 0;
        unauthorizedRef.current = true;
        return;
      }
      const errorStatus = err instanceof ApiException ? err.status : (typeof err === 'object' && err && 'status' in err ? Number((err as { status?: unknown }).status) : 0);
      const errorRetryAfterMs = err instanceof ApiException ? err.retryAfterMs : undefined;
      if (errorStatus === 429) {
        retryAfterUntilRef.current = Date.now() + (errorRetryAfterMs ?? nextNotificationRetryDelayMs(failureRef.current + 1));
      }
      if (err instanceof ApiException && (err.status === 403 || (err.status === 503 && err.code === 'NOTIFICATIONS_DISABLED'))) {
        setUnread(null);
        setUnreadIdentity('');
        setReadAccessIdentity('');
      }
      failureRef.current += 1;
      setError(true);
    } finally {
      if (controllerRef.current === controller && generationRef.current === requestGeneration) {
        inFlightRef.current = false;
        setLoading(false);
      } else if (controllerRef.current === controller) {
        inFlightRef.current = false;
      }
    }
  }, [accountEnabled, identityKey, isLoading, token]);

  useEffect(() => {
    generationRef.current += 1;
    failureRef.current = 0;
    retryAfterUntilRef.current = 0;
    unauthorizedRef.current = false;
    controllerRef.current?.abort();
    inFlightRef.current = false;
    setUnreadIdentity('');
    setReadAccessIdentity('');

    if (isLoading || !accountEnabled) {
      setUnread(null);
      setLoading(false);
      setError(false);
      return;
    }

    void refreshUnreadCount();
    return () => controllerRef.current?.abort();
  }, [accountEnabled, identityKey, isLoading, refreshUnreadCount]);

  useEffect(() => {
    if (!identityKey || isLoading) return;

    let timer: number | null = null;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
      const online = typeof navigator === 'undefined' || navigator.onLine;
      const delay = visible && online && !error
        ? NOTIFICATION_POLL_INTERVAL_MS
        : nextNotificationRetryDelayMs(failureRef.current, retryAfterUntilRef.current - Date.now());
      timer = window.setTimeout(async () => {
        const canPoll = !unauthorizedRef.current && document.visibilityState === 'visible' && navigator.onLine;
        if (!stopped && canPoll) {
          await refreshUnreadCount();
        }
        schedule();
      }, delay);
    };

    const handleResume = () => {
      if (!unauthorizedRef.current && document.visibilityState === 'visible' && navigator.onLine) {
        void refreshUnreadCount();
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('online', handleResume);
    window.addEventListener('focus', handleResume);
    schedule();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('online', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [error, identityKey, isLoading, refreshUnreadCount]);

  const value = useMemo<NotificationContextValue>(() => ({
    canReadNotifications,
    unread: visibleUnread,
    unreadTotal: getUnreadTotal(visibleUnread),
    loading,
    error,
    refreshUnreadCount,
    applyUnreadCount,
  }), [applyUnreadCount, canReadNotifications, error, loading, refreshUnreadCount, visibleUnread]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext);
}
