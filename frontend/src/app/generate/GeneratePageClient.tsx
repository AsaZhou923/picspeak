'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ImageIcon } from 'lucide-react';
import { SignInButton } from '@clerk/nextjs';
import { createGeneration, getGenerationTemplates, getMyGenerations } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ApiException, GeneratedImageItem, GenerationQuality, GenerationSize } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { trackProductEvent } from '@/lib/product-analytics';
import { useCreditPackCheckout } from '@/lib/hooks/useCreditPackCheckout';
import { startProCheckout } from '@/lib/pro-checkout';
import {
  type GenerationCreditsTable,
  estimateGenerationCredits,
  formatGenerationOutputSpec,
  getTemplateByKey,
} from '@/features/generations/generation-config';
import {
  formatGenerationHistoryDate,
  generationCtaKey,
  interpolateGenerationCopy,
  QUALITY_COPY_KEYS,
  templateCopyKey,
  TEMPLATE_COPY_KEYS,
} from '@/features/generations/generation-page-copy';
import GenerateFormPanel from '@/features/generations/components/GenerateFormPanel';
import GenerationPricingGrid from '@/features/generations/components/GenerationPricingGrid';
import {
  getGenerationPromptExample,
  getLocalizedPromptExampleText,
  type GenerationPromptExample,
} from '@/content/generation/prompt-examples';
import GeneratePageHeader from '@/features/generations/components/GeneratePageHeader';

type AppliedPromptExample = {
  id: string;
  category: string;
  templateKey: string;
  promptText: string;
};

export default function GeneratePage() {
  const router = useRouter();
  const { token, ensureToken, userInfo, isLoading: authLoading } = useAuth();
  const { t, locale } = useI18n();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const skipNextTemplatePromptSyncRef = useRef(false);
  const initialUrlPromptAppliedRef = useRef(false);
  const [templateKey, setTemplateKey] = useState('photo_inspiration');
  const [prompt, setPrompt] = useState<string>(() => t(TEMPLATE_COPY_KEYS.photo_inspiration.prompt));
  const [quality, setQuality] = useState<GenerationQuality>('medium');
  const [size, setSize] = useState<GenerationSize>('1024x1536');
  const [style, setStyle] = useState('cinematic');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showNegative, setShowNegative] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<GeneratedImageItem[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [sourceMetadata, setSourceMetadata] = useState<Record<string, string>>({});
  const [appliedPromptExample, setAppliedPromptExample] = useState<AppliedPromptExample | null>(null);
  const [creditsTable, setCreditsTable] = useState<GenerationCreditsTable | null>(null);

  const authReady = hasHydrated && !authLoading;
  const plan = authReady ? userInfo?.plan ?? 'guest' : 'guest';
  const isGuest = plan === 'guest';
  const isFreeQualityBlocked = plan === 'free' && quality !== 'low';
  const selectedTemplate = useMemo(() => getTemplateByKey(templateKey), [templateKey]);
  const selectedTemplateCopy = templateCopyKey(selectedTemplate.key);
  const credits = estimateGenerationCredits(creditsTable, quality, size);
  const creditsReady = creditsTable?.[quality]?.[size] !== undefined;
  const outputSpec = formatGenerationOutputSpec(quality, size);
  const creditPackCheckout = useCreditPackCheckout({
    ensureToken,
    locale,
    t,
    disabled: plan === 'guest',
  });

  useEffect(() => {
    setHasHydrated(true);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const metadata: Record<string, string> = {};
      ['source', 'entrypoint', 'content_slug', 'gallery_review_id', 'image_type', 'prompt_example_id'].forEach((key) => {
        const value = params.get(key);
        if (value) metadata[key] = value;
      });
      const promptExample = getGenerationPromptExample(params.get('prompt_example_id') ?? '');
      if (promptExample && !initialUrlPromptAppliedRef.current) {
        initialUrlPromptAppliedRef.current = true;
        const nextTemplate = getTemplateByKey(promptExample.suggestedTemplateKey);
        const nextPrompt = getLocalizedPromptExampleText(promptExample.prompt, locale);
        skipNextTemplatePromptSyncRef.current = true;
        setTemplateKey(nextTemplate.key);
        setPrompt(nextPrompt);
        setStyle(promptExample.suggestedStyle);
        setSize(promptExample.suggestedSize);
        setAppliedPromptExample({
          id: promptExample.id,
          category: promptExample.category,
          templateKey: nextTemplate.key,
          promptText: nextPrompt,
        });
        metadata.prompt_example_id = promptExample.id;
        metadata.prompt_example_category = promptExample.category;
        metadata.template_key = nextTemplate.key;
        void trackProductEvent('generation_prompt_example_applied', {
          token: token ?? undefined,
          pagePath: '/generate',
          locale,
          metadata: {
            prompt_example_id: promptExample.id,
            prompt_example_category: promptExample.category,
            template_key: nextTemplate.key,
            trigger: 'url_prefill',
            source: metadata.source,
            entrypoint: metadata.entrypoint,
          },
        });
      }
      setSourceMetadata(metadata);
    }
  }, [locale, token]);

  useEffect(() => {
    if (skipNextTemplatePromptSyncRef.current) {
      skipNextTemplatePromptSyncRef.current = false;
      return;
    }
    setPrompt(t(selectedTemplateCopy.prompt));
  }, [locale, selectedTemplateCopy.prompt, t]);

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

  useEffect(() => {
    void trackProductEvent('generation_page_viewed', {
      token: token ?? undefined,
      pagePath: '/generate',
      locale,
    });
  }, [locale, token]);

  useEffect(() => {
    if (!token || plan === 'guest') return;
    let cancelled = false;
    getMyGenerations(token, { limit: 4 })
      .then((data) => {
        if (!cancelled) setHistory(data.items);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [plan, token]);

  const handleTemplateSelect = useCallback(
    (key: string) => {
      const nextTemplate = getTemplateByKey(key);
      setTemplateKey(nextTemplate.key);
      setPrompt(t(templateCopyKey(nextTemplate.key).prompt));
      setAppliedPromptExample(null);
      void trackProductEvent('generation_template_selected', {
        token: token ?? undefined,
        pagePath: '/generate',
        locale,
        metadata: { template_key: nextTemplate.key },
      });
    },
    [locale, t, token]
  );

  const handlePromptExampleApply = useCallback(
    (example: GenerationPromptExample) => {
      const nextTemplate = getTemplateByKey(example.suggestedTemplateKey);
      if (nextTemplate.key !== templateKey) {
        skipNextTemplatePromptSyncRef.current = true;
      }
      const nextPrompt = getLocalizedPromptExampleText(example.prompt, locale);
      setTemplateKey(nextTemplate.key);
      setPrompt(nextPrompt);
      setStyle(example.suggestedStyle);
      setSize(example.suggestedSize);
      setAppliedPromptExample({
        id: example.id,
        category: example.category,
        templateKey: nextTemplate.key,
        promptText: nextPrompt,
      });
      setError('');
      void trackProductEvent('generation_prompt_example_applied', {
        token: token ?? undefined,
        pagePath: '/generate',
        locale,
        metadata: {
          prompt_example_id: example.id,
          prompt_example_category: example.category,
          template_key: nextTemplate.key,
          style: example.suggestedStyle,
          size: example.suggestedSize,
          trigger: 'gallery_apply',
        },
      });
      window.requestAnimationFrame(() => {
        promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        promptRef.current?.focus();
      });
    },
    [locale, templateKey, token]
  );

  const handleGenerate = useCallback(async () => {
    if (isGuest || isFreeQualityBlocked || submitting || !creditsReady) return;
    if (quality === 'high' && !window.confirm(interpolateGenerationCopy(t('generation_high_confirm'), { credits }))) {
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const activeToken = await ensureToken();
      const result = await createGeneration(
        {
          generation_mode: 'general',
          intent: selectedTemplate.intent,
          prompt,
          template_key: selectedTemplate.key,
          prompt_example_id: appliedPromptExample?.id ?? null,
          prompt_example_category: appliedPromptExample?.category ?? null,
          image_type: 'default',
          quality,
          size,
          style,
          negative_prompt: negativePrompt.trim() || null,
          output_format: 'webp',
          async: true,
          idempotency_key: `${selectedTemplate.key}-${quality}-${size}-${Date.now()}`,
        },
        activeToken
      );
      void trackProductEvent('generation_requested', {
        token: activeToken,
        pagePath: '/generate',
        locale,
        metadata: {
          ...sourceMetadata,
          task_id: result.task_id,
          template_key: selectedTemplate.key,
          prompt_example_id: appliedPromptExample?.id,
          prompt_example_category: appliedPromptExample?.category,
          prompt_example_modified: appliedPromptExample ? prompt.trim() !== appliedPromptExample.promptText.trim() : false,
          quality,
          size,
          credits_reserved: result.credits_reserved,
        },
      });
      router.push(`/generation-tasks/${result.task_id}`);
    } catch (err) {
      if (err instanceof ApiException && err.code === 'IMAGE_GENERATION_CREDITS_EXHAUSTED') {
        void trackProductEvent('generation_credit_exhausted', {
          token: token ?? undefined,
          pagePath: '/generate',
          locale,
          metadata: {
            ...sourceMetadata,
            quality,
            size,
            credits,
            template_key: selectedTemplate.key,
            prompt_example_id: appliedPromptExample?.id,
            prompt_example_category: appliedPromptExample?.category,
          },
        });
      }
      setError(formatUserFacingError(t, err, t('generation_error_fallback')));
    } finally {
      setSubmitting(false);
    }
  }, [appliedPromptExample, credits, creditsReady, ensureToken, isFreeQualityBlocked, isGuest, locale, negativePrompt, prompt, quality, router, selectedTemplate, size, sourceMetadata, style, submitting, t, token]);

  const handleCreditPackCheckout = useCallback(
    async (currency: 'usd', entrypoint: 'sidebar' | 'credit_exhausted') => {
      await creditPackCheckout.startCreditPackCheckout({
        currency,
        entrypoint,
        pagePath: '/generate',
        metadata: {
          ...sourceMetadata,
          quality,
          size,
          credits,
          template_key: selectedTemplate.key,
          prompt_example_id: appliedPromptExample?.id,
          prompt_example_category: appliedPromptExample?.category,
        },
      });
    },
    [appliedPromptExample, creditPackCheckout, credits, quality, selectedTemplate.key, size, sourceMetadata]
  );

  const handleGenerationProUpgrade = useCallback(
    async (entrypoint: 'quality_gate' | 'credit_exhausted') => {
      if (plan === 'guest') return;
      void trackProductEvent('generation_upgrade_clicked', {
        token: token ?? undefined,
        pagePath: '/generate',
        locale,
        metadata: {
          ...sourceMetadata,
          entrypoint,
          quality,
          size,
          credits,
          template_key: selectedTemplate.key,
          prompt_example_id: appliedPromptExample?.id,
          prompt_example_category: appliedPromptExample?.category,
        },
      });
      try {
        await startProCheckout(ensureToken, locale);
      } catch (err) {
        setError(formatUserFacingError(t, err, t('usage_checkout_unavailable')));
      }
    },
    [appliedPromptExample, credits, ensureToken, locale, plan, quality, selectedTemplate.key, size, sourceMetadata, t, token]
  );

  const ctaLabel = t(generationCtaKey({ isGuest, isFreeQualityBlocked, submitting, plan }));

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <GeneratePageHeader t={t} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <GenerateFormPanel
            t={t}
            promptRef={promptRef}
            templateKey={templateKey}
            prompt={prompt}
            quality={quality}
            size={size}
            style={style}
            negativePrompt={negativePrompt}
            showNegative={showNegative}
            onTemplateSelect={handleTemplateSelect}
            onPromptChange={setPrompt}
            onPromptFocus={() =>
              trackProductEvent('generation_prompt_opened', {
                token: token ?? undefined,
                pagePath: '/generate',
                locale,
              })
            }
            onQualityChange={setQuality}
            onSizeChange={setSize}
            onStyleChange={setStyle}
            onNegativePromptChange={setNegativePrompt}
            onToggleNegative={() => setShowNegative((value) => !value)}
            onPromptExampleApply={handlePromptExampleApply}
          />

          <aside className="space-y-5">
            <section className="rounded-lg border border-border-subtle bg-raised/80 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-ink-subtle">{t('generation_credits_label')}</p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-3xl text-ink">{credits}</span>
                    <span className="text-sm font-medium text-ink-muted">{t('generation_credits_unit')}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-gold/30 bg-gold/10 p-3 text-gold">
                  <ImageIcon size={22} />
                </div>
              </div>
              <p className="text-sm leading-6 text-ink-muted">
                {t(selectedTemplateCopy.label)}{t('generation_summary_separator')}{t(QUALITY_COPY_KEYS[quality].label)}{t('generation_summary_separator')}{outputSpec}
              </p>
              <p className="mt-2 text-xs leading-5 text-ink-subtle">{t('generation_credits_hint')}</p>
              {isFreeQualityBlocked && (
                <p className="mt-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs leading-5 text-gold">
                  {t('generation_free_quality_hint')}
                </p>
              )}
              {error && (
                <div className="mt-3 rounded-lg border border-rust/20 bg-rust/5 px-3 py-2 text-sm text-rust">
                  <p className="flex gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </p>
                  {error.toLowerCase().includes('credit') && plan !== 'guest' && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCreditPackCheckout('usd', 'credit_exhausted')}
                        disabled={creditPackCheckout.busy}
                        className="rounded-full border border-rust/25 bg-void/40 px-3 py-1.5 text-xs text-rust transition-colors hover:bg-rust/10 disabled:opacity-60"
                      >
                        {t('usage_credit_pack_button')}
                      </button>
                      {plan === 'free' && (
                        <button
                          type="button"
                          onClick={() => void handleGenerationProUpgrade('credit_exhausted')}
                          className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs text-gold transition-colors hover:bg-gold/15"
                        >
                          {t('generation_credit_exhausted_pro_cta')}
                        </button>
                      )}
                      <span className="self-center text-xs text-ink-subtle">
                        {t('usage_credit_pack_payment_hint')}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!authReady ? (
                <button
                  type="button"
                  disabled
                  className="mt-5 w-full rounded-full bg-gold px-5 py-3 text-sm font-bold text-void opacity-70 transition-colors disabled:cursor-wait"
                >
                  {t('generation_auth_loading_cta')}
                </button>
              ) : isGuest ? (
                <SignInButton mode="modal" fallbackRedirectUrl="/generate">
                  <button
                    type="button"
                    className="mt-5 w-full rounded-full bg-gold px-5 py-3 text-sm font-bold text-void transition-colors hover:bg-gold-light"
                  >
                    {ctaLabel}
                  </button>
                </SignInButton>
              ) : (
                <button
                  type="button"
                  onClick={isFreeQualityBlocked ? () => void handleGenerationProUpgrade('quality_gate') : handleGenerate}
                  disabled={submitting || !creditsReady || prompt.trim().length < 3}
                  className="mt-5 w-full rounded-full bg-gold px-5 py-3 text-sm font-bold text-void transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ctaLabel}
                </button>
              )}
            </section>

            {plan !== 'guest' && (
              <section className="rounded-lg border border-border-subtle bg-surface/80 p-5">
                <h2 className="text-sm font-medium text-ink">
                  {t('usage_credit_pack_title')}
                </h2>
                <p className="mt-2 text-xs leading-5 text-ink-muted">
                  {t('usage_credit_pack_body')}
                </p>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreditPackCheckout('usd', 'sidebar')}
                    disabled={creditPackCheckout.busy}
                    className="rounded-full border border-gold/30 px-4 py-2 text-xs font-medium text-gold transition-colors hover:bg-gold/10 disabled:opacity-60"
                  >
                    {t('usage_credit_pack_button')}
                  </button>
                  <p className="text-xs leading-5 text-ink-subtle">
                    {t('usage_credit_pack_payment_hint')}
                  </p>
                </div>
                {creditPackCheckout.message && (
                  <p className="mt-3 rounded-lg border border-border-subtle bg-void/35 px-3 py-2 text-xs leading-5 text-ink-muted">
                    {creditPackCheckout.message}
                  </p>
                )}
              </section>
            )}

            <section className="rounded-lg border border-border-subtle bg-surface/80 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium text-ink">{t('generation_recent_title')}</h2>
                <Link href="/account/generations" className="text-xs text-ink-subtle hover:text-gold">
                  {t('generation_view_all')}
                </Link>
              </div>
              {history.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-ink-subtle">
                  {t('generation_recent_empty')}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {history.map((item) => (
                    <Link
                      key={item.generation_id}
                      href={`/generations/${item.generation_id}`}
                      className="group overflow-hidden rounded-lg border border-border-subtle bg-raised"
                    >
                      <div className="relative aspect-square bg-void">
                        <Image
                          src={item.image_url}
                          alt={item.prompt}
                          fill
                          sizes="(min-width: 1024px) 160px, 45vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-2">
                        <p className="truncate text-[11px] text-ink-muted">{formatGenerationHistoryDate(item.created_at, locale)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>

        <GenerationPricingGrid t={t} />
      </div>
    </div>
  );
}
