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
    <section className="ui-feature-panel mt-8 px-4 py-5 sm:px-5" aria-labelledby="gallery-scoreboard-title">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <p className="ui-eyebrow inline-flex items-center gap-2">
            <Trophy size={14} />
            Scoreboard
          </p>
          <h2 id="gallery-scoreboard-title" className="mt-2 font-display text-3xl text-ink">
            {copy.scoreboardTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            {payload?.ranking_mode === 'collection' ? copy.collectionBody : copy.scoreboardBody}
          </p>
          {payload && (
            <p className="mt-2 text-xs leading-5 text-ink-subtle">
              {copy.asOf}: {new Date(payload.as_of).toLocaleString(locale)}
              {' · '}
              {payload.eligible_photo_count} {copy.photos} / {payload.eligible_author_count} {copy.authors}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {([7, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={windowDays === days}
              onClick={() => setWindowDays(days)}
              className={`min-h-10 rounded-control border px-3 py-2 text-xs transition-colors ${
                windowDays === days ? 'border-gold/40 bg-gold/15 text-gold' : 'border-border-subtle text-ink-muted hover:text-ink'
              }`}
            >
              {days === 7 ? copy.sevenDays : copy.thirtyDays}
            </button>
          ))}
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {items.map((item, index) => (
            <Link
              key={item.review_id}
              href={buildReviewHref(item.review_id)}
              onClick={() => onOpenReview(item.review_id)}
              className="group rounded-card border border-border-subtle bg-surface/75 p-3 transition-colors hover:border-gold/30 hover:bg-gold/5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-2xl text-gold">{index + 1}</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-rust/25 bg-rust/10 px-2 py-1 text-xs text-rust">
                  <Heart size={12} className={item.like_count > 0 ? 'fill-current' : ''} />
                  {item.like_count}
                </span>
              </div>
              <p className="mt-2 truncate text-sm font-medium text-ink">{item.owner_username}</p>
              <p className="mt-1 text-xs text-ink-subtle">
                {new Date(item.gallery_added_at).toLocaleDateString(locale)}
              </p>
            </Link>
          ))}
        </div>
      )}

      {payload && (
        <Link href={buildScoreboardGalleryHref(payload)} className="ui-action-secondary mt-5 inline-flex px-4 py-2 text-sm">
          {copy.viewMore}
          <ArrowRight size={14} />
        </Link>
      )}
    </section>
  );
}
