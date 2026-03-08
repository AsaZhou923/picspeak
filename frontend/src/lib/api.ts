import {
  ApiException,
  AuthToken,
  PhotoCreateResponse,
  PhotoReviewsResponse,
  PresignRequest,
  PresignResponse,
  ReviewCreateRequest,
  ReviewCreateResponse,
  ReviewGetResponse,
  ReviewHistoryResponse,
  TaskStatusResponse,
  UsageResponse,
} from './types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const GOOGLE_OAUTH_START_PATH = '/api/v1/auth/google/start';

type UnauthorizedHandler = (failedToken: string) => Promise<string | null>;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function registerUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string; _retried?: boolean } = {}
): Promise<T> {
  const { token, headers = {}, _retried = false, ...rest } = options;

  const allHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (token) {
    allHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...rest,
    credentials: 'include',
    headers: allHeaders,
  });

  if (res.status === 401 && token && !_retried && unauthorizedHandler) {
    const recoveredToken = await unauthorizedHandler(token);
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

// ─── Usage ───────────────────────────────────────────────────────────────────

export async function getUsage(token: string): Promise<UsageResponse> {
  return request<UsageResponse>('/me/usage', { token });
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
  });
}

// ─── Review ──────────────────────────────────────────────────────────────────

export async function createReview(
  payload: ReviewCreateRequest,
  token: string
): Promise<ReviewCreateResponse> {
  return request<ReviewCreateResponse>('/reviews', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  });
}

export async function getTask(taskId: string, token: string): Promise<TaskStatusResponse> {
  return request<TaskStatusResponse>(`/tasks/${taskId}`, { token });
}

export function buildTaskWebSocketUrl(taskId: string): string {
  const apiBase = API_BASE.replace(/\/$/, '');
  const url = new URL(`${apiBase}/api/v1/ws/tasks/${encodeURIComponent(taskId)}`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export async function getReview(reviewId: string, token: string): Promise<ReviewGetResponse> {
  return request<ReviewGetResponse>(`/reviews/${reviewId}`, { token });
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
  cursor?: string,
  limit = 20
): Promise<ReviewHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return request<ReviewHistoryResponse>(`/me/reviews?${params.toString()}`, { token });
}

// ─── Google OAuth URL builder ─────────────────────────────────────────────────

export function buildGoogleOAuthUrl(): string {
  return `${API_BASE}${GOOGLE_OAUTH_START_PATH}`;
}
