'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Copy, Download, ImageIcon, RefreshCw, RotateCcw } from 'lucide-react';
import { downloadGeneration, getGeneration, reuseGeneration } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { GeneratedImageDetailResponse } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { trackProductEvent } from '@/lib/product-analytics';
import { formatGenerationOutputSpec } from '@/features/generations/generation-config';

export default function GenerationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const generationId = params.generationId as string;
  const { ensureToken } = useAuth();
  const { t, locale } = useI18n();
  const [generation, setGeneration] = useState<GeneratedImageDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    ensureToken()
      .then((token) => getGeneration(generationId, token, controller.signal))
      .then((data) => {
        if (!cancelled) {
          setGeneration(data);
          setImageFailed(false);
          void trackProductEvent('generation_viewed', {
            pagePath: `/generations/${generationId}`,
            locale,
            metadata: { generation_id: generationId, generation_mode: data.generation_mode },
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(formatUserFacingError(t, err, t('generation_detail_fetch_error')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ensureToken, generationId, locale, t]);

  const handleReuse = useCallback(async () => {
    if (!generation) return;
    setBusy(true);
    setError('');
    try {
      const token = await ensureToken();
      void trackProductEvent('generation_reuse_clicked', {
        token,
        pagePath: `/generations/${generationId}`,
        locale,
        metadata: {
          generation_id: generation.generation_id,
          generation_mode: generation.generation_mode,
          source_review_id: generation.source_review_id,
          template_key: generation.template_key,
          quality: generation.quality,
          size: generation.size,
          entrypoint: 'generation_detail_reuse',
        },
      });
      const result = await reuseGeneration(generationId, token);
      router.push(`/generation-tasks/${result.task_id}`);
    } catch (err) {
      setError(formatUserFacingError(t, err, t('generation_detail_reuse_error')));
    } finally {
      setBusy(false);
    }
  }, [ensureToken, generation, generationId, locale, router, t]);

  const handleCopy = useCallback(async () => {
    if (!generation) return;
    await navigator.clipboard.writeText(generation.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [generation]);

  const handleDownload = useCallback(async () => {
    if (!generation) return;
    setDownloadBusy(true);
    setError('');
    try {
      const token = await ensureToken();
      const { blob, filename } = await downloadGeneration(generation.generation_id, token);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      void trackProductEvent('generation_download_clicked', {
        token,
        pagePath: `/generations/${generationId}`,
        locale,
        metadata: { generation_id: generation.generation_id, generation_mode: generation.generation_mode },
      });
    } catch (err) {
      setError(formatUserFacingError(t, err, t('generation_detail_download_error')));
      window.open(generation.image_url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadBusy(false);
    }
  }, [ensureToken, generation, generationId, locale, t]);

  const handleUseForRetake = useCallback(() => {
    if (!generation) return;
    void trackProductEvent('generation_used_for_retake', {
      pagePath: `/generations/${generationId}`,
      locale,
      metadata: {
        generation_id: generation.generation_id,
        source_review_id: generation.source_review_id,
        source_photo_id: generation.source_photo_id,
        generation_mode: generation.generation_mode,
      },
    });
    const params = new URLSearchParams({ generation_id: generation.generation_id });
    if (generation.source_review_id) params.set('source_review_id', generation.source_review_id);
    if (generation.source_photo_id) params.set('photo_id', generation.source_photo_id);
    const imageType = typeof generation.metadata.image_type === 'string' ? generation.metadata.image_type : null;
    if (imageType) params.set('image_type', imageType);
    params.set('retake_intent', 'new_photo_retake');
    params.set('next_shoot_action', generation.prompt.slice(0, 220));
    params.set('next_shoot_dimension', generation.intent);
    router.push(`/workspace?${params.toString()}`);
  }, [generation, generationId, locale, router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12 text-center sm:px-6">
        <div className="space-y-4">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border border-gold/20 border-t-gold" />
          <div>
            <h1 className="font-display text-2xl text-ink">{t('generation_detail_loading')}</h1>
            <p className="mt-2 font-mono text-xs text-ink-subtle">{generationId}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !generation) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12 text-center sm:px-6">
        <div role="alert" className="ui-panel w-full max-w-lg space-y-4 p-6">
          <h1 className="text-2xl font-semibold text-ink">{t('generation_detail_fetch_error')}</h1>
          <p className="text-sm leading-7 text-rust">{error}</p>
          <Link href="/generate" className="ui-action-secondary w-full px-4 text-sm sm:w-auto">
            <ArrowLeft size={15} aria-hidden="true" />
            {t('generation_detail_back_generate')}
          </Link>
        </div>
      </div>
    );
  }

  if (!generation) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12 text-center sm:px-6">
        <div className="ui-panel w-full max-w-lg space-y-4 p-6">
          <h1 className="text-2xl font-semibold text-ink">{t('generation_detail_title')}</h1>
          <p className="text-sm text-ink-muted">{t('generation_detail_empty')}</p>
          <Link href="/generate" className="ui-action-secondary w-full px-4 text-sm sm:w-auto">
            <ArrowLeft size={15} aria-hidden="true" />
            {t('generation_detail_back_generate')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-workspace px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-7 flex flex-col gap-5 border-b border-border-subtle pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="ui-eyebrow">{t('generation_ai_badge')}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{t('generation_detail_title')}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sage/30 bg-sage/10 px-3 text-xs font-semibold text-sage">
              <CheckCircle2 size={15} aria-hidden="true" />
              {t('generation_task_complete')}
            </span>
            <button
              type="button"
              onClick={() => router.back()}
              className="ui-action-secondary px-4 text-sm"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              {t('generation_detail_back')}
            </button>
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 overflow-hidden rounded-feature border border-border-subtle bg-void shadow-level-2">
            {imageFailed ? (
              <div className="flex min-h-[42vh] items-center justify-center px-6 text-center sm:min-h-[56vh]">
                <div className="space-y-3">
                  <ImageIcon size={36} className="mx-auto text-ink-subtle" />
                  <p className="text-sm text-ink-muted">{t('generation_detail_image_error')}</p>
                  <a
                    href={generation.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ui-action-secondary px-4 text-sm text-gold"
                  >
                    {t('generation_detail_open_image')}
                  </a>
                </div>
              </div>
            ) : (
              <div className="relative min-h-[42vh] w-full sm:min-h-[56vh]">
                <Image
                  src={generation.image_url}
                  alt={generation.prompt}
                  fill
                  sizes="(min-width: 1024px) 62vw, 100vw"
                  className="object-contain"
                  priority
                  onError={() => setImageFailed(true)}
                />
              </div>
            )}
          </div>

          <aside className="space-y-5">
            <section className="ui-panel p-5" aria-labelledby="generation-result-prompt">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-gold/30 bg-gold/10 text-gold">
                  <ImageIcon size={20} aria-hidden="true" />
                </div>
                <h2 id="generation-result-prompt" className="text-base font-semibold text-ink">{t('generation_prompt_label')}</h2>
              </div>
              <p className="text-sm leading-7 text-ink-muted">{generation.prompt}</p>
              <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-control border border-border bg-raised/70 p-3">
                  <p className="text-ink-subtle">{t('generation_detail_quality')}</p>
                  <p className="mt-1 text-ink">{generation.quality}</p>
                </div>
                <div className="rounded-control border border-border bg-raised/70 p-3">
                  <p className="text-ink-subtle">{t('generation_detail_size')}</p>
                  <p className="mt-1 text-ink">{formatGenerationOutputSpec(generation.quality, generation.size)}</p>
                </div>
                <div className="rounded-control border border-border bg-raised/70 p-3">
                  <p className="text-ink-subtle">{t('generation_detail_credits')}</p>
                  <p className="mt-1 text-ink">{generation.credits_charged}</p>
                </div>
                <div className="rounded-control border border-border bg-raised/70 p-3">
                  <p className="text-ink-subtle">{t('generation_detail_model')}</p>
                  <p className="mt-1 truncate text-ink">{generation.model_snapshot ?? generation.model_name}</p>
                </div>
              </div>
            </section>

            {(generation.source_photo_id || generation.source_review_id) && (
              <section className="ui-panel p-5">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle">Source</p>
                <div className="mt-3 space-y-3 text-sm">
                  {generation.source_photo_id && (
                    <div className="rounded-control border border-border bg-raised/70 p-3">
                      <p className="text-xs text-ink-subtle">{locale === 'zh' ? '参考原图' : 'Source photo'}</p>
                      <p className="mt-1 font-mono text-xs text-ink">{generation.source_photo_id}</p>
                    </div>
                  )}
                  {generation.source_review_id && (
                    <Link
                      href={`/reviews/${generation.source_review_id}`}
                      className="block rounded-control border border-gold/25 bg-gold/10 p-3 transition-colors hover:bg-gold/15"
                    >
                      <p className="text-xs text-gold/85">{locale === 'zh' ? '来源点评' : 'Source review'}</p>
                      <p className="mt-1 font-mono text-xs text-ink">{generation.source_review_id}</p>
                    </Link>
                  )}
                </div>
              </section>
            )}

            <div className="ui-panel space-y-3 p-5">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloadBusy}
                aria-busy={downloadBusy}
                className="ui-action-primary w-full px-5 text-sm disabled:pointer-events-none disabled:opacity-60"
              >
                <Download size={15} className={downloadBusy ? 'animate-bounce' : ''} aria-hidden="true" />
                {downloadBusy ? t('generation_detail_download_busy') : t('generation_detail_download')}
              </button>
              <button
                type="button"
                onClick={handleReuse}
                disabled={busy}
                aria-busy={busy}
                className="ui-action-secondary w-full px-5 text-sm disabled:pointer-events-none disabled:opacity-50"
              >
                <RefreshCw size={15} className={busy ? 'animate-spin' : ''} aria-hidden="true" />
                {t('generation_detail_reuse')}
              </button>
              <button
                type="button"
                onClick={handleUseForRetake}
                className="ui-action-secondary w-full border-sage/30 px-5 text-sm text-sage hover:bg-sage/10"
              >
                <RotateCcw size={15} aria-hidden="true" />
                {t('generation_detail_retake')}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control px-5 text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <Copy size={15} aria-hidden="true" />
                {copied ? t('generation_detail_copied_prompt') : t('generation_detail_copy_prompt')}
              </button>
              {error && <p role="alert" className="rounded-control border border-rust/30 bg-rust/10 px-3 py-2 text-sm text-rust">{error}</p>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
