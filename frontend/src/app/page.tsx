'use client';

import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowRight, Aperture, Zap, Star, BarChart2, Mail, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import ScoreRing from '@/components/ui/ScoreRing';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import { DEMO_IMAGE_URL, DEMO_REVIEW_ID } from '@/lib/demo-review';
import { useI18n } from '@/lib/i18n';
import { siteConfig } from '@/lib/site';

const DEMO_SCORES_KEYS = [
  { labelKey: 'score_composition' as const, score: 7 },
  { labelKey: 'score_lighting' as const, score: 8 },
  { labelKey: 'score_color' as const, score: 9 },
  { labelKey: 'score_impact' as const, score: 7 },
  { labelKey: 'score_technical' as const, score: 6 },
];

export default function HomePage() {
  const { t, locale } = useI18n();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const updatesCopy = locale === 'ja'
    ? { label: '更新記録', hint: '最近の変更を見る' }
    : locale === 'en'
      ? { label: 'Updates', hint: 'See recent changes' }
      : { label: '更新记录', hint: '查看最近改动' };

  const homeUpdatesCopy = locale === 'ja'
    ? { label: '更新记录', hint: '公开ギャラリー更新を見る' }
    : locale === 'en'
      ? { label: 'Updates', hint: 'See the public gallery update' }
      : { label: '更新记录', hint: '查看公开长廊更新' };

  const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: siteConfig.name,
    applicationCategory: 'PhotographyApplication',
    operatingSystem: 'Web',
    url: siteConfig.url,
    description: siteConfig.description,
    image: `${siteConfig.url}${siteConfig.ogImage}`,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
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
      priceLabel: locale === 'en' ? '$3.99 / month' : '$3.99 / 月',
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
      <Script
        id="picspeak-faq-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-20 overflow-hidden">
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/4 w-[700px] h-[700px] rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse, rgba(200,162,104,0.06) 0%, transparent 70%)',
          }}
        />

        <div className="relative flex items-center gap-2 mb-8 px-4 py-1.5 border border-gold/20 rounded-full text-xs text-gold/80 animate-fade-in">
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
            className="btn-gold flex items-center gap-2 px-7 py-3 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light active:scale-[0.98] transition-all duration-200 hover:shadow-[0_0_24px_rgba(200,162,104,0.4)]"
          >
            {t('hero_cta_start')}
            <ArrowRight size={14} />
          </Link>
          <ClerkSignInTrigger className="flex items-center gap-2 px-7 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold active:scale-[0.98] transition-all duration-200">
            {t('usage_login_now')}
          </ClerkSignInTrigger>
        </div>

        <div className="relative mt-20 w-full max-w-2xl animate-slide-up anim-fill-both delay-400">
          <div className="border border-border-subtle rounded-lg bg-raised/60 backdrop-blur-sm overflow-hidden hover:border-border transition-colors duration-300">
            <div className="flex items-stretch">
              {/* Actual photo thumbnail */}
              <div className="relative w-28 sm:w-36 shrink-0">
                <Image
                  src={DEMO_IMAGE_URL}
                  alt={t('demo_image_alt')}
                  fill
                  className="object-cover"
                  sizes="144px"
                />
              </div>
              {/* Score header */}
              <div className="flex-1 p-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-ink-subtle mb-1 font-mono">{t('demo_label')}</p>
                  <p className="font-display text-2xl text-gold">7.4</p>
                  <p className="text-xs text-ink-muted mt-0.5">{t('demo_final_score')}</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end score-stagger">
                  {DEMO_SCORES_KEYS.map((d) => (
                    <div
                      key={d.labelKey}
                      className="animate-scale-in anim-fill-both"
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
                  <ArrowRight size={11} />
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
	                className={`relative rounded-lg border overflow-hidden transition-all duration-300 h-full ${
	                  tier.highlight
	                    ? 'bg-raised border-gold/50 shadow-[0_0_48px_rgba(200,162,104,0.18)] ring-1 ring-gold/20 sm:scale-[1.05] sm:z-10'
	                    : 'bg-raised/20 border-border-subtle'
	                }`}
	              >
                {tier.highlight && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent" />
                )}
	                <div className="p-8 h-full min-h-[22rem] flex flex-col">
	                  {tier.highlight && (
	                    <span className="inline-block mb-3 text-xs text-void bg-gold rounded-full px-2.5 py-0.5 font-medium tracking-wide">
	                      Most Popular
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
	                    <p className="text-xs font-mono tracking-wide text-gold/75 mb-2">
	                      {tier.priceLabel}
	                    </p>
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
	                      <Link
	                        href="/account/usage"
	                        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-sm font-medium text-void transition-all duration-200 hover:bg-gold-light hover:shadow-[0_0_24px_rgba(200,162,104,0.35)]"
	                      >
	                        {t('usage_checkout_pro')}
	                        <ArrowRight size={14} />
	                      </Link>
	                    </div>
	                  )}
	                </div>
	              </div>
	            ))}
	          </div>
	        </div>
	      </section>

      <section className="px-6 py-24 border-t border-border-subtle">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <h2 className="font-display text-4xl sm:text-5xl">{t('hero_cta_start')}</h2>
          <Link
            href="/workspace"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
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

          <div className="space-y-2">
            {FAQ_KEYS.map(({ q, a }, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={q}
                  className={`border rounded-lg overflow-hidden transition-colors duration-200 ${
                    isOpen ? 'border-gold/40 bg-raised/50' : 'border-border-subtle bg-raised/20 hover:border-border'
                  }`}
                >
                  <button
                    className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm font-medium text-ink leading-snug">{t(q)}</span>
                    <ChevronDown
                      size={16}
                      className={`text-gold shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-sm text-ink-muted leading-relaxed border-t border-border-subtle pt-4">
                      {t(a)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 border-t border-border-subtle">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs text-gold/70 font-mono mb-4 tracking-widest uppercase">Contact</p>
          <h2 className="font-display text-2xl sm:text-3xl mb-8">Get in Touch</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="https://x.com/Zzw_Prime"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-5 py-4 border border-border rounded-lg hover:border-gold/40 hover:bg-raised/50 transition-all duration-200 group w-full sm:w-64"
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
              className="flex items-center gap-3 px-5 py-4 border border-border rounded-lg hover:border-gold/40 hover:bg-raised/50 transition-all duration-200 group w-full sm:w-64"
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
            <Link
              href="/updates"
              className="inline-flex items-center gap-2 text-xs text-ink-subtle transition-colors hover:text-gold"
            >
              <span>{homeUpdatesCopy.label}</span>
              <span className="hidden sm:inline">{homeUpdatesCopy.hint}</span>
              <ArrowRight size={11} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-ink-muted group-hover:text-gold transition-colors">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

