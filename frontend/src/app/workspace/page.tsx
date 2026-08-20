'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle } from 'lucide-react';
import Image from 'next/image';
import { createReview } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ApiException, ImageType, ReviewCreateAsyncResponse, ReviewCreateSyncResponse, ReviewModel } from '@/lib/types';
import ImageUploader from '@/components/upload/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { trackProductEvent } from '@/lib/product-analytics';
import { resolveReviewAnalysisType } from '@/lib/retake-coach';
import { getRetakeCoachCopy } from '@/lib/retake-coach-copy';
import { useWorkspaceUsage } from '@/features/workspace/hooks/useWorkspaceUsage';
import { useUploadFlow } from '@/features/workspace/hooks/useUploadFlow';
import { useReplayContext } from '@/features/workspace/hooks/useReplayContext';
import { QuotaModal } from '@/features/workspace/components/QuotaModal';
import { QuotaBanner } from '@/features/workspace/components/QuotaBanner';
import { ReplayBanner } from '@/features/workspace/components/ReplayBanner';
import { RetakeWorkspaceIntro } from '@/features/workspace/components/RetakeWorkspaceIntro';
import { WorkspaceSettingsPanel } from '@/features/workspace/components/WorkspaceSettingsPanel';
import { WorkspaceSubmitPanel } from '@/features/workspace/components/WorkspaceSubmitPanel';
import { WorkspaceTaskShell } from '@/features/workspace/components/WorkspaceTaskShell';
import { getWorkspaceTaskFlowCopy, resolveWorkspaceTaskStep } from '@/features/workspace/workspaceTaskFlow';

function isImageType(value: string | null): value is ImageType {
  return ['default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'].includes(value as string);
}

function retakeTargetCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Retake Target',
      title: '次の撮影目標を引き継ぎました',
      sourceReview: 'Source review',
      sourcePrompt: 'Prompt example',
      sourceContent: 'Content source',
      dimension: 'Focus',
      coachTitle: 'GPT-5.6 Retake Coach',
      originalLabel: '元の写真',
      retakeLabel: '再撮影',
      uploadHint: '新しい写真をアップロードすると、この目標と流入元の文脈を保ったまま講評できます。',
    };
  }
  if (locale === 'en') {
    return {
      label: 'Retake Target',
      title: 'Next-shoot target carried over',
      sourceReview: 'Source review',
      sourcePrompt: 'Prompt example',
      sourceContent: 'Content source',
      dimension: 'Focus',
      coachTitle: 'GPT-5.6 Retake Coach',
      originalLabel: 'Original',
      retakeLabel: 'Retake',
      uploadHint: 'Upload a new photo and PicSpeak will keep this goal and source context attached to the critique.',
    };
  }
  return {
    label: '复拍目标',
    title: '已带入下一次拍摄目标',
    sourceReview: '来源点评',
    sourcePrompt: '来源案例',
    sourceContent: '内容来源',
    dimension: '重点维度',
    coachTitle: 'GPT-5.6 重拍教练',
    originalLabel: '原片',
    retakeLabel: '重拍图',
    uploadHint: '上传新照片后，PicSpeak 会保留这次练习目标和来源上下文，方便继续复盘。',
  };
}

function WorkspacePageContent() {
  const router = useRouter();
  const { token, ensureToken } = useAuth();
  const { t, locale } = useI18n();

  const [reviewMode, setReviewMode] = useState<'flash' | 'pro'>('flash');
  const [reviewModel, setReviewModel] = useState<ReviewModel>('qwen');
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
    sourcePhotoError,
    sourcePhotoLoading,
    clearReplay,
    initialMode,
    initialImageType,
    retakeIntent,
    nextShootAction,
    nextShootDimension,
    sourceGenerationId,
    contentEntrypoint,
    contentSlug,
    galleryReviewId,
    promptExampleId,
  } =
    useReplayContext();

  const handleFileSelected = useCallback(
    async (...args: Parameters<typeof _handleFileSelected>) => {
      clearReplay({ preserveSourcePhoto: true });
      return _handleFileSelected(...args);
    },
    [clearReplay, _handleFileSelected]
  );

  const canReplayWithoutUpload = Boolean(sourceReviewId && replayPhotoId && !preview);
  const canUseNextShootTarget = Boolean(nextShootAction && !preview && !canReplayWithoutUpload);
  const targetCopy = retakeTargetCopy(locale);
  const coachCopy = getRetakeCoachCopy(locale);
  const isRetakeCoachFlow = retakeIntent === 'retake_coach' && Boolean(sourceReviewId);
  const canUploadRetake = !isRetakeCoachFlow || Boolean(replayPhotoUrl);
  const selectedReviewModel: ReviewModel = isRetakeCoachFlow ? 'gpt-5.6-luna' : reviewModel;
  const contentSourceLabel = promptExampleId ?? contentSlug ?? galleryReviewId;

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
        review_model: selectedReviewModel,
        image_type: imageType,
        has_source_review_id: Boolean(sourceReviewId),
        retake_intent: retakeIntent,
        next_shoot_action: nextShootAction,
        next_shoot_dimension: nextShootDimension,
        source_generation_id: sourceGenerationId,
        content_entrypoint: contentEntrypoint,
        content_slug: contentSlug,
        gallery_review_id: galleryReviewId,
        prompt_example_id: promptExampleId,
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
      const idempotencyKey = `${activePhotoId}-${reviewMode}-${selectedReviewModel}-${Date.now()}`;
      const result = await createReview(
        {
          photo_id: activePhotoId,
          mode: reviewMode,
          review_model: selectedReviewModel,
          async: true,
          idempotency_key: idempotencyKey,
          locale,
          image_type: imageType,
          ...(sourceReviewId ? { source_review_id: sourceReviewId } : {}),
          analysis_type: resolveReviewAnalysisType(sourceReviewId, Boolean(photo)),
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
            review_model: selectedReviewModel,
            image_type: imageType,
            photo_id: activePhotoId,
            task_id: asyncResult.task_id,
            async: true,
            has_source_review_id: Boolean(sourceReviewId),
            retake_intent: retakeIntent,
            next_shoot_action: nextShootAction,
            next_shoot_dimension: nextShootDimension,
            source_generation_id: sourceGenerationId,
            content_entrypoint: contentEntrypoint,
            content_slug: contentSlug,
            gallery_review_id: galleryReviewId,
            prompt_example_id: promptExampleId,
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
            review_model: selectedReviewModel,
            image_type: imageType,
            photo_id: activePhotoId,
            review_id: syncResult.review_id,
            async: false,
            has_source_review_id: Boolean(sourceReviewId),
            retake_intent: retakeIntent,
            next_shoot_action: nextShootAction,
            next_shoot_dimension: nextShootDimension,
            source_generation_id: sourceGenerationId,
            content_entrypoint: contentEntrypoint,
            content_slug: contentSlug,
            gallery_review_id: galleryReviewId,
            prompt_example_id: promptExampleId,
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
  }, [photo, replayPhotoId, reviewMode, selectedReviewModel, locale, imageType, sourceReviewId, retakeIntent, nextShootAction, nextShootDimension, sourceGenerationId, contentEntrypoint, contentSlug, galleryReviewId, promptExampleId, ensureToken, router, t, token, usage, remainingQuota, setStage, setErrMessage]);

  const flowCopy = getWorkspaceTaskFlowCopy(locale);
  const hasReadyPhoto = Boolean(photo && (stage === 'ready' || stage === 'reviewing'));
  const hasSubmitError = Boolean(stage === 'ready' && errMessage);
  const activeTaskStep = resolveWorkspaceTaskStep(stage, hasReadyPhoto, hasSubmitError);
  const completedTaskSteps =
    activeTaskStep === 'submit'
      ? (['image', 'settings'] as const)
      : hasReadyPhoto
        ? (['image'] as const)
        : [];

  return (
    <div className="min-h-screen">
      {showQuotaModal && (
        <QuotaModal plan={currentPlan} onClose={() => setShowQuotaModal(false)} t={t} />
      )}
      <div className="mx-auto max-w-workspace px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <div className="mb-8 max-w-task animate-fade-in sm:mb-10">
          <p className="ui-eyebrow mb-3">
            {isRetakeCoachFlow ? coachCopy.label : t('workspace_label')}
          </p>
          <h1 className="text-balance font-display text-4xl text-ink sm:text-5xl">
            {isRetakeCoachFlow ? coachCopy.workspaceTitle : t('workspace_headline')}
          </h1>
          {isRetakeCoachFlow && (
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted">{coachCopy.workspaceBody}</p>
          )}
          <QuotaBanner
            usage={usage}
            usageError={usageError}
            remainingQuota={remainingQuota}
            totalQuota={totalQuota}
            reviewMode={reviewMode}
            t={t}
          />
        </div>

        <div className="animate-slide-up anim-fill-both delay-100">
          {!preview ? (
            <div className="space-y-6">
              {isRetakeCoachFlow && (
                <RetakeWorkspaceIntro
                  copy={coachCopy}
                  sourcePhotoUrl={replayPhotoUrl}
                  sourceLoading={sourcePhotoLoading}
                  sourceError={sourcePhotoError}
                />
              )}
              {canReplayWithoutUpload && (
                <ReplayBanner
                  replayPhotoUrl={replayPhotoUrl}
                  imageType={imageType}
                  reviewMode={reviewMode}
                  reviewModel={reviewModel}
                  isGuest={isGuest}
                  stage={stage}
                  errorMessage={errMessage}
                  remainingQuota={remainingQuota}
                  totalQuota={totalQuota}
                  onImageTypeChange={setImageType}
                  onReviewModeChange={setReviewMode}
                  onReviewModelChange={setReviewModel}
                  onStartReview={handleReview}
                  onUploadNew={() => { clearReplay({ preserveSourcePhoto: true }); setStage('idle'); }}
                  t={t}
                />
              )}
              {canUseNextShootTarget && (
                <section className="ui-panel max-w-task p-5 animate-fade-in sm:p-6">
                  <p className="ui-eyebrow mb-2">{targetCopy.label}</p>
                  <h2 className="font-display text-2xl text-ink sm:text-3xl">{targetCopy.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-ink">{nextShootAction}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-ink-subtle">
                    {nextShootDimension && (
                      <span className="rounded-control border border-border-subtle bg-raised/60 px-3 py-1">
                        {targetCopy.dimension}: {nextShootDimension}
                      </span>
                    )}
                    {sourceReviewId && (
                      <span className="rounded-control border border-border-subtle bg-raised/60 px-3 py-1">
                        {targetCopy.sourceReview}: {sourceReviewId}
                      </span>
                    )}
                    {promptExampleId && (
                      <span className="rounded-control border border-border-subtle bg-raised/60 px-3 py-1">
                        {targetCopy.sourcePrompt}: {promptExampleId}
                      </span>
                    )}
                    {!promptExampleId && contentSourceLabel && (
                      <span className="rounded-control border border-border-subtle bg-raised/60 px-3 py-1">
                        {targetCopy.sourceContent}: {contentSourceLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-ink-muted">{targetCopy.uploadHint}</p>
                </section>
              )}
              {canUploadRetake && !canReplayWithoutUpload && (
                <WorkspaceTaskShell
                  copy={flowCopy}
                  activeStep="image"
                  image={
                    <div className="space-y-4">
                      {stage === 'error' && errMessage && (
                        <div role="alert" className="flex items-start gap-2 rounded-control border border-rust/25 bg-rust/10 px-3 py-2.5 text-sm text-rust animate-scale-in">
                          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                          <span>{errMessage}</span>
                        </div>
                      )}
                      <ImageUploader
                        onFileSelected={handleFileSelected}
                        disabled={stage !== 'idle' && stage !== 'error'}
                      />
                    </div>
                  }
                />
              )}
            </div>
          ) : (
            <WorkspaceTaskShell
              copy={flowCopy}
              activeStep={activeTaskStep}
              completedSteps={[...completedTaskSteps]}
              image={
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-card border border-border bg-raised">
                    {sourceReviewId && replayPhotoUrl ? (
                      <div className="grid grid-cols-2 gap-px bg-border-subtle">
                        <div className="bg-raised p-2 sm:p-3">
                          <p className="mb-2 text-xs font-medium text-ink-subtle">{targetCopy.originalLabel}</p>
                          <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-surface">
                            <Image src={replayPhotoUrl} alt={targetCopy.originalLabel} fill className="object-contain" unoptimized />
                          </div>
                        </div>
                        <div className="bg-raised p-2 sm:p-3">
                          <p className="mb-2 text-xs font-medium text-ink-subtle">{targetCopy.retakeLabel}</p>
                          <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-surface">
                            <Image src={preview} alt={targetCopy.retakeLabel} fill className="object-contain" unoptimized />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="photo-frame group relative aspect-[4/3] bg-raised">
                        <Image
                          src={preview}
                          alt="Preview"
                          fill
                          className="object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                          unoptimized
                        />
                      </div>
                    )}

                    {stage === 'uploading' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-void/80 px-6 text-center backdrop-blur-sm animate-fade-in">
                        <LoadingSpinner size={32} />
                        <div className="flex w-full max-w-52 flex-col items-center gap-2">
                          <p className="text-sm font-bold text-gold">{t('stage_uploading')} {uploadProgress}%</p>
                          <div className="h-1.5 w-full overflow-hidden rounded-full border border-white/10 bg-white/10">
                            <div
                              className="h-full rounded-full bg-action transition-[width] duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {stage === 'confirming' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void/80 px-6 text-center backdrop-blur-sm animate-fade-in">
                        <LoadingSpinner size={32} label={t('stage_confirming')} />
                      </div>
                    )}
                  </div>

                  {selectedFile && (
                    <div className="flex items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface/50 px-3 py-2 font-mono text-[11px] text-ink-subtle">
                      <span className="min-w-0 truncate">{selectedFile.name}</span>
                      <span className="shrink-0 font-bold text-ink-muted">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  )}

                  {hasReadyPhoto && (
                    <div role="status" className="flex items-start gap-2 rounded-control border border-sage/25 bg-sage/10 px-3 py-2.5 text-sm text-sage animate-scale-in">
                      <CheckCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span className="font-medium">{t('photo_ready_msg')}</span>
                    </div>
                  )}

                  {(stage === 'rejected' || stage === 'error') && (
                    <div role="alert" className="flex items-start gap-2 rounded-control border border-rust/25 bg-rust/10 px-3 py-2.5 text-sm text-rust animate-scale-in">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{errMessage}</span>
                    </div>
                  )}

                  {(stage === 'rejected' || stage === 'error') && (
                    <button type="button" onClick={handleReset} className="ui-action-secondary min-h-12 w-full px-6 py-3 text-sm">
                      {t('btn_reupload')}
                    </button>
                  )}
                </div>
              }
              settings={
                stage === 'ready' && photo ? (
                  <WorkspaceSettingsPanel
                    imageType={imageType}
                    reviewMode={reviewMode}
                    reviewModel={reviewModel}
                    isGuest={isGuest}
                    locale={locale}
                    showReviewModel={!isRetakeCoachFlow}
                    remainingQuota={remainingQuota}
                    totalQuota={totalQuota}
                    onImageTypeChange={setImageType}
                    onReviewModeChange={setReviewMode}
                    onReviewModelChange={setReviewModel}
                    t={t}
                  />
                ) : undefined
              }
              submit={
                photo && (stage === 'ready' || stage === 'reviewing') ? (
                  <WorkspaceSubmitPanel
                    imageType={imageType}
                    reviewMode={reviewMode}
                    reviewModel={selectedReviewModel}
                    locale={locale}
                    remainingQuota={remainingQuota}
                    totalQuota={totalQuota}
                    isSubmitting={stage === 'reviewing'}
                    errorMessage={hasSubmitError ? errMessage : undefined}
                    secondaryLabel={t('btn_change_photo')}
                    onSubmit={handleReview}
                    onSecondary={handleReset}
                    t={t}
                  />
                ) : undefined
              }
            />
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
    <Suspense fallback={<div className="min-h-screen" />}>
      <WorkspacePageContent />
    </Suspense>
  );
}
