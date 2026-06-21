'use client';

import type { RefObject } from 'react';
import { Copy, Sparkles, Wand2 } from 'lucide-react';
import type { Translator } from '@/lib/i18n';
import type { GenerationQuality, GenerationSize } from '@/lib/types';
import {
  GENERATION_SIZE_OPTIONS,
  GENERATION_TEMPLATES,
} from '@/features/generations/generation-config';
import {
  QUALITY_COPY_KEYS,
  SIZE_DETAIL_KEYS,
  STYLE_OPTIONS,
  templateCopyKey,
} from '@/features/generations/generation-page-copy';
import { PromptExampleGallery } from '@/features/generations/components/PromptExampleGallery';
import type { GenerationPromptExample } from '@/content/generation/prompt-examples';

type GenerateFormPanelProps = {
  t: Translator;
  promptRef: RefObject<HTMLTextAreaElement>;
  templateKey: string;
  prompt: string;
  quality: GenerationQuality;
  size: GenerationSize;
  style: string;
  negativePrompt: string;
  showNegative: boolean;
  onTemplateSelect: (key: string) => void;
  onPromptChange: (value: string) => void;
  onPromptFocus: () => void;
  onQualityChange: (value: GenerationQuality) => void;
  onSizeChange: (value: GenerationSize) => void;
  onStyleChange: (value: string) => void;
  onNegativePromptChange: (value: string) => void;
  onToggleNegative: () => void;
  onPromptExampleApply: (example: GenerationPromptExample) => void;
};

export default function GenerateFormPanel({
  t,
  promptRef,
  templateKey,
  prompt,
  quality,
  size,
  style,
  negativePrompt,
  showNegative,
  onTemplateSelect,
  onPromptChange,
  onPromptFocus,
  onQualityChange,
  onSizeChange,
  onStyleChange,
  onNegativePromptChange,
  onToggleNegative,
  onPromptExampleApply,
}: GenerateFormPanelProps) {
  return (
    <main className="min-w-0 space-y-5">
      <section className="rounded-lg border border-border-subtle bg-surface/80 p-3 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm text-ink sm:mb-4">
          <Sparkles size={16} className="text-gold" />
          <span>{t('generation_templates_title')}</span>
        </div>
        <div className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3">
          {GENERATION_TEMPLATES.map((template) => {
            const copyKeys = templateCopyKey(template.key);
            return (
              <button
                key={template.key}
                type="button"
                aria-pressed={templateKey === template.key}
                onClick={() => onTemplateSelect(template.key)}
                className={`min-w-[176px] max-w-[176px] snap-start rounded-lg border p-3 text-left transition-all sm:min-h-[128px] sm:min-w-0 sm:max-w-none sm:p-4 ${
                  templateKey === template.key
                    ? 'border-gold/50 bg-gold/10 text-ink'
                    : 'border-border-subtle bg-raised/70 text-ink-muted hover:border-gold/30 hover:text-ink'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2 sm:mb-2">
                  <span className="text-sm font-medium text-ink">{t(copyKeys.label)}</span>
                  <Wand2
                    size={15}
                    className={templateKey === template.key ? 'shrink-0 text-gold' : 'shrink-0 text-transparent'}
                  />
                </div>
                <p className="line-clamp-2 text-xs leading-5 text-ink-muted sm:line-clamp-none">
                  {t(copyKeys.description)}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface/80 p-4 sm:p-5">
        <label className="block">
          <span className="mb-3 block text-sm text-ink">{t('generation_prompt_label')}</span>
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onFocus={onPromptFocus}
            rows={6}
            className="w-full resize-none rounded-lg border border-border bg-void/70 px-4 py-3 text-sm leading-7 text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-gold/40"
            placeholder={t('generation_prompt_placeholder')}
          />
        </label>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="space-y-2 text-xs text-ink-muted">
            <span>{t('generation_quality_label')}</span>
            <select
              value={quality}
              onChange={(event) => onQualityChange(event.target.value as GenerationQuality)}
              className="w-full rounded-lg border border-border bg-void/70 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/40"
            >
              {(Object.keys(QUALITY_COPY_KEYS) as GenerationQuality[]).map((value) => (
                <option key={value} value={value}>
                  {t(QUALITY_COPY_KEYS[value].label)} - {t(QUALITY_COPY_KEYS[value].detail)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-xs text-ink-muted">
            <span>{t('generation_size_label')}</span>
            <select
              value={size}
              onChange={(event) => onSizeChange(event.target.value as GenerationSize)}
              className="w-full rounded-lg border border-border bg-void/70 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/40"
            >
              {GENERATION_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {t(SIZE_DETAIL_KEYS[option.value])}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-xs text-ink-muted">
            <span>{t('generation_style_label')}</span>
            <select
              value={style}
              onChange={(event) => onStyleChange(event.target.value)}
              className="w-full rounded-lg border border-border bg-void/70 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/40"
            >
              {STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={onToggleNegative}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
          >
            <Copy size={12} />
            {t('generation_negative_toggle')}
          </button>
          {showNegative && (
            <textarea
              value={negativePrompt}
              onChange={(event) => onNegativePromptChange(event.target.value)}
              rows={3}
              className="mt-3 w-full resize-none rounded-lg border border-border bg-void/70 px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-gold/40"
              placeholder="no text, no watermark, no distorted face"
            />
          )}
        </div>

        <div className="mt-5 border-t border-border-subtle pt-5">
          <PromptExampleGallery onApply={onPromptExampleApply} />
        </div>
      </section>
    </main>
  );
}
