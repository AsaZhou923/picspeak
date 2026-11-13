import { buildGalleryApiUrl } from '@/lib/gallery-scoreboard-api';
import {
  isValidGalleryReviewId,
  type GallerySitemapEntry,
  type PublicGalleryReview,
} from '@/lib/gallery-review-page';

export const GALLERY_REVIEW_REVALIDATE_SECONDS = 3600;
/**
 * Critique detail cache window. Kept short (matching the API's public max-age)
 * so withdrawing or deleting a critique takes its public page offline within
 * about a minute; the client also re-checks availability after hydration.
 */
export const GALLERY_REVIEW_DETAIL_REVALIDATE_SECONDS = 60;
const SITEMAP_PAGE_SIZE = 1000;
const SITEMAP_MAX_PAGES = 20;

/**
 * Server-side read of one approved Gallery critique.
 * Returns null for a missing/withdrawn critique; throws for transient failures so
 * an outage is not cached as a 404.
 */
export async function fetchPublicGalleryReview(reviewId: string): Promise<PublicGalleryReview | null> {
  if (!isValidGalleryReviewId(reviewId)) return null;
  const response = await fetch(buildGalleryApiUrl(`/gallery/${encodeURIComponent(reviewId)}`), {
    headers: { Accept: 'application/json' },
    next: { revalidate: GALLERY_REVIEW_DETAIL_REVALIDATE_SECONDS, tags: [`gallery-review:${reviewId}`] },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Gallery review request failed with ${response.status}`);
  }
  const review = (await response.json()) as PublicGalleryReview;
  // Signed original-photo URLs expire within minutes, so they must never be
  // baked into cached HTML. Clients refresh the full-size URL after hydration.
  return { ...review, photo_url: null };
}

/** All indexable Gallery critiques for the sitemap; an API failure yields an empty list, never a broken sitemap. */
export async function fetchGallerySitemapEntries(): Promise<GallerySitemapEntry[]> {
  const entries: GallerySitemapEntry[] = [];
  let cursor: string | null = null;
  try {
    for (let page = 0; page < SITEMAP_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: String(SITEMAP_PAGE_SIZE) });
      if (cursor) query.set('cursor', cursor);
      const response = await fetch(buildGalleryApiUrl(`/gallery/sitemap-entries?${query.toString()}`), {
        headers: { Accept: 'application/json' },
        next: { revalidate: GALLERY_REVIEW_REVALIDATE_SECONDS },
      });
      if (!response.ok) break;
      const payload = (await response.json()) as { items?: GallerySitemapEntry[]; next_cursor?: string | null };
      entries.push(...(payload.items ?? []));
      cursor = payload.next_cursor ?? null;
      if (!cursor) break;
    }
  } catch {
    return entries;
  }
  return entries;
}

export type GalleryTopicSample = {
  review_id: string;
  photo_thumbnail_url: string | null;
  final_score: number;
  summary: string;
};

/** Highest-scoring public critiques of one image type; an API failure yields no samples, never a broken page. */
export async function fetchGalleryTopicSamples(imageType: string, limit = 3): Promise<GalleryTopicSample[]> {
  try {
    const query = new URLSearchParams({ image_type: imageType, sort: 'score', limit: String(limit) });
    const response = await fetch(buildGalleryApiUrl(`/gallery?${query.toString()}`), {
      headers: { Accept: 'application/json' },
      next: { revalidate: GALLERY_REVIEW_REVALIDATE_SECONDS },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { items?: GalleryTopicSample[] };
    return (payload.items ?? [])
      .filter((item) => isValidGalleryReviewId(item.review_id))
      .slice(0, limit)
      .map((item) => ({
        review_id: item.review_id,
        photo_thumbnail_url: item.photo_thumbnail_url ?? null,
        final_score: Number(item.final_score) || 0,
        summary: String(item.summary ?? ''),
      }));
  } catch {
    return [];
  }
}
