'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  getLocalizedPromptExampleCategoryLabel,
  getLocalizedPromptExampleText,
  getLocalizedPromptExampleTitle,
  type GenerationPromptExample,
} from '@/content/generation/prompt-examples';
import { useI18n } from '@/lib/i18n';

const PROMPT_EXAMPLE_PAGE_COPY = {
  zh: {
    back: '返回提示词库',
    body:
      '这是 PicSpeak AI 创作库中的可索引 GPT Image 2 提示词案例，包含来源署名、推荐模板、风格、比例和完整提示词文本。',
    primaryCta: '打开 AI 创作',
    sourceCta: '原始来源',
    template: '模板',
    style: '风格',
    ratio: '比例',
    fullPrompt: '完整提示词',
  },
  en: {
    back: 'Back to prompt library',
    body:
      'A crawlable GPT Image 2 prompt example from the PicSpeak AI Create library, including the source credit, suggested template, style, ratio, and full prompt text.',
    primaryCta: 'Open AI Create',
    sourceCta: 'Original source',
    template: 'Template',
    style: 'Style',
    ratio: 'Ratio',
    fullPrompt: 'Full prompt',
  },
  ja: {
    back: 'プロンプトライブラリへ戻る',
    body:
      'PicSpeak AI 作成ライブラリの検索可能な GPT Image 2 プロンプト例です。出典、推奨テンプレート、スタイル、比率、全文プロンプトを確認できます。',
    primaryCta: 'AI 作成を開く',
    sourceCta: '元の出典',
    template: 'テンプレート',
    style: 'スタイル',
    ratio: '比率',
    fullPrompt: '完全なプロンプト',
  },
};

export default function PromptExampleContent({ example }: { example: GenerationPromptExample }) {
  const { locale } = useI18n();
  const copy = PROMPT_EXAMPLE_PAGE_COPY[locale];
  const title = getLocalizedPromptExampleTitle(example, locale);
  const prompt = getLocalizedPromptExampleText(example.prompt, locale);
  const categoryLabel = getLocalizedPromptExampleCategoryLabel(example.category, locale);
  const generateHref = `/generate?source=prompt_library&entrypoint=prompt_example_detail&prompt_example_id=${encodeURIComponent(example.id)}`;

  return (
    <main className="min-h-screen px-6 pb-20 pt-24">
      <article className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="min-w-0">
          <Link href="/generate/prompts" className="text-sm text-gold transition-colors hover:text-gold-light">
            {copy.back}
          </Link>
          <p className="mt-6 text-xs uppercase tracking-[0.28em] text-gold/75">{categoryLabel}</p>
          <h1 className="mt-4 font-display text-5xl leading-tight text-ink sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-ink-muted">{copy.body}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={generateHref}
              className="rounded bg-gold px-5 py-2.5 text-sm font-bold text-void transition-colors hover:bg-gold-light"
            >
              {copy.primaryCta}
            </Link>
            <a
              href={example.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-border-subtle px-5 py-2.5 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
            >
              {copy.sourceCta}
            </a>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border-subtle bg-raised/45 p-3">
          <div className="relative aspect-[4/3] rounded-md bg-void/75">
            <Image
              src={example.imagePath}
              alt={title}
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="rounded-md object-contain"
            />
          </div>
        </div>
      </article>

      <section className="mx-auto mt-10 grid max-w-7xl gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border-subtle bg-raised/35 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-ink-subtle">{copy.template}</p>
          <p className="mt-3 font-display text-2xl text-ink">{example.suggestedTemplateKey.replace(/_/g, ' ')}</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-raised/35 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-ink-subtle">{copy.style}</p>
          <p className="mt-3 font-display text-2xl text-ink">{example.suggestedStyle}</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-raised/35 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-ink-subtle">{copy.ratio}</p>
          <p className="mt-3 font-display text-2xl text-ink">{example.suggestedSize}</p>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl rounded-lg border border-border-subtle bg-void/40 p-5 sm:p-6">
        <h2 className="font-display text-3xl text-ink">{copy.fullPrompt}</h2>
        <p className="mt-4 whitespace-pre-wrap break-words rounded-lg border border-border-subtle bg-surface/70 p-4 text-sm leading-7 text-ink-muted">
          {prompt}
        </p>
      </section>
    </main>
  );
}
