'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CountUp } from '@/components/ui/Reveal';
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

// The demo critique as a print on the darkroom table: the photo carries
// film-edge captions and the score is written on a slip of paper.
export default function HomeCritiqueArtifact({ t }: HomeCritiqueArtifactProps) {
  return (
    <article className="group relative" aria-labelledby="home-demo-critique-title">
      <div className="ui-rebate px-0.5 pb-2" aria-hidden="true">
        <span>PicSpeak 400</span>
        <span>▸ 12</span>
        <span className="hidden sm:inline">▸ 12A</span>
        <span>{t('demo_label')}</span>
      </div>

      <div className="relative aspect-[4/3] overflow-hidden rounded-[3px] shadow-level-2 sm:aspect-[3/2]">
        <Image
          src={DEMO_IMAGE_URL}
          alt={t('demo_image_alt')}
          fill
          priority
          fetchPriority="high"
          quality={70}
          className="anim-develop object-cover"
          sizes="(min-width: 1280px) 720px, (min-width: 1024px) 56vw, calc(100vw - 40px)"
        />
      </div>

      <div className="ui-paper anim-slip-in relative z-10 mx-3 -mt-10 rounded-[4px] p-5 shadow-level-2 sm:absolute sm:-left-10 sm:bottom-10 sm:m-0 sm:w-[21rem] sm:p-6">
        <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle pb-3">
          <p className="font-display text-5xl font-black leading-none text-ink [font-variant-numeric:tabular-nums]">
            <CountUp value={7.4} delay={1100} />
          </p>
          <p
            id="home-demo-critique-title"
            className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle"
          >
            {t('demo_final_score')}
          </p>
        </div>

        <ul className="flex justify-between gap-2 border-b border-border-subtle py-3 text-xs text-ink-muted">
          {DEMO_SCORES.map((item) => (
            <li key={item.labelKey}>
              {t(item.labelKey)}
              <span className="block text-base font-bold text-ink">{item.score}</span>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-sm leading-6 text-ink">
          <span className="mr-1.5 font-bold text-gold">{t('demo_suggestion')}</span>
          {t('demo_suggestion_body')}
        </p>

        <Link
          href={`/reviews/${DEMO_REVIEW_ID}`}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-gold transition-colors hover:text-gold-dim"
        >
          {t('demo_view_example')}
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
