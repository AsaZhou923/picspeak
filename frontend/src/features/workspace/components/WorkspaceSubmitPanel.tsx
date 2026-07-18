import { AlertCircle, Gauge, Loader2 } from 'lucide-react';
import type { ImageType, ReviewModel } from '@/lib/types';
import type { Translator } from '@/lib/i18n';
import { getWorkspaceTaskFlowCopy, reviewModelLabel } from '../workspaceTaskFlow';

interface WorkspaceSubmitPanelProps {
  imageType: ImageType;
  reviewMode: 'flash' | 'pro';
  reviewModel: ReviewModel;
  locale: 'zh' | 'en' | 'ja';
  remainingQuota: number | null;
  totalQuota: number | null;
  isSubmitting: boolean;
  errorMessage?: string;
  secondaryLabel: string;
  onSubmit: () => void;
  onSecondary: () => void;
  t: Translator;
}

export function WorkspaceSubmitPanel({
  imageType,
  reviewMode,
  reviewModel,
  locale,
  remainingQuota,
  totalQuota,
  isSubmitting,
  errorMessage,
  secondaryLabel,
  onSubmit,
  onSecondary,
  t,
}: WorkspaceSubmitPanelProps) {
  const copy = getWorkspaceTaskFlowCopy(locale);
  const modeLabel = reviewMode === 'pro' ? 'Pro' : 'Flash';

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-border-subtle bg-surface/70 p-4">
        <p className="text-xs font-bold text-ink-muted">{copy.requestSummary}</p>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <div className="min-w-0">
            <dt className="text-ink-subtle">{t('select_image_type')}</dt>
            <dd className="mt-1 truncate font-bold text-ink">{t(`image_type_${imageType}`)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-ink-subtle">{copy.reviewModel}</dt>
            <dd className="mt-1 truncate font-bold text-ink">{reviewModelLabel(reviewModel)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-ink-subtle">{t('select_mode')}</dt>
            <dd className="mt-1 truncate font-bold text-ink">{modeLabel}</dd>
          </div>
        </dl>
      </div>

      <div className="flex items-start gap-2 rounded-control border border-border-subtle bg-surface/50 px-3 py-2.5 text-xs leading-5 text-ink-muted">
        <Gauge size={15} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
        <span>{copy.quotaImpact(reviewMode)} {copy.quotaAvailable(remainingQuota, totalQuota)}</span>
      </div>

      {errorMessage && (
        <div role="alert" className="flex items-start gap-2 rounded-control border border-rust/25 bg-rust/10 px-3 py-2.5 text-sm text-rust">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {isSubmitting && (
        <div role="status" className="flex items-center gap-2 rounded-control border border-gold/25 bg-gold/10 px-3 py-2.5 text-sm text-ink">
          <Loader2 size={16} className="shrink-0 animate-spin text-gold" aria-hidden="true" />
          <span>{t('stage_reviewing')}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="ui-action-primary min-h-12 flex-1 px-6 py-3 text-sm disabled:cursor-wait disabled:opacity-70"
        >
          {isSubmitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {t('btn_start_review')} {modeLabel} {t('btn_review_suffix')}
        </button>
        <button
          type="button"
          onClick={onSecondary}
          disabled={isSubmitting}
          className="ui-action-secondary min-h-12 px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}
