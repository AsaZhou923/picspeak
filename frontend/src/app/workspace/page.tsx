'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, AlertCircle, Info, Zap, Star, X, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import {
  createPresign,
  putObjectStorage,
  confirmPhoto,
  createReview,
  getUsage,
} from '@/lib/api';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
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
import ImageUploader from '@/components/upload/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';
import { useI18n } from '@/lib/i18n';
import type { ExifData } from '@/lib/exif';

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

const PHOTO_UPLOAD_CACHE_KEY = 'ps_uploaded_photos_v1';
const PHOTO_UPLOAD_CACHE_LIMIT = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractClientMeta(
  file: File,
  extra?: { width?: number; height?: number; original_size?: number }
): Record<string, unknown> {
  return {
    original_filename: file.name,
    mime: file.type,
    size_bytes: file.size,
    last_modified: new Date(file.lastModified).toISOString(),
    ...(extra?.width ? { width: extra.width } : {}),
    ...(extra?.height ? { height: extra.height } : {}),
    ...(extra?.original_size ? { original_size: extra.original_size } : {}),
  };
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const router = useRouter();
  const { userInfo, ensureToken, isLoading: authLoading, syncPlan } = useAuth();
  const { t, locale } = useI18n();

  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageError, setUsageError] = useState(false);
  const isGuest = (userInfo?.plan ?? usage?.plan) === 'guest';

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [exifData, setExifData] = useState<ExifData>({});
  const [uploadProgress, setUploadProgress] = useState(0);

  const [stage, setStage] = useState<Stage>('idle');
  const [photo, setPhoto] = useState<PhotoCreateResponse | null>(null);
  const [errMessage, setErrMessage] = useState('');

  const [reviewMode, setReviewMode] = useState<'flash' | 'pro'>('flash');
  const [imageType, setImageType] = useState<ImageType>('default');
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const { remaining: remainingQuota, total: totalQuota } = getEffectiveQuota(usage, reviewMode);

  // ── Fetch usage ────────────────────────────────────────────────────────────

  const fetchUsage = useCallback(async () => {
    try {
      setUsageError(false);
      const token = await ensureToken();
      const data = await getUsage(token);
      syncPlan(data.plan);
      setUsage(data);
    } catch {
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

  // ── File selected → upload flow ────────────────────────────────────────────

  const handleFileSelected = useCallback(
    async (file: File, dataUrl: string, exif: ExifData = {}) => {
      setSelectedFile(file);
      setPreview(dataUrl);
      setExifData(exif);
      setStage('uploading');
      setUploadProgress(0);
      setErrMessage('');

      // Decode image dimensions from the preview dataUrl
      let imgWidth = 0;
      let imgHeight = 0;
      let checksumSha256: string | null = null;
      try {
        const bmp = await createImageBitmap(file);
        imgWidth = bmp.width;
        imgHeight = bmp.height;
        bmp.close();
      } catch {
        // non-critical
      }

      try {
        checksumSha256 = await computeFileSha256(file);
      } catch {
        checksumSha256 = null;
      }

      try {
        const token = await ensureToken();

        if (checksumSha256) {
          const cachedPhoto = getCachedPhoto(checksumSha256);
          if (cachedPhoto) {
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

        // 1. Presign
        const presign = await createPresign(
          {
            filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
            ...(checksumSha256 ? { sha256: checksumSha256 } : {}),
          },
          token
        );

        // 2. PUT to object storage
        await putObjectStorage(presign.put_url, file, presign.headers, (pct) => {
          setUploadProgress(pct);
        });

        // 3. Confirm photo
        setStage('confirming');
        const photoData = await confirmPhoto(
          presign.upload_id,
          exif as Record<string, unknown>,
          extractClientMeta(file, { width: imgWidth, height: imgHeight }),
          token
        );

        setPhoto(photoData);
        if (checksumSha256) {
          cachePhoto(checksumSha256, photoData);
        }

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
            setErrMessage(t('err_rate_limit'));
          } else if (err.status === 402 || err.code === 'QUOTA_EXCEEDED') {
            setErrMessage(t('err_quota'));
          } else {
            setErrMessage(err.message);
          }
        } else {
          setErrMessage(t('err_upload'));
        }
      }
    },
    [ensureToken, fetchUsage, t]
  );

  // ── Submit review ──────────────────────────────────────────────────────────

  const handleReview = useCallback(async () => {
    if (!photo) return;
    // Guard: check quota before making any API call
    if (usage && remainingQuota !== null && remainingQuota <= 0) {
      setShowQuotaModal(true);
      return;
    }
    setStage('reviewing');
    setErrMessage('');

    try {
      const token = await ensureToken();
      const idempotencyKey = `${photo.photo_id}-${reviewMode}-${Date.now()}`;
      const result = await createReview(
        {
          photo_id: photo.photo_id,
          mode: reviewMode,
          async: true,
          idempotency_key: idempotencyKey,
          locale,
          image_type: imageType,
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
          setErrMessage(t('err_rate_limit'));
        } else if (err.code === 'QUOTA_EXCEEDED') {
          setErrMessage(t('err_quota'));
        } else {
          setErrMessage(err.message);
        }
      } else {
        setErrMessage(t('err_upload'));
      }
    }
  }, [photo, reviewMode, locale, imageType, ensureToken, router, t, usage, remainingQuota]);

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
      {/* ── Quota exhausted modal ──────────────────────────────────────────── */}
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
        {/* Header */}
        <div className="mb-10 animate-fade-in">
          <p className="text-xs text-gold/70 font-mono mb-3 tracking-widest uppercase">
            — {t('workspace_label')}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl mb-4">{t('workspace_headline')}</h1>

          {/* Usage bar */}
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
            <p className="text-xs text-ink-subtle mt-2">{t('usage_error')}</p>
          )}
        </div>

        {/* Upload zone or preview */}
        <div className="animate-slide-up anim-fill-both delay-100">
          {!preview ? (
            <ImageUploader
              onFileSelected={handleFileSelected}
              disabled={stage !== 'idle' && stage !== 'error'}
            />
          ) : (
            <div className="space-y-5">
              {/* Image preview */}
              <div className="photo-frame relative aspect-[4/3] rounded-lg overflow-hidden border border-border bg-raised">
                <Image
                  src={preview}
                  alt="Preview"
                  fill
                  className="object-contain"
                  unoptimized
                />

                {/* Progress overlay */}
                {stage === 'uploading' && (
                  <div className="absolute inset-0 bg-void/75 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3">
                    <LoadingSpinner size={32} />
                    <p className="text-sm text-ink-muted">{t('stage_uploading')} {uploadProgress}%</p>
                    <div className="w-40 h-0.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(200,162,104,0.6)]"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {stage === 'confirming' && (
                  <div className="absolute inset-0 bg-void/70 flex flex-col items-center justify-center gap-3">
                    <LoadingSpinner size={32} label={t('stage_confirming')} />
                  </div>
                )}

                {stage === 'reviewing' && (
                  <div className="absolute inset-0 bg-void/70 flex flex-col items-center justify-center gap-3">
                    <LoadingSpinner size={32} label={t('stage_reviewing')} />
                  </div>
                )}
              </div>

              {/* File info */}
              {selectedFile && (
                <div className="flex items-center justify-between text-xs text-ink-subtle font-mono">
                  <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                  <span>{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              )}

              {/* Status messages */}
              {stage === 'ready' && photo && (
                <div className="flex items-center gap-2 text-sage text-sm animate-scale-in">
                  <CheckCircle size={14} />
                  <span>{t('photo_ready_msg')}</span>
                </div>
              )}

              {(stage === 'rejected' || stage === 'error') && (
                <div className="flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded px-3 py-2 animate-scale-in">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errMessage}</span>
                </div>
              )}

              {/* Image type selector */}
              {stage === 'ready' && photo && (
                <div>
                  <p className="text-xs text-ink-muted mb-3">{t('select_image_type')}</p>
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
                        className={`px-3 py-2 rounded border text-xs transition-colors ${imageType === id ? 'border-gold/60 text-gold bg-gold/5' : 'border-border text-ink-muted hover:text-ink hover:border-gold/30'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Review mode selector */}
              {stage === 'ready' && photo && (
                <>
                  <div>
                    <p className="text-xs text-ink-muted mb-3">{t('select_mode')}</p>
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
                            flex items-start gap-3 p-4 rounded-lg border text-left transition-all duration-200
                            ${
                              disabled
                                ? 'opacity-40 cursor-not-allowed border-border'
                                : reviewMode === m.id
                                ? 'border-gold/60 bg-gold/5 shadow-[0_0_16px_rgba(200,162,104,0.12)]'
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
                              className={`text-sm font-medium ${
                                reviewMode === m.id ? 'text-gold' : 'text-ink'
                              }`}
                            >
                              {m.title}
                            </p>
                            <p className="text-xs text-ink-muted mt-0.5">
                              {disabled ? t('mode_pro_guest') : m.desc}
                            </p>
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleReview}
                      className="btn-gold flex-1 px-6 py-3 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light active:scale-[0.98] transition-all duration-200 hover:shadow-[0_0_24px_rgba(200,162,104,0.35)]"
                    >
                      {t('btn_start_review')} {reviewMode === 'pro' ? 'Pro' : 'Flash'} {t('btn_review_suffix')}
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-4 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-ink active:scale-[0.98] transition-all duration-200"
                    >
                      {t('btn_change_photo')}
                    </button>
                  </div>
                </>
              )}

              {/* Error reset */}
              {(stage === 'rejected' || stage === 'error') && (
                <button
                  onClick={handleReset}
                  className="w-full px-6 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-ink active:scale-[0.98] transition-all duration-200"
                >
                  {t('btn_reupload')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
