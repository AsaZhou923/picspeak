import {
  ApiException,
  ReviewHistoryResponse,
  ReviewMetaResponse,
  ReviewMetaUpdateRequest,
  ReviewShareResponse,
} from '@/lib/types';
import {
  buildReviewOrganizationHistoryPath,
  type ReviewOrganizationHistoryQuery,
} from '@/features/reviews/reviewOrganization';

export type OrganizedReviewHistoryQuery = ReviewOrganizationHistoryQuery;

export type ReviewVisibilityResponse = {
  review_id: string;
  is_public: boolean;
  gallery_visible: boolean;
  gallery_audit_status: 'none' | 'approved' | 'rejected';
  gallery_added_at: string | null;
  gallery_rejected_reason: string | null;
  share_enabled: boolean;
  share_token: string | null;
  share_url: string | null;
};

type RequestOptions = RequestInit & {
  token?: string;
};

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

function buildApiUrl(path: string): string {
  const url = new URL(resolveApiBase());
  const [rawPath, rawQuery = ''] = path.split('?', 2);
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  url.pathname = `${apiBasePath()}${normalizedPath}`.replace(/\/{2,}/g, '/');
  url.search = rawQuery ? `?${rawQuery}` : '';
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers = {}, ...rest } = options;
  const allHeaders: Record<string, string> = { ...(headers as Record<string, string>) };
  if (rest.body !== undefined && !Object.keys(allHeaders).some((key) => key.toLowerCase() === 'content-type')) {
    allHeaders['Content-Type'] = 'application/json';
  }
  if (token) allHeaders.Authorization = `Bearer ${token}`;

  const res = await fetch(buildApiUrl(path), {
    ...rest,
    credentials: 'include',
    headers: allHeaders,
  });
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
      }
    } catch {
      // Keep the HTTP fallback.
    }
    throw new ApiException(res.status, code, message, requestId);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function buildOrganizedReviewHistoryPath(query: OrganizedReviewHistoryQuery = {}): string {
  return buildReviewOrganizationHistoryPath(query);
}

export async function getOrganizedMyReviews(
  token: string,
  query: OrganizedReviewHistoryQuery = {},
  signal?: AbortSignal,
): Promise<ReviewHistoryResponse> {
  return request<ReviewHistoryResponse>(buildOrganizedReviewHistoryPath(query), { token, signal });
}

export async function updateOrganizedReviewMeta(
  reviewId: string,
  payload: ReviewMetaUpdateRequest,
  token: string,
): Promise<ReviewMetaResponse> {
  return request<ReviewMetaResponse>(`/reviews/${reviewId}/meta`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    token,
  });
}

export async function createOrganizedReviewShare(reviewId: string, token: string): Promise<ReviewShareResponse> {
  return request<ReviewShareResponse>(`/reviews/${reviewId}/share`, { method: 'POST', token });
}

export async function getReviewVisibility(reviewId: string, token: string, signal?: AbortSignal): Promise<ReviewVisibilityResponse> {
  return request<ReviewVisibilityResponse>(`/reviews/${reviewId}/visibility`, { token, signal });
}

export async function revokeReviewShare(reviewId: string, token: string): Promise<ReviewVisibilityResponse> {
  return request<ReviewVisibilityResponse>(`/reviews/${reviewId}/share`, { method: 'DELETE', token });
}

export async function disableReviewPublicVisibility(reviewId: string, token: string): Promise<ReviewVisibilityResponse> {
  return request<ReviewVisibilityResponse>(`/reviews/${reviewId}/visibility`, { method: 'DELETE', token });
}
