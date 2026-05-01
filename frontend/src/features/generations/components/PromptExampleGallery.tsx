'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, Sparkles, Wand2 } from 'lucide-react';
import {
  GENERATION_PROMPT_EXAMPLE_CATEGORIES,
  GENERATION_PROMPT_EXAMPLES,
  getLocalizedPromptExampleText,
  getLocalizedPromptExampleTitle,
  type GenerationPromptExample,
  type GenerationPromptExampleCategory,
} from '@/content/generation/prompt-examples';
import { useI18n, type TranslationKey } from '@/lib/i18n';

type CategoryFilter = 'all' | GenerationPromptExampleCategory;

const CATEGORY_FILTERS = ['all', ...GENERATION_PROMPT_EXAMPLE_CATEGORIES] as const satisfies readonly CategoryFilter[];

const CATEGORY_LABEL_KEYS = {
  all: 'generation_examples_category_all',
  photography: 'generation_examples_category_photography',
  poster: 'generation_examples_category_poster',
  product: 'generation_examples_category_product',
  ui: 'generation_examples_category_ui',
  experimental: 'generation_examples_category_experimental',
} as const satisfies Record<CategoryFilter, TranslationKey>;

type PromptExampleGalleryProps = {
  onApply: (example: GenerationPromptExample) => void;
};

function normalizeExcerpt(prompt: string) {
  return prompt.replace(/\s+/g, ' ').trim();
}

function formatByline(message: string, author: string) {
  return message.replace('{author}', author);
}

export function PromptExampleGallery({ onApply }: PromptExampleGalleryProps) {
  const { t, locale } = useI18n();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: GENERATION_PROMPT_EXAMPLES.length,
      photography: 0,
      poster: 0,
      product: 0,
      ui: 0,
      experimental: 0,
    };

    for (const example of GENERATION_PROMPT_EXAMPLES) {
      counts[example.category] += 1;
    }

    return counts;
  }, []);

  const examples = useMemo(() => {
    if (activeCategory === 'all') {
      return GENERATION_PROMPT_EXAMPLES;
    }
    return GENERATION_PROMPT_EXAMPLES.filter((example) => example.category === activeCategory);
  }, [activeCategory]);

  async function copyPrompt(example: GenerationPromptExample) {
    try {
      await navigator.clipboard.writeText(getLocalizedPromptExampleText(example.prompt, locale));
      setCopiedId(example.id);
      window.setTimeout(() => setCopiedId((current) => (current === example.id ? null : current)), 1600);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 border-l-2 border-gold/50 pl-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="mb-2 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-gold/70">
            <Sparkles size={14} />
            {t('generation_examples_label')}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <h2 className="font-display text-2xl text-ink">{t('generation_examples_title')}</h2>
            <Link
              href="/generate/prompts"
              className="text-xs font-medium text-gold/80 transition-colors hover:text-gold"
            >
              {locale === 'zh'
                ? 'GPT Image 2 提示词案例'
                : locale === 'ja'
                  ? 'GPT Image 2 プロンプト例'
                  : 'GPT Image 2 prompt examples'}
            </Link>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{t('generation_examples_body')}</p>
        </div>
        <div
          role="tablist"
          aria-label={t('generation_examples_label')}
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:justify-end lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {CATEGORY_FILTERS.map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={activeCategory === category}
              onClick={() => setActiveCategory(category)}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${
                activeCategory === category
                  ? 'border-gold/45 bg-gold/10 text-gold'
                  : 'border-border-subtle bg-surface/70 text-ink-muted hover:border-gold/30 hover:text-ink'
              }`}
            >
              <span>{t(CATEGORY_LABEL_KEYS[category])}</span>
              <span className="font-mono text-[10px] text-ink-subtle">{categoryCounts[category]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="lg:max-h-[760px] lg:overflow-y-auto lg:pr-1">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {examples.map((example) => {
            const copied = copiedId === example.id;
            const title = getLocalizedPromptExampleTitle(example, locale);
            const prompt = getLocalizedPromptExampleText(example.prompt, locale);
            return (
              <article
                key={example.id}
                className="group grid overflow-hidden rounded-lg border border-border-subtle bg-surface/90 transition-colors hover:border-gold/35"
              >
                <div className="relative aspect-[4/3] bg-void/75 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={example.imagePath}
                    alt={title}
                    className="h-full w-full rounded-md object-contain transition-transform duration-500 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                  <div className="absolute left-3 top-3 rounded-md border border-void/30 bg-void/80 px-2.5 py-1 text-[11px] font-medium text-ink shadow-sm backdrop-blur">
                    {t(CATEGORY_LABEL_KEYS[example.category])}
                  </div>
                </div>
                <div className="grid min-h-[188px] grid-rows-[auto_1fr_auto] gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5 text-ink">
                        {title}
                      </h3>
                      <a
                        href={example.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('generation_examples_source')}
                        aria-label={t('generation_examples_source')}
                        className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle text-ink-subtle transition-colors hover:border-gold/30 hover:text-gold"
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-ink-subtle">
                      {formatByline(t('generation_examples_by'), example.author)}
                    </p>
                  </div>
                  <p className="line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-ink-muted">
                    {normalizeExcerpt(prompt)}
                  </p>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      onClick={() => onApply(example)}
                      className="inline-flex h-9 min-w-0 items-center justify-center gap-2 rounded-lg bg-gold px-3 text-xs font-bold text-void transition-colors hover:bg-gold-light"
                    >
                      <Wand2 size={13} />
                      <span className="truncate">{t('generation_examples_apply')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyPrompt(example)}
                      title={copied ? t('generation_examples_copied') : t('generation_examples_copy')}
                      aria-label={copied ? t('generation_examples_copied') : t('generation_examples_copy')}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:border-gold/30 hover:text-gold"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
