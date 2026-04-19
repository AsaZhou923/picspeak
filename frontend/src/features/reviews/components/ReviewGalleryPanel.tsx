import Link from 'next/link';
import { BookmarkCheck, BookmarkPlus, LayoutGrid } from 'lucide-react';
import { ReviewGetResponse } from '@/lib/types';
import { type Translator } from '@/lib/i18n';

interface ReviewGalleryPanelProps {
  review: ReviewGetResponse;
  gallerySaved: boolean;
  actionBusy: string | null;
  reviewGalleryCardCopy: { title: string; body: string };
  onGalleryToggle: () => void;
  t: Translator;
}

export function ReviewGalleryPanel({
  review,
  gallerySaved,
  actionBusy,
  reviewGalleryCardCopy,
  onGalleryToggle,
  t,
}: ReviewGalleryPanelProps) {
  void review; // consumed by parent for context; kept in props for future use
  return (
    <section className="relative overflow-hidden rounded-[24px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,113,87,0.14),transparent_36%),rgb(var(--color-surface)/0.76)] px-5 py-5">
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:20px_20px]" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-gold/80">
            <LayoutGrid size={12} />
            {t('review_gallery_label')}
          </p>
          <h2 className="font-display text-2xl text-ink">{reviewGalleryCardCopy.title}</h2>
          <p className="mt-2 text-sm leading-7 text-ink-muted">{reviewGalleryCardCopy.body}</p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 lg:min-w-[172px]">
          <button
            type="button"
            onClick={onGalleryToggle}
            disabled={actionBusy !== null}
            className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium leading-5 whitespace-nowrap text-center transition-colors disabled:opacity-60 ${
              gallerySaved
                ? 'border border-sage/30 bg-sage/10 text-sage hover:bg-sage/15'
                : 'bg-gold text-void hover:bg-gold-light'
            }`}
          >
            {gallerySaved ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
            {gallerySaved ? t('review_gallery_remove') : t('review_gallery_add')}
          </button>
          <Link
            href="/gallery"
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-border-subtle px-5 py-3 text-sm leading-5 whitespace-nowrap text-center text-ink-muted transition-colors hover:border-gold/30 hover:text-gold"
          >
            <LayoutGrid size={14} />
            {t('review_gallery_open')}
          </Link>
        </div>
      </div>
    </section>
  );
}
