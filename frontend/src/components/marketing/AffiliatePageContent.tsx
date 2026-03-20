'use client';

import Link from 'next/link';
import { ArrowRight, BadgeDollarSign, Camera, Repeat2 } from 'lucide-react';
import { siteConfig } from '@/lib/site';
import { useI18n } from '@/lib/i18n';

const affiliateUrl = 'https://picspeak.lemonsqueezy.com/affiliates';

export default function AffiliatePageContent() {
  const { t } = useI18n();

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
