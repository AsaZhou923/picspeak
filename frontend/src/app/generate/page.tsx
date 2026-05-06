'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowUpRight, Copy, ImageIcon, Sparkles, Wand2 } from 'lucide-react';
import { SignInButton } from '@clerk/nextjs';
import { createGeneration, createImageCreditPackCheckout, getGenerationTemplates, getMyGenerations } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ApiException, GeneratedImageItem, GenerationQuality, GenerationSize } from '@/lib/types';
import { useI18n, type Locale, type TranslationKey } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import {
  closeExternalCheckoutWindow,
  navigateExternalCheckoutWindow,
  openExternalCheckoutWindow,
} from '@/lib/external-checkout-window';
import { rememberCheckoutReturnPath } from '@/lib/checkout-return';
import { trackProductEvent } from '@/lib/product-analytics';
import { startProCheckout } from '@/lib/pro-checkout';
import {
  GENERATION_SIZE_OPTIONS,
  GENERATION_TEMPLATES,
  type GenerationCreditsTable,
  estimateGenerationCredits,
  formatGenerationOutputSpec,
  getTemplateByKey,
} from '@/features/generations/generation-config';
import { PromptExampleGallery } from '@/features/generations/components/PromptExampleGallery';
import {
  getGenerationPromptExample,
  getLocalizedPromptExampleText,
  type GenerationPromptExample,
} from '@/content/generation/prompt-examples';

const STYLE_OPTIONS = [
  { value: 'none', labelKey: 'generation_style_none' },
  { value: 'realistic', labelKey: 'generation_style_realistic' },
  { value: 'editorial', labelKey: 'generation_style_editorial' },
  { value: 'cinematic', labelKey: 'generation_style_cinematic' },
  { value: 'minimal', labelKey: 'generation_style_minimal' },
  { value: 'illustration', labelKey: 'generation_style_illustration' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: TranslationKey }>;

const TEMPLATE_COPY_KEYS = {
  custom_creation: {
    label: 'generation_template_custom_label',
    description: 'generation_template_custom_description',
    prompt: 'generation_template_custom_prompt',
  },
  photo_inspiration: {
    label: 'generation_template_photo_label',
    description: 'generation_template_photo_description',
    prompt: 'generation_template_photo_prompt',
  },
  social_visual: {
    label: 'generation_template_social_label',
    description: 'generation_template_social_description',
    prompt: 'generation_template_social_prompt',
  },
  portrait_avatar: {
    label: 'generation_template_portrait_label',
    description: 'generation_template_portrait_description',
    prompt: 'generation_template_portrait_prompt',
  },
  product_scene: {
    label: 'generation_template_product_label',
    description: 'generation_template_product_description',
    prompt: 'generation_template_product_prompt',
  },
  interior_atmosphere: {
    label: 'generation_template_interior_label',
    description: 'generation_template_interior_description',
    prompt: 'generation_template_interior_prompt',
  },
  color_moodboard: {
    label: 'generation_template_moodboard_label',
    description: 'generation_template_moodboard_description',
    prompt: 'generation_template_moodboard_prompt',
  },
} as const satisfies Record<string, Record<'label' | 'description' | 'prompt', TranslationKey>>;

const QUALITY_COPY_KEYS = {
  low: { label: 'generation_quality_low', detail: 'generation_quality_low_detail' },
  medium: { label: 'generation_quality_medium', detail: 'generation_quality_medium_detail' },
  high: { label: 'generation_quality_high', detail: 'generation_quality_high_detail' },
} as const satisfies Record<GenerationQuality, Record<'label' | 'detail', TranslationKey>>;

const SIZE_DETAIL_KEYS = {
  '1024x1024': 'generation_size_square_detail',
  '1024x1536': 'generation_size_portrait_detail',
  '1536x1024': 'generation_size_landscape_detail',
} as const satisfies Record<GenerationSize, TranslationKey>;

function formatDate(value: string, locale: Locale) {
  return new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function interpolate(message: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    message
  );
}

function templateCopyKey(templateKey: string) {
  return TEMPLATE_COPY_KEYS[templateKey as keyof typeof TEMPLATE_COPY_KEYS] ?? TEMPLATE_COPY_KEYS.photo_inspiration;
}

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
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
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
  const [creditPackMessage, setCreditPackMessage] = useState('');
  const [creditPackBusy, setCreditPackBusy] = useState(false);
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
    if (quality === 'high' && !window.confirm(interpolate(t('generation_high_confirm'), { credits }))) {
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
      if (plan === 'guest' || creditPackBusy) return;
      rememberCheckoutReturnPath();
      const checkoutWindow = openExternalCheckoutWindow(t('usage_checkout_loading'));
      setCreditPackBusy(true);
      setCreditPackMessage('');
      try {
        const activeToken = await ensureToken();
        const response = await createImageCreditPackCheckout(activeToken, { currency, locale });
        if (response.checkout_url) {
          void trackProductEvent('credit_pack_checkout_started', {
            token: activeToken,
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
              pack: response.pack,
              pack_credits: response.credits,
              price: response.price,
            },
          });
          if (!navigateExternalCheckoutWindow(checkoutWindow, response.checkout_url)) {
            throw new Error('Checkout window was blocked');
          }
          return;
        }
        closeExternalCheckoutWindow(checkoutWindow);
        setCreditPackMessage(`${response.credits} credits / ${response.price} checkout is unavailable.`);
      } catch (err) {
        closeExternalCheckoutWindow(checkoutWindow);
        setCreditPackMessage(formatUserFacingError(t, err, t('usage_checkout_unavailable')));
      } finally {
        setCreditPackBusy(false);
      }
    },
    [appliedPromptExample, creditPackBusy, credits, ensureToken, locale, plan, quality, selectedTemplate.key, size, sourceMetadata, t]
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

  const ctaLabel = isGuest
    ? t('generation_login_cta')
    : isFreeQualityBlocked
      ? t('generation_upgrade_cta')
      : submitting
        ? t('generation_submitting_cta')
        : plan === 'free'
          ? t('generation_free_cta')
          : t('generation_submit_cta');
  const pricingItems = [
    {
      title: t('home_generation_pricing_low_title'),
      cost: t('home_generation_pricing_low_cost'),
      body: t('home_generation_pricing_low_body'),
    },
    {
      title: t('home_generation_pricing_medium_title'),
      cost: t('home_generation_pricing_medium_cost'),
      body: t('home_generation_pricing_medium_body'),
    },
    {
      title: t('home_generation_pricing_high_title'),
      cost: t('home_generation_pricing_high_cost'),
      body: t('home_generation_pricing_high_body'),
    },
  ];

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-gold/70">{t('generation_badge')}</p>
            <h1 className="font-display text-4xl text-ink sm:text-5xl">{t('generation_title')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted">{t('generation_intro')}</p>
          </div>
          <Link
            href="/account/generations"
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-gold"
          >
            {t('generation_history_link')}
            <ArrowUpRight size={14} />
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
                      onClick={() => handleTemplateSelect(template.key)}
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
                  onChange={(event) => setPrompt(event.target.value)}
                  onFocus={() =>
                    trackProductEvent('generation_prompt_opened', {
                      token: token ?? undefined,
                      pagePath: '/generate',
                      locale,
                    })
                  }
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
                    onChange={(event) => setQuality(event.target.value as GenerationQuality)}
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
                    onChange={(event) => setSize(event.target.value as GenerationSize)}
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
                    onChange={(event) => setStyle(event.target.value)}
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
                  onClick={() => setShowNegative((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
                >
                  <Copy size={12} />
                  {t('generation_negative_toggle')}
                </button>
                {showNegative && (
                  <textarea
                    value={negativePrompt}
                    onChange={(event) => setNegativePrompt(event.target.value)}
                    rows={3}
                    className="mt-3 w-full resize-none rounded-lg border border-border bg-void/70 px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-gold/40"
                    placeholder="no text, no watermark, no distorted face"
                  />
                )}
              </div>

              <div className="mt-5 border-t border-border-subtle pt-5">
                <PromptExampleGallery onApply={handlePromptExampleApply} />
              </div>
            </section>
          </main>

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
                        disabled={creditPackBusy}
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
                    disabled={creditPackBusy}
                    className="rounded-full border border-gold/30 px-4 py-2 text-xs font-medium text-gold transition-colors hover:bg-gold/10 disabled:opacity-60"
                  >
                    {t('usage_credit_pack_button')}
                  </button>
                  <p className="text-xs leading-5 text-ink-subtle">
                    {t('usage_credit_pack_payment_hint')}
                  </p>
                </div>
                {creditPackMessage && (
                  <p className="mt-3 rounded-lg border border-border-subtle bg-void/35 px-3 py-2 text-xs leading-5 text-ink-muted">
                    {creditPackMessage}
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.image_url} alt={item.prompt} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      </div>
                      <div className="p-2">
                        <p className="truncate text-[11px] text-ink-muted">{formatDate(item.created_at, locale)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>

        <section className="mt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-gold/70">
                {t('home_generation_pricing_label')}
              </p>
              <h2 className="mt-2 font-display text-2xl text-ink">{t('home_generation_pricing_headline')}</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-ink-muted">{t('home_generation_pricing_body')}</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {pricingItems.map((item) => (
              <article key={item.title} className="rounded-lg border border-border-subtle bg-surface/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
                  <span className="rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold">
                    {item.cost}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-ink-muted">{item.body}</p>
              </article>
            ))}
          </div>
          <p className="mt-3 rounded-lg border border-border-subtle bg-raised/70 px-4 py-3 text-xs leading-5 text-ink-muted">
            {t('home_generation_pricing_model_note')}
          </p>
        </section>
      </div>
    </div>
  );
}

