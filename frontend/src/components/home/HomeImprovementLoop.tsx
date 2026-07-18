'use client';

import { Aperture, BarChart2, CheckCircle2, Repeat2, UploadCloud } from 'lucide-react';
import type { Translator } from '@/lib/i18n';

type HomeImprovementLoopProps = {
  t: Translator;
  retakeTitle: string;
  retakeBody: string;
};

export default function HomeImprovementLoop({
  t,
  retakeTitle,
  retakeBody,
}: HomeImprovementLoopProps) {
  const steps = [
    {
      icon: UploadCloud,
      title: t('workspace_headline'),
      body: t('hero_desc'),
    },
    {
      icon: Aperture,
      title: t('feature_flash_title'),
      body: t('feature_flash_body'),
    },
    {
      icon: CheckCircle2,
      title: t('demo_suggestion'),
      body: t('feature_pro_body'),
    },
    {
      icon: Repeat2,
      title: retakeTitle,
      body: retakeBody,
    },
    {
      icon: BarChart2,
      title: t('feature_history_title'),
      body: t('feature_history_body'),
    },
  ];

  return (
    <section className="border-t border-border-subtle px-5 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-editorial">
        <p className="ui-eyebrow">{t('features_label')}</p>
        <h2 className="mt-4 max-w-2xl font-display text-4xl leading-tight text-ink sm:text-5xl">
          {t('features_headline')}
        </h2>

        <ol
          className="mt-12 grid border-l border-border md:grid-cols-5 md:border-l-0 md:border-t"
          aria-label={t('features_headline')}
        >
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            return (
              <li
                key={`${step.title}-${index}`}
                className="relative pb-10 pl-9 last:pb-0 md:px-3 md:pb-0 md:pt-9 first:md:pl-0 last:md:pr-0"
              >
                <span className="absolute -left-[1.1rem] top-0 flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-void text-gold shadow-level-1 md:-top-[1.1rem] md:left-3 first:md:left-0">
                  <StepIcon size={15} aria-hidden="true" />
                </span>
                <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-gold">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-2 font-display text-xl leading-snug text-ink">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-ink-muted">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
