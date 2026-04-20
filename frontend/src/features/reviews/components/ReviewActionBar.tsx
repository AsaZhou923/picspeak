import Link from 'next/link';
import { Check, Download, Heart, History, Share2 } from 'lucide-react';
import { ReviewGetResponse } from '@/lib/types';
import { type Translator } from '@/lib/i18n';

interface ReviewActionBarProps {
  review: ReviewGetResponse;
  showOwnerActions: boolean;
  showGuestHistoryLink: boolean;
  linkCopied: boolean;
  actionBusy: string | null;
  favoriteCopy: { add: string; remove: string };
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
  onFavoriteToggle,
  onShareLink,
  onExportSummary,
  t,
}: ReviewActionBarProps) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-border-subtle bg-raised/45 p-2.5">
      {showOwnerActions && (
        <>
          {!showGuestHistoryLink && (
            <Link
              href="/account/reviews"
              className="flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-[13px] text-ink-muted transition-colors hover:border-gold/40 hover:text-gold"
            >
              <History size={13} />
              {t('review_btn_history_all')}
            </Link>
          )}
          <button
            onClick={onFavoriteToggle}
            disabled={actionBusy !== null}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] transition-colors disabled:opacity-60 ${
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
            className="flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-[13px] text-ink-muted transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-60"
          >
            {linkCopied ? <Check size={13} className="text-sage" /> : <Share2 size={13} />}
            {linkCopied ? t('review_link_copied') : t('review_share_link')}
          </button>
          <button
            onClick={onExportSummary}
            disabled={actionBusy !== null}
            className="flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-[13px] text-ink-muted transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-60"
          >
            <Download size={13} />
            {t('review_export_summary')}
          </button>
        </>
      )}
    </div>
  );
}
