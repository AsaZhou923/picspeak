import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Download, Heart, History, RotateCcw, Share2, Upload } from 'lucide-react';
import { ReviewGetResponse } from '@/lib/types';
import { type Translator } from '@/lib/i18n';

interface ReviewActionBarProps {
  review: ReviewGetResponse;
  showOwnerActions: boolean;
  showGuestHistoryLink: boolean;
  linkCopied: boolean;
  actionBusy: string | null;
  favoriteCopy: { add: string; remove: string };
  onReplayReview: () => void;
  onFavoriteToggle: () => void;
  onShareLink: () => void;
  onExportSummary: () => void;
  t: Translator;
}

export function ReviewActionBar({
  review,
  showOwnerActions,
  showGuestHistoryLink,
  linkCopied,
  actionBusy,
  favoriteCopy,
  onReplayReview,
  onFavoriteToggle,
  onShareLink,
  onExportSummary,
  t,
}: ReviewActionBarProps) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap gap-2.5">
      <button
        onClick={() => router.push('/workspace')}
        className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
      >
        <Upload size={13} />
        {t('review_btn_upload_next')}
      </button>
      {showOwnerActions && (
        <>
          <button
            onClick={onReplayReview}
            disabled={actionBusy !== null}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors disabled:opacity-60"
          >
            <RotateCcw size={13} />
            {t('review_btn_again')}
          </button>
          {!showGuestHistoryLink && (
            <Link
              href="/account/reviews"
              className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
            >
              <History size={13} />
              {t('review_btn_history_all')}
            </Link>
          )}
          <button
            onClick={onFavoriteToggle}
            disabled={actionBusy !== null}
            className={`flex items-center gap-2 px-4 py-2 border text-sm rounded transition-colors disabled:opacity-60 ${
              review.favorite
                ? 'border-rust/35 bg-rust/10 text-rust hover:bg-rust/15'
                : 'border-border text-ink-muted hover:border-rust/35 hover:text-rust'
            }`}
          >
            <Heart size={13} className={review.favorite ? 'fill-current' : ''} />
            {review.favorite ? favoriteCopy.remove : favoriteCopy.add}
          </button>
          <button
            onClick={onShareLink}
            disabled={actionBusy !== null}
            className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors disabled:opacity-60"
          >
            {linkCopied ? <Check size={13} className="text-sage" /> : <Share2 size={13} />}
            {linkCopied ? t('review_link_copied') : t('review_share_link')}
          </button>
          <button
            onClick={onExportSummary}
            disabled={actionBusy !== null}
            className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors disabled:opacity-60"
          >
            <Download size={13} />
            {t('review_export_summary')}
          </button>
        </>
      )}
    </div>
  );
}
