import { buildGalleryApiUrl } from './gallery-scoreboard-api.ts';

// Query the original publication day so selections remain fixed as newer works are added.
// Only current public Gallery membership permits republishing an image and its critique.
export async function getPublishedCritique(reviewId: string, publishedDate: string) {
  try {
    const params = new URLSearchParams({
      limit: '60', sort: 'latest',
      created_from: `${publishedDate}T00:00:00Z`,
      created_to: `${publishedDate}T23:59:59.999999Z`,
    });
    const response = await fetch(buildGalleryApiUrl(`/gallery?${params}`), {
      cache: 'no-store', signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const data = await response.json() as {
      items?: Array<{ review_id: string; photo_thumbnail_url?: string | null }>;
    };
    const item = data.items?.find((entry) => entry.review_id === reviewId);
    return item?.photo_thumbnail_url ? item : null;
  } catch {
    return null;
  }
}
