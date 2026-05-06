'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  GENERATION_PROMPT_EXAMPLE_CATEGORIES,
  GENERATION_PROMPT_EXAMPLES,
  getLocalizedPromptExampleCategoryLabel,
  getLocalizedPromptExampleText,
  getLocalizedPromptExampleTitle,
  normalizePromptExampleExcerpt,
} from '@/content/generation/prompt-examples';
import { useI18n } from '@/lib/i18n';

const PROMPT_LIBRARY_COPY = {
  zh: {
    eyebrow: 'PicSpeak AI 创作',
    title: 'GPT Image 2 视觉参考提示词案例',
    body:
      '一个可索引的提示词模式库，收录 PicSpeak AI 创作里的摄影参考、海报、产品场景、UI 概念和实验视觉案例。你可以先研究结构，再把合适的模式带回自己的生成流程。',
    primaryCta: '打开 AI 创作',
    secondaryCta: '浏览点评长廊',
    countSuffix: '个案例',
    sourcePrefix: '来源',
  },
  en: {
    eyebrow: 'PicSpeak AI Create',
    title: 'GPT Image 2 prompt examples for visual references',
    body:
      'A crawlable library of prompt patterns used inside PicSpeak AI Create. Explore photography references, posters, product scenes, UI concepts, and experimental prompts, then bring a pattern back into your own generation workflow.',
    primaryCta: 'Open AI Create',
    secondaryCta: 'Browse critique gallery',
    countSuffix: 'examples',
    sourcePrefix: 'Source',
  },
  ja: {
    eyebrow: 'PicSpeak AI 作成',
    title: 'GPT Image 2 のビジュアル参考プロンプト例',
    body:
      'PicSpeak AI 作成で使えるプロンプトパターンを検索可能なライブラリとして整理しました。写真参考、ポスター、商品シーン、UI コンセプト、実験的な表現を見比べ、自分の生成フローに戻せます。',
    primaryCta: 'AI 作成を開く',
    secondaryCta: '講評ギャラリーを見る',
    countSuffix: '件',
    sourcePrefix: '出典',
  },
};

export default function PromptLibraryContent() {
  const { locale } = useI18n();
  const copy = PROMPT_LIBRARY_COPY[locale];
  const counts = Object.fromEntries(
    GENERATION_PROMPT_EXAMPLE_CATEGORIES.map((category) => [
      category,
      GENERATION_PROMPT_EXAMPLES.filter((example) => example.category === category).length,
    ])
  ) as Record<(typeof GENERATION_PROMPT_EXAMPLE_CATEGORIES)[number], number>;

  return (
    <main className="min-h-screen px-6 pb-20 pt-24">
      <section className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-gold/75">{copy.eyebrow}</p>
          <h1 className="mt-4 max-w-3xl font-display text-5xl leading-tight text-ink sm:text-6xl">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-ink-muted">{copy.body}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/generate?source=prompt_library&entrypoint=prompt_library_home"
              className="rounded bg-gold px-5 py-2.5 text-sm font-bold text-void transition-colors hover:bg-gold-light"
            >
              {copy.primaryCta}
            </Link>
            <Link
              href="/gallery"
              className="rounded border border-border-subtle px-5 py-2.5 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
            >
              {copy.secondaryCta}
            </Link>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {GENERATION_PROMPT_EXAMPLE_CATEGORIES.map((category) => (
            <div key={category} className="rounded-lg border border-border-subtle bg-raised/45 p-4">
              <p className="font-display text-2xl text-ink">
                {getLocalizedPromptExampleCategoryLabel(category, locale)}
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                {counts[category]} {copy.countSuffix}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-12 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GENERATION_PROMPT_EXAMPLES.map((example) => {
          const title = getLocalizedPromptExampleTitle(example, locale);
          const prompt = getLocalizedPromptExampleText(example.prompt, locale);
          return (
            <article
              key={example.id}
              className="group overflow-hidden rounded-lg border border-border-subtle bg-raised/45 transition-colors hover:border-gold/35"
            >
              <Link href={`/generate/prompts/${example.id}`} className="block">
                <div className="relative aspect-[4/3] bg-void/75 p-2">
                  <Image
                    src={example.imagePath}
                    alt={title}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="rounded-md object-contain transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                </div>
                <div className="p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-gold/75">
                    {getLocalizedPromptExampleCategoryLabel(example.category, locale)}
                  </p>
                  <h2 className="mt-2 line-clamp-2 font-display text-2xl text-ink">{title}</h2>
                  <p className="mt-2 text-xs text-ink-subtle">
                    {copy.sourcePrefix}: {example.author}
                  </p>
                  <p className="mt-4 line-clamp-3 text-sm leading-6 text-ink-muted">
                    {normalizePromptExampleExcerpt(prompt)}
                  </p>
                </div>
              </Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
