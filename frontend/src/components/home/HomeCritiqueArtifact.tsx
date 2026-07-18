'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import ScoreRing from '@/components/ui/ScoreRing';
import { DEMO_IMAGE_URL, DEMO_REVIEW_ID } from '@/lib/demo-review';
import type { Translator } from '@/lib/i18n';

const DEMO_SCORES = [
  { labelKey: 'score_composition' as const, score: 7 },
  { labelKey: 'score_lighting' as const, score: 8 },
  { labelKey: 'score_color' as const, score: 9 },
  { labelKey: 'score_impact' as const, score: 7 },
  { labelKey: 'score_technical' as const, score: 6 },
];

type HomeCritiqueArtifactProps = {
  t: Translator;
};

export default function HomeCritiqueArtifact({ t }: HomeCritiqueArtifactProps) {
  return (
    <article
      className="ui-feature-panel group overflow-hidden"
      aria-labelledby="home-demo-critique-title"
    >
      <div className="grid sm:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="relative min-h-44 overflow-hidden sm:min-h-full">
          <Image
            src={DEMO_IMAGE_URL}
            alt={t('demo_image_alt')}
            fill
            priority
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            sizes="(min-width: 1280px) 280px, (min-width: 640px) 42vw, calc(100vw - 40px)"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent"
          />
          <p className="absolute bottom-4 left-4 rounded-full border border-white/25 bg-black/45 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-white backdrop-blur-sm">
            {t('demo_label')}
          </p>
          <div className="absolute right-4 top-4 rounded-control border border-white/25 bg-black/55 px-3 py-2 text-right text-white backdrop-blur-sm sm:hidden">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/75">
              {t('demo_final_score')}
            </p>
            <p className="mt-1 font-display text-3xl leading-none">7.4</p>
          </div>
        </div>

        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p id="home-demo-critique-title" className="ui-eyebrow">
                {t('demo_final_score')}
              </p>
              <p className="mt-2 font-display text-5xl leading-none text-gold">7.4</p>
            </div>
            <Link
              href={`/reviews/${DEMO_REVIEW_ID}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold transition-colors hover:text-gold-light"
            >
              {t('demo_view_example')}
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-5 gap-1 border-y border-border-subtle py-4">
            {DEMO_SCORES.map((item) => (
              <ScoreRing
                key={item.labelKey}
                score={item.score}
                size={44}
                strokeWidth={3}
                label={t(item.labelKey)}
                animate={false}
              />
            ))}
          </div>

          <div className="mt-5 space-y-4 text-xs leading-5 text-ink-muted sm:text-sm sm:leading-6">
            <p>
              <span className="mb-1 block font-semibold text-sage">{t('demo_advantage')}</span>
              {t('demo_advantage_body')}
            </p>
            <p className="rounded-control border border-gold/25 bg-gold/10 p-3">
              <span className="mb-1 block font-semibold text-gold">{t('demo_suggestion')}</span>
              {t('demo_suggestion_body')}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
