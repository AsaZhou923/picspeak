'use client';

import Link from 'next/link';
import { ArrowRight, BadgeDollarSign, Camera, Repeat2 } from 'lucide-react';
import { siteConfig } from '@/lib/site';
import { useI18n } from '@/lib/i18n';

const affiliateUrl = 'https://picspeak.lemonsqueezy.com/affiliates';

function getAffiliateSeoCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      proofLabel: 'Why creators promote PicSpeak',
      proofTitle: '写真学習の文脈で紹介しやすく、登録後も価値が伝わりやすい設計です。',
      proofBody:
        'PicSpeak は写真の構図、光、色、訴求力、技術面を具体的に言語化して返すため、単なる AI ツール紹介ではなく、学習補助として説明しやすいのが特徴です。無料枠から始められるため、興味を持った読者や視聴者が試しやすく、継続課金への導線も自然です。',
      stepsLabel: 'Suggested promotion flow',
      steps: [
        '公開ギャラリーや実例レビューを見せて、どんな講評が返るかを先に体験させる。',
        '自分の写真や受講生の作例を題材に、改善ポイントがどう見えるかを紹介する。',
        '無料枠から始めてもらい、より深い分析が必要な場面で Pro を案内する。',
      ],
      fitTitle: '相性の良い発信者',
      fitItems: [
        '写真 YouTube・X・ブログ運営者',
        'ポートレート、風景、ストリートの教育系アカウント',
        '講評や添削の補助ツールを探している写真講師',
      ],
    };
  }

  if (locale === 'en') {
    return {
      proofLabel: 'Why creators promote PicSpeak',
      proofTitle: 'It is easy to explain in a photography context and easy for new users to try without friction.',
      proofBody:
        'PicSpeak turns composition, lighting, color, impact, and technique into concrete written feedback, so affiliates can position it as a practical learning tool instead of a vague AI product. Free access lowers the first-click barrier, while recurring subscriptions create a cleaner long-term revenue fit.',
      stepsLabel: 'Suggested promotion flow',
      steps: [
        'Show the public gallery or a sample critique first so people can see the output quality.',
        'Use your own photos, student work, or before-and-after examples to explain the value.',
        'Send new users to the free experience first, then frame Pro as the deeper workflow upgrade.',
      ],
      fitTitle: 'Best-fit audiences',
      fitItems: [
        'Photography YouTubers, bloggers, and X creators',
        'Portrait, landscape, and street photography educators',
        'Mentors who want faster review support for student submissions',
      ],
    };
  }

  return {
    proofLabel: '为什么值得推广',
    proofTitle: '它更像一个能直接演示效果的摄影学习工具，而不是抽象的 AI 概念产品。',
    proofBody:
      'PicSpeak 会把构图、光线、色彩、画面冲击力和技术问题拆成可读、可执行的点评，这让创作者更容易在摄影教学、作品复盘、器材内容之外自然植入。用户还能先从免费体验开始，转化路径比纯订阅推广更顺滑。',
    stepsLabel: '推荐推广路径',
    steps: [
      '先展示公开长廊或示例评图，让受众直观看到输出质量。',
      '结合你自己的照片、学员作业或前后对比案例解释产品价值。',
      '先引导受众从免费额度上手，再把 Pro 作为深度分析升级来介绍。',
    ],
    fitTitle: '更适合的推广者',
    fitItems: [
      '摄影类 YouTube、X、公众号和博客作者',
      '做人像、风光、街拍教学的内容创作者',
      '需要提高作业点评效率的摄影老师或训练营组织者',
    ],
  };
}

export default function AffiliatePageContent() {
  const { t, locale } = useI18n();
  const seoCopy = getAffiliateSeoCopy(locale);

  return (
    <div className="px-6 pt-28 pb-24">
      <section className="max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 border border-gold/20 rounded-full text-xs text-gold/80">
          <BadgeDollarSign size={12} />
          <span>{t('affiliate_badge')}</span>
        </div>

        <h1 className="font-display text-5xl sm:text-6xl leading-[1.06] max-w-4xl text-balance">
          {t('affiliate_title_1')}
          <br />
          <span className="text-gold">{t('affiliate_title_2')}</span>
        </h1>

        <p className="mt-6 max-w-2xl text-base sm:text-lg text-ink-muted leading-relaxed">
          {t('affiliate_desc')}
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 items-start">
          <a
            href={affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gold inline-flex items-center gap-2 px-7 py-3 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-all duration-200 hover:shadow-[0_0_24px_rgba(200,162,104,0.35)]"
          >
            {t('affiliate_cta_primary')}
            <ArrowRight size={14} />
          </a>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-7 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-all duration-200"
          >
            {t('affiliate_cta_secondary')}
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto mt-20 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border-subtle bg-raised/30 p-8">
          <div className="flex items-center gap-2 text-gold mb-4">
            <Camera size={16} />
            <h2 className="font-display text-2xl text-ink">{t('affiliate_intro_title')}</h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">{t('affiliate_intro_body')}</p>
          <div className="mt-6 space-y-3 text-sm text-ink-muted">
            <p>{t('affiliate_intro_item_1')}</p>
            <p>{t('affiliate_intro_item_2')}</p>
            <p>{t('affiliate_intro_item_3')}</p>
            <p>{t('affiliate_intro_item_4')}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gold/30 bg-raised p-8 shadow-[0_0_48px_rgba(200,162,104,0.12)]">
          <div className="flex items-center gap-2 text-gold mb-4">
            <Repeat2 size={16} />
            <h2 className="font-display text-2xl text-ink">{t('affiliate_commission_title')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <p className="font-display text-4xl text-gold">30%</p>
              <p className="text-sm text-ink-muted mt-1">{t('affiliate_commission_rate_caption')}</p>
            </div>
            <div>
              <p className="font-display text-4xl text-gold">30 days</p>
              <p className="text-sm text-ink-muted mt-1">{t('affiliate_commission_window_caption')}</p>
            </div>
            <p className="text-sm text-ink-muted leading-relaxed">{t('affiliate_commission_body')}</p>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto mt-20 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-border-subtle bg-raised/25 p-8">
          <p className="text-xs text-gold/70 font-mono tracking-widest uppercase">{seoCopy.proofLabel}</p>
          <h2 className="mt-3 font-display text-3xl text-ink">{seoCopy.proofTitle}</h2>
          <p className="mt-5 text-sm leading-7 text-ink-muted">{seoCopy.proofBody}</p>
        </article>

        <aside className="rounded-2xl border border-border-subtle bg-raised/25 p-8">
          <p className="text-xs text-gold/70 font-mono tracking-widest uppercase">{seoCopy.stepsLabel}</p>
          <div className="mt-5 space-y-4">
            {seoCopy.steps.map((step, index) => (
              <div key={step} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-xs font-medium text-gold">
                  {index + 1}
                </span>
                <p className="text-sm leading-7 text-ink-muted">{step}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="max-w-5xl mx-auto mt-6 rounded-2xl border border-border-subtle bg-raised/20 p-8">
        <h2 className="font-display text-3xl text-ink">{seoCopy.fitTitle}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {seoCopy.fitItems.map((item) => (
            <div
              key={item}
              className="rounded-xl border border-border-subtle bg-void/35 px-5 py-4 text-sm leading-7 text-ink-muted"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto mt-20">
        <div className="rounded-2xl border border-border-subtle bg-raised/20 p-8 sm:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-xs text-gold/70 font-mono tracking-widest uppercase">{t('affiliate_join_label')}</p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl max-w-2xl">
              {t('affiliate_join_title')}
            </h2>
          </div>
          <a
            href={affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-gold px-6 py-3 text-sm font-medium text-void transition-all duration-200 hover:bg-gold-light hover:shadow-[0_0_24px_rgba(200,162,104,0.35)]"
          >
            {t('affiliate_join_cta')}
            <ArrowRight size={14} />
          </a>
        </div>
      </section>

      <section className="max-w-5xl mx-auto mt-8">
        <p className="text-xs text-ink-subtle">
          {t('affiliate_product_site')}:{' '}
          <a
            href={siteConfig.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gold transition-colors"
          >
            {siteConfig.url}
          </a>
        </p>
      </section>
    </div>
  );
}
