'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { getUsage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { planLabel, planColor } from '@/lib/auth-context';
import { UsageResponse, ApiException } from '@/lib/types';
import { buildGoogleOAuthUrl } from '@/lib/api';
import LoadingSpinner, { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';
import { useI18n } from '@/lib/i18n';

function UsageBar({ used, total }: { used: number; total: number }) {
  const { t } = useI18n();
  const pct = total > 0 ? (used / total) * 100 : 0;
  const color = pct >= 90 ? 'bg-rust' : pct >= 60 ? 'bg-gold' : 'bg-sage';
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-ink-muted">
        <span>{t('usage_bar_used')} {used} {t('usage_bar_total')}</span>
        <span>{total} {t('usage_bar_total')}</span>
      </div>
      <div className="w-full h-1 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function UsagePage() {
  const { ensureToken, userInfo } = useAuth();
  const { t } = useI18n();
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    ensureToken()
      .then((token) => getUsage(token))
      .then((data) => {
        setUsage(data);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        if (err instanceof ApiException) {
          setError(err.message);
        } else {
          setError(t('usage_error'));
        }
      });
  }, [ensureToken]);

  return (
    <div className="pt-14 min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-12 animate-fade-in">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs text-gold/70 font-mono mb-2 tracking-widest uppercase">
            — {t('usage_label')}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">{t('usage_headline')}</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            <SkeletonBlock className="h-28 w-full" />
            <SkeletonBlock className="h-28 w-full" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded px-4 py-3">
            <AlertCircle size={14} />
            {error}
          </div>
        ) : usage ? (
          <div className="space-y-4">
            {/* Identity card */}
            <div className="border border-border-subtle rounded-lg bg-raised p-6">
              <p className="text-xs text-ink-muted mb-3">{t('usage_identity')}</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-2xl font-display ${planColor(usage.plan)}`}>
                    {planLabel(usage.plan)}
                  </p>
                  {userInfo?.user_id && (
                    <p className="text-xs text-ink-muted font-mono mt-1 truncate max-w-[200px]">
                      {userInfo.user_id}
                    </p>
                  )}
                </div>
                {usage.plan === 'guest' && (
                  <a
                    href={buildGoogleOAuthUrl()}
                    className="flex items-center gap-1.5 text-xs text-gold border border-gold/30 rounded px-3 py-1.5 hover:bg-gold/10 transition-colors"
                  >
                    {t('usage_upgrade')}
                    <ArrowRight size={11} />
                  </a>
                )}
              </div>
            </div>

            {/* Quota card */}
            <div className="border border-border-subtle rounded-lg bg-raised p-6 space-y-4">
              <p className="text-xs text-ink-muted">{t('usage_today_quota')}</p>
              <div className="flex items-end gap-2">
                <span className="font-display text-4xl text-ink">
                  {usage.quota.remaining}
                </span>
                <span className="text-ink-muted mb-1.5 text-sm">
                  {t('usage_remaining_label').replace('{total}', String(usage.quota.daily_total))}
                </span>
              </div>
              <UsageBar used={usage.quota.used} total={usage.quota.daily_total} />
              {usage.quota.remaining === 0 && (
                <p className="text-xs text-rust">
                  {t('usage_reset_hint')}
                </p>
              )}
            </div>

            {/* Plan comparison */}
            {usage.plan === 'guest' && (
              <div className="border border-gold/15 rounded-lg bg-gold/5 p-5 space-y-3">
                <p className="text-sm text-gold font-medium">{t('usage_login_unlock_title')}</p>
                <p className="text-xs text-ink-muted leading-relaxed">
                  {t('usage_login_unlock_body')}
                </p>
                <a
                  href={buildGoogleOAuthUrl()}
                  className="inline-flex items-center gap-1.5 text-sm text-gold hover:text-gold-light transition-colors"
                >
                  {t('usage_login_now')} <ArrowRight size={12} />
                </a>
              </div>
            )}
          </div>
        ) : null}

        {/* Back link */}
        <div className="mt-10">
          <Link
            href="/workspace"
            className="text-sm text-ink-muted hover:text-ink transition-colors flex items-center gap-1.5"
          >
            {t('usage_goto_workspace')} →
          </Link>
        </div>
      </div>
    </div>
  );
}
