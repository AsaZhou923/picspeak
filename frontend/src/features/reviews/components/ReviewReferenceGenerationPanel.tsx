'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ImagePlus, Loader2, Sparkles } from 'lucide-react';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import { createGeneration, getGenerationTemplates } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatUserFacingError } from '@/lib/error-utils';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { trackProductEvent } from '@/lib/product-analytics';
import type { GenerationQuality, GenerationSize, ImageType } from '@/lib/types';
import {
  type GenerationCreditsTable,
  estimateGenerationCredits,
  formatGenerationOutputSpec,
} from '@/features/generations/generation-config';

type ReferenceIntent = 'retake_reference' | 'composition_sketch' | 'lighting_reference' | 'color_mood_reference';

type ReviewReferenceGenerationPanelProps = {
  reviewId: string;
  photoId: string;
  imageType: ImageType;
  suggestions: string;
  plan: 'guest' | 'free' | 'pro' | string;
  locale: 'zh' | 'en' | 'ja';
  sourceAspect?: { w: number; h: number } | null;
};

const INTENTS: Array<{ value: ReferenceIntent; labelKey: TranslationKey; descriptionKey: TranslationKey }> = [
  {
    value: 'retake_reference',
    labelKey: 'review_reference_intent_retake_title',
    descriptionKey: 'review_reference_intent_retake_body',
  },
  {
    value: 'composition_sketch',
    labelKey: 'review_reference_intent_composition_title',
    descriptionKey: 'review_reference_intent_composition_body',
  },
  {
    value: 'lighting_reference',
    labelKey: 'review_reference_intent_lighting_title',
    descriptionKey: 'review_reference_intent_lighting_body',
  },
  {
    value: 'color_mood_reference',
    labelKey: 'review_reference_intent_color_title',
    descriptionKey: 'review_reference_intent_color_body',
  },
];

export function ReviewReferenceGenerationPanel({
  reviewId,
  photoId,
  imageType,
  suggestions,
  plan,
  locale,
  sourceAspect,
}: ReviewReferenceGenerationPanelProps) {
  const router = useRouter();
  const { ensureToken } = useAuth();
  const { t } = useI18n();
  const [intent, setIntent] = useState<ReferenceIntent>('retake_reference');
  const [customPrompt, setCustomPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creditsTable, setCreditsTable] = useState<GenerationCreditsTable | null>(null);

  const quality: GenerationQuality = plan === 'pro' ? 'medium' : 'low';
  const size = useMemo<GenerationSize>(() => {
    if (!sourceAspect?.w || !sourceAspect?.h) return '1024x1024';
    const ratio = sourceAspect.w / sourceAspect.h;
    if (ratio > 1.15) return '1536x1024';
    if (ratio < 0.87) return '1024x1536';
    return '1024x1024';
  }, [sourceAspect]);
  const credits = estimateGenerationCredits(creditsTable, quality, size, 1);
  const creditsReady = creditsTable?.[quality]?.[size] !== undefined;
  const activeIntent = INTENTS.find((item) => item.value === intent) ?? INTENTS[0];
  const defaultPrompt = useMemo(
    () => buildReviewLinkedUserPrompt(suggestions, t(activeIntent.labelKey), t('review_reference_prompt_seed')),
    [activeIntent.labelKey, suggestions, t]
  );
  const promptToSubmit = customPrompt.trim();
  const promptCustomized = promptToSubmit !== defaultPrompt.trim();

  useEffect(() => {
    setCustomPrompt(defaultPrompt);
  }, [defaultPrompt]);

  useEffect(() => {
    let cancelled = false;
    getGenerationTemplates()
      .then((data) => {
        if (!cancelled) setCreditsTable(data.credits_table);
      })
      .catch(() => {
        if (!cancelled) setCreditsTable(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGenerate() {
    if (plan === 'guest' || !creditsReady) return;
    if (promptToSubmit.length < 3) {
      setError(t('review_reference_prompt_too_short'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const token = await ensureToken();
      const result = await createGeneration(
        {
          generation_mode: 'review_linked',
          intent,
          prompt: promptToSubmit,
          template_key: 'photo_inspiration',
          source_photo_id: photoId,
          source_review_id: reviewId,
          image_type: imageType,
          quality,
          size,
          style: intent === 'composition_sketch' ? 'editorial' : 'realistic',
          negative_prompt: 'no text, no watermark, no fake before/after label',
          output_format: 'webp',
          async: true,
          idempotency_key: `${reviewId}-${intent}-${Date.now()}`,
        },
        token
      );
      void trackProductEvent('generation_intent_selected', {
        token,
        pagePath: `/reviews/${reviewId}`,
        locale,
        metadata: {
          source_review_id: reviewId,
          intent,
          quality,
          size,
          credits_reserved: result.credits_reserved,
          prompt_customized: promptCustomized,
        },
      });
      router.push(`/generation-tasks/${result.task_id}`);
    } catch (err) {
      setError(formatUserFacingError(t, err, t('generation_error_fallback')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gold/20 bg-gold/[0.04] p-4 shadow-soft sm:p-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-gold/30 bg-gold/10 p-2.5 text-gold">
              <ImagePlus size={18} />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-gold/70">{t('review_reference_label')}</p>
              <h2 className="mt-1 font-display text-xl text-ink sm:text-2xl">{t('review_reference_title')}</h2>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                {t('review_reference_body')}
              </p>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium text-ink">{t('review_reference_prompt_label')}</span>
            <textarea
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              rows={5}
              maxLength={1200}
              className="w-full resize-none rounded-lg border border-border bg-void/60 px-3 py-3 text-sm leading-6 text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-gold/40"
              placeholder={t('review_reference_prompt_placeholder')}
            />
            <span className="mt-1.5 block text-xs leading-5 text-ink-subtle">{t('review_reference_prompt_hint')}</span>
          </label>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {INTENTS.map((item) => {
              const selected = item.value === intent;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setIntent(item.value);
                    setCustomPrompt(buildReviewLinkedUserPrompt(suggestions, t(item.labelKey), t('review_reference_prompt_seed')));
                    void trackProductEvent('generation_intent_selected', {
                      pagePath: `/reviews/${reviewId}`,
                      locale,
                      metadata: { source_review_id: reviewId, intent: item.value },
                    });
                  }}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selected
                      ? 'border-gold/50 bg-gold/10 text-ink'
                      : 'border-border bg-raised/50 text-ink-muted hover:border-gold/25 hover:text-ink'
                  }`}
                >
                  <span className="block text-sm font-medium">{t(item.labelKey)}</span>
                  <span className="mt-1 block text-xs leading-5 text-ink-subtle">{t(item.descriptionKey)}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
            <span className="rounded-full border border-border bg-raised px-3 py-1">
              {formatMessage(t('review_reference_quality'), { quality })}
            </span>
            <span className="rounded-full border border-border bg-raised px-3 py-1">
              {formatMessage(t('review_reference_size'), { size: formatGenerationOutputSpec(quality, size) })}
            </span>
            <span className="rounded-full border border-border bg-raised px-3 py-1">
              {formatMessage(t('review_reference_credits'), { credits })}
            </span>
            <span className="rounded-full border border-sage/25 bg-sage/5 px-3 py-1 text-sage">
              {t('review_reference_ai_badge')}
            </span>
          </div>

          {error && <p className="rounded-lg border border-rust/20 bg-rust/5 px-3 py-2 text-sm text-rust">{error}</p>}

          <div>
            {plan === 'guest' ? (
              <ClerkSignInTrigger
                fallbackRedirectUrl={`/reviews/${reviewId}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-bold text-void transition-colors hover:bg-gold-light sm:w-auto xl:w-full"
              >
                {t('review_reference_login_cta')} <ArrowRight size={14} />
              </ClerkSignInTrigger>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={busy || !creditsReady || promptToSubmit.length < 3}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-bold text-void transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto xl:w-full"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {busy ? t('review_reference_busy_cta') : t('review_reference_submit_cta')}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function buildReviewLinkedUserPrompt(suggestions: string, intentLabel: string, promptTemplate: string): string {
  const trimmed = suggestions.trim().replace(/\s+/g, ' ');
  const direction = trimmed.length > 900 ? `${trimmed.slice(0, 900)}…` : trimmed;
  return formatMessage(promptTemplate, { intent: intentLabel, suggestions: direction });
}

function formatMessage(message: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    message
  );
}
