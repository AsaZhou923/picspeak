import { buildGalleryApiUrl } from '@/lib/gallery-scoreboard-api';
import {
  isIndexableGalleryReview,
  isValidGalleryReviewId,
  type GallerySitemapEntry,
  type PublicGalleryReview,
} from '@/lib/gallery-review-page';

const SITEMAP_PAGE_SIZE = 1000;
const SITEMAP_MAX_URLS = 50_000;

/**
 * Server-side read of one approved Gallery critique.
 * Returns null for a missing/withdrawn critique; throws for transient failures so
 * an outage is not cached as a 404.
 */
export async function fetchPublicGalleryReview(reviewId: string): Promise<PublicGalleryReview | null> {
  if (!isValidGalleryReviewId(reviewId)) return null;
  const response = await fetch(buildGalleryApiUrl(`/gallery/${encodeURIComponent(reviewId)}`), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
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

/** Only a complete, current inventory can be published as a successful sitemap. */
export async function fetchGallerySitemapEntries(): Promise<GallerySitemapEntry[]> {
  const entries: GallerySitemapEntry[] = [];
  const reviewIds = new Set<string>();
  let cursor: string | null = null;
  while (true) {
    const query = new URLSearchParams({ limit: String(SITEMAP_PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    const response = await fetch(buildGalleryApiUrl(`/gallery/sitemap-entries?${query.toString()}`), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Gallery sitemap request failed with ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items) || payload.items.length > SITEMAP_PAGE_SIZE
      || !(payload.next_cursor === null || (typeof payload.next_cursor === 'string' && /^[1-9]\d*$/.test(payload.next_cursor)))) {
      throw new Error('Invalid Gallery sitemap response');
    }
    for (const item of payload.items) {
      if (!item || typeof item.review_id !== 'string' || !isValidGalleryReviewId(item.review_id)
        || reviewIds.has(item.review_id) || typeof item.image_type !== 'string'
        || typeof item.last_modified !== 'string' || Number.isNaN(Date.parse(item.last_modified))) {
        throw new Error('Invalid or duplicate Gallery sitemap entry');
      }
      reviewIds.add(item.review_id);
      entries.push(item);
    }
    if (entries.length > SITEMAP_MAX_URLS || (entries.length === SITEMAP_MAX_URLS && payload.next_cursor !== null)) {
      throw new Error('Gallery inventory exceeds the single-sitemap URL limit');
    }
    const nextCursor: string | null = payload.next_cursor;
    if (nextCursor === null) return entries;
    if (payload.items.length === 0 || (cursor !== null && BigInt(nextCursor) >= BigInt(cursor))) {
      throw new Error('Gallery sitemap pagination did not advance');
    }
    cursor = nextCursor;
  }
}

export type GalleryTopicSample = {
  review_id: string;
  photo_thumbnail_url: string | null;
  final_score: number;
  summary: string;
};

/** Fresh, quality-eligible examples; failures leave the guide readable without old samples. */
export async function fetchGalleryTopicSamples(imageType: string, limit = 3): Promise<GalleryTopicSample[]> {
  try {
    const query = new URLSearchParams({ image_type: imageType, limit: String(limit) });
    const response = await fetch(buildGalleryApiUrl(`/gallery/topic-samples?${query.toString()}`), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    // During a backend-first rollout, older API instances still have the list route.
    if (response.status === 404) return await fetchLegacyGalleryTopicSamples(imageType, limit);
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

async function fetchLegacyGalleryTopicSamples(imageType: string, limit: number): Promise<GalleryTopicSample[]> {
  const samples: GalleryTopicSample[] = [];
  const candidateLimit = Math.min(6, limit * 2);
  const query = new URLSearchParams({ image_type: imageType, sort: 'score', limit: String(candidateLimit) });
  const response = await fetch(buildGalleryApiUrl(`/gallery?${query.toString()}`), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) return [];
  const payload = await response.json();
  if (!Array.isArray(payload?.items)) return [];
  for (const item of payload.items.slice(0, candidateLimit)) {
    if (!isValidGalleryReviewId(item?.review_id)) continue;
    const review = await fetchPublicGalleryReview(item.review_id);
    if (!review || review.image_type !== imageType || !isIndexableGalleryReview(review)) continue;
    samples.push({
      review_id: review.review_id,
      photo_thumbnail_url: review.photo_thumbnail_url,
      final_score: review.final_score,
      summary: review.summary,
    });
    if (samples.length === limit) return samples;
  }
  return samples;
}
