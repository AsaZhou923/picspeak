'use client';

import Link from 'next/link';
import { ArrowRight, Settings2, Sparkles, Ticket } from 'lucide-react';
import { useState } from 'react';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import ActivationCodeModal from '@/components/billing/ActivationCodeModal';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { CN_PRO_CHECKOUT_TIP, startProCheckout } from '@/lib/pro-checkout';
import { getProPlanBoundaryCopy, getProUpgradeTriggerCopy } from '@/lib/pro-conversion';

export type PromoPlan = 'guest' | 'free' | 'pro';
export type PromoScene = 'workspace' | 'gallery' | 'usage' | 'review';

type SceneCopy = { title: string; body: string };

type LocalePromoCopy = {
  badge: string;
  discount: string;
  price: string;
  oldPrice: string;
  footnote: string;
  features: string[];
  guestCta: string;
  freeCta: string;
  proCta: string;
  proStatus: string;
  activationCta: string;
  activationRenewCta: string;
  scenes: Record<PromoScene, { default: SceneCopy; pro: SceneCopy }>;
};

type ProPromoCardProps = {
  plan: PromoPlan;
  scene: PromoScene;
  title?: string;
  body?: string;
  ctaHref?: string;
  fallbackRedirectUrl?: string;
  className?: string;
};

function getPromoCopy(locale: 'zh' | 'en' | 'ja'): LocalePromoCopy {
  const proFeatures = getProPlanBoundaryCopy(locale).pro.features;
  const workspaceTrigger = getProUpgradeTriggerCopy(locale, 'retake_compare');
  const reviewTrigger = getProUpgradeTriggerCopy(locale, 'deeper_result');
  const usageTrigger = getProUpgradeTriggerCopy(locale, 'standard');

  if (locale === 'zh') {
    return {
      badge: 'Pro',
      discount: '30 天一次性开通',
      price: '$1.99 / 30 天',
      oldPrice: '',
      footnote: CN_PRO_CHECKOUT_TIP,
      features: proFeatures,
      guestCta: '升级到 Pro',
      freeCta: '升级到 Pro',
      proCta: '查看账户页',
      proStatus: '你当前已经是 Pro，可以在账户页查看状态或兑换新的激活码。',
      activationCta: '输入激活码',
      activationRenewCta: '输入新的激活码',
      scenes: {
        workspace: {
          default: {
            title: workspaceTrigger.title,
            body: `${workspaceTrigger.body} 中文用户使用 Lemon Squeezy 专属 checkout，$1.99 一次性开通 30 天，不会自动续费。`,
          },
          pro: {
            title: '你的 Pro 已开通',
            body: '你已经是 Pro，可以继续使用深度评图、永久历史和优先处理。',
          },
        },
        gallery: {
          default: {
            title: usageTrigger.title,
            body: `${usageTrigger.body} 中文用户使用 Lemon Squeezy 专属 checkout，$1.99 一次性开通 30 天，不会自动续费。`,
          },
          pro: {
            title: '你的 Pro 已开通',
            body: '可以继续使用深度评图、永久历史和优先处理。',
          },
        },
        usage: {
          default: {
            title: usageTrigger.title,
            body: `${usageTrigger.body} 中文用户使用 Lemon Squeezy 专属 checkout，$1.99 一次性开通 30 天，不会自动续费。`,
          },
          pro: {
            title: '当前账号已是 Pro',
            body: '你可以在账户页查看 Pro 状态，或兑换已有激活码。',
          },
        },
        review: {
          default: {
            title: reviewTrigger.title,
            body: `${reviewTrigger.body} 中文用户使用 Lemon Squeezy 专属 checkout，$1.99 一次性开通 30 天，不会自动续费。`,
          },
          pro: {
            title: '继续使用 Pro 深度分析',
            body: '当前订阅已生效，可以继续使用深度评图和永久历史。',
          },
        },
      },
    };
  }

  const isJa = locale === 'ja';
  return {
    badge: 'Pro',
    discount: isJa ? '月額プラン' : 'Monthly plan',
    price: isJa ? '$3.99 / 月' : '$3.99 / month',
    oldPrice: '',
    footnote: isJa
      ? 'より深い分析、永久履歴、優先処理、毎月の AI image credits が含まれます。'
      : 'Includes deeper critique, permanent history, priority processing, and monthly AI image credits.',
    features: proFeatures,
    guestCta: isJa ? 'Pro にアップグレード' : 'Upgrade to Pro',
    freeCta: isJa ? '今すぐ Pro にアップグレード' : 'Upgrade to Pro now',
    proCta: isJa ? 'サブスクリプションを管理' : 'Manage subscription',
    proStatus: isJa ? '現在の契約は Pro プランです' : 'Your subscription is already on the Pro plan',
    activationCta: '',
    activationRenewCta: '',
    scenes: {
      workspace: {
        default: { title: workspaceTrigger.title, body: workspaceTrigger.body },
        pro: {
          title: isJa ? 'Pro プランは有効です' : 'Your Pro plan is active',
          body: isJa
            ? '深い分析、永久履歴、優先処理をそのまま利用できます。'
            : 'Your current subscription keeps deeper critique, permanent history, and priority processing available.',
        },
      },
      gallery: {
        default: {
          title: usageTrigger.title,
          body: isJa
            ? 'ギャラリーを参考にしながら、次のアップロードを Pro の成長ループへつなげられます。'
            : 'Use the gallery for reference, then move your next upload into the Pro growth loop.',
        },
        pro: {
          title: isJa ? 'Pro プランは有効です' : 'Your Pro plan is active',
          body: isJa
            ? '深い分析、永久履歴、優先処理を引き続き利用できます。'
            : 'Unlimited-style review flow, permanent history, and priority processing remain available.',
        },
      },
      usage: {
        default: { title: usageTrigger.title, body: usageTrigger.body },
        pro: {
          title: isJa ? 'すでに Pro を利用中です' : 'You already have Pro',
          body: isJa
            ? 'プラン状況、請求、更新の詳細はサブスクリプション管理から確認できます。'
            : 'You can check plan status, billing, and renewal details anytime from subscription management.',
        },
      },
      review: {
        default: { title: reviewTrigger.title, body: reviewTrigger.body },
        pro: {
          title: isJa ? 'Pro でさらに深く確認できます' : 'This result can still be explored more deeply with Pro',
          body: isJa
            ? '現在の契約は有効なので、深い分析と永久履歴を使い続けられます。'
            : 'Your current subscription is active, so you can keep using deeper critique and permanent history.',
        },
      },
    },
  };
}

export default function ProPromoCard({
  plan,
  scene,
  title,
  body,
  ctaHref = '/account/usage',
  fallbackRedirectUrl = '/account/usage',
  className = '',
}: ProPromoCardProps) {
  const { ensureToken } = useAuth();
  const { locale, t } = useI18n();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);
  const copy = getPromoCopy(locale);
  const sceneCopy = copy.scenes[scene][plan === 'pro' ? 'pro' : 'default'];
  const resolvedTitle = title ?? sceneCopy.title;
  const resolvedBody = body ?? sceneCopy.body;

  async function handleCheckout() {
    if (checkoutLoading) return;

    setCheckoutLoading(true);
    try {
      await startProCheckout(ensureToken, locale);
    } catch {
      window.alert(t('usage_checkout_unavailable'));
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <section
      className={`relative overflow-hidden rounded-[24px] border border-gold/30 bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,113,87,0.16),transparent_38%),rgb(var(--color-surface)/0.78)] px-5 py-5 shadow-[0_24px_64px_rgba(0,0,0,0.22)] ${className}`.trim()}
    >
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:20px_20px]" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-gold/85">
              <Ticket size={12} />
              {copy.badge}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-ink-subtle">
              {copy.discount}
            </span>
          </div>

          <h2 className="font-display text-2xl text-ink sm:text-3xl">{resolvedTitle}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted">{resolvedBody}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {copy.features.map((feature) => (
              <span
                key={feature}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-ink-subtle"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>

        <div className="w-full max-w-sm rounded-[22px] border border-gold/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 backdrop-blur-sm">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold/75">{copy.discount}</p>
          <div className="mt-3 flex items-end gap-3">
            <p className="font-display text-4xl text-gold">{copy.price}</p>
            {copy.oldPrice && copy.oldPrice !== copy.price && (
              <p className="pb-1 text-sm text-ink-subtle line-through">{copy.oldPrice}</p>
            )}
          </div>
          <p className="mt-2 text-xs leading-6 text-ink-subtle">{copy.footnote}</p>

          {plan === 'pro' ? (
            <>
              <p className="mt-5 rounded-2xl border border-gold/20 bg-gold/10 px-4 py-3 text-sm text-gold/90">
                {copy.proStatus}
              </p>
              <Link
                href={ctaHref}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-gold/30 px-5 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/10"
              >
                <Settings2 size={14} />
                {copy.proCta}
                <ArrowRight size={14} />
              </Link>
              {locale === 'zh' && (
                <button
                  type="button"
                  onClick={() => setActivationOpen(true)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-gold/30 hover:text-gold"
                >
                  {copy.activationRenewCta}
                </button>
              )}
            </>
          ) : (
            <div className="mt-5">
              {plan === 'guest' ? (
                <ClerkSignInTrigger
                  fallbackRedirectUrl={fallbackRedirectUrl}
                  signedInClassName="hidden"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-medium text-void transition-colors hover:bg-gold-light"
                >
                  <Sparkles size={14} />
                  {copy.guestCta}
                  <ArrowRight size={14} />
                </ClerkSignInTrigger>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleCheckout()}
                  disabled={checkoutLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-medium text-void transition-colors hover:bg-gold-light disabled:cursor-wait disabled:opacity-70"
                >
                  <Sparkles size={14} />
                  {checkoutLoading ? t('usage_checkout_loading') : copy.freeCta}
                  <ArrowRight size={14} />
                </button>
              )}
              {locale === 'zh' && (
                <button
                  type="button"
                  onClick={() => setActivationOpen(true)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-gold/30 hover:text-gold"
                >
                  {copy.activationCta}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <ActivationCodeModal open={activationOpen} onClose={() => setActivationOpen(false)} />
    </section>
  );
}
