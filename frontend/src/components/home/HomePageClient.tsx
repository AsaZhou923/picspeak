'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Aperture,
  ArrowRight,
  Clock3,
  FileText,
  Repeat2,
  UploadCloud,
  Wand2,
} from 'lucide-react';
import HomeContactSection from '@/components/home/HomeContactSection';
import HomeCritiqueArtifact from '@/components/home/HomeCritiqueArtifact';
import HomeGenerationPricingSection from '@/components/home/HomeGenerationPricingSection';
import HomeImageCreditRedeem from '@/components/home/HomeImageCreditRedeem';
import HomeImprovementLoop from '@/components/home/HomeImprovementLoop';
import { getHomeIntentEntrances, type HomeIntent } from '@/lib/content-conversion';
import { useI18n } from '@/lib/i18n';
import { markProductAttributionSource, trackProductEvent } from '@/lib/product-analytics';
import { getRetakeCoachCopy } from '@/lib/retake-coach-copy';

const HomeAuthWidgets = dynamic(() => import('@/components/home/HomeAuthWidgets'), {
  ssr: false,
  loading: () => null,
});

const HomeFaq = dynamic(() => import('@/components/home/HomeFaq'), {
  ssr: false,
  loading: () => (
    <div className="space-y-2">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-[74px] rounded-card border border-border-subtle bg-raised/20"
        />
      ))}
    </div>
  ),
});

export function HomePageContent() {
  const { t, locale } = useI18n();
  const homeIntentEntrances = getHomeIntentEntrances(locale);
  const retakeCopy = getRetakeCoachCopy(locale);
  const homeIntentIcons: Record<HomeIntent, typeof UploadCloud> = {
    new_user: UploadCloud,
    returning_user: Clock3,
    content_reader: FileText,
  };

  const TIERS = [
    {
      plan: t('plan_guest_name'),
      quotaLabel: t('plan_guest_quota'),
      features: [t('plan_guest_feature'), t('plan_guest_feature_2')],
    },
    {
      plan: t('plan_free_name'),
      quotaLabel: t('plan_free_quota'),
      features: [t('plan_free_feature'), t('plan_free_feature_2'), t('plan_free_feature_3')],
    },
    {
      plan: t('plan_pro_name'),
      quotaLabel: t('plan_pro_quota'),
      features: [t('plan_pro_feature'), t('plan_pro_feature_2'), t('plan_pro_feature_3')],
      priceLabel: t('pro_offer_price_label'),
      highlight: true,
    },
  ];

  return (
    <>
      <HomeAuthWidgets />

      <section className="relative overflow-hidden px-5 py-12 sm:px-6 sm:py-16 lg:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 top-0 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(200,162,104,0.1),transparent_68%)]"
        />
        <div className="relative mx-auto grid max-w-editorial items-center gap-10 lg:grid-cols-[minmax(0,0.74fr)_minmax(0,1.26fr)] lg:gap-14">
          <div className="max-w-xl">
            <div className="ui-eyebrow inline-flex items-center gap-2">
              <Aperture size={13} aria-hidden="true" />
              <span>{t('hero_label')}</span>
            </div>

            <div
              aria-hidden="true"
              className="mt-5 text-balance font-display text-[clamp(3.25rem,7vw,6.75rem)] leading-[0.9] tracking-[-0.035em] text-ink"
            >
              {t('hero_headline_1')}
              <span className="mt-1 block text-gold">{t('hero_headline_2')}</span>
            </div>

            <p className="mt-6 max-w-lg text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
              {t('hero_desc')}
            </p>

            <Link
              href="/workspace"
              onClick={() => markProductAttributionSource('home_direct')}
              className="ui-action-primary mt-8 w-full px-7 py-3.5 text-sm sm:w-auto"
            >
              {t('hero_cta_start')}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <HomeCritiqueArtifact t={t} />
        </div>

        <div className="relative mx-auto mt-8 flex max-w-editorial flex-wrap items-center justify-center gap-3 lg:justify-start">
          <div
            id="home-signin-slot"
            className="flex min-h-[46px] items-center justify-center"
          />
          <div
            id="home-signup-slot"
            className="flex min-h-[46px] items-center justify-center"
          />
        </div>
      </section>

      <HomeImprovementLoop
        t={t}
        retakeTitle={retakeCopy.homeTitle}
        retakeBody={retakeCopy.homeBody}
      />

      <section className="border-t border-border-subtle px-5 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-editorial">
          <div className="grid gap-5 lg:grid-cols-2">
            <article className="ui-feature-panel flex flex-col overflow-hidden p-6 sm:p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-control border border-sage/35 bg-sage/10 text-sage">
                <Repeat2 size={18} aria-hidden="true" />
              </div>
              <p className="ui-eyebrow mt-6 text-sage">{t('nav_workspace')}</p>
              <h2 className="mt-3 font-display text-3xl leading-tight text-ink sm:text-4xl">
                {retakeCopy.homeTitle}
              </h2>
              <p className="mt-4 flex-1 text-sm leading-7 text-ink-muted">{retakeCopy.homeBody}</p>
              <Link href="/retake" className="ui-action-secondary mt-7 w-fit px-5 py-3 text-sm">
                {retakeCopy.homeCta}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>

            <article className="ui-panel flex flex-col p-6 sm:p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-control border border-gold/30 bg-gold/10 text-gold">
                <Wand2 size={18} aria-hidden="true" />
              </div>
              <p className="ui-eyebrow mt-6">{t('nav_generate')}</p>
              <h2 className="mt-3 font-display text-3xl leading-tight text-ink sm:text-4xl">
                {t('home_gpt_image_title')}
              </h2>
              <p className="mt-4 flex-1 text-sm leading-7 text-ink-muted">
                {t('home_gpt_image_body')}
              </p>
              <Link href="/generate" className="ui-action-secondary mt-7 w-fit px-5 py-3 text-sm">
                {t('home_gpt_image_cta')}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>
          </div>

          <div className="ui-panel mt-6 p-5 sm:p-6">
            <p className="ui-eyebrow">
              {locale === 'en' ? 'Start by intent' : locale === 'ja' ? '目的別の入口' : '按目的开始'}
            </p>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {homeIntentEntrances.map((entry) => {
                const IntentIcon = homeIntentIcons[entry.intent];
                return (
                  <Link
                    key={entry.intent}
                    href={entry.href}
                    onClick={() => {
                      markProductAttributionSource(entry.source);
                      if (entry.entrypoint) {
                        void trackProductEvent('content_workspace_clicked', {
                          source: entry.source,
                          pagePath: '/',
                          locale,
                          metadata: { entrypoint: entry.entrypoint, home_intent: entry.intent },
                        });
                      }
                    }}
                    className="group flex items-start gap-3 rounded-control border border-transparent p-3 transition-colors hover:border-border-subtle hover:bg-raised/65"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-gold/25 bg-gold/10 text-gold">
                      <IntentIcon size={15} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-gold">{entry.label}</span>
                      <span className="mt-1 block text-sm font-semibold text-ink">{entry.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-ink-muted">{entry.cta}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-7 flex justify-center">
            <HomeImageCreditRedeem />
          </div>
        </div>
      </section>

      <section className="border-t border-border-subtle px-5 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="ui-eyebrow">{t('quota_label')}</p>
          <h2 className="mt-4 max-w-3xl font-display text-4xl leading-tight text-ink sm:text-5xl">
            {t('quota_headline')}
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-ink-muted">{t('quota_subhead')}</p>

          <div className="mt-10 grid items-stretch gap-4 sm:grid-cols-3">
            {TIERS.map((tier) => (
              <article
                key={tier.plan}
                className={`relative flex h-full flex-col overflow-hidden rounded-card border p-6 sm:p-7 ${
                  tier.highlight
                    ? 'border-gold/45 bg-raised shadow-level-1'
                    : 'border-border-subtle bg-surface/45'
                }`}
              >
                {tier.highlight && (
                  <span className="mb-4 w-fit rounded-full bg-action px-3 py-1 text-xs font-semibold text-action-ink">
                    {t('pro_offer_highlight')}
                  </span>
                )}
                <h3 className="font-display text-2xl text-ink">{tier.plan}</h3>
                {tier.priceLabel && (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap items-end gap-2">
                      <p className="font-mono text-xs font-semibold tracking-wide text-gold">
                        {tier.priceLabel}
                      </p>
                      {tier.highlight && t('pro_offer_original_price_label') && (
                        <p className="font-mono text-[11px] text-ink-subtle line-through">
                          {t('pro_offer_original_price_label')}
                        </p>
                      )}
                    </div>
                    {tier.highlight && t('pro_offer_label') && (
                      <p className="w-fit rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-gold">
                        {t('pro_offer_label')}
                      </p>
                    )}
                  </div>
                )}
                <p className="mt-4 text-lg font-semibold leading-7 text-ink-muted">
                  {tier.quotaLabel}
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm leading-6 text-ink-muted">
                      <span
                        aria-hidden="true"
                        className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${tier.highlight ? 'bg-gold' : 'bg-ink-subtle'}`}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                {tier.highlight && (
                  <div className="mt-7 border-t border-border-subtle pt-6">
                    <div id="home-checkout-slot" className="min-h-[46px] w-full" />
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <HomeGenerationPricingSection t={t} />

      <section className="border-t border-border-subtle px-5 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-reading text-center">
          <h2 className="font-display text-4xl text-ink sm:text-5xl">{t('hero_cta_start')}</h2>
          <Link
            href="/workspace"
            onClick={() => markProductAttributionSource('home_direct')}
            className="ui-action-primary mt-8 px-8 py-3.5 text-sm"
          >
            {t('hero_cta_start')}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section id="faq" className="border-t border-border-subtle px-5 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-reading">
          <p className="ui-eyebrow">{t('faq_label')}</p>
          <h2 className="mt-4 mb-10 font-display text-4xl text-ink sm:text-5xl">
            {t('faq_headline')}
          </h2>
          <HomeFaq />
        </div>
      </section>

      <HomeContactSection locale={locale} t={t} />
    </>
  );
}

export default function HomePageClient() {
  return <HomePageContent />;
}
