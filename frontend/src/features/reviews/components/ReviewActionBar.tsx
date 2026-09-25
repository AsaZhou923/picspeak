import Link from 'next/link';
import { Download, Heart, History, Images, Loader2, Share2 } from 'lucide-react';
import { memo } from 'react';
import { SignInButton } from '@clerk/nextjs';
import { ReviewGetResponse } from '@/lib/types';
import { type Translator } from '@/lib/i18n';
import { getGalleryState, getGalleryStateCopy } from '@/features/reviews/reviewVisibility';

interface ReviewActionBarProps {
  review: ReviewGetResponse;
  showOwnerActions: boolean;
  showGuestHistoryLink: boolean;
  locale: string;
  actionBusy: string | null;
  favoriteCopy: { add: string; remove: string };
  exportLabel?: string;
  shareLabel: string;
  onGalleryToggle: () => void;
  onFavoriteToggle: () => void;
  onShareLink: () => void;
  onExportSummary: () => void;
  t: Translator;
}

export const ReviewActionBar = memo(function ReviewActionBar({
  review,
  showOwnerActions,
  showGuestHistoryLink,
  locale,
  actionBusy,
  favoriteCopy,
  exportLabel,
  shareLabel,
  onGalleryToggle,
  onFavoriteToggle,
  onShareLink,
  onExportSummary,
  t,
}: ReviewActionBarProps) {
  const galleryState = getGalleryState(review);
  const galleryCopy = getGalleryStateCopy(locale);
  return (
    <div id="review-actions" className="scroll-mt-28 space-y-3">
      {showOwnerActions && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {showGuestHistoryLink ? (
              <SignInButton mode="modal" fallbackRedirectUrl={`/reviews/${review.review_id}`}>
                <button type="button" className="ui-action-primary px-4 py-2.5 text-sm">
                  <Images size={17} aria-hidden="true" />{galleryCopy.signIn}
                </button>
              </SignInButton>
            ) : (
            <button
              type="button"
              onClick={onGalleryToggle}
              disabled={actionBusy !== null}
              className={`${galleryState === 'not_added' ? 'ui-action-primary' : 'ui-action-secondary'} px-4 py-2.5 text-sm disabled:opacity-60`}
            >
              {actionBusy === 'gallery' ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Images size={17} aria-hidden="true" />}
              {actionBusy === 'gallery'
                ? (galleryState === 'not_added' ? galleryCopy.adding : galleryCopy.removing)
                : galleryState === 'not_added' ? galleryCopy.add : galleryState === 'public' ? galleryCopy.remove : galleryCopy.withdraw}
            </button>
            )}
            <span className={`text-sm ${galleryState === 'public' ? 'text-sage' : galleryState === 'rejected' ? 'text-rust' : 'text-ink-muted'}`}>
              {galleryCopy.labels[galleryState]}
            </span>
          </div>
          {galleryState === 'rejected' && review.gallery_rejected_reason && (
            <p className="text-sm text-rust">{review.gallery_rejected_reason}</p>
          )}
          <div className="flex flex-wrap gap-2">
          {!showGuestHistoryLink && (
            <Link
              href="/account/reviews"
              className="ui-action-secondary px-3.5 py-2 text-sm"
            >
              <History size={15} aria-hidden="true" />
              {t('review_btn_history_all')}
            </Link>
          )}
          <button
            type="button"
            onClick={onFavoriteToggle}
            disabled={actionBusy !== null}
            aria-pressed={Boolean(review.favorite)}
            className={`ui-action-secondary px-3.5 py-2 text-sm disabled:opacity-60 ${
              review.favorite
                ? 'border-rust/35 bg-rust/10 text-rust hover:bg-rust/15'
                : 'border-border text-ink-muted hover:border-rust/35 hover:text-rust'
            }`}
          >
            <Heart size={15} aria-hidden="true" className={review.favorite ? 'fill-current' : ''} />
            {review.favorite ? favoriteCopy.remove : favoriteCopy.add}
          </button>
          <button
            type="button"
            onClick={onShareLink}
            disabled={actionBusy !== null}
            className="ui-action-secondary px-3.5 py-2 text-sm disabled:opacity-60"
          >
            <Share2 size={15} aria-hidden="true" />
            {shareLabel}
          </button>
          <button
            type="button"
            onClick={onExportSummary}
            disabled={actionBusy !== null}
            className="ui-action-secondary px-3.5 py-2 text-sm disabled:opacity-60"
          >
            <Download size={15} aria-hidden="true" />
            {exportLabel ?? t('review_export_summary')}
          </button>
          </div>
        </>
      )}
    </div>
  );
});
