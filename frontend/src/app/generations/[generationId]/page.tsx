'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Download, ImageIcon, RefreshCw, RotateCcw } from 'lucide-react';
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
    setBusy(true);
    setError('');
    try {
      const token = await ensureToken();
      const result = await reuseGeneration(generationId, token);
      router.push(`/generation-tasks/${result.task_id}`);
    } catch (err) {
      setError(formatUserFacingError(t, err, t('generation_detail_reuse_error')));
    } finally {
      setBusy(false);
    }
  }, [ensureToken, generationId, router, t]);

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
    router.push(`/workspace?${params.toString()}`);
  }, [generation, generationId, locale, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 pt-14 text-center">
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
      <div className="flex min-h-screen items-center justify-center px-6 pt-14 text-center">
        <div className="space-y-4">
          <p className="text-sm text-rust">{error}</p>
          <Link href="/generate" className="text-sm text-gold hover:text-gold-light">{t('generation_detail_back_generate')}</Link>
        </div>
      </div>
    );
  }

  if (!generation) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 pt-14 text-center">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">{t('generation_detail_empty')}</p>
          <Link href="/generate" className="text-sm text-gold hover:text-gold-light">{t('generation_detail_back_generate')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-2 text-xs text-ink-subtle transition-colors hover:text-ink"
        >
          <ArrowLeft size={12} />
          {t('generation_detail_back')}
        </button>

        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_380px]">
          <main className="min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-void">
            {imageFailed ? (
              <div className="flex min-h-[56vh] items-center justify-center px-6 text-center">
                <div className="space-y-3">
                  <ImageIcon size={36} className="mx-auto text-ink-subtle" />
                  <p className="text-sm text-ink-muted">{t('generation_detail_image_error')}</p>
                  <a
                    href={generation.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-full border border-gold/35 px-4 py-2 text-sm text-gold hover:bg-gold/10"
                  >
                    {t('generation_detail_open_image')}
                  </a>
                </div>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={generation.image_url}
                alt={generation.prompt}
                className="max-h-[78vh] w-full object-contain"
                onError={() => setImageFailed(true)}
              />
            )}
          </main>

          <aside className="space-y-5">
            <section className="rounded-lg border border-border-subtle bg-surface/80 p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg border border-gold/30 bg-gold/10 p-3 text-gold">
                  <ImageIcon size={20} />
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle">{t('generation_ai_badge')}</p>
                  <h1 className="font-display text-2xl text-ink">{t('generation_detail_title')}</h1>
                </div>
              </div>
              <p className="text-sm leading-7 text-ink-muted">{generation.prompt}</p>
              <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-border bg-raised/70 p-3">
                  <p className="text-ink-subtle">{t('generation_detail_quality')}</p>
                  <p className="mt-1 text-ink">{generation.quality}</p>
                </div>
                <div className="rounded-lg border border-border bg-raised/70 p-3">
                  <p className="text-ink-subtle">{t('generation_detail_size')}</p>
                  <p className="mt-1 text-ink">{formatGenerationOutputSpec(generation.quality, generation.size)}</p>
                </div>
                <div className="rounded-lg border border-border bg-raised/70 p-3">
                  <p className="text-ink-subtle">{t('generation_detail_credits')}</p>
                  <p className="mt-1 text-ink">{generation.credits_charged}</p>
                </div>
                <div className="rounded-lg border border-border bg-raised/70 p-3">
                  <p className="text-ink-subtle">{t('generation_detail_model')}</p>
                  <p className="mt-1 truncate text-ink">{generation.model_snapshot ?? generation.model_name}</p>
                </div>
              </div>
            </section>

            {(generation.source_photo_id || generation.source_review_id) && (
              <section className="rounded-lg border border-border-subtle bg-surface/80 p-5">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle">Source</p>
                <div className="mt-3 space-y-3 text-sm">
                  {generation.source_photo_id && (
                    <div className="rounded-lg border border-border bg-raised/70 p-3">
                      <p className="text-xs text-ink-subtle">{locale === 'zh' ? '参考原图' : 'Source photo'}</p>
                      <p className="mt-1 font-mono text-xs text-ink">{generation.source_photo_id}</p>
                    </div>
                  )}
                  {generation.source_review_id && (
                    <Link
                      href={`/reviews/${generation.source_review_id}`}
                      className="block rounded-lg border border-gold/25 bg-gold/10 p-3 transition-colors hover:bg-gold/15"
                    >
                      <p className="text-xs text-gold/85">{locale === 'zh' ? '来源点评' : 'Source review'}</p>
                      <p className="mt-1 font-mono text-xs text-ink">{generation.source_review_id}</p>
                    </Link>
                  )}
                </div>
              </section>
            )}

            <section className="space-y-3 rounded-lg border border-border-subtle bg-surface/80 p-5">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloadBusy}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-bold text-void transition-colors hover:bg-gold-light"
              >
                <Download size={15} className={downloadBusy ? 'animate-bounce' : ''} />
                {downloadBusy ? t('generation_detail_download_busy') : t('generation_detail_download')}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
              >
                <Copy size={15} />
                {copied ? t('generation_detail_copied_prompt') : t('generation_detail_copy_prompt')}
              </button>
              <button
                type="button"
                onClick={handleReuse}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink disabled:opacity-50"
              >
                <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
                {t('generation_detail_reuse')}
              </button>
              <button
                type="button"
                onClick={handleUseForRetake}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-sage/30 px-5 py-3 text-sm text-sage transition-colors hover:bg-sage/10"
              >
                <RotateCcw size={15} />
                {t('generation_detail_retake')}
              </button>
              {error && <p className="rounded-lg border border-rust/20 bg-rust/5 px-3 py-2 text-sm text-rust">{error}</p>}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
