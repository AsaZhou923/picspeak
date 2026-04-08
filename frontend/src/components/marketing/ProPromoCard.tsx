'use client';

import Link from 'next/link';
import { ArrowRight, Settings2, Sparkles, Ticket } from 'lucide-react';
import { useState } from 'react';
import ActivationCodeModal from '@/components/billing/ActivationCodeModal';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { CN_PRO_CHECKOUT_TIP, openChinaProPurchase, startProCheckout } from '@/lib/pro-checkout';

export type PromoPlan = 'guest' | 'free' | 'pro';
export type PromoScene = 'workspace' | 'gallery' | 'usage' | 'review';

type SceneCopy = {
  title: string;
  body: string;
};

type LocalePromoCopy = {
  badge: string;
  discount: string;
  price: string;
  oldPrice: string;
  footnote: string;
  features: string[];
  guestCta: string;
  freeCta: string;
  chinaCta: string;
  chinaHint: string;
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
  if (locale === 'zh') {
    return {
      badge: '首发促销',
      discount: '网站运营初期 25% OFF',
      price: '$2.99 / 月',
      oldPrice: '$3.99',
      footnote: CN_PRO_CHECKOUT_TIP,
      features: ['更深入的 Pro 评图', '近乎不限量评图', '永久保留历史记录', '优先进入分析队列'],
      guestCta: '使用 Lemon Squeezy 开通',
      freeCta: '使用 Lemon Squeezy 开通',
      chinaCta: '中文用户可选：前往爱发电开通',
      chinaHint: '爱发电通常会有更多优惠，下单后用激活码开通。',
      proCta: '查看账户页',
      proStatus: '你当前已是 Pro，可继续通过激活码续期。',
      activationCta: '输入激活码',
      activationRenewCta: '输入新激活码',
      scenes: {
        workspace: {
          default: {
            title: '主支付入口为 Lemon Squeezy，中文用户也可选爱发电',
            body: '如果你想直接开通 Pro，可以先走 Lemon Squeezy；如果你在国内支付更方便，也可以选择爱发电，下单后再输入激活码。',
          },
          pro: {
            title: '继续通过激活码续费你的 Pro',
            body: '你已经是 Pro。再次购买后输入新的激活码，就能把当前到期时间继续顺延。',
          },
        },
        gallery: {
          default: {
            title: '看完案例后，直接开通 Pro 深入评图',
            body: '主支付入口还是 Lemon Squeezy。中文用户如果更在意优惠，也可以选择爱发电后再兑换激活码。',
          },
          pro: {
            title: '你的 Pro 已开通，可继续续期',
            body: '如果你继续购买中文优惠通道，输入新激活码即可顺延当前 Pro 时长。',
          },
        },
        usage: {
          default: {
            title: '优先使用 Lemon Squeezy，也支持中文优惠通道',
            body: '默认支付入口仍是 Lemon Squeezy。中文用户可额外选择爱发电，通常会有更多优惠。',
          },
          pro: {
            title: '当前账号已是 Pro，可继续续期',
            body: '你可以继续用 Lemon Squeezy 管理订阅，或使用中文优惠通道购买后输入激活码续期。',
          },
        },
        review: {
          default: {
            title: '这次评图想更深入，可以直接开通 Pro',
            body: '主支付入口仍是 Lemon Squeezy；如果你是中文用户，也可以走爱发电优惠通道，收到激活码后在站内兑换。',
          },
          pro: {
            title: '继续延长你的 Pro 时长',
            body: '再次购买后输入新的激活码，就能把当前 Pro 时长继续顺延。',
          },
        },
      },
    };
  }

  if (locale === 'ja') {
    return {
      badge: 'Launch Offer',
      discount: '25% off during early launch',
      price: '$2.99 / month',
      oldPrice: '$3.99',
      footnote: 'This is the current launch-period price and may return to the regular rate later.',
      features: ['Deeper Pro critique', 'Near-unlimited reviews', 'Permanent history', 'Priority queue'],
      guestCta: 'Claim the launch price',
      freeCta: 'Upgrade to Pro now',
      chinaCta: '',
      chinaHint: '',
      proCta: 'Manage subscription',
      proStatus: 'Your subscription is already on the launch-price Pro plan',
      activationCta: '',
      activationRenewCta: '',
      scenes: {
        workspace: {
          default: {
            title: 'Go straight from upload to deeper Pro critique',
            body: 'If you want fuller diagnosis and clearer next-step direction, you can switch into Pro right here.',
          },
          pro: {
            title: 'Your Pro plan is still active at the launch price',
            body: 'Your current subscription keeps permanent history and priority processing active as usual.',
          },
        },
        gallery: {
          default: {
            title: 'See a strong example, then deepen your own photo with Pro',
            body: 'Use the gallery for reference, then move straight into deeper critique on your next upload.',
          },
          pro: {
            title: 'Your Pro plan is still locked in',
            body: 'Unlimited-style review flow, permanent history, and priority processing remain available.',
          },
        },
        usage: {
          default: {
            title: 'Pro is currently available for $2.99/month',
            body: 'Unlock deeper critique, permanent history, and priority processing in one step.',
          },
          pro: {
            title: 'You have already locked in the Pro launch price',
            body: 'You can check plan status, billing, and renewal details anytime from subscription management.',
          },
        },
        review: {
          default: {
            title: 'Take this result one step further with Pro',
            body: 'If you want a deeper breakdown and clearer improvement direction from this critique, upgrading here is the fastest path.',
          },
          pro: {
            title: 'This result can still be explored more deeply with Pro',
            body: 'Your current subscription remains active, so you can keep using deeper critique and permanent history.',
          },
        },
      },
    };
  }

  return {
    badge: 'Launch Offer',
    discount: '25% off during early launch',
    price: '$2.99 / month',
    oldPrice: '$3.99',
    footnote: 'This is the current launch-period price and may return to the regular rate later.',
    features: ['Deeper Pro critique', 'Near-unlimited reviews', 'Permanent history', 'Priority queue'],
    guestCta: 'Claim the launch price',
    freeCta: 'Upgrade to Pro now',
    chinaCta: '',
    chinaHint: '',
    proCta: 'Manage subscription',
    proStatus: 'Your subscription is already on the launch-price Pro plan',
    activationCta: '',
    activationRenewCta: '',
    scenes: {
      workspace: {
        default: {
          title: 'Go straight from upload to deeper Pro critique',
          body: 'If you want fuller diagnosis and clearer next-step direction, you can switch into Pro right here.',
        },
        pro: {
          title: 'Your Pro plan is still active at the launch price',
          body: 'Your current subscription is still billed at the launch price and keeps deeper critique available.',
        },
      },
      gallery: {
        default: {
          title: 'See a strong example, then deepen your own photo with Pro',
          body: 'Use the gallery for reference, then move straight into deeper critique on your next upload.',
        },
        pro: {
          title: 'Your Pro plan is still locked in at the launch price',
          body: 'Unlimited-style review flow, permanent history, and priority processing remain available.',
        },
      },
      usage: {
        default: {
          title: 'Pro is currently available for $2.99/month',
          body: 'Unlock deeper critique, permanent history, and priority processing in one step.',
        },
        pro: {
          title: 'You have already locked in the Pro launch price',
          body: 'You can check plan status, billing, and renewal details anytime from subscription management.',
        },
      },
      review: {
        default: {
          title: 'Take this result one step further with Pro',
          body: 'If you want a deeper breakdown and clearer improvement direction from this critique, upgrading here is the fastest path.',
        },
        pro: {
          title: 'This result can still be explored more deeply with Pro',
          body: 'Your current subscription is active, so you can keep using deeper critique and permanent history.',
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
  className = '',
}: ProPromoCardProps) {
  const { ensureToken } = useAuth();
  const { locale, t } = useI18n();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [chinaCheckoutLoading, setChinaCheckoutLoading] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);
  const copy = getPromoCopy(locale);
  const sceneCopy = copy.scenes[scene][plan === 'pro' ? 'pro' : 'default'];
  const resolvedTitle = title ?? sceneCopy.title;
  const resolvedBody = body ?? sceneCopy.body;

  async function handleCheckout() {
    if (checkoutLoading) {
      return;
    }

    setCheckoutLoading(true);
    try {
      await startProCheckout(ensureToken, locale);
    } catch {
      window.alert(t('usage_checkout_unavailable'));
    } finally {
      setCheckoutLoading(false);
    }
  }

  function handleChinaCheckout() {
    if (chinaCheckoutLoading) {
      return;
    }

    setChinaCheckoutLoading(true);
    try {
      openChinaProPurchase();
    } finally {
      setChinaCheckoutLoading(false);
    }
  }

  return (
    <section
      className={`relative overflow-hidden rounded-[24px] border border-gold/30 bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,113,87,0.16),transparent_38%),rgba(18,16,13,0.78)] px-5 py-5 shadow-[0_24px_64px_rgba(0,0,0,0.22)] ${className}`.trim()}
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
            <p className="pb-1 text-sm text-ink-subtle line-through">{copy.oldPrice}</p>
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
                <>
                  <button
                    type="button"
                    onClick={handleChinaCheckout}
                    disabled={chinaCheckoutLoading}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-5 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/15 disabled:opacity-70"
                  >
                    {chinaCheckoutLoading ? '正在打开爱发电…' : copy.chinaCta}
                    <ArrowRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivationOpen(true)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-gold/30 hover:text-gold"
                  >
                    {copy.activationRenewCta}
                  </button>
                  <p className="mt-3 text-xs leading-6 text-ink-subtle">{copy.chinaHint}</p>
                </>
              )}
            </>
          ) : (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => void handleCheckout()}
                disabled={checkoutLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-medium text-void transition-colors hover:bg-gold-light disabled:cursor-wait disabled:opacity-70"
              >
                <Sparkles size={14} />
                {checkoutLoading ? t('usage_checkout_loading') : plan === 'guest' ? copy.guestCta : copy.freeCta}
                <ArrowRight size={14} />
              </button>
              {locale === 'zh' && (
                <>
                  <button
                    type="button"
                    onClick={handleChinaCheckout}
                    disabled={chinaCheckoutLoading}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-5 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/15 disabled:opacity-70"
                  >
                    {chinaCheckoutLoading ? '正在打开爱发电…' : copy.chinaCta}
                    <ArrowRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivationOpen(true)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-gold/30 hover:text-gold"
                  >
                    {copy.activationCta}
                  </button>
                  <p className="mt-3 text-xs leading-6 text-ink-subtle">
                    {copy.chinaHint}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <ActivationCodeModal open={activationOpen} onClose={() => setActivationOpen(false)} />
    </section>
  );
}
