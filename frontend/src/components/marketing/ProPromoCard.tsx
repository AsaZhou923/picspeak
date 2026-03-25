'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Settings2, Sparkles, Ticket } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { CN_PRO_CHECKOUT_TIP, startProCheckout } from '@/lib/pro-checkout';

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
  proCta: string;
  proStatus: string;
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
  if (locale === 'ja') {
    return {
      badge: '初回キャンペーン',
      discount: 'サイト初期運営 25% OFF',
      price: '$2.99 / 月',
      oldPrice: '$3.99',
      footnote: '現在はサイト立ち上げ初期の期間限定価格です。今後は通常価格に戻る可能性があります。',
      features: ['より深い Pro 分析', 'レビュー回数ほぼ無制限', '履歴を長期保存', '優先分析キュー'],
      guestCta: '初回価格で Pro を始める',
      freeCta: '今すぐ Pro を始める',
      proCta: '購読を管理',
      proStatus: '現在の購読には Pro の初回価格が適用中です',
      scenes: {
        workspace: {
          default: {
            title: 'アップロード後、そのまま Pro の深い分析へ',
            body: 'より細かい原因分析と具体的な改善方向まで見たいなら、ここからそのまま Pro に進めます。現在は月額 $2.99 です。',
          },
          pro: {
            title: 'あなたの Pro は今も初回価格で利用中です',
            body: '現在の購読は月額 $2.99 のまま継続中です。深い分析、長期履歴、優先分析キューをこのまま使い続けられます。',
          },
        },
        gallery: {
          default: {
            title: '作例を見たあと、そのまま自分の写真を Pro で深掘り',
            body: 'ギャラリーで参考を見つけたら、次の一枚をより深く分析できます。現在の初回価格は月額 $2.99 です。',
          },
          pro: {
            title: 'あなたの Pro は現在も初回価格で継続中です',
            body: '今の購読価格は月額 $2.99 のままです。無制限に近いレビュー、長期履歴、優先分析を引き続き利用できます。',
          },
        },
        usage: {
          default: {
            title: '今なら Pro は $2.99 / 月で始められます',
            body: '深い分析、長期履歴、優先分析をまとめて解放できます。継続的に写真を見直すなら、ここからのアップグレードが最短です。',
          },
          pro: {
            title: 'あなたは Pro の初回価格をすでに確保しています',
            body: '現在の購読は月額 $2.99 で適用中です。プラン状況や更新情報は購読管理からいつでも確認できます。',
          },
        },
        review: {
          default: {
            title: 'この結果から、そのまま Pro の深い分析へ進めます',
            body: '次の改善までつなげたいなら、ここで Pro に切り替えるのが最短です。現在の初回価格は月額 $2.99 です。',
          },
          pro: {
            title: 'この結果は Pro でさらに深く見直せます',
            body: '現在の購読は月額 $2.99 の初回価格で継続中です。深い分析、長期履歴、優先分析をそのまま使えます。',
          },
        },
      },
    };
  }

  if (locale === 'en') {
    return {
      badge: 'Launch Offer',
      discount: '25% off during early launch',
      price: '$2.99 / month',
      oldPrice: '$3.99',
      footnote: 'This is the current launch-period price and may return to the regular rate later.',
      features: ['Deeper Pro critique', 'Near-unlimited reviews', 'Permanent history', 'Priority queue'],
      guestCta: 'Claim the launch price',
      freeCta: 'Upgrade to Pro now',
      proCta: 'Manage subscription',
      proStatus: 'Your subscription is already on the launch-price Pro plan',
      scenes: {
        workspace: {
          default: {
            title: 'Go straight from upload to deeper Pro critique',
            body: 'If you want fuller diagnosis and clearer next-step direction, you can switch into Pro right here. The current launch price is $2.99/month.',
          },
          pro: {
            title: 'Your Pro plan is still active at the launch price',
            body: 'Your current subscription is still billed at $2.99/month. You can keep using deeper critique, permanent history, and priority processing as usual.',
          },
        },
        gallery: {
          default: {
            title: 'See a strong example, then deepen your own photo with Pro',
            body: 'Use the gallery for reference, then move straight into deeper critique on your next upload. The current launch price is $2.99/month.',
          },
          pro: {
            title: 'Your Pro plan is still locked in at the launch price',
            body: 'Your subscription is currently billed at $2.99/month. Unlimited-style review flow, permanent history, and priority processing remain available.',
          },
        },
        usage: {
          default: {
            title: 'Pro is currently available for $2.99/month',
            body: 'Unlock deeper critique, permanent history, and priority processing in one step. If you review often, this is the shortest upgrade path.',
          },
          pro: {
            title: 'You have already locked in the Pro launch price',
            body: 'Your subscription is currently active at $2.99/month. You can check plan status, billing, and renewal details anytime from subscription management.',
          },
        },
        review: {
          default: {
            title: 'Take this result one step further with Pro',
            body: 'If you want a deeper breakdown and clearer improvement direction from this critique, upgrading here is the fastest path. The current launch price is $2.99/month.',
          },
          pro: {
            title: 'This result can still be explored more deeply with Pro',
            body: 'Your current subscription is already on the $2.99/month launch price, so you can keep using deeper critique, permanent history, and priority processing.',
          },
        },
      },
    };
  }

  return {
    badge: '首发优惠',
    discount: '网站运营初期 25% OFF',
    price: '$2.99 / 月',
    oldPrice: '$3.99',
    footnote: '当前为网站运营初期限时价，后续可能恢复原价。',
    features: ['更深入的 Pro 评图', '近乎不限量评图', '永久历史记录', '优先分析队列'],
    guestCta: '领取 Pro 首发价',
    freeCta: '立即升级 Pro',
    proCta: '管理订阅',
    proStatus: '你当前订阅已享受 Pro 首发优惠价',
    scenes: {
      workspace: {
        default: {
          title: '上传之后，直接进入 Pro 深度分析',
          body: '如果你想马上看到更完整的拆解、问题优先级和修改方向，现在就可以直接升级到 Pro。当前首发优惠价为 $2.99/月。',
        },
        pro: {
          title: '你的 Pro 当前仍在享受首发优惠价',
          body: '当前订阅仍按 $2.99/月生效，你可以继续使用更深入的分析、永久历史记录和优先分析队列。',
        },
      },
      gallery: {
        default: {
          title: '看完案例，下一张直接用 Pro 深挖',
          body: '从影像长廊找到参考后，可以直接切到更深入的评图流程。当前网站运营初期，Pro 首发优惠价为 $2.99/月。',
        },
        pro: {
          title: '你的 Pro 当前仍按首发优惠价生效',
          body: '当前订阅价格为 $2.99/月，你可以继续使用更深入的分析、永久历史记录和优先分析队列。',
        },
      },
      usage: {
        default: {
          title: '现在升级 Pro，首发期仅 $2.99/月',
          body: '更深入的分析、永久历史记录和优先分析都已包含在内，适合高频复盘和持续提升。',
        },
        pro: {
          title: '你已锁定 Pro 首发优惠价',
          body: '当前订阅仍按 $2.99/月生效。你可以在订阅管理中随时查看套餐状态、账单和续费信息。',
        },
      },
      review: {
        default: {
          title: '这张照片值得一次更深入的 Pro 分析',
          body: '如果你想把这次结果真正转成下一轮提升，Pro 会给你更完整的拆解和更清晰的修改方向。当前首发优惠价为 $2.99/月。',
        },
        pro: {
          title: '这张结果可以继续用 Pro 深挖',
          body: '你当前已享受 $2.99/月首发优惠价，可以继续使用更深入的分析、永久历史记录和优先分析队列。',
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
  fallbackRedirectUrl = '/workspace',
  className = '',
}: ProPromoCardProps) {
  const { ensureToken } = useAuth();
  const { locale, t } = useI18n();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
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
      await startProCheckout(ensureToken);
    } catch {
      window.alert(t('usage_checkout_unavailable'));
    } finally {
      setCheckoutLoading(false);
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
                <p className="mt-3 text-xs leading-6 text-ink-subtle">
                  {CN_PRO_CHECKOUT_TIP}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
