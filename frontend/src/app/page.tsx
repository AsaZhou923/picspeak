'use client';

import Link from 'next/link';
import { ArrowRight, Aperture, Zap, Star, BarChart2 } from 'lucide-react';
import { buildGoogleOAuthUrl } from '@/lib/api';
import ScoreRing from '@/components/ui/ScoreRing';
import { useI18n } from '@/lib/i18n';

const DEMO_SCORES_KEYS = [
  { labelKey: 'score_composition' as const, score: 8 },
  { labelKey: 'score_lighting' as const, score: 7 },
  { labelKey: 'score_color' as const, score: 9 },
  { labelKey: 'score_story' as const, score: 6 },
  { labelKey: 'score_technical' as const, score: 8 },
];

export default function HomePage() {
  const { t } = useI18n();

  const FEATURES = [
    { icon: Zap, title: t('feature_flash_title'), body: t('feature_flash_body') },
    { icon: Star, title: t('feature_pro_title'), body: t('feature_pro_body') },
    { icon: BarChart2, title: t('feature_history_title'), body: t('feature_history_body') },
  ];

  const TIERS = [
    {
      plan: t('plan_guest_name'),
      daily: 3,
      dailyLabel: t('plan_guest_quota'),
      features: [t('plan_guest_feature'), t('plan_guest_label')],
    },
    {
      plan: t('plan_free_name'),
      daily: 6,
      dailyLabel: t('plan_free_quota'),
      features: [t('plan_free_feature'), 'Google'],
    },
    {
      plan: t('plan_pro_name'),
      daily: 30,
      dailyLabel: t('plan_pro_quota'),
      features: [t('plan_pro_feature')],
      highlight: true,
    },
  ];

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-20 overflow-hidden">
        {/* Decorative radial glow */}
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/4 w-[700px] h-[700px] rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse, rgba(200,162,104,0.06) 0%, transparent 70%)',
          }}
        />

        {/* Label */}
        <div className="relative flex items-center gap-2 mb-8 px-4 py-1.5 border border-gold/20 rounded-full text-xs text-gold/80">
          <Aperture size={11} />
          <span>{t('hero_label')}</span>
        </div>

        {/* Headline */}
        <h1 className="relative font-display text-5xl sm:text-6xl md:text-7xl text-center leading-[1.08] max-w-3xl text-balance">
          {t('hero_headline_1')}
          <br />
          <span className="text-gold">{t('hero_headline_2')}</span>
        </h1>

        <p className="relative mt-6 text-ink-muted text-base sm:text-lg text-center max-w-xl leading-relaxed">
          {t('hero_desc')}
        </p>

        {/* CTA Buttons */}
        <div className="relative mt-10 flex flex-col sm:flex-row gap-4 items-center">
          <Link
            href="/workspace"
            className="flex items-center gap-2 px-7 py-3 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
          >
            {t('hero_cta_start')}
            <ArrowRight size={14} />
          </Link>
          <a
            href={buildGoogleOAuthUrl()}
            className="flex items-center gap-2 px-7 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
          >
            <GoogleIcon />
            {t('hero_cta_login')}
          </a>
        </div>

        {/* Demo score panel */}
        <div className="relative mt-20 w-full max-w-2xl animate-slide-up">
          <div className="border border-border-subtle rounded-lg bg-raised/60 backdrop-blur-sm p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-xs text-ink-subtle mb-1 font-mono">{t('demo_label')}</p>
                <p className="font-display text-2xl text-gold">7.6</p>
                <p className="text-xs text-ink-muted mt-0.5">{t('demo_final_score')}</p>
              </div>
              <div className="flex flex-wrap gap-3 justify-end">
                {DEMO_SCORES_KEYS.map((d) => (
                  <ScoreRing
                    key={d.labelKey}
                    score={d.score}
                    size={60}
                    strokeWidth={3}
                    label={t(d.labelKey)}
                  />
                ))}
              </div>
            </div>
            <div className="border-t border-border-subtle pt-4 space-y-2 text-sm text-ink-muted leading-relaxed">
              <p>
                <span className="text-sage font-medium">{t('demo_advantage')}</span> ·{' '}
                {t('demo_advantage_body')}
              </p>
              <p>
                <span className="text-gold font-medium">{t('demo_suggestion')}</span> ·{' '}
                {t('demo_suggestion_body')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section className="px-6 py-24 border-t border-border-subtle">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs text-gold/70 font-mono mb-4 tracking-widest uppercase">— {t('features_label')}</p>
          <h2 className="font-display text-3xl sm:text-4xl mb-16 max-w-md">
            {t('features_headline')}
          </h2>

          <div className="grid md:grid-cols-3 gap-px bg-border-subtle">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-void p-8 space-y-4">
                <div className="w-10 h-10 border border-border rounded flex items-center justify-center">
                  <f.icon size={16} className="text-gold" />
                </div>
                <h3 className="font-display text-xl">{f.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quota info ──────────────────────────────────────────────────────── */}
      <section className="px-6 py-24 border-t border-border-subtle">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs text-gold/70 font-mono mb-4 tracking-widest uppercase">— {t('quota_label')}</p>
          <h2 className="font-display text-3xl sm:text-4xl mb-12">{t('quota_headline')}</h2>

          <div className="grid sm:grid-cols-3 gap-px bg-border-subtle">
            {TIERS.map((tier) => (
              <div
                key={tier.plan}
                className={`bg-void p-8 relative ${tier.highlight ? 'bg-raised' : ''}`}
              >
                {tier.highlight && (
                  <span className="absolute top-4 right-4 text-xs text-gold border border-gold/30 rounded px-2 py-0.5">
                    ★
                  </span>
                )}
                <p
                  className={`font-display text-2xl mb-1 ${
                    tier.highlight ? 'text-gold' : 'text-ink'
                  }`}
                >
                  {tier.plan}
                </p>
                <p className="text-3xl font-display text-ink-muted mb-6">
                  {tier.dailyLabel}
                </p>
                <ul className="space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="text-sm text-ink-muted flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-gold/60 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="px-6 py-24 border-t border-border-subtle">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <h2 className="font-display text-4xl sm:text-5xl">
            {t('hero_cta_start')}
          </h2>
          <Link
            href="/workspace"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
          >
            {t('hero_cta_start')}
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </>
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
