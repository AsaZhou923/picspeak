'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Archive, ArrowLeft, Bell, ChevronRight, RefreshCw } from 'lucide-react';
import { getNotificationDetail, markNotificationRead, updateNotificationArchive } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatUserFacingError } from '@/lib/error-utils';
import { useI18n } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n-en';
import { localeToIntlLocale } from '@/lib/locale';
import { trackProductEvent } from '@/lib/product-analytics';
import { ApiException, type NotificationDetail } from '@/lib/types';
import { useNotifications } from './NotificationProvider';
import { canUseNotifications, notificationCategoryTone, notificationEventType, notificationItemId, resolveNotificationHref } from './notification-state';

export default function NotificationDetailClient({ notificationId }: { notificationId: string }) {
  const { token, userInfo, isLoading } = useAuth();
  return <DetailSession key={`${userInfo?.user_id}:${token}:${isLoading}:${notificationId}`} notificationId={notificationId} />;
}

function DetailSession({ notificationId }: { notificationId: string }) {
  const { token, userInfo, isLoading } = useAuth();
  const { locale, t } = useI18n();
  const copy = useCallback((key: TranslationKey) => t(key), [t]);
  const { applyUnreadCount, refreshUnreadCount } = useNotifications();
  const [detail, setDetail] = useState<NotificationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const readMarkedRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const lifetimeRef = useRef<AbortController | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const signedIn = canUseNotifications(userInfo) && Boolean(token);
  const targetHref = resolveNotificationHref(detail?.target ?? null);
  useEffect(() => {
    const lifetime = new AbortController();
    lifetimeRef.current = lifetime;
    return () => { lifetime.abort(); controllerRef.current?.abort(); };
  }, []);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(localeToIntlLocale(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }), [locale]);

  const loadDetail = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (isLoading) return;
    if (!signedIn || !token || unauthorized) {
      setDetail(null);
      setLoading(false);
      return;
    }

    setDetail(null);
    setLoading(true);
    setError('');

    try {
      const payload = await getNotificationDetail(notificationId, token, controller.signal, locale);
      if (requestRef.current !== requestId || controller.signal.aborted) return;
      setDetail(payload);
      setLoading(false);
      void trackProductEvent('notification_opened', {
        token,
        source: 'notifications',
        pagePath: `/account/notifications/${notificationId}`,
        locale,
        metadata: { category: payload.category, type: notificationEventType(payload) },
      });

      const payloadId = notificationItemId(payload);
      if (!payload.read_at && readMarkedRef.current !== payloadId) {
        try {
          const response = await markNotificationRead(notificationId, token, controller.signal);
          if (requestRef.current !== requestId || controller.signal.aborted) return;
          readMarkedRef.current = payloadId;
          applyUnreadCount(null);
          void refreshUnreadCount();
          setDetail((prev) => prev ? { ...prev, read_at: response.read_at } : prev);
        } catch (readErr) {
          if (requestRef.current === requestId && !controller.signal.aborted) {
            if (readErr instanceof ApiException && readErr.status === 401) { setUnauthorized(true); setDetail(null); return; }
            if (readErr instanceof ApiException && [404, 410].includes(readErr.status)) { setDetail(null); setError(t('notifications_target_unavailable')); return; }
            setError(formatUserFacingError(t, readErr, copy('notifications_error')));
          }
        }
      }
    } catch (err) {
      if (requestRef.current !== requestId || controller.signal.aborted) return;
      setDetail(null);
      if (err instanceof ApiException && err.status === 401) { setUnauthorized(true); setLoading(false); return; }
      setError(formatUserFacingError(t, err, copy('notifications_error')));
      setLoading(false);
    }

  }, [applyUnreadCount, copy, isLoading, locale, notificationId, refreshUnreadCount, signedIn, t, token, unauthorized]);

  useEffect(() => {
    void loadDetail();
    return () => controllerRef.current?.abort();
  }, [loadDetail, userInfo?.access_token]);

  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        void loadDetail();
      }
    };
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [loadDetail]);

  const handleArchive = async () => {
    const signal = lifetimeRef.current?.signal;
    if (!detail || !token || !signal || signal.aborted || unauthorized || actionBusy) return;
    setActionBusy(true);
    setError('');
    try {
      const response = await updateNotificationArchive(notificationItemId(detail), !detail.archived_at, token, signal);
      if (signal.aborted) return;
      applyUnreadCount(null);
      setDetail((current) => current ? { ...current, archived_at: response.archived_at } : current);
      await refreshUnreadCount();
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof ApiException && err.status === 401) { setUnauthorized(true); setDetail(null); return; }
      setError(formatUserFacingError(t, err, copy('notifications_error')));
    } finally {
      if (!signal.aborted) setActionBusy(false);
    }
  };

  const handleTargetClick = async () => {
    if (!detail) return;
    if (!token) return;
    void trackProductEvent('notification_target_clicked', {
      token,
      source: 'notifications',
      pagePath: `/account/notifications/${notificationId}`,
      locale,
      metadata: { category: detail.category, type: notificationEventType(detail), target_type: detail.target?.type ?? null },
    });
  };

  if (!isLoading && (!signedIn || unauthorized)) {
    return (
      <section className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-reading ui-feature-panel px-6 py-12 text-center">
          <Bell className="mx-auto mb-4 text-gold" size={24} />
          <h1 className="font-display text-4xl text-ink">{copy('notifications_auth_title')}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-ink-muted">{copy('notifications_auth_body')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-reading animate-fade-in">
        <Link href="/account/notifications" className="mb-6 inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-gold">
          <ArrowLeft size={14} />
          {copy('notifications_back')}
        </Link>

        {error && detail && <p role="alert" className="mb-4 text-sm text-rust">{error}</p>}
        {loading ? (
          <div className="ui-panel flex items-center gap-2 px-5 py-5 text-sm text-ink-muted">
            <RefreshCw size={15} className="animate-spin" />
            {copy('notifications_loading')}
          </div>
        ) : error && !detail ? (
          <div className="ui-panel border-rust/25 bg-rust/10 px-5 py-5 text-sm text-rust">{error}</div>
        ) : detail ? (
          <article className="ui-feature-panel px-6 py-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${notificationCategoryTone(detail.category)}`}>
                {copy(`notifications_category_${detail.category}`)}
              </span>
              <span className="font-mono text-xs text-ink-subtle">{dateFormatter.format(new Date(detail.occurred_at))}</span>
            </div>
            <h1 className="mt-4 font-display text-4xl text-ink">{detail.title}</h1>
            <p className="mt-3 text-sm leading-7 text-ink-muted">{detail.summary}</p>
            <div className="mt-6 whitespace-pre-line rounded-card border border-border-subtle bg-raised/55 p-5 text-sm leading-7 text-ink">
              {detail.body}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {targetHref ? (
                <Link href={targetHref} onClick={() => void handleTargetClick()} className="ui-action-primary px-4 py-2 text-sm">
                  {copy('notifications_open_target')}
                  <ChevronRight size={13} />
                </Link>
              ) : (
                <span className="rounded-control border border-border-subtle bg-raised/55 px-4 py-2 text-sm text-ink-muted">
                  {copy('notifications_target_unavailable')}
                </span>
              )}
              <button type="button" onClick={() => void handleArchive()} disabled={actionBusy} className="ui-action-secondary px-4 py-2 text-sm disabled:opacity-60">
                {actionBusy ? <RefreshCw size={14} className="animate-spin" /> : <Archive size={14} />}
                {detail.archived_at ? copy('notifications_restore') : copy('notifications_archive')}
              </button>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
