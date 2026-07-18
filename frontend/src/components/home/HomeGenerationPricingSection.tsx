'use client';

import Link from 'next/link';
import { ArrowRight, Coins } from 'lucide-react';
import type { Translator } from '@/lib/i18n';

type HomeGenerationPricingSectionProps = {
  t: Translator;
};

export default function HomeGenerationPricingSection({ t }: HomeGenerationPricingSectionProps) {
  const generationPricing = [
    {
      title: t('home_generation_pricing_low_title'),
      cost: t('home_generation_pricing_low_cost'),
      body: t('home_generation_pricing_low_body'),
    },
    {
      title: t('home_generation_pricing_medium_title'),
      cost: t('home_generation_pricing_medium_cost'),
      body: t('home_generation_pricing_medium_body'),
      featured: true,
    },
    {
      title: t('home_generation_pricing_high_title'),
      cost: t('home_generation_pricing_high_cost'),
      body: t('home_generation_pricing_high_body'),
    },
  ];

  return (
    <section className="px-6 py-24 border-t border-border-subtle">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs text-gold/70 font-mono mb-4 tracking-widest uppercase">
              {t('home_generation_pricing_label')}
            </p>
            <h2 className="font-display text-3xl sm:text-4xl">{t('home_generation_pricing_headline')}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted">
              {t('home_generation_pricing_body')}
            </p>
          </div>
          <Link
            href="/generate"
            className="inline-flex w-fit items-center gap-2 rounded border border-gold/35 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold/10"
          >
            {t('home_gpt_image_cta')}
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {generationPricing.map((item) => (
            <div
              key={item.title}
              className={`rounded-lg border p-6 transition-all duration-300 ${
                item.featured
                  ? 'border-gold/45 bg-raised shadow-[0_20px_54px_rgba(200,162,104,0.14)]'
                  : 'border-border-subtle bg-raised/35 hover:border-gold/25'
              }`}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <p className={`font-display text-2xl ${item.featured ? 'text-gold' : 'text-ink'}`}>
                  {item.title}
                </p>
                <span className="flex h-9 w-9 items-center justify-center rounded border border-gold/25 bg-gold/10 text-gold">
                  <Coins size={15} />
                </span>
              </div>
              <p className="text-sm font-medium leading-6 text-ink">{item.cost}</p>
              <p className="mt-4 text-sm leading-7 text-ink-muted">{item.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 rounded-lg border border-border-subtle bg-void/25 px-4 py-3 text-xs leading-6 text-ink-muted">
          {t('home_generation_pricing_model_note')}
        </p>
      </div>
    </section>
  );
}
