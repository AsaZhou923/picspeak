'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Mail, X } from 'lucide-react';
import ActivationCodeModal from '@/components/billing/ActivationCodeModal';
import { createBillingCheckout, getBillingPortal, getUsage } from '@/lib/api';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { useAuth } from '@/lib/auth-context';
import { planColor, planLabel } from '@/lib/auth-context';
import { BillingCheckoutResponse, BillingPortalResponse, UsageResponse } from '@/lib/types';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { CN_PRO_CHECKOUT_TIP, openChinaProPurchase } from '@/lib/pro-checkout';

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
    setCheckoutLoading(true);
    setBillingMessage('');
    try {
      const token = await ensureToken();
      const response: BillingCheckoutResponse = await createBillingCheckout(token, 'pro');
      if (response.checkout_url) {
        window.location.assign(response.checkout_url);
        return;
      }
      setBillingMessage(response.message);
      setBillingModalOpen(true);
    } catch (err) {
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
    setPortalLoading(true);
    setBillingMessage('');
    try {
      const token = await ensureToken();
      const response: BillingPortalResponse = await getBillingPortal(token);
      if (response.portal_url) {
        window.location.assign(response.portal_url);
        return;
      }
      setBillingMessage(response.message);
      setBillingModalOpen(true);
    } catch (err) {
      setBillingMessage(formatUserFacingError(t, err, t('usage_manage_unavailable')));
      setBillingModalOpen(true);
    } finally {
      setPortalLoading(false);
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
  const subscriptionEndText = formatSubscriptionDate(usage?.subscription?.current_period_ends_at, locale) ?? fixedSubscriptionCopy[locale].pending;
  const isZhLocale = locale === 'zh';
  const isActivationCodeSubscription = usage?.subscription?.provider === 'activation_code';

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
                    {isZhLocale && (
                      <>
                        <button
                          type="button"
                          onClick={() => openChinaProPurchase(locale)}
                          className="flex items-center gap-1.5 text-xs text-gold border border-gold/20 rounded px-3 py-1.5 hover:bg-gold/10 transition-colors"
                        >
                          中文用户可选：爱发电开通
                          <ArrowRight size={11} />
                        </button>
                        <p className="max-w-[260px] text-right text-[11px] leading-5 text-ink-subtle">
                          {CN_PRO_CHECKOUT_TIP}
                        </p>
                      </>
                    )}
                  </div>
                ) : usage.plan === 'pro' ? (
                  isZhLocale && isActivationCodeSubscription ? (
                    <div className="flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={handleCheckout}
                        className="flex items-center gap-1.5 text-xs text-gold border border-gold/30 rounded px-3 py-1.5 hover:bg-gold/10 transition-colors"
                      >
                        使用 Lemon Squeezy 开通
                        <ArrowRight size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openChinaProPurchase(locale)}
                        className="flex items-center gap-1.5 text-xs text-gold border border-gold/20 rounded px-3 py-1.5 hover:bg-gold/10 transition-colors"
                      >
                        中文用户可选：爱发电开通
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

              {usage.quota.pro_monthly_total !== null && usage.quota.pro_monthly_used !== null && (
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <span className="font-display text-3xl text-ink">
                      {usage.quota.pro_monthly_remaining}
                    </span>
                    <span className="text-ink-muted mb-1 text-sm">
                      {t('usage_pro_monthly_remaining').replace('{total}', String(usage.quota.pro_monthly_total))}
                    </span>
                  </div>
                  <UsageBar
                    label={t('usage_pro_monthly_quota')}
                    used={usage.quota.pro_monthly_used}
                    total={usage.quota.pro_monthly_total}
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
                  <button
                    type="button"
                    onClick={handleCheckout}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-medium text-void transition-colors hover:bg-gold-light"
                  >
                    使用 Lemon Squeezy 开通
                    <ArrowRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openChinaProPurchase(locale)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-5 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/15"
                  >
                    中文用户可选：爱发电开通
                    <ArrowRight size={14} />
                  </button>
                </div>
                <p className="text-[11px] leading-5 text-ink-subtle">{CN_PRO_CHECKOUT_TIP}</p>
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
            {t('usage_goto_workspace')} →
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setBillingModalOpen(false)}
        >
          <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-raised border border-border rounded-xl p-7 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setBillingModalOpen(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="mb-5">
              <p className="text-xs text-gold/70 font-mono mb-3 tracking-widest uppercase">Billing</p>
              <p className="text-sm text-ink leading-relaxed">
                {billingMessage || t('billing_payment_placeholder')}
              </p>
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

const subscriptionCopy = {
  zh: {
    label: 'Pro 到期时间',
    pending: '等待同步',
    cancelledHint: '已取消自动续费，到期后将降级。',
  },
  en: {
    label: 'Pro expires on',
    pending: 'Syncing…',
    cancelledHint: 'Auto-renew is off and the plan will downgrade at the end of the term.',
  },
  ja: {
    label: 'Pro の終了日時',
    pending: '同期中',
    cancelledHint: '自動更新は停止済みで、期間終了後にダウングレードされます。',
  },
} as const;

const fixedSubscriptionCopy = {
  zh: {
    label: 'Pro 到期时间',
    pending: '等待同步',
    cancelledHint: '已关闭自动续费，到期后将降级。',
  },
  en: {
    label: 'Pro expires on',
    pending: 'Syncing…',
    cancelledHint: 'Auto-renew is off and the plan will downgrade at the end of the term.',
  },
  ja: {
    label: 'Pro の終了日時',
    pending: '同期中',
    cancelledHint: '自動更新は停止中で、期間終了後にダウングレードされます。',
  },
} as const;

const activationUiCopy = {
  zh: {
    title: '国内支付与激活码开通',
    body: '中文用户可通过爱发电购买 30 天 Pro。我会在下单后发送激活码，你登录账号后输入激活码即可立即开通或续期。',
    stepBuy: '前往爱发电完成下单',
    stepReceive: '等待我发送激活码',
    stepRedeem: '登录账号后输入激活码',
    purchaseCta: '前往爱发电开通',
    renewCta: '续费 30 天 Pro',
    redeemCta: '输入激活码',
    signInFirst: '先登录再兑换',
    subscriptionHint: '当前账号通过激活码开通，无自动续费。',
    modalEyebrow: 'Activation',
    modalTitle: '兑换激活码',
    modalBody: '请输入我发送给你的激活码。兑换成功后，当前账号会立即获得或延长 30 天 Pro 会员。',
    codeLabel: '激活码',
    codePlaceholder: '例如 PSCN-ABCD-EFGH-JKLM',
    redeemSubmit: '立即兑换',
    redeeming: '正在兑换…',
    close: '关闭',
    success: '兑换成功，Pro 已开通至 {date}。',
    error: '暂时无法兑换激活码，请稍后再试。',
    pending: '已开通',
  },
  en: {
    pending: 'Activated',
  },
  ja: {
    pending: '有効化済み',
  },
} as const;

function formatSubscriptionDate(value: string | null | undefined, locale: 'zh' | 'en' | 'ja'): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const localeMap = {
    zh: 'zh-CN',
    en: 'en-US',
    ja: 'ja-JP',
  } as const;

  return new Intl.DateTimeFormat(localeMap[locale], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function XBrandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-ink-muted group-hover:text-gold transition-colors">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
