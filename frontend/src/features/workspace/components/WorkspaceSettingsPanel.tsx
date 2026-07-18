import type { ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { ImageType, ReviewModel } from '@/lib/types';
import type { Translator } from '@/lib/i18n';
import { ImageTypePicker } from './ImageTypePicker';
import { ModePicker } from './ModePicker';
import { ReviewModelPicker } from './ReviewModelPicker';
import { getWorkspaceTaskFlowCopy, reviewModelLabel } from '../workspaceTaskFlow';

interface WorkspaceSettingsPanelProps {
  imageType: ImageType;
  reviewMode: 'flash' | 'pro';
  reviewModel: ReviewModel;
  isGuest: boolean;
  locale: 'zh' | 'en' | 'ja';
  showReviewModel?: boolean;
  remainingQuota: number | null;
  totalQuota: number | null;
  onImageTypeChange: (type: ImageType) => void;
  onReviewModeChange: (mode: 'flash' | 'pro') => void;
  onReviewModelChange: (model: ReviewModel) => void;
  t: Translator;
}

function MobileSetting({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <details className="group overflow-hidden rounded-card border border-border-subtle bg-surface/60">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden">
        <span className="min-w-0">
          <span className="block text-xs font-medium text-ink-muted">{label}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-ink">
            <Check size={13} className="shrink-0 text-sage" aria-hidden="true" />
            <span className="truncate">{value}</span>
          </span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border-subtle p-3">{children}</div>
    </details>
  );
}

function DesktopSetting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface/50 p-4">
      <p className="mb-3 text-xs font-bold text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

export function WorkspaceSettingsPanel({
  imageType,
  reviewMode,
  reviewModel,
  isGuest,
  locale,
  showReviewModel = true,
  remainingQuota,
  totalQuota,
  onImageTypeChange,
  onReviewModeChange,
  onReviewModelChange,
  t,
}: WorkspaceSettingsPanelProps) {
  const copy = getWorkspaceTaskFlowCopy(locale);
  const quotaNote = copy.quotaAvailable(remainingQuota, totalQuota);
  const modeLabel = reviewMode === 'pro' ? 'Pro' : 'Flash';

  return (
    <>
      <div className="space-y-3 lg:hidden">
        <MobileSetting label={t('select_image_type')} value={t(`image_type_${imageType}`)}>
          <ImageTypePicker value={imageType} onChange={onImageTypeChange} variant="compact" t={t} />
        </MobileSetting>

        {showReviewModel && (
          <MobileSetting label={copy.reviewModel} value={reviewModelLabel(reviewModel)}>
            <ReviewModelPicker value={reviewModel} onChange={onReviewModelChange} locale={locale} />
          </MobileSetting>
        )}

        <MobileSetting label={t('select_mode')} value={`${modeLabel} · ${quotaNote}`}>
          <ModePicker value={reviewMode} onChange={onReviewModeChange} isGuest={isGuest} variant="compact" t={t} />
          <p className="mt-3 text-xs leading-5 text-ink-muted">{copy.quotaImpact(reviewMode)} {quotaNote}</p>
        </MobileSetting>
      </div>

      <div className="hidden space-y-4 lg:block">
        <DesktopSetting label={t('select_image_type')}>
          <ImageTypePicker value={imageType} onChange={onImageTypeChange} t={t} />
        </DesktopSetting>

        {showReviewModel && (
          <DesktopSetting label={copy.reviewModel}>
            <ReviewModelPicker value={reviewModel} onChange={onReviewModelChange} locale={locale} />
          </DesktopSetting>
        )}

        <DesktopSetting label={t('select_mode')}>
          <ModePicker value={reviewMode} onChange={onReviewModeChange} isGuest={isGuest} t={t} />
          <p className="mt-3 text-xs leading-5 text-ink-muted">{copy.quotaImpact(reviewMode)} {quotaNote}</p>
        </DesktopSetting>
      </div>
    </>
  );
}
