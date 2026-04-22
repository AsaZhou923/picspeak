'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowRight, Aperture, Zap, Star, BarChart2, Mail, BookOpenText } from 'lucide-react';
import { getBlogUi } from '@/lib/blog-data';
import ScoreRing from '@/components/ui/ScoreRing';
import { DEMO_IMAGE_URL, DEMO_REVIEW_ID } from '@/lib/demo-review';
import { useI18n } from '@/lib/i18n';
import { markProductAttributionSource } from '@/lib/product-analytics';
import { siteConfig } from '@/lib/site';
import {
  shouldRenderHomeFaqJsonLd,
  type HomeStructuredDataScope,
} from '@/lib/home-structured-data';

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
          className="h-[74px] rounded-lg border border-border-subtle bg-raised/20"
        />
      ))}
    </div>
  ),
});

const DEMO_SCORES_KEYS = [
  { labelKey: 'score_composition' as const, score: 7 },
  { labelKey: 'score_lighting' as const, score: 8 },
  { labelKey: 'score_color' as const, score: 9 },
  { labelKey: 'score_impact' as const, score: 7 },
  { labelKey: 'score_technical' as const, score: 6 },
];

type HomePageProps = {
  structuredDataScope?: HomeStructuredDataScope;
};

export function HomePageContent({ structuredDataScope = 'root' }: HomePageProps = {}) {
  const { t, locale } = useI18n();
  const blogUi = getBlogUi(locale);
  const renderFaqJsonLd = shouldRenderHomeFaqJsonLd(structuredDataScope);

  const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: siteConfig.name,
    applicationCategory: 'PhotographyApplication',
    operatingSystem: 'Web',
    url: siteConfig.url,
    description: siteConfig.description,
    image: `${siteConfig.url}${siteConfig.ogImage}`,
    sameAs: [siteConfig.social.x, siteConfig.repositoryUrl],
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  const authorJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': siteConfig.author.id,
    name: siteConfig.author.name,
    alternateName: siteConfig.author.alternateName,
    jobTitle: siteConfig.author.jobTitle,
    description: siteConfig.author.description,
    email: siteConfig.author.email,
    sameAs: [siteConfig.social.x, siteConfig.social.githubProfile],
  };

  const sourceCodeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: 'PicSpeak',
    codeRepository: siteConfig.repositoryUrl,
    url: siteConfig.repositoryUrl,
    programmingLanguage: ['TypeScript', 'Python'],
    runtimePlatform: ['Next.js', 'FastAPI'],
    author: {
      '@id': siteConfig.author.id,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };

  const FAQ_KEYS = [
    { q: 'faq_q1' as const, a: 'faq_a1' as const },
    { q: 'faq_q2' as const, a: 'faq_a2' as const },
    { q: 'faq_q3' as const, a: 'faq_a3' as const },
    { q: 'faq_q4' as const, a: 'faq_a4' as const },
    { q: 'faq_q5' as const, a: 'faq_a5' as const },
    { q: 'faq_q6' as const, a: 'faq_a6' as const },
    { q: 'faq_q7' as const, a: 'faq_a7' as const },
    { q: 'faq_q8' as const, a: 'faq_a8' as const },
    { q: 'faq_q9' as const, a: 'faq_a9' as const },
    { q: 'faq_q10' as const, a: 'faq_a10' as const },
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_KEYS.map(({ q, a }) => ({
      '@type': 'Question',
      name: t(q),
      acceptedAnswer: {
        '@type': 'Answer',
        text: t(a),
      },
    })),
  };

  const FEATURES = [
    { icon: Zap, title: t('feature_flash_title'), body: t('feature_flash_body') },
    { icon: Star, title: t('feature_pro_title'), body: t('feature_pro_body') },
    { icon: BarChart2, title: t('feature_history_title'), body: t('feature_history_body') },
  ];

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
      <Script
        id="picspeak-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      {renderFaqJsonLd && (
        <Script
          id="picspeak-faq-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      <Script
        id="picspeak-author-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(authorJsonLd) }}
      />
      <Script
        id="picspeak-source-code-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sourceCodeJsonLd) }}
      />
      <HomeAuthWidgets />
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-20 overflow-hidden">
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/4 w-[700px] h-[700px] rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse, rgba(200,162,104,0.06) 0%, transparent 70%)',
          }}
        />

        <div className="relative flex items-center gap-2 mb-8 px-4 py-1.5 border border-gold/20 rounded-full text-xs text-gold/80 animate-fade-in transition-transform hover:scale-105 duration-300">
          <Aperture size={11} className="animate-spin-slow opacity-70" />
          <span>{t('hero_label')}</span>
        </div>

        <h1 className="relative font-display text-5xl sm:text-6xl md:text-7xl text-center leading-[1.08] max-w-3xl text-balance animate-fade-in anim-fill-both delay-100">
          {t('hero_headline_1')}
          <br />
          <span className="text-gold">{t('hero_headline_2')}</span>
        </h1>

        <p className="relative mt-6 text-ink-muted text-base sm:text-lg text-center max-w-xl leading-relaxed animate-fade-in anim-fill-both delay-200">
          {t('hero_desc')}
        </p>

        <div className="relative mt-10 flex flex-col sm:flex-row gap-4 items-center animate-fade-in anim-fill-both delay-300">
          <Link
            href="/workspace"
            onClick={() => markProductAttributionSource('home_direct')}
            className="btn-gold flex items-center gap-2 px-7 py-3 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light active:scale-[0.98] transition-all duration-200 hover:shadow-[0_0_24px_rgba(200,162,104,0.4)]"
          >
            {t('hero_cta_start')}
            <ArrowRight size={14} />
          </Link>
          <div
            id="home-signin-slot"
            className="flex min-h-[46px] items-center justify-center"
            aria-hidden="true"
          />
          <div
            id="home-signup-slot"
            className="flex min-h-[46px] items-center justify-center"
            aria-hidden="true"
          />
        </div>

        <div className="relative mt-20 w-full max-w-2xl animate-slide-up anim-fill-both delay-400">
          <div className="border border-border-subtle rounded-lg bg-raised/60 backdrop-blur-sm overflow-hidden hover:border-gold/30 hover:shadow-[0_24px_64px_rgba(0,0,0,0.2)] transition-all duration-500 group">
            <div className="flex items-stretch">
              <div className="relative w-28 sm:w-36 shrink-0 overflow-hidden">
                <Image
                  src={DEMO_IMAGE_URL}
                  alt={t('demo_image_alt')}
                  fill
                  className="object-cover transition-transform duration-1000 group-hover:scale-110"
                  sizes="(min-width: 640px) 144px, 112px"
                />
              </div>
              <div className="flex-1 p-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-ink-subtle mb-1 font-mono">{t('demo_label')}</p>
                  <p className="font-display text-2xl text-gold">7.4</p>
                  <p className="text-xs text-ink-muted mt-0.5">{t('demo_final_score')}</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end score-stagger">
                  {DEMO_SCORES_KEYS.map((d, i) => (
                    <div
                      key={d.labelKey}
                      className="animate-scale-in anim-fill-both"
                      style={{ animationDelay: `${500 + i * 100}ms` }}
                    >
                      <ScoreRing
                        score={d.score}
                        size={54}
                        strokeWidth={3}
                        label={t(d.labelKey)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-t border-border-subtle px-5 py-4 space-y-2 text-sm text-ink-muted leading-relaxed">
              <p>
                <span className="text-sage font-medium">{t('demo_advantage')}</span> {t('demo_advantage_body')}
              </p>
              <p>
                <span className="text-gold font-medium">{t('demo_suggestion')}</span> {t('demo_suggestion_body')}
              </p>
              <div className="pt-1">
                <Link
                  href={`/reviews/${DEMO_REVIEW_ID}`}
                  className="inline-flex items-center gap-1 text-xs text-gold/60 hover:text-gold transition-colors"
                >
                  {t('demo_view_example')}
                  <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-24 border-t border-border-subtle">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs text-gold/70 font-mono mb-4 tracking-widest uppercase">
            {t('features_label')}
          </p>
          <h2 className="font-display text-3xl sm:text-4xl mb-16 max-w-md">
            {t('features_headline')}
          </h2>

          <div className="grid md:grid-cols-3 gap-px bg-border-subtle">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-void p-8 space-y-4 transition-all duration-300 hover:bg-raised/50 group">
                <div className="w-10 h-10 border border-border rounded flex items-center justify-center transition-all duration-300 group-hover:border-gold/40 group-hover:shadow-[0_0_12px_rgba(200,162,104,0.15)]">
                  <f.icon size={16} className="text-gold" />
                </div>
                <h3 className="font-display text-xl">{f.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 border-t border-border-subtle">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs text-gold/70 font-mono mb-4 tracking-widest uppercase">
            {t('quota_label')}
          </p>
          <h2 className="font-display text-3xl sm:text-4xl mb-4">{t('quota_headline')}</h2>
          <p className="text-sm text-ink-muted max-w-2xl mb-12 leading-relaxed">
            {t('quota_subhead')}
          </p>

	          <div className="grid sm:grid-cols-3 gap-4 items-start">
	            {TIERS.map((tier) => (
	              <div
	                key={tier.plan}
	                className={`relative rounded-lg border overflow-hidden transition-all duration-500 h-full ${
	                  tier.highlight
	                    ? 'bg-raised border-gold/50 shadow-[0_0_48px_rgba(200,162,104,0.18)] ring-1 ring-gold/20 sm:scale-[1.05] sm:z-10'
	                    : 'bg-raised/20 border-border-subtle hover:border-gold/20'
	                }`}
	              >
                {tier.highlight && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent" />
                )}
	                <div className="p-8 h-full min-h-[22rem] flex flex-col">
	                  {tier.highlight && (
	                    <span className="inline-block mb-3 text-xs text-void bg-gold rounded-full px-2.5 py-0.5 font-medium tracking-wide">
	                      {t('pro_offer_highlight')}
	                    </span>
	                  )}
	                  <p
	                    className={`font-display text-2xl mb-1 ${
	                      tier.highlight ? 'text-gold' : 'text-ink'
	                    }`}
	                  >
	                    {tier.plan}
	                  </p>
	                  {tier.priceLabel && (
                      <div className="mb-3 space-y-2">
                        <div className="flex items-end gap-2">
                          <p className="text-xs font-mono tracking-wide text-gold/85">
                            {tier.priceLabel}
                          </p>
                          {tier.highlight && (
                            <p className="text-[11px] font-mono text-ink-subtle line-through">
                              {t('pro_offer_original_price_label')}
                            </p>
                          )}
                        </div>
                        {tier.highlight && (
                          <p className="inline-flex rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-gold/80">
                            {t('pro_offer_label')}
                          </p>
                        )}
                      </div>
	                  )}
	                  <p className={`text-3xl font-display mb-6 ${tier.highlight ? 'text-ink' : 'text-ink-muted'}`}>
	                    {tier.quotaLabel}
	                  </p>
	                  <ul className="space-y-2.5 flex-1">
	                    {tier.features.map((f) => (
	                      <li key={f} className="text-sm text-ink-muted flex items-center gap-2">
	                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tier.highlight ? 'bg-gold' : 'bg-gold/40'}`} />
	                        {f}
	                      </li>
	                    ))}
	                  </ul>
	                  {tier.highlight && (
	                    <div className="mt-8 pt-2">
                        <div
                          id="home-checkout-slot"
                          className="w-full min-h-[46px]"
                          aria-hidden="true"
                        />
	                    </div>
	                  )}
	                </div>
	              </div>
	            ))}
	          </div>
	        </div>
	      </section>

      <section className="px-6 py-24 border-t border-border-subtle">
        <div className="max-w-2xl mx-auto text-center space-y-8 animate-fade-in">
          <h2 className="font-display text-4xl sm:text-5xl">{t('hero_cta_start')}</h2>
          <Link
            href="/workspace"
            onClick={() => markProductAttributionSource('home_direct')}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-all active:scale-95"
          >
            {t('hero_cta_start')}
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      <section id="faq" className="px-6 py-24 border-t border-border-subtle">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs text-gold/70 font-mono mb-4 tracking-widest uppercase">
            {t('faq_label')}
          </p>
          <h2 className="font-display text-3xl sm:text-4xl mb-12">{t('faq_headline')}</h2>

          <HomeFaq />
        </div>
      </section>

      <section className="px-6 py-16 border-t border-border-subtle">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs text-gold/70 font-mono mb-4 tracking-widest uppercase">{t('contact_label')}</p>
          <h2 className="font-display text-2xl sm:text-3xl mb-8">{t('contact_headline')}</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="https://x.com/Zzw_Prime"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-5 py-4 border border-border rounded-lg hover:border-gold/40 hover:bg-raised/50 transition-all duration-300 group w-full sm:w-64 active:scale-[0.98]"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-full border border-border group-hover:border-gold/40 transition-colors shrink-0">
                <XIcon />
              </span>
              <div>
                <p className="text-sm font-medium text-ink group-hover:text-gold transition-colors">X (Twitter)</p>
                <p className="text-xs text-ink-subtle mt-0.5">@Zzw_Prime</p>
              </div>
            </a>
            <a
              href="mailto:xavierzhou23@gmail.com"
              className="flex items-center gap-3 px-5 py-4 border border-border rounded-lg hover:border-gold/40 hover:bg-raised/50 transition-all duration-300 group w-full sm:w-64 active:scale-[0.98]"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-full border border-border group-hover:border-gold/40 transition-colors shrink-0">
                <Mail size={14} className="text-ink-muted group-hover:text-gold transition-colors" />
              </span>
              <div>
                <p className="text-sm font-medium text-ink group-hover:text-gold transition-colors">Email</p>
                <p className="text-xs text-ink-subtle mt-0.5">xavierzhou23@gmail.com</p>
              </div>
            </a>
          </div>
          <div className="mt-8 flex justify-end">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/${locale}/blog`}
                className="inline-flex items-center gap-2 text-xs text-ink-subtle transition-colors hover:text-gold group"
              >
                <BookOpenText size={12} className="text-gold/75 transition-colors group-hover:text-gold" />
                <span>{blogUi.homeLabel}</span>
                <span className="hidden sm:inline opacity-60 group-hover:opacity-100 transition-opacity">
                  {blogUi.homeHint}
                </span>
                <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href={`/${locale}/updates`}
                className="inline-flex items-center gap-2 text-xs text-ink-subtle transition-colors hover:text-gold group"
              >
                <span>{t('updates_label')}</span>
                <span className="hidden sm:inline opacity-60 group-hover:opacity-100 transition-opacity">{t('updates_hint_latest')}</span>
                <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-ink-muted group-hover:text-gold transition-colors">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
