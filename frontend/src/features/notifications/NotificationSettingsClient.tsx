'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Heart, RefreshCw } from 'lucide-react';
import { getNotificationPreferences, updateNotificationPreferences } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatUserFacingError } from '@/lib/error-utils';
import { useI18n } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n-en';
import { trackProductEvent } from '@/lib/product-analytics';
import { ApiException, type NotificationPreferencesResponse } from '@/lib/types';
import { canUseNotifications } from './notification-state';

export default function NotificationSettingsClient() {
  const { token, userInfo, isLoading } = useAuth();
  return <SettingsSession key={`${userInfo?.user_id}:${token}:${isLoading}`} />;
}

function SettingsSession() {
  const { token, userInfo, isLoading } = useAuth();
  const { locale, t } = useI18n();
  const copy = useCallback((key: TranslationKey) => t(key), [t]);
  const [preferences, setPreferences] = useState<NotificationPreferencesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const signedIn = canUseNotifications(userInfo) && Boolean(token);
  const lifetimeRef = useRef<AbortController | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const lifetime = new AbortController();
    lifetimeRef.current = lifetime;
    return () => lifetime.abort();
  }, []);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = new AbortController();

    if (isLoading) return () => controller.abort();
    if (!signedIn || !token || unauthorized) {
      setPreferences(null);
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    setError('');
    getNotificationPreferences(token, controller.signal)
      .then((payload) => {
        if (requestRef.current !== requestId || controller.signal.aborted) return;
        setPreferences(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (requestRef.current !== requestId || controller.signal.aborted) return;
        if (err instanceof ApiException && err.status === 401) { setUnauthorized(true); setPreferences(null); setLoading(false); return; }
        setError(formatUserFacingError(t, err, copy('notifications_error')));
        setLoading(false);
      });

    return () => controller.abort();
  }, [copy, isLoading, signedIn, t, token, userInfo?.access_token, userInfo?.user_id, unauthorized, retry]);

  const toggle = async (key: 'likes_enabled' | 'announcements_enabled', value: boolean) => {
    const signal = lifetimeRef.current?.signal;
    if (!token || !signal || signal.aborted || unauthorized || saving) return;
    setSaving(key);
    setError('');
    try {
      const next = await updateNotificationPreferences(token, { [key]: value }, signal);
      if (signal.aborted) return;
      setPreferences(next);
      void trackProductEvent('notification_preferences_changed', {
        token,
        source: 'notifications',
        pagePath: '/account/notifications/settings',
        locale,
        metadata: { key, enabled: value },
      });
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof ApiException && err.status === 401) { setUnauthorized(true); setPreferences(null); return; }
      setError(formatUserFacingError(t, err, copy('notifications_error')));
    } finally {
      if (!signal.aborted) setSaving(null);
    }
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
        <div className="mb-8">
          <p className="ui-eyebrow">{copy('notifications_label')}</p>
          <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">{copy('notifications_settings_title')}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted">{copy('notifications_settings_intro')}</p>
        </div>

        {error && <div role="alert" className="mb-5 rounded-control border border-rust/25 bg-rust/10 px-4 py-3 text-sm text-rust">{error}<button type="button" disabled={loading || Boolean(saving)} className="ml-3 min-h-11 underline" onClick={() => setRetry((value) => value + 1)}>{t('notifications_refresh')}</button></div>}

        {loading ? (
          <div className="ui-panel flex items-center gap-2 px-5 py-5 text-sm text-ink-muted">
            <RefreshCw size={15} className="animate-spin" />
            {copy('notifications_loading')}
          </div>
        ) : preferences ? (
          <div className="space-y-3">
            <PreferenceRow
              icon={<Heart size={17} />}
              title={copy('notifications_likes_title')}
              body={copy('notifications_likes_body')}
              enabled={preferences.likes_enabled}
              saving={saving === 'likes_enabled'}
              onChange={(next) => void toggle('likes_enabled', next)}
              onLabel={copy('notifications_enabled')}
              offLabel={copy('notifications_disabled')}
            />
            <PreferenceRow
              icon={<Bell size={17} />}
              title={copy('notifications_announcements_title')}
              body={copy('notifications_announcements_body')}
              enabled={preferences.announcements_enabled}
              saving={saving === 'announcements_enabled'}
              onChange={(next) => void toggle('announcements_enabled', next)}
              onLabel={copy('notifications_enabled')}
              offLabel={copy('notifications_disabled')}
            />
            <div className="rounded-control border border-border-subtle bg-raised/55 px-4 py-3 text-xs leading-6 text-ink-muted">
              {copy('notifications_system_always_on')}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PreferenceRow({
  icon,
  title,
  body,
  enabled,
  saving,
  onChange,
  onLabel,
  offLabel,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  enabled: boolean;
  saving: boolean;
  onChange: (next: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <section className="ui-panel flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-gold/20 bg-gold/10 text-gold">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">{body}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        disabled={saving}
        className={`inline-flex h-11 min-w-28 items-center justify-center gap-2 rounded-full border px-4 text-sm transition-colors disabled:opacity-60 ${enabled ? 'border-sage/30 bg-sage/10 text-sage' : 'border-border-subtle text-ink-muted hover:text-ink'}`}
      >
        {saving && <RefreshCw size={13} className="animate-spin" />}
        {enabled ? onLabel : offLabel}
      </button>
    </section>
  );
}
