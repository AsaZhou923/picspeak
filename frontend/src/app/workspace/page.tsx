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
  buildGoogleOAuthUrl,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { planLabel, planColor } from '@/lib/auth-context';
import {
  ApiException,
  PhotoCreateResponse,
  UsageResponse,
  ReviewCreateAsyncResponse,
  ReviewCreateSyncResponse,
} from '@/lib/types';
import ImageUploader from '@/components/upload/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';
import { useI18n } from '@/lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage =
  | 'idle'
  | 'uploading'
  | 'confirming'
  | 'ready'
  | 'rejected'
  | 'reviewing'
  | 'error';

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const router = useRouter();
  const { userInfo, ensureToken, isLoading: authLoading } = useAuth();
  const { t, locale } = useI18n();

  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageError, setUsageError] = useState(false);
  const isGuest = (userInfo?.plan ?? usage?.plan) === 'guest';

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [stage, setStage] = useState<Stage>('idle');
  const [photo, setPhoto] = useState<PhotoCreateResponse | null>(null);
  const [errMessage, setErrMessage] = useState('');

  const [reviewMode, setReviewMode] = useState<'flash' | 'pro'>('flash');
  const [showQuotaModal, setShowQuotaModal] = useState(false);

  // ── Fetch usage ────────────────────────────────────────────────────────────

  const fetchUsage = useCallback(async () => {
    try {
      const token = await ensureToken();
      const data = await getUsage(token);
      setUsage(data);
    } catch {
      setUsageError(true);
    }
  }, [ensureToken]);

  useEffect(() => {
    if (!authLoading) fetchUsage();
  }, [authLoading, fetchUsage]);

  useEffect(() => {
    if (isGuest && reviewMode === 'pro') {
      setReviewMode('flash');
    }
  }, [isGuest, reviewMode]);

  // ── File selected → upload flow ────────────────────────────────────────────

  const handleFileSelected = useCallback(
    async (file: File, dataUrl: string) => {
      setSelectedFile(file);
      setPreview(dataUrl);
      setStage('uploading');
      setUploadProgress(0);
      setErrMessage('');

      // Decode image dimensions from the preview dataUrl
      let imgWidth = 0;
      let imgHeight = 0;
      try {
        const bmp = await createImageBitmap(file);
        imgWidth = bmp.width;
        imgHeight = bmp.height;
        bmp.close();
      } catch {
        // non-critical
      }

      try {
        const token = await ensureToken();

        // 1. Presign
        const presign = await createPresign(
          {
            filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
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
          {},
          extractClientMeta(file, { width: imgWidth, height: imgHeight }),
          token
        );

        setPhoto(photoData);

        if (photoData.status === 'READY') {
          // Persist photo_url so the review result page can display the photo
          try {
            const cache = JSON.parse(localStorage.getItem('ps_photo_urls') || '{}');
            cache[photoData.photo_id] = photoData.photo_url;
            // Keep only the last 20 entries to avoid unbounded growth
            const keys = Object.keys(cache);
            if (keys.length > 20) delete cache[keys[0]];
            localStorage.setItem('ps_photo_urls', JSON.stringify(cache));
          } catch { /* non-critical */ }
          setStage('ready');
          fetchUsage();
        } else if (photoData.status === 'REJECTED') {
          setStage('rejected');
          setErrMessage(t('status_rejected'));
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
    if (usage && usage.quota.remaining <= 0) {
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
        },
        token
      );

      if ('task_id' in result) {
        const async_result = result as ReviewCreateAsyncResponse;
        router.push(`/tasks/${async_result.task_id}`);
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
  }, [photo, reviewMode, locale, ensureToken, router, t]);

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
                <a
                  href={buildGoogleOAuthUrl()}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
                >
                  {t('quota_modal_upgrade')}
                  <ArrowRight size={13} />
                </a>
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
                  {usage.quota.remaining} / {usage.quota.daily_total}
                </span>
                {t('usage_times')}
              </div>
              {usage.quota.remaining === 0 && (
                <Badge variant="rust">{t('usage_quota_exhausted')}</Badge>
              )}
            </div>
          )}

          {usageError && (
            <p className="text-xs text-ink-subtle mt-2">{t('usage_error')}</p>
          )}
        </div>

        {/* Upload zone or preview */}
        <div className="animate-slide-up">
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
                  <div className="absolute inset-0 bg-void/70 flex flex-col items-center justify-center gap-3">
                    <LoadingSpinner size={32} />
                    <p className="text-sm text-ink-muted">{t('stage_uploading')} {uploadProgress}%</p>
                    <div className="w-40 h-0.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold rounded-full transition-all duration-300"
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
                <div className="flex items-center gap-2 text-sage text-sm">
                  <CheckCircle size={14} />
                  <span>{t('status_ready')}</span>
                </div>
              )}

              {(stage === 'rejected' || stage === 'error') && (
                <div className="flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded px-3 py-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errMessage}</span>
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
                            flex items-start gap-3 p-4 rounded-lg border text-left transition-all
                            ${
                              disabled
                                ? 'opacity-45 cursor-not-allowed border-border'
                                : reviewMode === m.id
                                ? 'border-gold/60 bg-gold/5'
                                : 'border-border hover:border-border-subtle'
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
                      className="flex-1 px-6 py-3 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
                    >
                      {t('btn_start_review')} {reviewMode === 'pro' ? 'Pro' : 'Flash'} {t('btn_review_suffix')}
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-4 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 transition-colors"
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
                  className="w-full px-6 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 transition-colors"
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
