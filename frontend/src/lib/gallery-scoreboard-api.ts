import type { GalleryNeighborsResponse, GalleryScoreboardResponse, ImageType } from '@/lib/gallery-ux-types';

const STABLE_GALLERY_QUERY_KEYS = new Set([
  'created_from',
  'created_to',
  'min_score',
  'max_score',
  'image_type',
  'sort',
  'rank_reference_at',
]);

function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_API_URL is required for production builds');
    }
    return 'http://localhost:8000';
  }
  return new URL(configured).toString().replace(/\/$/, '');
}

function apiBasePath(): string {
  const pathname = new URL(resolveApiBase()).pathname.replace(/\/$/, '');
  if (pathname.endsWith('/api/v1')) return pathname;
  return pathname.endsWith('/api') ? `${pathname}/v1` : `${pathname}/api/v1`;
}

export function buildGalleryApiUrl(path: string): string {
  const url = new URL(resolveApiBase());
  const [rawPath, rawQuery = ''] = path.split('?', 2);
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  url.pathname = `${apiBasePath()}${normalizedPath}`.replace(/\/{2,}/g, '/');
  url.search = rawQuery ? `?${rawQuery}` : '';
  return url.toString();
}

async function requestJson<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(buildGalleryApiUrl(path), {
    credentials: 'include',
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Gallery request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getGalleryScoreboard(
  query: { window_days: 7 | 30; image_type?: ImageType | '' },
  token?: string
): Promise<GalleryScoreboardResponse> {
  const params = new URLSearchParams({ window_days: String(query.window_days) });
  if (query.image_type) params.set('image_type', query.image_type);
  return requestJson<GalleryScoreboardResponse>(`/gallery/scoreboard?${params.toString()}`, token);
}

export async function getGalleryNeighbors(
  reviewId: string,
  query: URLSearchParams,
  backHref: string,
  token?: string
): Promise<GalleryNeighborsResponse> {
  const params = sanitizeGalleryNeighborQuery(query);
  params.set('back_href', sanitizeGalleryBackHref(backHref));
  return requestJson<GalleryNeighborsResponse>(`/gallery/${encodeURIComponent(reviewId)}/neighbors?${params.toString()}`, token);
}

export function buildScoreboardGalleryHref(payload: GalleryScoreboardResponse): string {
  const params = new URLSearchParams();
  params.set('created_from', payload.window_start.slice(0, 10));
  const inclusiveEnd = new Date(new Date(payload.window_end).getTime() - 1);
  params.set('created_to', inclusiveEnd.toISOString().slice(0, 10));
  if (payload.image_type) params.set('image_type', payload.image_type);
  params.set('sort', 'likes');
  return `/gallery?${params.toString()}`;
}

export function sanitizeGalleryNeighborQuery(input: URLSearchParams | string): URLSearchParams {
  const source = typeof input === 'string' ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input) : input;
  const params = new URLSearchParams();
  for (const [key, value] of source.entries()) {
    if (!STABLE_GALLERY_QUERY_KEYS.has(key)) continue;
    if (!value.trim()) continue;
    params.set(key, value);
  }
  return params;
}

export function sanitizeGalleryBackHref(raw: string): string {
  if (!raw.startsWith('/gallery')) return '/gallery?restore=1';
  const [path, query = ''] = raw.split('?', 2);
  if (path !== '/gallery') return '/gallery?restore=1';
  const params = sanitizeGalleryNeighborQuery(query);
  params.set('restore', '1');
  const serialized = params.toString();
  return serialized ? `/gallery?${serialized}` : '/gallery?restore=1';
}
