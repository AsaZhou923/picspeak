'use client';

import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

function getUpdatesCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Update Log',
      title: 'Pro 初回キャンペーンと直接チェックアウトを公開',
      intro:
        '今回の更新では、Pro の初回価格を $2.99 / 月に統一し、ワークスペース、結果ページ、ギャラリー、使用状況ページ、トップページの導線をまとめて強化しました。さらに、購入ボタンは使用状況ページを経由せず、そのまま checkout に進むようになりました。',
      date: '2026-03-25',
      sections: [
        {
          title: 'Pro オファー統一',
          items: [
            'Pro の初回価格を全体で $2.99 / 月に統一',
            '「サイト初期運営 25% OFF」の表現で全体をそろえた',
            'Pro 利用中ユーザー向け文案も自然な表現へ調整した',
          ],
        },
        {
          title: '導線強化',
          items: [
            'ワークスペース、結果ページ、ギャラリー、使用状況ページで Pro 入口を強化',
            'トップページの料金カードも同じ初回キャンペーン表現に更新',
            '促進カードは主導線を邪魔しにくい位置へ移動した',
          ],
        },
        {
          title: '購入フロー',
          items: [
            'すべての Pro 購入入口を checkout_url 直行に変更',
            '使用状況ページを経由せず、そのまま決済へ進めるようにした',
            '入口ごとの挙動差をなくすため、共通 checkout helper を追加した',
          ],
        },
        {
          title: '中国語ユーザー向け案内',
          items: [
            '中国語表示時のみ、checkout ボタン下に支払い案内を追加',
            '国内ユーザー向けに WeChat `Asa-180` での購入案内を追記',
            '今回の更新内容を changelog とトップページの更新記録に反映した',
          ],
        },
      ],
      docLabel: 'Doc path',
      docPath: 'docs/changelog/update-log-2026-03-25-pro-launch-checkout.md',
      backHome: 'Back home',
    };
  }

  if (locale === 'en') {
    return {
      label: 'Update Log',
      title: 'Pro Launch Offer and Direct Checkout Updated',
      intro:
        'This release tightens the entire Pro conversion flow. The launch offer is now consistently presented as $2.99/month, new Pro entry points were added across the workspace, result page, gallery, usage page, and homepage, and purchase buttons now go straight to checkout instead of detouring through the usage page.',
      date: '2026-03-25',
      sections: [
        {
          title: 'Offer Consistency',
          items: [
            'Standardized the Pro launch price to $2.99/month across the site, with the original $3.99 shown as a strike-through reference',
            'Unified the promotion framing around an early-launch 25% off offer',
            'Rewrote the Pro-user copy so it confirms value and subscription status instead of exposing internal review language',
          ],
        },
        {
          title: 'Entry Points',
          items: [
            'Added or strengthened Pro conversion cards in the workspace, result page, gallery, and usage page',
            'Updated the homepage pricing card to match the same launch-offer messaging',
            'Shifted conversion cards lower on the page so the main workflow stays primary',
          ],
        },
        {
          title: 'Checkout Flow',
          items: [
            'All Pro promo cards and the homepage pricing CTA now request checkout_url and redirect directly to checkout',
            'Users no longer need to pass through /account/usage before starting payment',
            'Added a shared frontend checkout helper so every promo entry follows the same path',
          ],
        },
        {
          title: 'Chinese Payment Note',
          items: [
            'When the interface language is Chinese, checkout CTAs now show an extra payment note below the button',
            'The note explains that domestic payment channels are not connected yet and offers WeChat purchase via `Asa-180`',
            'This release is also documented in the changelog and linked from the homepage updates record',
          ],
        },
      ],
      docLabel: 'Doc path',
      docPath: 'docs/changelog/update-log-2026-03-25-pro-launch-checkout.md',
      backHome: 'Back home',
    };
  }

  return {
    label: 'Update Log',
    title: 'Pro 首发优惠与直达购买已上线',
    intro:
      '这次更新主要围绕 Pro 首发优惠和购买流程做了统一，重点是价格表达更清晰、入口更多、购买更直接。',
    date: '2026-03-25',
    sections: [
      {
        title: 'Pro 优惠统一',
        items: [
          '全站统一 Pro 首发优惠价为 $2.99/月',
          '优惠表达统一为“网站运营初期 25% OFF”',
          'Pro 用户文案同步改成更自然的用户视角',
        ],
      },
      {
        title: '入口增强',
        items: [
          '工作台、结果页、影像长廊、额度页都补了 Pro 入口',
          '首页定价区同步切到首发优惠表达',
          '促销卡整体下移，减少对主流程的打断',
        ],
      },
      {
        title: '购买链路',
        items: [
          '所有领取 Pro 首发价的入口都改成直接进入 checkout',
          '不再先跳到额度页再购买',
          '不同入口的购买行为已经统一',
        ],
      },
      {
        title: '中文支付提示',
        items: [
          '中文环境下补充了国内支付提示',
          '国内用户可通过微信 `Asa-180` 联系购买',
          '首页更新记录和 changelog 已同步更新',
        ],
      },
    ],
    docLabel: '文档路径',
    docPath: 'docs/changelog/update-log-2026-03-25-pro-launch-checkout.md',
    backHome: '返回首页',
  };
}

export default function UpdatesPage() {
  const { locale } = useI18n();
  const copy = getUpdatesCopy(locale);

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-4xl px-6 py-14 animate-fade-in">
        <div className="mb-10 max-w-3xl">
          <p className="mb-3 text-xs uppercase tracking-[0.32em] text-gold/70">{copy.label}</p>
          <h1 className="font-display text-4xl text-ink sm:text-5xl">{copy.title}</h1>
          <p className="mt-4 text-sm leading-7 text-ink-muted">{copy.intro}</p>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,113,87,0.1),transparent_38%),rgba(18,16,13,0.8)]">
          <div className="border-b border-border-subtle px-6 py-5">
            <div className="flex items-center gap-3 text-sm text-ink">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-gold">
                <Clock3 size={16} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-gold/70">Release</p>
                <p className="font-mono text-sm text-ink-muted">{copy.date}</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="grid gap-5 md:grid-cols-2">
              {copy.sections.map((section) => (
                <article
                  key={section.title}
                  className="rounded-[22px] border border-border-subtle bg-raised/55 p-5"
                >
                  <h2 className="font-display text-2xl text-ink">{section.title}</h2>
                  <div className="mt-4 space-y-3">
                    {section.items.map((item) => (
                      <p key={item} className="flex gap-3 text-sm leading-7 text-ink-muted">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold/80" />
                        <span>{item}</span>
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-border px-4 py-2 text-sm text-ink-muted">
                {copy.docLabel}: <span className="font-mono text-ink">{copy.docPath}</span>
              </div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-gold-light"
              >
                {copy.backHome}
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
