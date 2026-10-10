'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Archive, Bell, CheckCheck, ChevronRight, Inbox, RefreshCw, Settings } from 'lucide-react';
import { getNotifications, markNotificationsReadAll, updateNotificationArchive } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatUserFacingError } from '@/lib/error-utils';
import { useI18n } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n-en';
import { localeToIntlLocale } from '@/lib/locale';
import { trackProductEvent } from '@/lib/product-analytics';
import { ApiException, type NotificationCategoryFilter, type NotificationItem, type NotificationListResponse } from '@/lib/types';
import { useNotifications } from './NotificationProvider';
import { canUseNotifications, notificationCategoryTone, notificationItemId } from './notification-state';

const CATEGORY_FILTERS: NotificationCategoryFilter[] = ['all', 'system', 'announcement', 'interaction'];

export default function NotificationsPageClient() {
  const { token, userInfo, isLoading } = useAuth();
  return <NotificationsSession key={`${userInfo?.user_id}:${token}:${isLoading}`} />;
}

function NotificationsSession() {
  const { token, userInfo, isLoading } = useAuth();
  const { locale, t } = useI18n();
  const copy = useCallback((key: TranslationKey) => t(key), [t]);
  const { unread, applyUnreadCount, refreshUnreadCount } = useNotifications();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [category, setCategory] = useState<NotificationCategoryFilter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [archived, setArchived] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lifetimeRef = useRef<AbortController | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const openedAnalyticsRef = useRef('');
  const syncedUnreadAtRef = useRef<string | null>(null);
  const loadedItemCountRef = useRef(0);
  loadedItemCountRef.current = items.length;
  const signedIn = canUseNotifications(userInfo) && Boolean(token);
  useEffect(() => {
    const lifetime = new AbortController();
    lifetimeRef.current = lifetime;
    return () => { lifetime.abort(); controllerRef.current?.abort(); };
  }, []);

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(localeToIntlLocale(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }), [locale]);

  const load = useCallback(async (startCursor?: string | null, append = false, refreshBadge = true) => {
    if (!signedIn || !token || unauthorized) {
      setItems([]);
      setCursor(null);
      setLoading(false);
      return;
    }
    const activeToken = token;

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (append) setLoadingMore(true);
    else if (refreshBadge) setLoading(true);

    try {
      const query = {
        locale,
        category,
        unread_only: unreadOnly,
        archived,
        cursor: startCursor,
        limit: 20,
      };
      let response: NotificationListResponse = await getNotifications(activeToken, query, controller.signal);
      if (requestRef.current !== requestId || controller.signal.aborted) return;
      const refreshedItems = [...response.items];
      if (!append && !refreshBadge) {
        const desiredCount = Math.max(20, loadedItemCountRef.current);
        while (response.next_cursor && refreshedItems.length < desiredCount) {
          response = await getNotifications(activeToken, {
            ...query,
            cursor: response.next_cursor,
            limit: Math.min(50, desiredCount - refreshedItems.length),
          }, controller.signal);
          if (requestRef.current !== requestId || controller.signal.aborted) return;
          refreshedItems.push(...response.items);
        }
      }
      setItems((prev) => append ? [...prev, ...refreshedItems] : refreshedItems);
      setCursor(response.next_cursor);
      if (refreshBadge) {
        applyUnreadCount(null);
        void refreshUnreadCount();
      }
      setError('');
    } catch (err) {
      if (requestRef.current !== requestId || controller.signal.aborted) return;
      if (err instanceof ApiException && err.status === 401) { setUnauthorized(true); setItems([]); setCursor(null); return; }
      setError(formatUserFacingError(t, err, copy('notifications_error')));
    } finally {
      if (requestRef.current === requestId && !controller.signal.aborted) {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [applyUnreadCount, archived, category, copy, locale, refreshUnreadCount, signedIn, t, token, unreadOnly, unauthorized]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    if (isLoading) return;
    void load();
    return () => controllerRef.current?.abort();
  }, [isLoading, load, reload, userInfo?.access_token, userInfo?.user_id]);

  // The shared visible/online poll also reconciles reads and archives from other devices.
  // Skip a second count request here so this refresh cannot feed back into itself.
  useEffect(() => {
    if (!unread?.as_of || syncedUnreadAtRef.current === unread.as_of) return;
    const initial = syncedUnreadAtRef.current === null;
    syncedUnreadAtRef.current = unread.as_of;
    if (!initial && !isLoading && signedIn && !unauthorized && document.visibilityState === 'visible' && navigator.onLine) {
      void load(undefined, false, false);
    }
  }, [isLoading, load, signedIn, unauthorized, unread?.as_of]);

  useEffect(() => {
    if (!signedIn || !token || openedAnalyticsRef.current === token) return;
    openedAnalyticsRef.current = token;
    void trackProductEvent('notification_center_opened', {
      token,
      source: 'notifications',
      pagePath: '/account/notifications',
      locale,
      metadata: { archived, category, unread_only: unreadOnly },
    });
  }, [archived, category, locale, signedIn, token, unreadOnly]);

  const handleRefresh = useCallback(() => {
    applyUnreadCount(null);
    setReload((value) => value + 1);
    void refreshUnreadCount();
  }, [applyUnreadCount, refreshUnreadCount]);

  const handleReadAll = async () => {
    const signal = lifetimeRef.current?.signal;
    if (!token || unauthorized || !signal || signal.aborted || actionBusy) return;
    setActionBusy('read-all');
    setError('');
    try {
      await markNotificationsReadAll(token, category, signal);
      if (signal.aborted) return;
      applyUnreadCount(null);
      setReload((value) => value + 1);
      await refreshUnreadCount();
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof ApiException && err.status === 401) { setUnauthorized(true); setItems([]); return; }
      setError(formatUserFacingError(t, err, copy('notifications_error')));
    } finally {
      if (!signal.aborted) setActionBusy(null);
    }
  };

  const handleArchive = async (notificationId: string, nextArchived: boolean) => {
    const signal = lifetimeRef.current?.signal;
    if (!token || unauthorized || !signal || signal.aborted || actionBusy) return;
    setActionBusy(notificationId);
    setError('');
    try {
      await updateNotificationArchive(notificationId, nextArchived, token, signal);
      if (signal.aborted) return;
      applyUnreadCount(null);
      void refreshUnreadCount();
      setReload((value) => value + 1);
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof ApiException && err.status === 401) { setUnauthorized(true); setItems([]); return; }
      setError(formatUserFacingError(t, err, copy('notifications_error')));
    } finally {
      if (!signal.aborted) setActionBusy(null);
    }
  };

  if (!isLoading && (!signedIn || unauthorized)) {
    return (
      <section className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-reading">
          <div className="ui-feature-panel px-6 py-12 text-center">
            <Bell className="mx-auto mb-4 text-gold" size={24} />
            <h1 className="font-display text-4xl text-ink">{copy('notifications_auth_title')}</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-ink-muted">{copy('notifications_auth_body')}</p>
            <Link href="/workspace" className="ui-action-primary mt-6 px-4 py-2 text-sm">
              {copy('notifications_auth_cta')}
              <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl animate-fade-in">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="ui-eyebrow">{copy('notifications_label')}</p>
            <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">{copy('notifications_title')}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted">{copy('notifications_intro')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/account/notifications/settings" className="ui-action-secondary px-3 py-2 text-sm">
              <Settings size={14} />
              {copy('notifications_settings')}
            </Link>
            <button type="button" onClick={handleRefresh} className="ui-action-secondary px-3 py-2 text-sm">
              <RefreshCw size={14} />
              {copy('notifications_refresh')}
            </button>
            <button type="button" onClick={() => void handleReadAll()} disabled={actionBusy === 'read-all'} className="ui-action-primary px-3 py-2 text-sm disabled:opacity-60">
              {actionBusy === 'read-all' ? <RefreshCw size={14} className="animate-spin" /> : <CheckCheck size={14} />}
              {copy('notifications_mark_all_read')}
            </button>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {CATEGORY_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              aria-pressed={category === key}
              className={`rounded-full border px-3 py-2 text-sm transition-colors ${category === key ? 'border-gold/40 bg-gold/10 text-gold' : 'border-border-subtle text-ink-muted hover:text-ink'}`}
            >
              {copy(`notifications_category_${key}`)}
            </button>
          ))}
          <button type="button" onClick={() => setUnreadOnly((value) => !value)} aria-pressed={unreadOnly} className={`rounded-full border px-3 py-2 text-sm transition-colors ${unreadOnly ? 'border-sage/40 bg-sage/10 text-sage' : 'border-border-subtle text-ink-muted hover:text-ink'}`}>
            {copy('notifications_unread_only')}
          </button>
          <button type="button" onClick={() => setArchived((value) => !value)} aria-pressed={archived} className={`rounded-full border px-3 py-2 text-sm transition-colors ${archived ? 'border-rust/40 bg-rust/10 text-rust' : 'border-border-subtle text-ink-muted hover:text-ink'}`}>
            {copy('notifications_archived')}
          </button>
        </div>

        {error && <div className="mb-5 rounded-control border border-rust/25 bg-rust/10 px-4 py-3 text-sm text-rust">{error}</div>}

        {loading ? (
          <div className="ui-panel flex items-center gap-2 px-5 py-5 text-sm text-ink-muted">
            <RefreshCw size={15} className="animate-spin" />
            {copy('notifications_loading')}
          </div>
        ) : items.length === 0 ? (
          <div className="ui-feature-panel px-6 py-12 text-center">
            <Inbox className="mx-auto mb-4 text-ink-muted" size={24} />
            <h2 className="font-display text-3xl text-ink">{unreadOnly || category !== 'all' ? copy('notifications_empty_filter') : copy('notifications_empty')}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-ink-muted">{copy('notifications_empty_body')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const itemId = notificationItemId(item);
              const unread = !item.read_at;
              return (
                <article key={itemId} className={`ui-panel px-4 py-4 transition-colors ${unread ? 'border-gold/30 bg-gold/5' : ''}`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <Link href={`/account/notifications/${itemId}`} className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${notificationCategoryTone(item.category)}`}>
                          {copy(`notifications_category_${item.category}`)}
                        </span>
                        {unread && <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-medium text-action-ink">{copy('notifications_unread')}</span>}
                        <span className="font-mono text-xs text-ink-subtle">{dateFormatter.format(new Date(item.occurred_at))}</span>
                      </div>
                      <h2 className="mt-2 text-base font-semibold text-ink">{item.title}</h2>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-muted">{item.summary}</p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link href={`/account/notifications/${itemId}`} className="ui-action-secondary px-3 py-2 text-sm">
                        {copy('notifications_open')}
                        <ChevronRight size={13} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleArchive(itemId, !archived)}
                        disabled={actionBusy === itemId}
                        className="flex h-10 w-10 items-center justify-center rounded-control border border-border-subtle text-ink-muted transition-colors hover:text-gold disabled:opacity-60"
                        aria-label={archived ? copy('notifications_restore') : copy('notifications_archive')}
                      >
                        {actionBusy === itemId ? <RefreshCw size={14} className="animate-spin" /> : <Archive size={14} />}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {cursor && !loading && (
          <div className="mt-8 text-center">
            <button type="button" onClick={() => void load(cursor, true)} disabled={loadingMore} className="ui-action-secondary mx-auto px-5 py-2 text-sm disabled:opacity-60">
              {loadingMore && <RefreshCw size={13} className="animate-spin" />}
              {loadingMore ? copy('notifications_loading_more') : copy('notifications_load_more')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
