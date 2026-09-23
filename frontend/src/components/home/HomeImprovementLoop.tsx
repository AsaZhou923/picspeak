'use client';

import { Aperture, BarChart2, CheckCircle2, Repeat2, UploadCloud } from 'lucide-react';
import Link from 'next/link';
import type { Locale, Translator } from '@/lib/i18n';
import { buildWorkspaceConversionHref } from '@/lib/content-conversion';
import { markProductAttributionSource, trackProductEvent } from '@/lib/product-analytics';

const PRACTICE_COPY = {
  zh: {
    label: '看完点评之后 · 可选的下一步', title: '想把建议用到下一张？',
    steps: [
      ['从自己的照片开始', '上传一张你有权使用的照片，先读懂画面里的具体问题。'],
      ['保存一个目标', '确认一个可执行动作和成功条件，下次回来仍能找到。'],
      ['带着目标再拍', '用新的拍摄尝试这个动作；编辑版本和同图重评分开记录。'],
      ['对照可见证据', '查看达成、部分达成、未达成或不可判断，以及这次改变的代价。'],
      ['复盘，再继续', '留下自己的反馈，从练习日志继续同一目标或开始下一目标。'],
    ],
    start: '从一张照片开始', resume: '继续已保存的目标',
    note: '记录的是每次尝试与 AI 比较意见，不是经过验证的摄影能力增长。',
  },
  en: {
    label: 'After your critique · An optional next step', title: 'Ready to try the advice in another photo?',
    steps: [
      ['Start with your photo', 'Upload a photo you have permission to use and inspect a specific issue.'],
      ['Save one goal', 'Keep an actionable change and a success criterion you can return to.'],
      ['Try a new capture', 'Put that action into a new photo. Edits and same-image rechecks stay separate.'],
      ['Compare visible evidence', 'See achieved, partial, not achieved or indeterminate, including trade-offs.'],
      ['Reflect and continue', 'Leave feedback, then return to the same goal or begin the next one.'],
    ],
    start: 'Start with a photo', resume: 'Continue a saved goal',
    note: 'These are practice records and AI opinions, not verified measurements of skill growth.',
  },
  ja: {
    label: '講評のあとに · 次の一歩は任意', title: '次の1枚で、改善案を試しませんか。',
    steps: [
      ['自分の写真から始める', '使用権のある写真をアップロードし、具体的な課題を確認します。'],
      ['目標を1つ保存する', '実行できる行動と成功条件を保存し、後から同じ目標に戻れます。'],
      ['目標を意識して撮り直す', '新しい撮影で試します。編集版や同一画像の再評価は別に記録します。'],
      ['見える根拠を比較する', '達成・一部達成・未達成・判定不能と、変更によるトレードオフを確認します。'],
      ['振り返り、続ける', '感想を残し、練習ログから同じ目標を続けるか次の目標に進みます。'],
    ],
    start: '写真から始める', resume: '保存した目標を続ける',
    note: '練習記録と AI の比較意見であり、写真技術の向上を実証した測定ではありません。',
  },
} as const;

type HomeImprovementLoopProps = {
  t: Translator;
  retakeTitle: string;
  retakeBody: string;
  locale: Locale;
  practiceEnabled: boolean;
};

export default function HomeImprovementLoop({
  t,
  retakeTitle,
  retakeBody,
  locale,
  practiceEnabled,
}: HomeImprovementLoopProps) {
  const copy = PRACTICE_COPY[locale];
  const defaultSteps = [
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
  const steps = practiceEnabled
    ? copy.steps.map(([title, body], index) => ({ icon: defaultSteps[index].icon, title, body }))
    : defaultSteps;
  const headline = practiceEnabled ? copy.title : t('features_headline');

  return (
    <section className="border-t border-border-subtle px-5 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-editorial">
        <p className="ui-eyebrow">{practiceEnabled ? copy.label : t('features_label')}</p>
        <h2 className="mt-4 max-w-2xl font-display text-4xl leading-tight text-ink sm:text-5xl">
          {headline}
        </h2>

        <ol
          className="mt-12 grid border-l border-border md:grid-cols-5 md:border-l-0 md:border-t"
          aria-label={headline}
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
        {practiceEnabled && (
          <div className="mt-10 border-t border-border-subtle pt-6">
            <div className="flex flex-wrap gap-3">
              <Link
                href={buildWorkspaceConversionHref({ source: 'home_direct', entrypoint: 'home_new_user' })}
                onClick={() => {
                  markProductAttributionSource('home_direct');
                  void trackProductEvent('content_workspace_clicked', {
                    pagePath: `/${locale}`, locale,
                    metadata: { entrypoint: 'home_new_user', home_intent: 'new_user' },
                  });
                }}
                className="ui-action-primary px-5 py-3 text-sm"
              >{copy.start}</Link>
              <Link href="/account/reviews?view=practice" className="ui-action-secondary px-5 py-3 text-sm">{copy.resume}</Link>
            </div>
            <p className="mt-4 max-w-2xl text-xs leading-6 text-ink-subtle">{copy.note}</p>
          </div>
        )}
      </div>
    </section>
  );
}
