'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle } from 'lucide-react';
import Image from 'next/image';
import { createReview } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ApiException, ImageType, ReviewCreateAsyncResponse, ReviewCreateSyncResponse } from '@/lib/types';
import ImageUploader from '@/components/upload/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { trackProductEvent } from '@/lib/product-analytics';
import { useWorkspaceUsage } from '@/features/workspace/hooks/useWorkspaceUsage';
import { useUploadFlow } from '@/features/workspace/hooks/useUploadFlow';
import { useReplayContext } from '@/features/workspace/hooks/useReplayContext';
import { QuotaModal } from '@/features/workspace/components/QuotaModal';
import { QuotaBanner } from '@/features/workspace/components/QuotaBanner';
import { ReplayBanner } from '@/features/workspace/components/ReplayBanner';
import { ModePicker } from '@/features/workspace/components/ModePicker';
import { ImageTypePicker } from '@/features/workspace/components/ImageTypePicker';

function isImageType(value: string | null): value is ImageType {
  return ['default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'].includes(value as string);
}

function retakeTargetCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Retake Target',
      title: '次の撮影目標を引き継ぎました',
      sourceReview: 'Source review',
      dimension: 'Focus',
      uploadHint: '新しい写真をアップロードすると、この目標と元の講評をつないで比較できます。',
    };
  }
  if (locale === 'en') {
    return {
      label: 'Retake Target',
      title: 'Next-shoot target carried over',
      sourceReview: 'Source review',
      dimension: 'Focus',
      uploadHint: 'Upload a new photo and PicSpeak will connect this goal back to the source critique for comparison.',
    };
  }
  return {
    label: '复拍目标',
    title: '已带入下一次拍摄目标',
    sourceReview: '来源点评',
    dimension: '重点维度',
    uploadHint: '上传新照片后，PicSpeak 会把这次目标和来源点评关联起来，方便比较进步。',
  };
}

function WorkspacePageContent() {
  const router = useRouter();
  const { token, ensureToken } = useAuth();
  const { t, locale } = useI18n();

  const [reviewMode, setReviewMode] = useState<'flash' | 'pro'>('flash');
  const [imageType, setImageType] = useState<ImageType>('default');
  const [showQuotaModal, setShowQuotaModal] = useState(false);

  const { usage, usageError, fetchUsage, currentPlan, isGuest, remainingQuota, totalQuota } =
    useWorkspaceUsage(reviewMode);

  const {
    selectedFile,
    preview,
    uploadProgress,
    stage,
    setStage,
    photo,
    errMessage,
    setErrMessage,
    handleFileSelected: _handleFileSelected,
    handleReset,
  } = useUploadFlow({ fetchUsage });

  const {
    sourceReviewId,
    replayPhotoId,
    replayPhotoUrl,
    clearReplay,
    initialMode,
    initialImageType,
    retakeIntent,
    nextShootAction,
    nextShootDimension,
    sourceGenerationId,
  } =
    useReplayContext({ preview });

  const handleFileSelected = useCallback(
    async (...args: Parameters<typeof _handleFileSelected>) => {
      clearReplay();
      return _handleFileSelected(...args);
    },
    [clearReplay, _handleFileSelected]
  );

  const canReplayWithoutUpload = Boolean(sourceReviewId && replayPhotoId && !preview);
  const canUseNextShootTarget = Boolean(sourceReviewId && nextShootAction && !preview && !canReplayWithoutUpload);
  const targetCopy = retakeTargetCopy(locale);

  useEffect(() => {
    if (isGuest && reviewMode === 'pro') setReviewMode('flash');
  }, [isGuest, reviewMode]);

  useEffect(() => {
    if (initialMode === 'flash' || initialMode === 'pro') setReviewMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (isImageType(initialImageType)) setImageType(initialImageType);
  }, [initialImageType]);

  const handleReview = useCallback(async () => {
    const activePhotoId = photo?.photo_id ?? replayPhotoId;
    if (!activePhotoId) return;
    void trackProductEvent('start_review_clicked', {
      token: token ?? undefined,
      pagePath: '/workspace',
      locale,
      metadata: {
        review_mode: reviewMode,
        image_type: imageType,
        has_source_review_id: Boolean(sourceReviewId),
        retake_intent: retakeIntent,
        next_shoot_action: nextShootAction,
        next_shoot_dimension: nextShootDimension,
        source_generation_id: sourceGenerationId,
      },
    });
    if (usage && remainingQuota !== null && remainingQuota <= 0) {
      setShowQuotaModal(true);
      return;
    }
    setStage('reviewing');
    setErrMessage('');
    try {
      const tok = await ensureToken();
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
        tok
      );
      if ('task_id' in result) {
        const asyncResult = result as ReviewCreateAsyncResponse;
        void trackProductEvent('review_requested', {
          token: tok ?? undefined,
          pagePath: '/workspace',
          locale,
          metadata: {
            review_mode: reviewMode,
            image_type: imageType,
            photo_id: activePhotoId,
            task_id: asyncResult.task_id,
            async: true,
            has_source_review_id: Boolean(sourceReviewId),
            retake_intent: retakeIntent,
            next_shoot_action: nextShootAction,
            next_shoot_dimension: nextShootDimension,
            source_generation_id: sourceGenerationId,
          },
        });
        router.push(`/tasks/${asyncResult.task_id}?mode=${reviewMode}`);
      } else {
        const syncResult = result as ReviewCreateSyncResponse;
        void trackProductEvent('review_requested', {
          token: tok ?? undefined,
          pagePath: '/workspace',
          locale,
          metadata: {
            review_mode: reviewMode,
            image_type: imageType,
            photo_id: activePhotoId,
            review_id: syncResult.review_id,
            async: false,
            has_source_review_id: Boolean(sourceReviewId),
            retake_intent: retakeIntent,
            next_shoot_action: nextShootAction,
            next_shoot_dimension: nextShootDimension,
            source_generation_id: sourceGenerationId,
          },
        });
        router.push(`/reviews/${syncResult.review_id}`);
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
  }, [photo, replayPhotoId, reviewMode, locale, imageType, sourceReviewId, retakeIntent, nextShootAction, nextShootDimension, sourceGenerationId, ensureToken, router, t, token, usage, remainingQuota, setStage, setErrMessage]);

  return (
    <div className="pt-14 min-h-screen">
      {showQuotaModal && (
        <QuotaModal plan={currentPlan} onClose={() => setShowQuotaModal(false)} t={t} />
      )}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10 animate-fade-in">
          <p className="text-xs text-gold/70 font-mono mb-3 tracking-widest uppercase">
            — {t('workspace_label')}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl mb-4">{t('workspace_headline')}</h1>
          <QuotaBanner
            usage={usage}
            usageError={usageError}
            remainingQuota={remainingQuota}
            totalQuota={totalQuota}
            t={t}
          />
        </div>

        <div className="animate-slide-up anim-fill-both delay-100">
          {!preview ? (
            <div className="space-y-5">
              {canReplayWithoutUpload && (
                <ReplayBanner
                  replayPhotoUrl={replayPhotoUrl}
                  imageType={imageType}
                  reviewMode={reviewMode}
                  isGuest={isGuest}
                  stage={stage}
                  onImageTypeChange={setImageType}
                  onReviewModeChange={setReviewMode}
                  onStartReview={handleReview}
                  onUploadNew={() => { clearReplay(); setStage('idle'); }}
                  t={t}
                />
              )}
              {canUseNextShootTarget && (
                <div className="rounded-[24px] border border-gold/25 bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.16),transparent_34%),rgb(var(--color-surface)/0.82)] p-5 animate-fade-in">
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-gold/80">{targetCopy.label}</p>
                  <h2 className="font-display text-2xl text-ink">{targetCopy.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-ink">{nextShootAction}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-ink-subtle">
                    {nextShootDimension && (
                      <span className="rounded-full border border-border-subtle bg-void/30 px-3 py-1">
                        {targetCopy.dimension}: {nextShootDimension}
                      </span>
                    )}
                    <span className="rounded-full border border-border-subtle bg-void/30 px-3 py-1">
                      {targetCopy.sourceReview}: {sourceReviewId}
                    </span>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-ink-muted">{targetCopy.uploadHint}</p>
                </div>
              )}
              {stage === 'error' && errMessage && (
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
                    <ImageTypePicker value={imageType} onChange={setImageType} t={t} />
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-mono uppercase tracking-[0.2em] text-ink-subtle">{t('select_mode')}</p>
                    <ModePicker
                      value={reviewMode}
                      onChange={setReviewMode}
                      isGuest={isGuest}
                      t={t}
                    />
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
