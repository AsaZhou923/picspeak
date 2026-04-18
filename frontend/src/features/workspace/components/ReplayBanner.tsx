import Image from 'next/image';
import { ImageType } from '@/lib/types';
import { Stage } from '../hooks/useUploadFlow';
import { ImageTypePicker } from './ImageTypePicker';
import { ModePicker } from './ModePicker';

interface ReplayBannerProps {
  replayPhotoUrl: string | null;
  imageType: ImageType;
  reviewMode: 'flash' | 'pro';
  isGuest: boolean;
  stage: Stage;
  promoModeBadge: string;
  onImageTypeChange: (type: ImageType) => void;
  onReviewModeChange: (mode: 'flash' | 'pro') => void;
  onStartReview: () => void;
  onUploadNew: () => void;
  t: (key: string) => string;
}

export function ReplayBanner({
  replayPhotoUrl,
  imageType,
  reviewMode,
  isGuest,
  stage,
  promoModeBadge,
  onImageTypeChange,
  onReviewModeChange,
  onStartReview,
  onUploadNew,
  t,
}: ReplayBannerProps) {
  return (
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
            <ImageTypePicker value={imageType} onChange={onImageTypeChange} variant="compact" t={t} />
          </div>

          <div>
            <p className="mb-3 text-xs text-ink-muted">{t('select_mode')}</p>
            <ModePicker
              value={reviewMode}
              onChange={onReviewModeChange}
              isGuest={isGuest}
              promoModeBadge={promoModeBadge}
              variant="compact"
              t={t}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onStartReview}
              disabled={stage === 'reviewing'}
              className="btn-gold flex-1 rounded bg-gold px-6 py-3 text-sm font-medium text-void transition-all duration-200 hover:bg-gold-light hover:shadow-[0_0_24px_rgba(200,162,104,0.35)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              {t('btn_start_review')} {reviewMode === 'pro' ? 'Pro' : 'Flash'} {t('btn_review_suffix')}
            </button>
            <button
              type="button"
              onClick={onUploadNew}
              className="rounded border border-border px-4 py-3 text-sm text-ink-muted transition-all duration-200 hover:border-gold/40 hover:text-ink active:scale-[0.98]"
            >
              {t('replay_upload_new')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
