'use client';

import type { Translator } from '@/lib/i18n';

type GenerationPricingGridProps = {
  t: Translator;
};

export default function GenerationPricingGrid({ t }: GenerationPricingGridProps) {
  const pricingItems = [
    {
      title: t('home_generation_pricing_low_title'),
      cost: t('home_generation_pricing_low_cost'),
      body: t('home_generation_pricing_low_body'),
    },
    {
      title: t('home_generation_pricing_medium_title'),
      cost: t('home_generation_pricing_medium_cost'),
      body: t('home_generation_pricing_medium_body'),
    },
    {
      title: t('home_generation_pricing_high_title'),
      cost: t('home_generation_pricing_high_cost'),
      body: t('home_generation_pricing_high_body'),
    },
  ];

  return (
    <section className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-gold/70">
            {t('home_generation_pricing_label')}
          </p>
          <h2 className="mt-2 font-display text-2xl text-ink">{t('home_generation_pricing_headline')}</h2>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-ink-muted">{t('home_generation_pricing_body')}</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {pricingItems.map((item) => (
          <article key={item.title} className="rounded-lg border border-border-subtle bg-surface/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
              <span className="rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold">
                {item.cost}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-muted">{item.body}</p>
          </article>
        ))}
      </div>
      <p className="mt-3 rounded-lg border border-border-subtle bg-raised/70 px-4 py-3 text-xs leading-5 text-ink-muted">
        {t('home_generation_pricing_model_note')}
      </p>
    </section>
  );
}
