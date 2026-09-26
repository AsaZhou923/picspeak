'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, Copy, Eye, EyeOff, RefreshCw, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import {
  getMyProfileSettings,
  ProfileSettingsResponse,
  updateMyProfileSettings,
} from '@/features/profile/api';
import { getProfileCopy } from '@/features/profile/profile-copy';

function profileHref(publicProfileId: string): string {
  if (typeof window === 'undefined') {
    return `/u/${publicProfileId}`;
  }
  return `${window.location.origin}/u/${publicProfileId}`;
}

export default function AccountProfilePage() {
  const { ensureToken, userInfo } = useAuth();
  const { locale, t } = useI18n();
  const copy = useMemo(() => getProfileCopy(locale), [locale]);
  const [settings, setSettings] = useState<ProfileSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = new AbortController();
    setLoading(true);

    ensureToken()
      .then((token) => getMyProfileSettings(token, controller.signal))
      .then((payload) => {
        if (requestRef.current !== requestId) return;
        setSettings(payload);
        setError('');
        setLoading(false);
      })
      .catch((err) => {
        if (requestRef.current !== requestId || controller.signal.aborted) return;
        setError(formatUserFacingError(t, err, copy.unavailable));
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [copy.unavailable, ensureToken, t, userInfo?.access_token]);

  const publicUrl = settings?.public_profile_enabled && settings.public_profile_id
    ? profileHref(settings.public_profile_id)
    : '';

  async function toggleProfile(enabled: boolean) {
    setSaving(true);
    setError('');
    try {
      const token = await ensureToken();
      const payload = await updateMyProfileSettings(token, enabled);
      setSettings(payload);
    } catch (err) {
      setError(formatUserFacingError(t, err, copy.unavailable));
    } finally {
      setSaving(false);
    }
  }

  async function copyPublicLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(copy.copyFailed);
    }
  }

  return (
    <section className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-4xl animate-fade-in">
        <div className="mb-8">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-accent-muted">
            <UserRound size={13} />
            {copy.accountLabel}
          </p>
          <h1 className="font-display text-4xl text-ink sm:text-5xl">{copy.accountTitle}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted">{copy.accountBody}</p>
        </div>

        <section className="ui-panel overflow-hidden border-gold/20 p-0">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="border-b border-border-subtle bg-void/25 p-6 lg:border-b-0 lg:border-r">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-ink-muted">
                  <RefreshCw size={15} className="animate-spin" />
                  {copy.loading}
                </div>
              ) : settings ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-4">
                    {settings.avatar_url ? (
                      <Image
                        src={settings.avatar_url}
                        alt={settings.username}
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded-full border border-border object-cover"
                      />
                    ) : (
                      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-action text-xl font-semibold text-action-ink">
                        {settings.username.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <h2 className="font-display text-2xl text-ink">{settings.username}</h2>
                      <p className="mt-1 text-sm text-ink-muted">
                        {settings.gallery_review_count}
                        {locale === 'en' ? ` ${copy.galleryCount}` : copy.galleryCount}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-control border border-border-subtle bg-raised/60 p-4">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      {settings.public_profile_enabled ? <Eye size={15} className="text-sage" /> : <EyeOff size={15} className="text-ink-subtle" />}
                      {settings.public_profile_enabled ? copy.visible : copy.hidden}
                    </p>
                    {publicUrl && (
                      <Link href={`/u/${settings.public_profile_id}`} className="mt-2 block break-all text-xs text-gold hover:text-gold-light">
                        {publicUrl}
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">{copy.signinHint}</p>
              )}
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-control border border-rust/30 bg-rust/10 p-3 text-sm text-rust">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid gap-3">
                <button
                  type="button"
                  disabled={loading || saving}
                  onClick={() => void toggleProfile(!settings?.public_profile_enabled)}
                  className="ui-action-primary justify-center px-4 py-3 disabled:opacity-60"
                >
                  {saving ? <RefreshCw size={15} className="animate-spin" /> : settings?.public_profile_enabled ? <EyeOff size={15} /> : <Eye size={15} />}
                  {settings?.public_profile_enabled ? copy.disable : copy.enable}
                </button>
                <button
                  type="button"
                  disabled={!publicUrl}
                  onClick={() => void copyPublicLink()}
                  className="ui-action-secondary justify-center px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy size={15} />
                  {copied ? copy.copied : copy.copyLink}
                </button>
              </div>

              {settings?.public_profile_enabled && settings.public_profile_id && (
                <div className="mt-5 rounded-control border border-border-subtle bg-raised/55 p-4 text-xs leading-6 text-ink-muted">
                  {copy.accountBody}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
