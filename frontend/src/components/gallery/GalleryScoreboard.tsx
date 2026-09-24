'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Heart, Trophy } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import type { GalleryScoreboardResponse, ImageType } from '@/lib/gallery-ux-types';
import { buildScoreboardGalleryHref, getGalleryScoreboard } from '@/lib/gallery-scoreboard-api';
import { getGalleryUxCopy } from '@/lib/gallery-ux-copy';

interface GalleryScoreboardProps {
  locale: Locale;
  imageType: ImageType | '';
  token?: string;
  onOpenReview: (reviewId: string) => void;
  buildReviewHref: (reviewId: string) => string;
}

export default function GalleryScoreboard({
  locale,
  imageType,
  token,
  onOpenReview,
  buildReviewHref,
}: GalleryScoreboardProps) {
  const copy = getGalleryUxCopy(locale);
  const [windowDays, setWindowDays] = useState<7 | 30>(30);
  const [payload, setPayload] = useState<GalleryScoreboardResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    getGalleryScoreboard({ window_days: windowDays, image_type: imageType }, token)
      .then((next) => {
        if (!cancelled) setPayload(next);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [imageType, token, windowDays]);

  const items = payload?.items ?? [];
  if (error) return null;

  return (
    <section className="mt-6 rounded-card border border-border-subtle bg-surface/70 px-3 py-3 shadow-level-1 sm:px-4" aria-labelledby="gallery-scoreboard-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="ui-eyebrow inline-flex items-center gap-2 text-[10px]">
              <Trophy size={12} />
              Scoreboard
            </p>
            {payload && (
              <p className="text-[11px] leading-5 text-ink-subtle">
                {copy.asOf}: {new Date(payload.as_of).toLocaleString(locale)}
                {' · '}
                {payload.eligible_photo_count} {copy.photos} / {payload.eligible_author_count} {copy.authors}
              </p>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="gallery-scoreboard-title" className="text-base font-semibold leading-6 text-ink">
              {copy.scoreboardTitle}
            </h2>
            <p className="text-xs leading-5 text-ink-muted">
              {payload?.ranking_mode === 'collection' ? copy.collectionBody : copy.scoreboardBody}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex rounded-control border border-border-subtle bg-void/35 p-1">
            {([7, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={windowDays === days}
                onClick={() => setWindowDays(days)}
                className={`min-h-8 rounded-[10px] px-3 text-xs transition-colors ${
                  windowDays === days ? 'bg-action text-action-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {days === 7 ? copy.sevenDays : copy.thirtyDays}
              </button>
            ))}
          </div>
          {payload && (
            <Link href={buildScoreboardGalleryHref(payload)} className="inline-flex min-h-8 items-center gap-1 rounded-control border border-border-subtle px-3 text-xs text-ink-muted transition-colors hover:border-gold/30 hover:text-ink">
              {copy.viewMore}
              <ArrowRight size={13} />
            </Link>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {items.map((item, index) => (
            <Link
              key={item.review_id}
              href={buildReviewHref(item.review_id)}
              onClick={() => onOpenReview(item.review_id)}
              className="group flex min-h-12 items-center gap-3 rounded-control border border-border-subtle bg-void/25 px-3 py-2 transition-colors hover:border-gold/30 hover:bg-gold/5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-xs font-semibold text-gold">
                {payload?.ranking_mode === 'popular' ? index + 1 : '•'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{item.owner_username}</p>
                <p className="text-[11px] leading-4 text-ink-subtle">
                  {new Date(item.gallery_added_at).toLocaleDateString(locale)}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rust/20 bg-rust/10 px-2 py-1 text-xs text-rust">
                <Heart size={12} className={item.like_count > 0 ? 'fill-current' : ''} />
                {item.like_count}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
