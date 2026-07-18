import Image from 'next/image';
import { ImageType, ReviewModel } from '@/lib/types';
import { Stage } from '../hooks/useUploadFlow';
import { type Translator, useI18n } from '@/lib/i18n';
import { getReplayIntentCopy } from '@/lib/replay-intent-copy';
import { WorkspaceSettingsPanel } from './WorkspaceSettingsPanel';
import { WorkspaceSubmitPanel } from './WorkspaceSubmitPanel';
import { WorkspaceTaskShell } from './WorkspaceTaskShell';
import { getWorkspaceTaskFlowCopy } from '../workspaceTaskFlow';

interface ReplayBannerProps {
  replayPhotoUrl: string | null;
  imageType: ImageType;
  reviewMode: 'flash' | 'pro';
  reviewModel: ReviewModel;
  isGuest: boolean;
  stage: Stage;
  errorMessage: string;
  remainingQuota: number | null;
  totalQuota: number | null;
  onImageTypeChange: (type: ImageType) => void;
  onReviewModeChange: (mode: 'flash' | 'pro') => void;
  onReviewModelChange: (model: ReviewModel) => void;
  onStartReview: () => void;
  onUploadNew: () => void;
  t: Translator;
}

export function ReplayBanner({
  replayPhotoUrl,
  imageType,
  reviewMode,
  reviewModel,
  isGuest,
  stage,
  errorMessage,
  remainingQuota,
  totalQuota,
  onImageTypeChange,
  onReviewModeChange,
  onReviewModelChange,
  onStartReview,
  onUploadNew,
  t,
}: ReplayBannerProps) {
  const { locale } = useI18n();
  const copy = getReplayIntentCopy(locale);
  const flowCopy = getWorkspaceTaskFlowCopy(locale);
  const hasSubmitError = Boolean(stage === 'ready' && errorMessage);
  const activeStep = stage === 'reviewing' || hasSubmitError ? 'submit' : 'settings';

  return (
    <div className="animate-fade-in">
      <WorkspaceTaskShell
        copy={flowCopy}
        activeStep={activeStep}
        completedSteps={activeStep === 'submit' ? ['image', 'settings'] : ['image']}
        image={
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-2xl text-ink">{copy.workspaceTitle}</h2>
              <p className="mt-2 text-sm leading-7 text-ink-muted">{copy.workspaceBody}</p>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-card border border-border bg-raised">
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
                  {copy.currentPhotoLabel}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-control border border-sage/25 bg-sage/10 px-3 py-2 text-xs">
              <span className="font-bold text-sage">{copy.currentPhotoLabel}</span>
              <span className="text-ink-muted">{copy.verificationHint}</span>
            </div>
          </div>
        }
        settings={
          stage !== 'reviewing' ? (
            <WorkspaceSettingsPanel
              imageType={imageType}
              reviewMode={reviewMode}
              reviewModel={reviewModel}
              isGuest={isGuest}
              locale={locale}
              remainingQuota={remainingQuota}
              totalQuota={totalQuota}
              onImageTypeChange={onImageTypeChange}
              onReviewModeChange={onReviewModeChange}
              onReviewModelChange={onReviewModelChange}
              t={t}
            />
          ) : undefined
        }
        submit={
          <WorkspaceSubmitPanel
            imageType={imageType}
            reviewMode={reviewMode}
            reviewModel={reviewModel}
            locale={locale}
            remainingQuota={remainingQuota}
            totalQuota={totalQuota}
            isSubmitting={stage === 'reviewing'}
            errorMessage={hasSubmitError ? errorMessage : undefined}
            secondaryLabel={copy.uploadNewLabel}
            onSubmit={onStartReview}
            onSecondary={onUploadNew}
            t={t}
          />
        }
      />
    </div>
  );
}
