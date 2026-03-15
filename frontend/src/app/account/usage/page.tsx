'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Mail, X } from 'lucide-react';
import { createBillingCheckout, getUsage } from '@/lib/api';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import { useAuth } from '@/lib/auth-context';
import { planColor, planLabel } from '@/lib/auth-context';
import { ApiException, BillingCheckoutResponse, UsageResponse } from '@/lib/types';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { useI18n } from '@/lib/i18n';

function UsageBar({
  label,
  used,
  total,
}: {
  label: string;
  used: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = pct >= 90 ? 'bg-rust' : pct >= 60 ? 'bg-gold' : 'bg-sage';

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-ink-muted">
        <span>{label}</span>
        <span>
          {used} / {total}
        </span>
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
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    if (!userInfo) {
      setUsage(null);
      setError('');
      setLoading(true);
    }
    ensureToken()
      .then((token) => getUsage(token))
      .then((data) => {
        setUsage(data);
        setError('');
        setLoading(false);
      })
      .catch((err) => {
        setUsage(null);
        setLoading(false);
        if (err instanceof ApiException) {
          setError(err.message);
        } else {
          setError(t('usage_error'));
        }
      });
  }, [ensureToken, userInfo?.access_token, t]);

  async function handleCheckout() {
    setCheckoutLoading(true);
    setCheckoutMessage('');
    try {
      const token = await ensureToken();
      const response: BillingCheckoutResponse = await createBillingCheckout(token, 'pro');
      setCheckoutMessage(response.message);
      setCheckoutModalOpen(true);
    } catch (err) {
      if (err instanceof ApiException) {
        setCheckoutMessage(err.message);
      } else {
        setCheckoutMessage(t('usage_checkout_unavailable'));
      }
      setCheckoutModalOpen(true);
    } finally {
      setCheckoutLoading(false);
    }
  }

  const historyRetentionText =
    usage?.features.history_retention_days === null
      ? t('usage_history_permanent')
      : usage?.features.history_retention_days === 0
        ? t('usage_history_none')
        : `${usage?.features.history_retention_days} ${t('usage_history_days')}`;
  const reviewModesText =
    usage?.features.review_modes.includes('pro') ? t('plan_free_feature') : t('plan_guest_feature');

  return (
    <div className="pt-14 min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-12 animate-fade-in">
        <div className="mb-10">
          <p className="text-xs text-gold/70 font-mono mb-2 tracking-widest uppercase">
            {t('usage_label')}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">{t('usage_headline')}</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            <SkeletonBlock className="h-28 w-full" />
            <SkeletonBlock className="h-44 w-full" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded px-4 py-3">
            <AlertCircle size={14} />
            {error}
          </div>
        ) : usage ? (
          <div className="space-y-4">
            <div className="border border-border-subtle rounded-lg bg-raised p-6">
              <p className="text-xs text-ink-muted mb-3">{t('usage_identity')}</p>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className={`text-2xl font-display ${planColor(usage.plan)}`}>
                    {planLabel(usage.plan)}
                  </p>
                  {userInfo?.user_id && (
                    <p className="text-xs text-ink-muted font-mono mt-1 truncate max-w-[220px]">
                      {userInfo.user_id}
                    </p>
                  )}
                </div>
                {usage.plan === 'guest' ? (
                  <ClerkSignInTrigger
                    className="flex items-center gap-1.5 text-xs text-gold border border-gold/30 rounded px-3 py-1.5 hover:bg-gold/10 transition-colors"
                    signedInClassName="shrink-0 inline-flex items-center"
                  >
                    {t('usage_login_now')}
                    <ArrowRight size={11} />
                  </ClerkSignInTrigger>
                ) : usage.plan === 'free' ? (
                  <button
                    type="button"
                    onClick={handleCheckout}
                    disabled={checkoutLoading}
                    className="flex items-center gap-1.5 text-xs text-gold border border-gold/30 rounded px-3 py-1.5 hover:bg-gold/10 transition-colors disabled:opacity-60"
                  >
                    {checkoutLoading ? t('usage_checkout_loading') : t('usage_checkout_pro')}
                    <ArrowRight size={11} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="border border-border-subtle rounded-lg bg-raised p-6 space-y-5">
              {usage.quota.daily_total !== null && usage.quota.daily_used !== null ? (
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <span className="font-display text-4xl text-ink">
                      {usage.quota.daily_remaining}
                    </span>
                    <span className="text-ink-muted mb-1.5 text-sm">
                      {t('usage_daily_remaining').replace('{total}', String(usage.quota.daily_total))}
                    </span>
                  </div>
                  <UsageBar
                    label={t('usage_daily_quota')}
                    used={usage.quota.daily_used}
                    total={usage.quota.daily_total}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-ink-muted">{t('usage_daily_quota')}</p>
                  <p className="text-sm text-sage">{t('usage_unlimited_daily')}</p>
                </div>
              )}

              {usage.quota.monthly_total !== null && usage.quota.monthly_used !== null && (
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <span className="font-display text-3xl text-ink">
                      {usage.quota.monthly_remaining}
                    </span>
                    <span className="text-ink-muted mb-1 text-sm">
                      {t('usage_monthly_remaining').replace('{total}', String(usage.quota.monthly_total))}
                    </span>
                  </div>
                  <UsageBar
                    label={t('usage_monthly_quota')}
                    used={usage.quota.monthly_used}
                    total={usage.quota.monthly_total}
                  />
                </div>
              )}

              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <div className="border border-border-subtle rounded-md px-4 py-3">
                  <p className="text-xs text-ink-muted mb-1">{t('usage_review_modes')}</p>
                  <p>{reviewModesText}</p>
                </div>
                <div className="border border-border-subtle rounded-md px-4 py-3">
                  <p className="text-xs text-ink-muted mb-1">{t('usage_history_label')}</p>
                  <p>{historyRetentionText}</p>
                </div>
                <div className="border border-border-subtle rounded-md px-4 py-3">
                  <p className="text-xs text-ink-muted mb-1">{t('usage_priority_label')}</p>
                  <p>{usage.features.priority_queue ? t('usage_priority_yes') : t('usage_priority_no')}</p>
                </div>
              </div>


            </div>

            {usage.plan === 'guest' && (
              <div className="border border-gold/15 rounded-lg bg-gold/5 p-5 space-y-3">
                <p className="text-sm text-gold font-medium">{t('usage_login_unlock_title')}</p>
                <p className="text-xs text-ink-muted leading-relaxed">
                  {t('usage_login_unlock_body')}
                </p>
                <ClerkSignInTrigger
                  className="inline-flex items-center gap-1.5 text-sm text-gold hover:text-gold-light transition-colors"
                  signedInClassName="inline-flex items-center"
                >
                  {t('usage_login_now')} <ArrowRight size={12} />
                </ClerkSignInTrigger>
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-10">
          <Link
            href="/workspace"
            className="text-sm text-ink-muted hover:text-ink transition-colors flex items-center gap-1.5"
          >
            {t('usage_goto_workspace')} →
          </Link>
        </div>
      </div>

      {checkoutModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setCheckoutModalOpen(false)}
        >
          <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-raised border border-border rounded-xl p-7 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setCheckoutModalOpen(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="mb-5">
              <p className="text-xs text-gold/70 font-mono mb-3 tracking-widest uppercase">Pro Upgrade</p>
              <p className="text-sm text-ink leading-relaxed">{t('billing_payment_placeholder')}</p>
            </div>

            <div className="border-t border-border-subtle pt-5">
              <p className="text-xs text-ink-muted mb-4 leading-relaxed">
                {t('billing_contact_prompt')}
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href="https://x.com/Zzw_Prime"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg hover:border-gold/40 hover:bg-void/60 transition-all duration-200 group"
                >
                  <span className="flex items-center justify-center w-7 h-7 rounded-full border border-border group-hover:border-gold/40 transition-colors shrink-0">
                    <XBrandIcon />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-ink group-hover:text-gold transition-colors">X (Twitter)</p>
                    <p className="text-xs text-ink-subtle mt-0.5">@Zzw_Prime</p>
                  </div>
                </a>
                <a
                  href="mailto:xavierzhou23@gmail.com"
                  className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg hover:border-gold/40 hover:bg-void/60 transition-all duration-200 group"
                >
                  <span className="flex items-center justify-center w-7 h-7 rounded-full border border-border group-hover:border-gold/40 transition-colors shrink-0">
                    <Mail size={13} className="text-ink-muted group-hover:text-gold transition-colors" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-ink group-hover:text-gold transition-colors">Email</p>
                    <p className="text-xs text-ink-subtle mt-0.5">xavierzhou23@gmail.com</p>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function XBrandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-ink-muted group-hover:text-gold transition-colors">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
