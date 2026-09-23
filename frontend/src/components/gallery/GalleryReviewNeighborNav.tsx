'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Images } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import type { GalleryNeighborsResponse } from '@/lib/gallery-ux-types';
import { getGalleryNeighbors, sanitizeGalleryBackHref, sanitizeGalleryNeighborQuery } from '@/lib/gallery-scoreboard-api';
import { getGalleryUxCopy } from '@/lib/gallery-ux-copy';

interface GalleryReviewNeighborNavProps {
  reviewId: string;
  locale: Locale;
  token?: string;
  search?: string;
  className?: string;
}

function buildNeighborHref(reviewId: string, backHref: string, search: string): string {
  const params = new URLSearchParams();
  params.set('back', backHref);
  if (search) params.set('gallery_query', search);
  return `/reviews/${reviewId}?${params.toString()}`;
}

export default function GalleryReviewNeighborNav({
  reviewId,
  locale,
  token,
  search = '',
  className = '',
}: GalleryReviewNeighborNavProps) {
  const copy = getGalleryUxCopy(locale);
  const [payload, setPayload] = useState<GalleryNeighborsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const query = useMemo(() => sanitizeGalleryNeighborQuery(search), [search]);
  const backHref = useMemo(() => sanitizeGalleryBackHref(`/gallery?${query.toString()}`), [query]);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setPayload(null);
    getGalleryNeighbors(reviewId, query, backHref, token)
      .then((next) => {
        if (!cancelled) setPayload(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [backHref, query, reviewId, token]);

  if (failed || !payload) return null;

  const payloadBackHref = payload.back_href || backHref;
  const neighborSearch = query.toString();

  return (
    <nav className={`rounded-card border border-border-subtle bg-surface/80 p-3 ${className}`} aria-label="Gallery">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={payloadBackHref} className="inline-flex min-h-10 items-center gap-2 rounded-control px-2 text-sm text-ink-muted hover:text-ink">
          <Images size={15} />
          {copy.backToGallery}
        </Link>
        <div className="flex flex-wrap gap-2">
          {payload.previous ? (
            <Link
              href={buildNeighborHref(payload.previous.review_id, payloadBackHref, neighborSearch)}
              className="ui-action-secondary px-3 py-2 text-xs"
            >
              <ArrowLeft size={13} />
              {copy.previous}
            </Link>
          ) : (
            <span className="inline-flex min-h-10 items-center rounded-control border border-border-subtle px-3 py-2 text-xs text-ink-subtle">
              {copy.unavailable}
            </span>
          )}
          {payload.next && (
            <Link
              href={buildNeighborHref(payload.next.review_id, payloadBackHref, neighborSearch)}
              className="ui-action-secondary px-3 py-2 text-xs"
            >
              {copy.next}
              <ArrowRight size={13} />
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
