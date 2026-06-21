'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Camera, CheckCircle2, ClipboardCheck, LineChart } from 'lucide-react';
import ActivationCodeModal from '@/components/billing/ActivationCodeModal';
import BillingContactModal from '@/components/account/BillingContactModal';
import UsageGenerationCreditsPanel from '@/components/account/UsageGenerationCreditsPanel';
import UsageQuotaPanel from '@/components/account/UsageQuotaPanel';
import { createBillingCheckout, getBillingPortal, getUsage } from '@/lib/api';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { useAuth } from '@/lib/auth-context';
import { planColor, planLabel } from '@/lib/auth-context';
import { BillingCheckoutResponse, BillingPortalResponse, UsageResponse } from '@/lib/types';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import {
  closeExternalCheckoutWindow,
  navigateExternalCheckoutWindow,
  openExternalCheckoutWindow,
} from '@/lib/external-checkout-window';
import { useCreditPackCheckout } from '@/lib/hooks/useCreditPackCheckout';
import { getProPlanBoundaryCopy, getUsageDecisionCopy, type ProConversionLocale } from '@/lib/pro-conversion';
import { activationUiCopy, fixedSubscriptionCopy, formatSubscriptionDate } from '@/lib/usage-page-copy';

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

function UsageDecisionPanel({
  locale,
  plan,
}: {
  locale: ProConversionLocale;
  plan: UsageResponse['plan'];
}) {
  const decisionCopy = getUsageDecisionCopy(locale);
  const boundaryCopy = getProPlanBoundaryCopy(locale);
  const differenceIcons = [Camera, ClipboardCheck, LineChart] as const;

  return (
    <section className="rounded-[24px] border border-gold/20 bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.14),transparent_36%),rgb(var(--color-surface)/0.72)] p-5">
      <div className="mb-5">
        <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.22em] text-gold/75">
          {decisionCopy.label}
        </p>
        <h2 className="font-display text-2xl text-ink">
          {plan === 'pro' ? decisionCopy.proHeadline : decisionCopy.headline}
        </h2>
        <p className="mt-2 text-sm leading-7 text-ink-muted">
          {plan === 'pro' ? decisionCopy.proBody : decisionCopy.body}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border-subtle bg-void/30 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-ink-subtle">{boundaryCopy.free.title}</p>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{boundaryCopy.free.body}</p>
        </div>
        <div className="rounded-2xl border border-gold/25 bg-gold/10 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-gold/80">{boundaryCopy.pro.title}</p>
          <p className="mt-2 text-sm leading-6 text-ink">{boundaryCopy.pro.body}</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-3 text-sm font-medium text-ink">{decisionCopy.differencesTitle}</p>
        <div className="space-y-3">
          {decisionCopy.differences.map((item, index) => {
            const Icon = differenceIcons[index] ?? CheckCircle2;
            return (
              <div
                key={item.label}
                className="grid gap-3 rounded-2xl border border-border-subtle bg-raised/70 p-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Icon size={15} className="shrink-0 text-gold" />
                  <span>{item.label}</span>
                </div>
                <p className="text-xs leading-5 text-ink-subtle">{item.before}</p>
                <p className="text-xs leading-5 text-gold/90">{item.after}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-border-subtle bg-void/30 p-4">
        <p className="mb-3 text-sm font-medium text-ink">{decisionCopy.outcomesTitle}</p>
        <div className="flex flex-wrap gap-2">
          {decisionCopy.outcomes.map((outcome) => (
            <span
              key={outcome}
              className="inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold/90"
            >
              <CheckCircle2 size={12} />
              {outcome}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function UsagePage() {
  const router = useRouter();
  const { ensureToken, userInfo, syncPlan } = useAuth();
  const { locale, t } = useI18n();
  const hasUserInfo = Boolean(userInfo);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [billingMessage, setBillingMessage] = useState('');
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [activationModalOpen, setActivationModalOpen] = useState(false);
  const creditPackCheckout = useCreditPackCheckout({
    ensureToken,
    locale,
    t,
    onMessage: (message) => {
      if (!message) return;
      setBillingMessage(message);
      setBillingModalOpen(true);
    },
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('checkout') === 'success') {
      router.replace('/payment-success');
    }
  }, [router]);

  useEffect(() => {
    if (!hasUserInfo) {
      setUsage(null);
      setError('');
      setLoading(true);
    }
    ensureToken()
      .then((token) => getUsage(token))
      .then((data) => {
        syncPlan(data.plan);
        setUsage(data);
        setError('');
        setLoading(false);
      })
      .catch((err) => {
        setUsage(null);
        setLoading(false);
        setError(formatUserFacingError(t, err, t('usage_error')));
      });
  }, [ensureToken, hasUserInfo, syncPlan, t, userInfo?.access_token]);

  async function handleCheckout() {
    if (usage?.plan === 'guest') {
      setBillingMessage(t('usage_login_unlock_title'));
      setBillingModalOpen(true);
      return;
    }

    const checkoutWindow = openExternalCheckoutWindow(t('usage_checkout_loading'));
    setCheckoutLoading(true);
    setBillingMessage('');
    try {
      const token = await ensureToken();
      const response: BillingCheckoutResponse = await createBillingCheckout(token, 'pro', locale);
      if (response.checkout_url) {
        if (!navigateExternalCheckoutWindow(checkoutWindow, response.checkout_url)) {
          throw new Error('Checkout window was blocked');
        }
        return;
      }
      closeExternalCheckoutWindow(checkoutWindow);
      setBillingMessage(response.message);
      setBillingModalOpen(true);
    } catch (err) {
      closeExternalCheckoutWindow(checkoutWindow);
      setBillingMessage(formatUserFacingError(t, err, t('usage_checkout_unavailable')));
      setBillingModalOpen(true);
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function refreshUsage(token: string) {
    const data = await getUsage(token, { force: true });
    syncPlan(data.plan);
    setUsage(data);
    return data;
  }

  async function handleManageSubscription() {
    const portalWindow = openExternalCheckoutWindow(t('usage_manage_loading'));
    setPortalLoading(true);
    setBillingMessage('');
    try {
      const token = await ensureToken();
      const response: BillingPortalResponse = await getBillingPortal(token);
      if (response.portal_url) {
        if (!navigateExternalCheckoutWindow(portalWindow, response.portal_url)) {
          throw new Error('Billing portal window was blocked');
        }
        return;
      }
      closeExternalCheckoutWindow(portalWindow);
      setBillingMessage(response.message);
      setBillingModalOpen(true);
    } catch (err) {
      closeExternalCheckoutWindow(portalWindow);
      setBillingMessage(formatUserFacingError(t, err, t('usage_manage_unavailable')));
      setBillingModalOpen(true);
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleCreditPackCheckout(currency: 'usd') {
    setBillingMessage('');
    await creditPackCheckout.startCreditPackCheckout({
      currency,
      entrypoint: 'account_usage',
      pagePath: '/account/usage',
    });
  }

  const historyRetentionText =
    usage?.features.history_retention_days === null
      ? t('usage_history_permanent')
      : usage?.features.history_retention_days === 0
        ? t('usage_history_none')
        : `${usage?.features.history_retention_days} ${t('usage_history_days')}`;
  const reviewModesText =
    usage?.features.review_modes.includes('pro') ? t('plan_free_feature') : t('plan_guest_feature');
  const subscriptionEndText = formatSubscriptionDate(usage?.subscription?.current_period_ends_at, locale) ?? fixedSubscriptionCopy[locale].pending;
  const isZhLocale = locale === 'zh';
  const isActivationCodeSubscription = usage?.subscription?.provider === 'activation_code';
  const generationCredits = usage?.generation_credits ?? {
    monthly_total: 0,
    monthly_used: 0,
    monthly_remaining: 0,
  };

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
                  {usage.plan === 'pro' && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-ink-muted">{fixedSubscriptionCopy[locale].label}</p>
                      <p className="text-sm text-ink">{subscriptionEndText}</p>
                      {isZhLocale && isActivationCodeSubscription && (
                        <p className="text-xs text-gold/80">{activationUiCopy.zh.subscriptionHint}</p>
                      )}
                      {usage.subscription?.cancelled && (
                        <p className="text-xs text-gold/80">{fixedSubscriptionCopy[locale].cancelledHint}</p>
                      )}
                    </div>
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
                  <div className="flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={handleCheckout}
                      disabled={checkoutLoading}
                      className="flex items-center gap-1.5 text-xs text-gold border border-gold/30 rounded px-3 py-1.5 hover:bg-gold/10 transition-colors disabled:opacity-60"
                    >
                      {checkoutLoading
                        ? t('usage_checkout_loading')
                        : t('usage_checkout_pro')}
                      <ArrowRight size={11} />
                    </button>
                  </div>
                ) : usage.plan === 'pro' ? (
                  isZhLocale && isActivationCodeSubscription ? (
                    <div className="flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={handleCheckout}
                        className="flex items-center gap-1.5 text-xs text-gold border border-gold/30 rounded px-3 py-1.5 hover:bg-gold/10 transition-colors"
                      >
                        {t('usage_checkout_pro')}
                        <ArrowRight size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                      className="flex items-center gap-1.5 text-xs text-gold border border-gold/30 rounded px-3 py-1.5 hover:bg-gold/10 transition-colors disabled:opacity-60"
                    >
                      {portalLoading ? t('usage_manage_loading') : t('usage_manage_subscription')}
                      <ArrowRight size={11} />
                    </button>
                  )
                ) : null}
              </div>
            </div>

            <UsageGenerationCreditsPanel
              t={t}
              plan={usage.plan}
              generationCredits={generationCredits}
              creditPackBusy={creditPackCheckout.busy}
              loadingCurrency={creditPackCheckout.loadingCurrency}
              onCreditPackCheckout={() => void handleCreditPackCheckout('usd')}
              renderUsageBar={(props) => <UsageBar {...props} />}
            />

            <UsageQuotaPanel
              t={t}
              usage={usage}
              reviewModesText={reviewModesText}
              historyRetentionText={historyRetentionText}
              renderUsageBar={(props) => <UsageBar {...props} />}
            />

            <UsageDecisionPanel locale={locale} plan={usage.plan} />

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

            {isZhLocale && (
              <div
                id="activation-code"
                className="border border-gold/15 rounded-lg bg-gold/5 p-5 space-y-4"
              >
                <div className="space-y-2">
                  <p className="text-sm text-gold font-medium">{activationUiCopy.zh.title}</p>
                  <p className="text-xs text-ink-muted leading-relaxed">{activationUiCopy.zh.body}</p>
                </div>
                <div className="grid gap-2 text-xs text-ink-muted sm:grid-cols-3">
                  <div className="rounded-md border border-border-subtle px-3 py-3">
                    1. {activationUiCopy.zh.stepBuy}
                  </div>
                  <div className="rounded-md border border-border-subtle px-3 py-3">
                    2. {activationUiCopy.zh.stepReceive}
                  </div>
                  <div className="rounded-md border border-border-subtle px-3 py-3">
                    3. {activationUiCopy.zh.stepRedeem}
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {usage.plan === 'guest' ? (
                    <ClerkSignInTrigger
                      fallbackRedirectUrl="/account/usage"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-medium text-void transition-colors hover:bg-gold-light"
                      signedInClassName="hidden"
                    >
                      {t('usage_login_now')}
                      <ArrowRight size={14} />
                    </ClerkSignInTrigger>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCheckout}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-medium text-void transition-colors hover:bg-gold-light"
                    >
                      {t('usage_checkout_pro')}
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {usage.plan === 'guest' ? (
                    <ClerkSignInTrigger
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-gold/30 px-5 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/10"
                      signedInClassName="inline-flex items-center justify-center gap-2 rounded-full border border-gold/30 px-5 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/10"
                    >
                      {activationUiCopy.zh.signInFirst}
                      <ArrowRight size={14} />
                    </ClerkSignInTrigger>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActivationModalOpen(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-gold/30 px-5 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/10"
                    >
                      {activationUiCopy.zh.redeemCta}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
        {usage && (
          <ProPromoCard
            plan={usage.plan}
            scene="usage"
            fallbackRedirectUrl="/account/usage"
            className="mt-8"
          />
        )}

        <div className="mt-10">
          <Link
            href="/workspace"
            className="text-sm text-ink-muted hover:text-ink transition-colors flex items-center gap-1.5"
          >
            {t('usage_goto_workspace')}
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      <ActivationCodeModal
        open={activationModalOpen}
        onClose={() => setActivationModalOpen(false)}
        onRedeemed={async () => {
          const token = await ensureToken();
          await refreshUsage(token);
        }}
      />

      {billingModalOpen && (
        <BillingContactModal
          t={t}
          message={billingMessage}
          onClose={() => setBillingModalOpen(false)}
        />
      )}
    </div>
  );
}
