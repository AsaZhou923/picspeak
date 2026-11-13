'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Heart, ImageOff, LayoutGrid } from 'lucide-react';
import { buildGalleryApiUrl } from '@/lib/gallery-scoreboard-api';
import {
  GALLERY_REVIEW_DIMENSIONS,
  buildGalleryReviewHeading,
  buildGalleryReviewWorkspaceHref,
  buildGalleryTypeFilterHref,
  formatGalleryScore,
  getGalleryImageTypeLabel,
  getGalleryReviewArticleCopy,
  getGalleryReviewChromeCopy,
  resolveGalleryReviewContentLocale,
  type PublicGalleryReview,
} from '@/lib/gallery-review-page';
import { useI18n } from '@/lib/i18n';
import { localeToIntlLocale } from '@/lib/locale';
import { markProductAttributionSource, trackProductEvent } from '@/lib/product-analytics';

type Props = {
  review: PublicGalleryReview;
  topicHref?: string | null;
};

function useFreshPhotoUrl(reviewId: string): string | null {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(buildGalleryApiUrl(`/gallery/${encodeURIComponent(reviewId)}`), { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { photo_url?: string | null } | null) => {
        if (!controller.signal.aborted && payload?.photo_url) setPhotoUrl(payload.photo_url);
      })
      .catch(() => {
        // The stable thumbnail already rendered on the server stays in place.
      });
    return () => controller.abort();
  }, [reviewId]);
  return photoUrl;
}

/** Carries the Gallery browsing context (back link, neighbor query) on to the interactive view. */
function useInteractiveReviewHref(reviewId: string): string {
  const [href, setHref] = useState(`/reviews/${reviewId}`);
  useEffect(() => {
    const current = new URLSearchParams(window.location.search);
    const next = new URLSearchParams();
    const back = current.get('back');
    const galleryQuery = current.get('gallery_query');
    if (back && back.startsWith('/gallery')) next.set('back', back);
    if (galleryQuery) next.set('gallery_query', galleryQuery);
    const query = next.toString();
    setHref(query ? `/reviews/${reviewId}?${query}` : `/reviews/${reviewId}`);
  }, [reviewId]);
  return href;
}

function CritiqueSection({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <section className="border-t border-border-subtle pt-6">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-3 whitespace-pre-line text-sm leading-7 text-ink-muted sm:text-base sm:leading-8">{body}</p>
    </section>
  );
}

export default function PublicGalleryReviewView({ review, topicHref }: Props) {
  const { locale } = useI18n();
  const chrome = getGalleryReviewChromeCopy(locale);
  const contentLocale = resolveGalleryReviewContentLocale(review);
  const article = getGalleryReviewArticleCopy(contentLocale);
  const contentTypeLabel = article.imageTypes[review.image_type as keyof typeof article.imageTypes] ?? article.imageTypes.default;
  const chromeTypeLabel = getGalleryImageTypeLabel(locale, review.image_type);
  const freshPhotoUrl = useFreshPhotoUrl(review.review_id);
  const interactiveHref = useInteractiveReviewHref(review.review_id);
  const imageSrc = freshPhotoUrl ?? review.photo_thumbnail_url;
  const workspaceHref = buildGalleryReviewWorkspaceHref(review);
  const pagePath = `/gallery/${review.review_id}`;
  const publishedDate = new Date(review.gallery_added_at).toLocaleDateString(localeToIntlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen">
      <nav aria-label="Breadcrumb" className="border-b border-border-subtle px-5 py-3 sm:px-6">
        <ol className="mx-auto flex max-w-workspace flex-wrap items-center gap-2 text-xs text-ink-subtle">
          <li>
            <Link href="/gallery" className="transition-colors hover:text-gold">{chrome.breadcrumbGallery}</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={buildGalleryTypeFilterHref(review.image_type)} className="transition-colors hover:text-gold">
              {chromeTypeLabel}
            </Link>
          </li>
        </ol>
      </nav>

      <article lang={contentLocale} className="px-5 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto grid max-w-workspace gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <figure className="overflow-hidden rounded-feature border border-border-subtle bg-void/40">
            <div className="relative aspect-[4/3]">
              {imageSrc ? (
                <Image
                  src={imageSrc}
                  alt={chrome.photoAlt(chromeTypeLabel)}
                  fill
                  priority
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  className="object-contain"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-ink-subtle">
                  <ImageOff size={28} aria-hidden="true" />
                </div>
              )}
            </div>
          </figure>

          <div>
            <p className="ui-eyebrow">{contentTypeLabel}</p>
            <h1 className="mt-3 text-balance font-display text-3xl leading-tight text-ink sm:text-4xl">
              {buildGalleryReviewHeading(review)}
            </h1>

            <div className="mt-6 flex items-end gap-3">
              <span className="font-display text-5xl leading-none text-ink">{formatGalleryScore(review.final_score)}</span>
              <span className="pb-1 text-xs uppercase tracking-[0.16em] text-ink-subtle">{article.scoreLabel}</span>
            </div>

            <dl className="mt-6 space-y-3">
              {GALLERY_REVIEW_DIMENSIONS.map((dimension) => {
                const value = Math.max(0, Math.min(10, Number(review.scores[dimension] ?? 0)));
                return (
                  <div key={dimension} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
                    <dt className="text-ink-muted">{article.dimensions[dimension]}</dt>
                    <dd className="h-1.5 overflow-hidden rounded-full bg-border-subtle" aria-hidden="true">
                      <span className="block h-full rounded-full bg-sage" style={{ width: `${value * 10}%` }} />
                    </dd>
                    <dd className="text-right font-mono text-ink">{value}</dd>
                  </div>
                );
              })}
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-subtle" lang={locale}>
              <span>
                {chrome.sharedBy}{' '}
                {review.owner_profile_url ? (
                  <Link href={review.owner_profile_url} className="font-semibold text-ink transition-colors hover:text-gold">
                    {review.owner_username}
                  </Link>
                ) : (
                  <span className="font-semibold text-ink">{review.owner_username}</span>
                )}
              </span>
              <span>{chrome.publishedOn} {publishedDate}</span>
              <span className="inline-flex items-center gap-1">
                <Heart size={12} aria-hidden="true" />
                {chrome.likes(review.like_count)}
              </span>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-workspace space-y-6">
          <CritiqueSection title={article.strengths} body={review.advantage} />
          <CritiqueSection title={article.critique} body={review.critique} />
          <CritiqueSection title={article.suggestions} body={review.suggestions} />
          <p className="border-t border-border-subtle pt-6 text-xs leading-6 text-ink-subtle">{article.disclaimer}</p>
        </div>
      </article>

      <section className="border-t border-border-subtle bg-surface/35 px-5 py-10 sm:px-6">
        <div className="mx-auto flex max-w-workspace flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl text-ink">{chrome.ctaTitle}</h2>
            <p className="mt-2 text-sm leading-7 text-ink-muted">{chrome.ctaBody(chromeTypeLabel)}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href={workspaceHref}
              onClick={() => {
                markProductAttributionSource('gallery');
                void trackProductEvent('content_workspace_clicked', {
                  source: 'gallery',
                  pagePath,
                  locale,
                  metadata: { entrypoint: 'gallery_detail', gallery_review_id: review.review_id, image_type: review.image_type },
                });
              }}
              className="ui-action-primary min-h-11 px-5 py-3 text-sm"
            >
              {chrome.ctaPrimary}
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
            <Link
              href={interactiveHref}
              prefetch={false}
              className="inline-flex min-h-11 items-center text-sm font-medium text-ink-muted transition-colors hover:text-gold"
            >
              {chrome.interactiveView}
            </Link>
          </div>
        </div>
        <div className="mx-auto mt-6 flex max-w-workspace flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href={buildGalleryTypeFilterHref(review.image_type)} className="inline-flex items-center gap-2 text-ink-muted transition-colors hover:text-gold">
            <LayoutGrid size={14} aria-hidden="true" />
            {chrome.moreOfType(chromeTypeLabel)}
          </Link>
          {topicHref && (
            <Link href={topicHref} className="inline-flex items-center gap-2 text-ink-muted transition-colors hover:text-gold">
              <ArrowRight size={14} aria-hidden="true" />
              {chrome.topicGuide(chromeTypeLabel)}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
