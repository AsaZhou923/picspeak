'use client';

import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowRight, Aperture, Zap, Star, BarChart2, Mail } from 'lucide-react';
import { buildGoogleOAuthUrl } from '@/lib/api';
import ScoreRing from '@/components/ui/ScoreRing';
import { useI18n } from '@/lib/i18n';
import { siteConfig } from '@/lib/site';

const DEMO_SCORES_KEYS = [
  { labelKey: 'score_composition' as const, score: 7 },
  { labelKey: 'score_lighting' as const, score: 8 },
  { labelKey: 'score_color' as const, score: 9 },
  { labelKey: 'score_story' as const, score: 5 },
  { labelKey: 'score_technical' as const, score: 8 },
];

const DEMO_IMAGE_URL =
  'https://pub-7ae066210514433e84a850bc95c5f1a2.r2.dev/user_108685848365180955307/2026/03/obj_2e7f89c3199643b5.jpg';
const DEMO_REVIEW_ID = 'rev_35e0951d0df94a1e';

export default function HomePage() {
  const { t } = useI18n();
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
          <a
            href={buildGoogleOAuthUrl()}
            className="flex items-center gap-2 px-7 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold active:scale-[0.98] transition-all duration-200"
          >
            <GoogleIcon />
            {t('hero_cta_login')}
          </a>
        </div>

        <div className="relative mt-20 w-full max-w-2xl animate-slide-up anim-fill-both delay-400">
          <div className="border border-border-subtle rounded-lg bg-raised/60 backdrop-blur-sm overflow-hidden hover:border-border transition-colors duration-300">
            <div className="flex items-stretch">
              {/* Actual photo thumbnail */}
              <div className="relative w-28 sm:w-36 shrink-0">
                <Image
                  src={DEMO_IMAGE_URL}
                  alt="Sample critique — autumn ginkgo trees against blue sky"
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
                className={`relative rounded-lg border overflow-hidden transition-all duration-300 ${
                  tier.highlight
                    ? 'bg-raised border-gold/50 shadow-[0_0_48px_rgba(200,162,104,0.18)] ring-1 ring-gold/20 sm:scale-[1.05] sm:z-10'
                    : 'bg-raised/20 border-border-subtle'
                }`}
              >
                {tier.highlight && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent" />
                )}
                <div className="p-8">
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
                  <p className={`text-3xl font-display mb-6 ${tier.highlight ? 'text-ink' : 'text-ink-muted'}`}>
                    {tier.quotaLabel}
                  </p>
                  <ul className="space-y-2.5">
                    {tier.features.map((f) => (
                      <li key={f} className="text-sm text-ink-muted flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tier.highlight ? 'bg-gold' : 'bg-gold/40'}`} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-subtle mt-5">
            {t('quota_payment_note')}
          </p>
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

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
