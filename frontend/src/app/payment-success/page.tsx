'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { getUsage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ApiException, UsageResponse } from '@/lib/types';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { useI18n } from '@/lib/i18n';

export default function PaymentSuccessPage() {
  const { ensureToken, syncPlan } = useAuth();
  const { t } = useI18n();
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadUsageWithRetry() {
      try {
        const token = await ensureToken();
        let latest: UsageResponse | null = null;

        for (let attempt = 0; attempt < 6; attempt += 1) {
          latest = await getUsage(token, { force: true });
          if (cancelled) {
            return;
          }

          syncPlan(latest.plan);
          setUsage(latest);
          setError('');
          setLoading(false);

          if (latest.plan === 'pro' || attempt === 5) {
            return;
          }

          await new Promise((resolve) => window.setTimeout(resolve, 2500));
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setUsage(null);
        setLoading(false);
        if (err instanceof ApiException) {
          setError(err.message);
        } else {
          setError(t('payment_success_error'));
        }
      }
    }

    void loadUsageWithRetry();

    return () => {
      cancelled = true;
    };
  }, [ensureToken, syncPlan, t]);

  const isActivated = usage?.plan === 'pro';
  const body = isActivated ? t('payment_success_body') : t('payment_success_pending_body');

  return (
    <div className="pt-14 min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-16 animate-fade-in">
        <div className="border border-gold/20 bg-raised rounded-2xl p-8 sm:p-10 shadow-[0_20px_80px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-3 text-gold mb-5">
            <CheckCircle2 size={28} />
            <p className="text-xs font-mono tracking-[0.3em] uppercase">{t('payment_success_label')}</p>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl text-ink mb-4">{t('payment_success_headline')}</h1>

          {loading ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-5 w-full" />
              <SkeletonBlock className="h-5 w-4/5" />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm sm:text-base text-ink leading-relaxed">{body}</p>
              {error && <p className="text-sm text-rust">{error}</p>}
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              href="/account/usage"
              className="inline-flex items-center justify-center gap-2 text-sm text-void bg-gold hover:bg-gold-light transition-colors rounded-lg px-4 py-3"
            >
              {t('payment_success_usage_cta')}
              <ArrowRight size={14} />
            </Link>
            <Link
              href="/workspace"
              className="inline-flex items-center justify-center gap-2 text-sm text-ink border border-border rounded-lg px-4 py-3 hover:border-gold/40 hover:bg-gold/5 transition-colors"
            >
              {t('payment_success_workspace_cta')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
