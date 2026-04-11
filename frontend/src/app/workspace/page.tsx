'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, AlertCircle, Info, Zap, Star, X, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import {
  createPresign,
  putObjectStorage,
  confirmPhoto,
  createReview,
  getReview,
  getUsage,
} from '@/lib/api';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { useAuth } from '@/lib/auth-context';
import { planLabel, planColor } from '@/lib/auth-context';
import {
  ApiException,
  PhotoCreateResponse,
  UsageResponse,
  ReviewCreateAsyncResponse,
  ReviewCreateSyncResponse,
  ImageType,
} from '@/lib/types';
import ImageUploader, { type UploadPreprocessMetrics } from '@/components/upload/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';
import { useI18n } from '@/lib/i18n';
import type { ExifData } from '@/lib/exif';
import { formatUserFacingError } from '@/lib/error-utils';
import { cacheUploadedPhotoPreview } from '@/lib/photo-preview-cache';

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage =
  | 'idle'
  | 'uploading'
  | 'confirming'
  | 'ready'
  | 'rejected'
  | 'reviewing'
  | 'error';

type CachedPhotoEntry = {
  photo: PhotoCreateResponse;
  cached_at: number;
};

type UploadFlowMetrics = UploadPreprocessMetrics & {
  bitmap_decode_ms?: number;
  sha256_ms?: number;
  frontend_preprocess_ms?: number;
  presign_request_ms?: number;
  object_upload_ms?: number;
  confirm_request_ms?: number;
  total_upload_flow_ms?: number;
};

const PHOTO_UPLOAD_CACHE_KEY = 'ps_uploaded_photos_v1';
const PHOTO_UPLOAD_CACHE_LIMIT = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractClientMeta(
  file: File,
  extra?: { width?: number; height?: number; original_size?: number; upload_metrics?: UploadFlowMetrics }
): Record<string, unknown> {
  return {
    original_filename: file.name,
    mime: file.type,
    size_bytes: file.size,
    last_modified: new Date(file.lastModified).toISOString(),
    ...(extra?.width ? { width: extra.width } : {}),
    ...(extra?.height ? { height: extra.height } : {}),
    ...(extra?.original_size ? { original_size: extra.original_size } : {}),
    ...(extra?.upload_metrics ? { upload_metrics: extra.upload_metrics } : {}),
  };
}

function logUploadMetrics(stage: string, metrics: Record<string, unknown>): void {
  console.info(`[upload-metrics] ${stage}`, metrics);
}

async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function readCachedPhotos(): Record<string, CachedPhotoEntry> {
  try {
    const raw = window.sessionStorage.getItem(PHOTO_UPLOAD_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CachedPhotoEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getCachedPhoto(sha256: string): PhotoCreateResponse | null {
  const cache = readCachedPhotos();
  return cache[sha256]?.photo ?? null;
}

function cachePhoto(sha256: string, photo: PhotoCreateResponse): void {
  try {
    const cache = readCachedPhotos();
    const nextEntries = Object.entries({
      ...cache,
      [sha256]: {
        photo,
        cached_at: Date.now(),
      },
    })
      .sort(([, left], [, right]) => right.cached_at - left.cached_at)
      .slice(0, PHOTO_UPLOAD_CACHE_LIMIT);
    window.sessionStorage.setItem(PHOTO_UPLOAD_CACHE_KEY, JSON.stringify(Object.fromEntries(nextEntries)));
  } catch {
    // Best-effort cache only.
  }
}

function getEffectiveQuota(
  usage: UsageResponse | null,
  reviewMode: 'flash' | 'pro'
): { remaining: number | null; total: number | null } {
  if (!usage) {
    return { remaining: null, total: null };
  }

  const candidates: Array<{ remaining: number; total: number }> = [];
  const {
    daily_remaining,
    daily_total,
    monthly_remaining,
    monthly_total,
    pro_monthly_remaining,
    pro_monthly_total,
  } = usage.quota;

  if (daily_remaining !== null && daily_total !== null) {
    candidates.push({ remaining: daily_remaining, total: daily_total });
  }
  if (monthly_remaining !== null && monthly_total !== null) {
    candidates.push({ remaining: monthly_remaining, total: monthly_total });
  }
  if (reviewMode === 'pro' && pro_monthly_remaining !== null && pro_monthly_total !== null) {
    candidates.push({ remaining: pro_monthly_remaining, total: pro_monthly_total });
  }

  if (candidates.length === 0) {
    return { remaining: null, total: null };
  }

  return candidates.reduce((current, candidate) =>
    candidate.remaining < current.remaining ? candidate : current
  );
}


function isImageType(value: string | null): value is ImageType {
  return value === 'default' ||
    value === 'landscape' ||
    value === 'portrait' ||
    value === 'street' ||
    value === 'still_life' ||
    value === 'architecture';
}

// ─── Component ────────────────────────────────────────────────────────────────

function WorkspacePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userInfo, ensureToken, isLoading: authLoading, syncPlan } = useAuth();
  const { t, locale } = useI18n();
  const promoModeBadge = '25% off';

  const initialSourceReviewId = searchParams.get('source_review_id');
  const initialPhotoId = searchParams.get('photo_id');
  const initialMode = searchParams.get('mode');
  const initialImageType = searchParams.get('image_type');

  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageError, setUsageError] = useState(false);
  const currentPlan = (userInfo?.plan ?? usage?.plan ?? 'guest') as 'guest' | 'free' | 'pro';
  const isGuest = currentPlan === 'guest';

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [exifData, setExifData] = useState<ExifData>({});
  const [uploadProgress, setUploadProgress] = useState(0);

  const [stage, setStage] = useState<Stage>('idle');
  const [photo, setPhoto] = useState<PhotoCreateResponse | null>(null);
  const [errMessage, setErrMessage] = useState('');

  const [reviewMode, setReviewMode] = useState<'flash' | 'pro'>('flash');
  const [imageType, setImageType] = useState<ImageType>('default');
  const [sourceReviewId, setSourceReviewId] = useState<string | null>(initialSourceReviewId);
  const [replayPhotoId, setReplayPhotoId] = useState<string | null>(initialPhotoId);
  const [replayPhotoUrl, setReplayPhotoUrl] = useState<string | null>(null);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const { remaining: remainingQuota, total: totalQuota } = getEffectiveQuota(usage, reviewMode);
  const canReplayWithoutUpload = Boolean(sourceReviewId && replayPhotoId && !preview);

  // ── Fetch usage ────────────────────────────────────────────────────────────

  const fetchUsage = useCallback(async () => {
    try {
      setUsageError(false);
      const token = await ensureToken();
      const data = await getUsage(token);
      syncPlan(data.plan);
      setUsage(data);
    } catch (err) {
      console.error('Failed to fetch usage in workspace', err);
      setUsageError(true);
    }
  }, [ensureToken, syncPlan]);

  useEffect(() => {
    if (authLoading) return;
    setUsage(null);
    fetchUsage();
  }, [authLoading, userInfo?.access_token, fetchUsage]);

  useEffect(() => {
    if (isGuest && reviewMode === 'pro') {
      setReviewMode('flash');
    }
  }, [isGuest, reviewMode]);

  useEffect(() => {
    if (initialMode === 'flash' || initialMode === 'pro') {
      setReviewMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    if (isImageType(initialImageType)) {
      setImageType(initialImageType);
    }
  }, [initialImageType]);

  useEffect(() => {
    if (!sourceReviewId || preview) return;

    let cancelled = false;
    ensureToken()
      .then((token) => getReview(sourceReviewId, token))
      .then((data) => {
        if (cancelled) return;
        setReplayPhotoUrl(data.photo_url);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to hydrate replay photo in workspace', err);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceReviewId, preview, ensureToken]);

  // ── File selected → upload flow ────────────────────────────────────────────

  const handleFileSelected = useCallback(
    async (
      file: File,
      dataUrl: string,
      exif: ExifData = {},
      preprocessMetrics?: UploadPreprocessMetrics
    ) => {
      const uploadFlowStartedAt = performance.now();
      setSourceReviewId(null);
      setReplayPhotoId(null);
      setReplayPhotoUrl(null);
      setSelectedFile(file);
      setPreview(dataUrl);
      setExifData(exif);
      setStage('uploading');
      setUploadProgress(0);
      setErrMessage('');

      let imgWidth = 0;
      let imgHeight = 0;
      let checksumSha256: string | null = null;
      const uploadMetrics: UploadFlowMetrics = {
        exif_extract_ms: preprocessMetrics?.exif_extract_ms ?? 0,
        compression_ms: preprocessMetrics?.compression_ms ?? 0,
        file_read_ms: preprocessMetrics?.file_read_ms ?? 0,
        preprocess_total_ms: preprocessMetrics?.preprocess_total_ms ?? 0,
        compressed: preprocessMetrics?.compressed ?? false,
        original_size_bytes: preprocessMetrics?.original_size_bytes ?? file.size,
        final_size_bytes: preprocessMetrics?.final_size_bytes ?? file.size,
      };
      const bitmapDecodeStartedAt = performance.now();
      try {
        const bmp = await createImageBitmap(file);
        imgWidth = bmp.width;
        imgHeight = bmp.height;
        bmp.close();
      } catch {
        // non-critical
      }
      uploadMetrics.bitmap_decode_ms = Math.round(performance.now() - bitmapDecodeStartedAt);

      const sha256StartedAt = performance.now();
      try {
        checksumSha256 = await computeFileSha256(file);
      } catch {
        checksumSha256 = null;
      }
      uploadMetrics.sha256_ms = Math.round(performance.now() - sha256StartedAt);
      uploadMetrics.frontend_preprocess_ms =
        uploadMetrics.preprocess_total_ms + uploadMetrics.bitmap_decode_ms + uploadMetrics.sha256_ms;
      logUploadMetrics('preprocess', {
        file_name: file.name,
        file_size_bytes: file.size,
        ...uploadMetrics,
      });

      try {
        const token = await ensureToken();

        if (checksumSha256) {
          const cachedPhoto = getCachedPhoto(checksumSha256);
          if (cachedPhoto) {
            void cacheUploadedPhotoPreview(cachedPhoto.photo_id, file);
            setPhoto(cachedPhoto);
            if (cachedPhoto.status === 'READY') {
              setStage('ready');
              fetchUsage();
            } else if (cachedPhoto.status === 'REJECTED') {
              setStage('rejected');
              setErrMessage(t('photo_rejected_msg'));
            } else {
              setStage('error');
              setErrMessage(t('status_photo_error') + cachedPhoto.status);
            }
            return;
          }
        }

        const presign = await createPresign(
          {
            filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
            ...(checksumSha256 ? { sha256: checksumSha256 } : {}),
          },
          token
        );

        await putObjectStorage(presign.put_url, file, presign.headers, (pct) => {
          setUploadProgress(pct);
        });

        setStage('confirming');
        const photoData = await confirmPhoto(
          presign.upload_id,
          exif as Record<string, unknown>,
          extractClientMeta(file, {
            width: imgWidth,
            height: imgHeight,
            original_size: preprocessMetrics?.original_size_bytes,
            upload_metrics: uploadMetrics,
          }),
          token
        );

        setPhoto(photoData);
        if (checksumSha256) {
          cachePhoto(checksumSha256, photoData);
        }
        void cacheUploadedPhotoPreview(photoData.photo_id, file);

        if (photoData.status === 'READY') {
          setStage('ready');
          fetchUsage();
        } else if (photoData.status === 'REJECTED') {
          setStage('rejected');
          setErrMessage(t('photo_rejected_msg'));
        } else {
          setStage('error');
          setErrMessage(t('status_photo_error') + photoData.status);
        }
      } catch (err) {
        setStage('error');
        if (err instanceof ApiException) {
          if (err.status === 429) {
            setErrMessage(formatUserFacingError(t, err, t('err_rate_limit')));
          } else if (err.status === 402 || err.code === 'QUOTA_EXCEEDED') {
            setErrMessage(formatUserFacingError(t, err, t('err_quota')));
          } else {
            setErrMessage(formatUserFacingError(t, err, err.message));
          }
        } else {
          setErrMessage(formatUserFacingError(t, err, t('err_upload')));
        }
      }
    },
    [ensureToken, fetchUsage, t]
  );

  // ── Submit review ──────────────────────────────────────────────────────────

  const handleReview = useCallback(async () => {
    const activePhotoId = photo?.photo_id ?? replayPhotoId;
    if (!activePhotoId) return;
    if (usage && remainingQuota !== null && remainingQuota <= 0) {
      setShowQuotaModal(true);
      return;
    }
    setStage('reviewing');
    setErrMessage('');

    try {
      const token = await ensureToken();
      const idempotencyKey = `${activePhotoId}-${reviewMode}-${Date.now()}`;
      const result = await createReview(
        {
          photo_id: activePhotoId,
          mode: reviewMode,
          async: true,
          idempotency_key: idempotencyKey,
          locale,
          image_type: imageType,
          ...(sourceReviewId ? { source_review_id: sourceReviewId } : {}),
        },
        token
      );

      if ('task_id' in result) {
        const async_result = result as ReviewCreateAsyncResponse;
        router.push(`/tasks/${async_result.task_id}?mode=${reviewMode}`);
      } else {
        const sync_result = result as ReviewCreateSyncResponse;
        router.push(`/reviews/${sync_result.review_id}`);
      }
    } catch (err) {
      setStage('ready');
      if (err instanceof ApiException) {
        if (err.status === 429) {
          setErrMessage(formatUserFacingError(t, err, t('err_rate_limit')));
        } else if (err.code === 'QUOTA_EXCEEDED') {
          setErrMessage(formatUserFacingError(t, err, t('err_quota')));
        } else {
          setErrMessage(formatUserFacingError(t, err, err.message));
        }
      } else {
        setErrMessage(formatUserFacingError(t, err, t('err_upload')));
      }
    }
  }, [photo, replayPhotoId, reviewMode, locale, imageType, sourceReviewId, ensureToken, router, t, usage, remainingQuota]);

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setPhoto(null);
    setStage('idle');
    setErrMessage('');
    setUploadProgress(0);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="pt-14 min-h-screen">
      {showQuotaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'rgba(8,8,8,0.80)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowQuotaModal(false)}
        >
          <div
            className="relative w-full max-w-sm bg-raised border border-border rounded-lg p-8 space-y-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowQuotaModal(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
              aria-label={t('quota_modal_close')}
              title={t('quota_modal_close')}
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-full bg-rust/10 border border-rust/30 flex items-center justify-center">
              <AlertCircle size={22} className="text-rust" />
            </div>
            <div>
              <h2 className="font-display text-2xl mb-2">{t('quota_modal_title')}</h2>
              <p className="text-sm text-ink-muted leading-relaxed">
                {t('quota_modal_body')}
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              {usage?.plan === 'guest' ? (
                <ClerkSignInTrigger
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
                  signedInClassName="inline-flex items-center justify-center"
                >
                  {t('quota_modal_upgrade')}
                  <ArrowRight size={13} />
                </ClerkSignInTrigger>
              ) : (
                <p className="text-xs text-ink-muted text-center">{t('quota_modal_upgrade')}</p>
              )}
              <button
                onClick={() => setShowQuotaModal(false)}
                className="text-sm text-ink-muted hover:text-ink transition-colors py-1"
              >
                {t('quota_modal_close')}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10 animate-fade-in">
          <p className="text-xs text-gold/70 font-mono mb-3 tracking-widest uppercase">
            — {t('workspace_label')}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl mb-4">{t('workspace_headline')}</h1>

          {usage && (
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs">
                <span className={`font-medium ${planColor(usage.plan)}`}>
                  {planLabel(usage.plan)}
                </span>
              </span>
              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <Info size={11} />
                {t('usage_remaining')}
                <span className="text-ink font-medium">
                  {remainingQuota ?? '∞'}{totalQuota !== null ? ` / ${totalQuota}` : ''}
                </span>
                {t('usage_times')}
              </div>
              {remainingQuota === 0 && (
                <Badge variant="rust">{t('usage_quota_exhausted')}</Badge>
              )}
            </div>
          )}

          {usageError && (
            <p className="text-xs text-ink-subtle mt-2">
              {`${t('usage_error')} ${t('support_contact_prompt')}`}
            </p>
          )}
        </div>

        <div className="animate-slide-up anim-fill-both delay-100">
          {!preview ? (
            <div className="space-y-5">
              {canReplayWithoutUpload && (
                <div className="overflow-hidden rounded-[24px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.16),transparent_34%),rgb(var(--color-surface)/0.82)] p-5 animate-fade-in">
                  <div className="grid gap-5 md:grid-cols-[180px_1fr]">
                    <div className="space-y-3">
                      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-raised">
                        {replayPhotoUrl ? (
                          <Image
                            src={replayPhotoUrl}
                            alt={t('replay_current_photo')}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-ink-subtle">
                            {t('replay_current_photo')}
                          </div>
                        )}
                      </div>
                      <div className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-center text-[11px] uppercase tracking-[0.22em] text-gold/85">
                        {t('replay_current_photo')}
                      </div>
                    </div>

                    <div className="space-y-5">
                      <div className="space-y-2">
                        <h2 className="font-display text-2xl text-ink">{t('replay_title')}</h2>
                        <p className="text-sm leading-7 text-ink-muted">{t('replay_body')}</p>
                      </div>

                      <div>
                        <p className="mb-3 text-xs text-ink-muted">{t('select_image_type')}</p>
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            ['default', t('image_type_default')],
                            ['landscape', t('image_type_landscape')],
                            ['portrait', t('image_type_portrait')],
                            ['street', t('image_type_street')],
                            ['still_life', t('image_type_still_life')],
                            ['architecture', t('image_type_architecture')],
                          ] as const).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setImageType(id)}
                              className={`rounded border px-3 py-2 text-xs transition-colors ${imageType === id ? 'border-gold/60 bg-gold/5 text-gold' : 'border-border text-ink-muted hover:border-gold/30 hover:text-ink'}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="mb-3 text-xs text-ink-muted">{t('select_mode')}</p>
                        <div className="grid grid-cols-2 gap-3">
                          {(
                            [
                              { id: 'flash' as const, icon: Zap, title: 'Flash', desc: t('mode_flash_desc') },
                              { id: 'pro' as const, icon: Star, title: 'Pro', desc: t('mode_pro_desc') },
                            ] as const
                          ).map((modeOption) => {
                            const disabled = isGuest && modeOption.id === 'pro';
                            return (
                              <button
                                key={modeOption.id}
                                type="button"
                                onClick={() => !disabled && setReviewMode(modeOption.id)}
                                disabled={disabled}
                                className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-all duration-200 ${
                                  disabled
                                    ? 'cursor-not-allowed border-border opacity-40'
                                    : reviewMode === modeOption.id
                                      ? 'border-gold/60 bg-gold/5 shadow-[0_0_16px_rgba(200,162,104,0.12)]'
                                      : 'border-border hover:border-gold/30 hover:bg-raised/60 active:scale-[0.98]'
                                }`}
                              >
                                <modeOption.icon
                                  size={16}
                                  className={reviewMode === modeOption.id ? 'mt-0.5 text-gold' : 'mt-0.5 text-ink-subtle'}
                                />
                                <div>
                                  <p className={`text-sm font-medium ${reviewMode === modeOption.id ? 'text-gold' : 'text-ink'}`}>
                                    {modeOption.title}
                                    {modeOption.id === 'pro' && (
                                      <span className="ml-2 rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gold/80">
                                        {promoModeBadge}
                                      </span>
                                    )}
                                  </p>
                                  <p className="mt-0.5 text-xs text-ink-muted">
                                    {disabled ? t('mode_pro_guest') : modeOption.desc}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={handleReview}
                          disabled={stage === 'reviewing'}
                          className="btn-gold flex-1 rounded bg-gold px-6 py-3 text-sm font-medium text-void transition-all duration-200 hover:bg-gold-light hover:shadow-[0_0_24px_rgba(200,162,104,0.35)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
                        >
                          {t('btn_start_review')} {reviewMode === 'pro' ? 'Pro' : 'Flash'} {t('btn_review_suffix')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSourceReviewId(null);
                            setReplayPhotoId(null);
                            setReplayPhotoUrl(null);
                            setStage('idle');
                          }}
                          className="rounded border border-border px-4 py-3 text-sm text-ink-muted transition-all duration-200 hover:border-gold/40 hover:text-ink active:scale-[0.98]"
                        >
                          {t('replay_upload_new')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(stage === 'error' && errMessage) && (
                <div className="flex items-center gap-2 rounded border border-rust/20 bg-rust/5 px-3 py-2 text-sm text-rust animate-scale-in">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errMessage}</span>
                </div>
              )}

              {(!canReplayWithoutUpload || stage === 'idle' || stage === 'error') && (
                <ImageUploader
                  onFileSelected={handleFileSelected}
                  disabled={stage !== 'idle' && stage !== 'error'}
                />
              )}
            </div>
          ) : (
            <div className="space-y-5 animate-fade-in">
              <div className="photo-frame relative aspect-[4/3] rounded-lg overflow-hidden border border-border bg-raised group">
                <Image
                  src={preview}
                  alt="Preview"
                  fill
                  className="object-contain transition-transform duration-500 group-hover:scale-[1.02]"
                  unoptimized
                />

                {stage === 'uploading' && (
                  <div className="absolute inset-0 bg-void/75 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4 transition-all animate-fade-in">
                    <LoadingSpinner size={32} />
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-sm font-medium text-gold drop-shadow-md">{t('stage_uploading')} {uploadProgress}%</p>
                      <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden border border-white/5 shadow-inner">
                        <div
                          className="h-full bg-[linear-gradient(90deg,rgba(200,162,104,0.8),rgba(200,162,104,1))] rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(200,162,104,0.8)]"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {stage === 'confirming' && (
                  <div className="absolute inset-0 bg-void/70 backdrop-blur-[1px] flex flex-col items-center justify-center gap-3 animate-fade-in">
                    <LoadingSpinner size={32} label={t('stage_confirming')} />
                  </div>
                )}

                {stage === 'reviewing' && (
                  <div className="absolute inset-0 bg-void/75 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 animate-fade-in">
                    <LoadingSpinner size={32} label={t('stage_reviewing')} />
                  </div>
                )}
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between text-[11px] text-ink-subtle font-mono tracking-tight px-1">
                  <span className="truncate max-w-[240px] opacity-70 italic">{selectedFile.name}</span>
                  <span className="bg-void/40 px-2 py-0.5 rounded border border-border-subtle">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              )}

              {stage === 'ready' && photo && (
                <div className="flex items-center gap-2 text-sage text-sm animate-scale-in bg-sage/5 border border-sage/20 px-4 py-2.5 rounded-lg">
                  <CheckCircle size={14} className="animate-pulse" />
                  <span className="font-medium">{t('photo_ready_msg')}</span>
                </div>
              )}

              {(stage === 'rejected' || stage === 'error') && (
                <div className="flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded-lg px-4 py-3 animate-scale-in">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errMessage}</span>
                </div>
              )}

              {stage === 'ready' && photo && (
                <div className="space-y-6 pt-2 animate-slide-up">
                  <div className="space-y-3">
                    <p className="text-xs font-mono uppercase tracking-[0.2em] text-ink-subtle">{t('select_image_type')}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ['default', t('image_type_default')],
                        ['landscape', t('image_type_landscape')],
                        ['portrait', t('image_type_portrait')],
                        ['street', t('image_type_street')],
                        ['still_life', t('image_type_still_life')],
                        ['architecture', t('image_type_architecture')],
                      ] as const).map(([id, label]) => (
                        <button
                          key={id}
                          onClick={() => setImageType(id)}
                          className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-all duration-200 active:scale-95 ${imageType === id ? 'border-gold/60 text-gold bg-gold/10 shadow-[0_4px_16px_rgba(200,162,104,0.12)]' : 'border-border text-ink-muted hover:text-ink hover:border-gold/30 hover:bg-raised/40'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-mono uppercase tracking-[0.2em] text-ink-subtle">{t('select_mode')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {(
                        [
                          {
                            id: 'flash' as const,
                            icon: Zap,
                            title: 'Flash',
                            desc: t('mode_flash_desc'),
                          },
                          {
                            id: 'pro' as const,
                            icon: Star,
                            title: 'Pro',
                            desc: t('mode_pro_desc'),
                          },
                        ] as const
                      ).map((m) => {
                        const disabled = isGuest && m.id === 'pro';
                        return (
                        <button
                          key={m.id}
                          onClick={() => !disabled && setReviewMode(m.id)}
                          disabled={disabled}
                          className={`
                            flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-300
                            ${
                              disabled
                                ? 'opacity-40 cursor-not-allowed border-border'
                                : reviewMode === m.id
                                ? 'border-gold/60 bg-gold/10 shadow-[0_8px_32px_rgba(200,162,104,0.14)] scale-[1.02] z-10'
                                : 'border-border hover:border-gold/30 hover:bg-raised/60 active:scale-[0.98]'
                            }
                          `}
                        >
                          <m.icon
                            size={16}
                            className={reviewMode === m.id ? 'text-gold mt-0.5' : 'text-ink-subtle mt-0.5'}
                          />
                          <div>
                            <p
                              className={`text-sm font-bold ${
                                reviewMode === m.id ? 'text-gold' : 'text-ink'
                              }`}
                            >
                              {m.title}
                              {m.id === 'pro' && (
                                <span className="ml-2 rounded-full border border-gold/25 bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gold/90 font-mono">
                                  {promoModeBadge}
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] leading-relaxed text-ink-muted mt-1 font-medium">
                              {disabled ? t('mode_pro_guest') : m.desc}
                            </p>
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handleReview}
                      className="btn-gold flex-1 px-6 py-4 bg-gold text-void text-sm font-bold rounded-full hover:bg-gold-light active:scale-[0.97] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(200,162,104,0.4)] shadow-[0_8px_24px_rgba(200,162,104,0.2)]"
                    >
                      {t('btn_start_review')} {reviewMode === 'pro' ? 'Pro' : 'Flash'} {t('btn_review_suffix')}
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-6 py-4 border border-border text-ink-muted text-sm font-medium rounded-full hover:border-gold/40 hover:text-ink active:scale-[0.97] transition-all duration-300"
                    >
                      {t('btn_change_photo')}
                    </button>
                  </div>
                </div>
              )}

              {(stage === 'rejected' || stage === 'error') && (
                <button
                  onClick={handleReset}
                  className="w-full px-6 py-4 border border-border text-ink-muted text-sm font-medium rounded-full hover:border-gold/40 hover:text-ink active:scale-[0.97] transition-all duration-300"
                >
                  {t('btn_reupload')}
                </button>
              )}
            </div>
          )}
        <ProPromoCard
          plan={currentPlan}
          scene="workspace"
          fallbackRedirectUrl="/workspace"
          className="mt-12 animate-slide-up anim-fill-both delay-150"
        />
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-14" />}>
      <WorkspacePageContent />
    </Suspense>
  );
}
