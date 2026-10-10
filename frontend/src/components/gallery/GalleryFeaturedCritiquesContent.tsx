'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { FEATURED_CRITIQUES } from '@/lib/featured-critiques';

const COPY = {
  en: {
    label: 'Selected public critiques', title: 'From a specific issue to an adjustment you can try',
    note: 'These summaries paraphrase real public AI feedback. The actions are editorial checklists for trying the advice; they are not verified retake results.',
    problem: 'Visible issue', advice: 'AI advice', action: 'Adjustment to try', full: 'Read the full critique',
  },
  zh: {
    label: '精选公开点评', title: '从具体问题，到可以尝试的调整',
    note: '以下摘要整理自真实公开 AI 点评。执行动作是用于尝试建议的编辑清单，不代表已验证的复拍结果。',
    problem: '画面中的问题', advice: 'AI 建议', action: '可以尝试的调整', full: '阅读完整点评',
  },
  ja: {
    label: '公開講評からの厳選例', title: '具体的な課題から、試せる調整へ',
    note: '実際の公開 AI 講評を要約しています。行動案は改善案を試すための編集チェックリストであり、撮り直しの成果を検証したものではありません。',
    problem: '写真上の課題', advice: 'AI の提案', action: '試せる調整', full: '講評全文を読む',
  },
} as const;

export default function GalleryFeaturedCritiquesContent({ examples }: {
  examples: Array<(typeof FEATURED_CRITIQUES)[number] & { image: string }>;
}) {
  const { locale } = useI18n();
  const ui = COPY[locale];
  return (
    <section id="featured-critiques" className="scroll-mt-24 border-b border-border-subtle px-6 py-8 sm:py-10" aria-labelledby="featured-critiques-title">
      <div className="mx-auto max-w-editorial">
        <p className="ui-eyebrow">{ui.label}</p>
        <h2 id="featured-critiques-title" className="mt-3 max-w-3xl font-display text-3xl text-ink">{ui.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">{ui.note}</p>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {examples.map((example) => {
            const copy = example.copy[locale];
            return (
              <article key={example.reviewId} className="ui-panel overflow-hidden">
                <div className="relative aspect-[4/3] bg-void/35">
                  <Image src={example.image} alt={copy.alt} fill sizes="(min-width: 768px) 33vw, calc(100vw - 48px)" className="object-contain" />
                </div>
                <div className="p-5">
                  <h3 className="font-display text-2xl text-ink">{copy.title}</h3>
                  <dl className="mt-4 space-y-4 text-sm leading-6">
                    <div><dt className="font-semibold text-ink">{ui.problem}</dt><dd className="mt-1 text-ink-muted">{copy.problem}</dd></div>
                    <div><dt className="font-semibold text-ink">{ui.advice}</dt><dd className="mt-1 text-ink-muted">{copy.advice}</dd></div>
                    <div className="border-t border-gold/25 pt-4"><dt className="font-semibold text-gold">{ui.action}</dt><dd className="mt-1 text-ink-muted">{copy.action}</dd></div>
                  </dl>
                  <Link href={`/reviews/${example.reviewId}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-gold hover:text-gold-light">{ui.full} →</Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
