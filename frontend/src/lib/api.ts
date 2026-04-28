import {
  ApiException,
  ActivationCodeRedeemResponse,
  AuthToken,
  BlogPostViewIncrementResponse,
  BlogPostViewsResponse,
  BillingCheckoutResponse,
  BillingPortalResponse,
  CreditPackCheckoutResponse,
  GalleryLikeResponse,
  GeneratedImageDetailResponse,
  GeneratedImageHistoryResponse,
  GenerationCreateRequest,
  GenerationCreateResponse,
  GenerationTaskStatusResponse,
  GenerationTemplatesResponse,
  GuestMigrateResponse,
  ImageCreditCodeRedeemResponse,
  PhotoCreateResponse,
  PhotoReviewsResponse,
  PresignRequest,
  PresignResponse,
  ProductAnalyticsTrackRequest,
  ProductAnalyticsTrackResponse,
  PublicGalleryQuery,
  PublicGalleryResponse,
  ReviewCreateRequest,
  ReviewCreateResponse,
  ReviewExportResponse,
  ReviewGetResponse,
  ReviewHistoryQuery,
  ReviewHistoryResponse,
  ReviewMetaResponse,
  ReviewMetaUpdateRequest,
  ReviewShareResponse,
  TaskStatusResponse,
  UsageResponse,
} from './types';

function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_API_URL is required for production builds');
    }
    return 'http://localhost:8000';
  }

  try {
    return new URL(configured).toString().replace(/\/$/, '');
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL must be an absolute URL');
  }
}

const API_BASE = resolveApiBase();
const GOOGLE_OAUTH_START_PATH = '/auth/google/start';
const USAGE_CACHE_TTL_MS = 30_000;
const DEVICE_ID_KEY = 'ps_device_id';

type UnauthorizedHandler = (failedToken: string) => Promise<string | null>;
type UnauthorizedRecoveryMode = 'disabled' | 'guest';
type UsageOptions = {
  force?: boolean;
  signal?: AbortSignal;
};
type UsageCacheEntry = {
  token: string;
  expiresAt: number;
  data?: UsageResponse;
  promise?: Promise<UsageResponse>;
};
type ApiRequestOptions = RequestInit & {
  token?: string;
  _retried?: boolean;
  unauthorizedRecovery?: UnauthorizedRecoveryMode;
};

let unauthorizedHandler: UnauthorizedHandler | null = null;
let usageCache: UsageCacheEntry | null = null;

function apiBasePath(): string {
  const pathname = new URL(API_BASE).pathname.replace(/\/$/, '');
  if (pathname.endsWith('/api/v1')) return pathname;
  return pathname.endsWith('/api') ? `${pathname}/v1` : `${pathname}/api/v1`;
}

function buildApiUrl(path: string): string {
  const url = new URL(API_BASE);
  const [rawPath, rawQuery = ''] = path.split('?', 2);
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  url.pathname = `${apiBasePath()}${normalizedPath}`.replace(/\/{2,}/g, '/');
  url.search = rawQuery ? `?${rawQuery}` : '';
  return url.toString();
}

function createAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function getClientDeviceId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY)?.trim();
    if (existing) {
      return existing.slice(0, 128);
    }

    const generated =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const normalized = generated.slice(0, 128);
    window.localStorage.setItem(DEVICE_ID_KEY, normalized);
    return normalized;
  } catch {
    return null;
  }
}

export function registerUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export function clearUsageCache(token?: string): void {
  if (!token || usageCache?.token === token) {
    usageCache = null;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function request<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    token,
    headers = {},
    _retried = false,
    unauthorizedRecovery = 'disabled',
    signal,
    ...rest
  } = options;

  const allHeaders: Record<string, string> = {
    ...(headers as Record<string, string>),
  };
  if (rest.body !== undefined && !Object.keys(allHeaders).some((key) => key.toLowerCase() === 'content-type')) {
    allHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    allHeaders['Authorization'] = `Bearer ${token}`;
  }

  const deviceId = getClientDeviceId();
  if (deviceId) {
    allHeaders['X-Device-Id'] = deviceId;
  }

  const res = await fetch(buildApiUrl(path), {
    ...rest,
    credentials: 'include',
    headers: allHeaders,
    signal,
  });

  if (signal?.aborted) {
    throw createAbortError();
  }

  if (res.status === 401 && token && !_retried && unauthorizedRecovery === 'guest' && unauthorizedHandler) {
    const recoveredToken = await unauthorizedHandler(token);
    if (signal?.aborted) {
      throw createAbortError();
    }
    if (recoveredToken && recoveredToken !== token) {
      return request<T>(path, { ...options, token: recoveredToken, _retried: true });
    }
  }

  if (!res.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = `HTTP ${res.status}`;
    let requestId: string | undefined;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
        requestId = body.error.request_id;
      } else {
        message = typeof body === 'string' ? body : (body?.detail ?? message);
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new ApiException(res.status, code, message, requestId);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function authGuest(): Promise<AuthToken> {
  return request<AuthToken>('/auth/guest', { method: 'POST' });
}

export async function authGoogleCallback(code: string): Promise<AuthToken> {
  return request<AuthToken>(`/auth/google/callback?code=${encodeURIComponent(code)}`);
}

export async function authGoogleLogin(idToken: string): Promise<AuthToken> {
  return request<AuthToken>('/auth/google/login', {
    method: 'POST',
    body: JSON.stringify({ id_token: idToken }),
  });
}

export async function authClerkExchange(
  sessionToken: string,
  guestToken?: string,
  recentLimit = 20
): Promise<AuthToken> {
  return request<AuthToken>('/auth/clerk/exchange', {
    method: 'POST',
    body: JSON.stringify({ guest_token: guestToken, recent_limit: recentLimit }),
    token: sessionToken,
  });
}

export async function migrateGuestReviews(
  token: string,
  recentLimit = 20
): Promise<GuestMigrateResponse> {
  return request<GuestMigrateResponse>('/auth/guest/migrate', {
    method: 'POST',
    body: JSON.stringify({ recent_limit: recentLimit }),
    token,
  });
}

// ─── Usage ───────────────────────────────────────────────────────────────────

export async function getUsage(token: string, options: UsageOptions = {}): Promise<UsageResponse> {
  const useCache =
    !options.force &&
    usageCache?.token === token &&
    usageCache.expiresAt > Date.now();

  if (useCache && usageCache?.data) {
    return usageCache.data;
  }

  if (useCache && usageCache?.promise) {
    return usageCache.promise;
  }

  const usagePromise = request<UsageResponse>('/me/usage', {
    token,
    unauthorizedRecovery: 'guest',
  })
    .then((data) => {
      usageCache = {
        token,
        expiresAt: Date.now() + USAGE_CACHE_TTL_MS,
        data,
      };
      return data;
    })
    .catch((error) => {
      if (usageCache?.promise === usagePromise) {
        usageCache = null;
      }
      throw error;
    });

  usageCache = {
    token,
    expiresAt: Date.now() + USAGE_CACHE_TTL_MS,
    promise: usagePromise,
  };

  return raceWithAbort(usagePromise, options.signal);
}

export async function createBillingCheckout(token: string, plan: 'pro', locale?: 'zh' | 'en' | 'ja'): Promise<BillingCheckoutResponse> {
  return request<BillingCheckoutResponse>('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, locale }),
    token,
    unauthorizedRecovery: 'guest',
  });
}

export async function createImageCreditPackCheckout(
  token: string,
  payload: { pack?: 'image_credits_300'; currency: 'usd'; locale?: 'zh' | 'en' | 'ja' }
): Promise<CreditPackCheckoutResponse> {
  return request<CreditPackCheckoutResponse>('/billing/image-credit-pack/checkout', {
    method: 'POST',
    body: JSON.stringify({
      pack: payload.pack ?? 'image_credits_300',
      currency: payload.currency,
      locale: payload.locale,
    }),
    token,
    unauthorizedRecovery: 'guest',
  });
}

export async function getBillingPortal(token: string): Promise<BillingPortalResponse> {
  return request<BillingPortalResponse>('/billing/portal', {
    token,
    unauthorizedRecovery: 'guest',
  });
}

export async function redeemActivationCode(token: string, code: string): Promise<ActivationCodeRedeemResponse> {
  const response = await request<ActivationCodeRedeemResponse>('/billing/activation-code/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
    token,
    unauthorizedRecovery: 'guest',
  });
  clearUsageCache(token);
  return response;
}

export async function redeemImageCreditCode(token: string, code: string): Promise<ImageCreditCodeRedeemResponse> {
  const response = await request<ImageCreditCodeRedeemResponse>('/billing/image-credit-code/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
    token,
    unauthorizedRecovery: 'guest',
  });
  clearUsageCache(token);
  return response;
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export async function createPresign(
  payload: PresignRequest,
  token: string
): Promise<PresignResponse> {
  return request<PresignResponse>('/uploads/presign', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
    unauthorizedRecovery: 'guest',
  });
}

export async function putObjectStorage(
  putUrl: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', putUrl, true);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        const message =
          xhr.status === 0
            ? 'Upload blocked before object storage responded. Check object storage CORS for PUT/OPTIONS.'
            : `Upload failed: ${xhr.status}`;
        reject(new ApiException(xhr.status, 'UPLOAD_FAILED', message));
      }
    };
    xhr.onerror = () =>
      reject(
        new ApiException(
          0,
          'NETWORK_ERROR',
          'Network error during upload. Check object storage CORS for PUT/OPTIONS from the frontend origin.'
        )
      );
    xhr.send(file);
  });
}

export async function confirmPhoto(
  uploadId: string,
  exifData: Record<string, unknown>,
  clientMeta: Record<string, unknown>,
  token: string
): Promise<PhotoCreateResponse> {
  return request<PhotoCreateResponse>('/photos', {
    method: 'POST',
    body: JSON.stringify({ upload_id: uploadId, exif_data: exifData, client_meta: clientMeta }),
    token,
    unauthorizedRecovery: 'guest',
  });
}

// ─── Review ──────────────────────────────────────────────────────────────────

export async function createReview(
  payload: ReviewCreateRequest,
  token: string
): Promise<ReviewCreateResponse> {
  const response = await request<ReviewCreateResponse>('/reviews', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  });
  clearUsageCache(token);
  return response;
}

export async function getTask(taskId: string, token: string, signal?: AbortSignal): Promise<TaskStatusResponse> {
  return request<TaskStatusResponse>(`/tasks/${taskId}?_ts=${Date.now()}`, {
    token,
    cache: 'no-store',
    signal,
  });
}

export async function getGenerationTemplates(): Promise<GenerationTemplatesResponse> {
  return request<GenerationTemplatesResponse>('/generations/templates');
}

export async function createGeneration(
  payload: GenerationCreateRequest,
  token: string
): Promise<GenerationCreateResponse> {
  const response = await request<GenerationCreateResponse>('/generations', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
    unauthorizedRecovery: 'guest',
  });
  clearUsageCache(token);
  return response;
}

export async function getGenerationTask(
  taskId: string,
  token: string,
  signal?: AbortSignal
): Promise<GenerationTaskStatusResponse> {
  return request<GenerationTaskStatusResponse>(`/generation-tasks/${taskId}?_ts=${Date.now()}`, {
    token,
    cache: 'no-store',
    signal,
  });
}

export async function getGeneration(
  generationId: string,
  token: string,
  signal?: AbortSignal
): Promise<GeneratedImageDetailResponse> {
  return request<GeneratedImageDetailResponse>(`/generations/${generationId}`, { token, signal });
}

export async function getMyGenerations(
  token: string,
  query: { cursor?: string; limit?: number } = {}
): Promise<GeneratedImageHistoryResponse> {
  const params = new URLSearchParams({ limit: String(query.limit ?? 20) });
  if (query.cursor) params.set('cursor', query.cursor);
  return request<GeneratedImageHistoryResponse>(`/me/generations?${params.toString()}`, { token });
}

export async function reuseGeneration(
  generationId: string,
  token: string
): Promise<GenerationCreateResponse> {
  return request<GenerationCreateResponse>(`/generations/${generationId}/reuse`, {
    method: 'POST',
    token,
    unauthorizedRecovery: 'guest',
  });
}

export async function deleteGeneration(generationId: string, token: string): Promise<void> {
  return request<void>(`/generations/${generationId}`, {
    method: 'DELETE',
    token,
  });
}

export async function downloadGeneration(
  generationId: string,
  token: string
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(buildApiUrl(`/generations/${encodeURIComponent(generationId)}/download`), {
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new ApiException(res.status, 'GENERATION_DOWNLOAD_FAILED', `HTTP ${res.status}`);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = parseContentDispositionFilename(disposition) ?? `${generationId}.png`;
  return { blob: await res.blob(), filename };
}

function parseContentDispositionFilename(disposition: string): string | null {
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1].trim().replace(/^"|"$/g, ''));
  } catch {
    return match[1].trim().replace(/^"|"$/g, '');
  }
}

export function buildTaskWebSocketUrl(taskId: string): string {
  const url = new URL(buildApiUrl(`/ws/tasks/${encodeURIComponent(taskId)}`));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export async function getReview(reviewId: string, token: string, signal?: AbortSignal): Promise<ReviewGetResponse> {
  return request<ReviewGetResponse>(`/reviews/${reviewId}`, { token, signal });
}

export async function getPhotoReviews(
  photoId: string,
  token: string,
  cursor?: string
): Promise<PhotoReviewsResponse> {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return request<PhotoReviewsResponse>(`/photos/${photoId}/reviews${q}`, { token });
}

export async function getMyReviews(
  token: string,
  query: ReviewHistoryQuery = {}
): Promise<ReviewHistoryResponse> {
  const params = new URLSearchParams({ limit: String(query.limit ?? 20) });
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.created_from) params.set('created_from', query.created_from);
  if (query.created_to) params.set('created_to', query.created_to);
  if (typeof query.min_score === 'number') params.set('min_score', String(query.min_score));
  if (typeof query.max_score === 'number') params.set('max_score', String(query.max_score));
  if (query.image_type) params.set('image_type', query.image_type);
  if (query.favorite_only) params.set('favorite_only', 'true');
  return request<ReviewHistoryResponse>(`/me/reviews?${params.toString()}`, { token });
}

export async function getBlogViewCounts(slugs: string[]): Promise<Record<string, number>> {
  const params = new URLSearchParams();
  slugs.forEach((slug) => {
    const normalizedSlug = slug.trim().toLowerCase();
    if (normalizedSlug) {
      params.append('slug', normalizedSlug);
    }
  });

  if (!params.toString()) {
    return {};
  }

  const response = await request<BlogPostViewsResponse>(`/blog/views?${params.toString()}`);
  return response.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.slug] = item.view_count;
    return acc;
  }, {});
}

export async function incrementBlogPostView(slug: string): Promise<number> {
  const response = await request<BlogPostViewIncrementResponse>(`/blog/${encodeURIComponent(slug)}/views`, {
    method: 'POST',
  });
  return response.view_count;
}

export async function trackProductAnalyticsEvent(
  payload: ProductAnalyticsTrackRequest,
  token?: string
): Promise<ProductAnalyticsTrackResponse> {
  return request<ProductAnalyticsTrackResponse>('/analytics/events', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
    keepalive: true,
  });
}

export async function getPublicGallery(
  query: PublicGalleryQuery = {},
  token?: string
): Promise<PublicGalleryResponse> {
  const params = new URLSearchParams({ limit: String(query.limit ?? 24) });
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.created_from) params.set('created_from', query.created_from);
  if (query.created_to) params.set('created_to', query.created_to);
  if (typeof query.min_score === 'number') params.set('min_score', String(query.min_score));
  if (typeof query.max_score === 'number') params.set('max_score', String(query.max_score));
  if (query.image_type) params.set('image_type', query.image_type);
  if (query.sort) params.set('sort', query.sort);
  return request<PublicGalleryResponse>(`/gallery?${params.toString()}`, { token });
}

export async function likeGalleryReview(
  reviewId: string,
  token: string
): Promise<GalleryLikeResponse> {
  return request<GalleryLikeResponse>(`/gallery/${reviewId}/likes`, {
    method: 'POST',
    token,
  });
}

export async function unlikeGalleryReview(
  reviewId: string,
  token: string
): Promise<GalleryLikeResponse> {
  return request<GalleryLikeResponse>(`/gallery/${reviewId}/likes`, {
    method: 'DELETE',
    token,
  });
}

export async function createReviewShare(
  reviewId: string,
  token: string
): Promise<ReviewShareResponse> {
  return request<ReviewShareResponse>(`/reviews/${reviewId}/share`, {
    method: 'POST',
    token,
  });
}

export async function exportReview(
  reviewId: string,
  token: string
): Promise<ReviewExportResponse> {
  return request<ReviewExportResponse>(`/reviews/${reviewId}/export`, {
    token,
  });
}

export async function getPublicReview(shareToken: string): Promise<ReviewGetResponse> {
  return request<ReviewGetResponse>(`/public/reviews/${shareToken}`);
}

export async function updateReviewMeta(
  reviewId: string,
  payload: ReviewMetaUpdateRequest,
  token: string
): Promise<ReviewMetaResponse> {
  return request<ReviewMetaResponse>(`/reviews/${reviewId}/meta`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    token,
  });
}

// ─── Google OAuth URL builder ─────────────────────────────────────────────────

export function buildGoogleOAuthUrl(): string {
  return buildApiUrl(GOOGLE_OAUTH_START_PATH);
}
