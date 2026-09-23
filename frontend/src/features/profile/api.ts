export interface ProfileGalleryItem {
  review_id: string;
  photo_id: string;
  photo_url: string | null;
  photo_thumbnail_url?: string | null;
  mode: 'flash' | 'pro';
  image_type: string;
  final_score: number;
  score_version: string;
  summary: string;
  like_count: number;
  recommended: boolean;
  score_percentile?: number | null;
  gallery_added_at: string;
  created_at: string;
}

export interface ProfileSettingsResponse {
  public_profile_enabled: boolean;
  public_profile_id: string | null;
  username: string;
  avatar_url: string | null;
  gallery_review_count: number;
}

export interface PublicProfileResponse {
  public_profile_id: string;
  username: string;
  avatar_url: string | null;
  gallery_review_count: number;
  total_like_count: number;
  items: ProfileGalleryItem[];
  next_cursor: string | null;
}

export class ProfileApiError extends Error {
  status: number;
  code: string;

  constructor(
    status: number,
    code: string,
    message: string
  ) {
    super(message);
    this.name = 'ProfileApiError';
    this.status = status;
    this.code = code;
  }
}

function resolveProfileApiBase(): string {
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

function apiBasePath(): string {
  const pathname = new URL(resolveProfileApiBase()).pathname.replace(/\/$/, '');
  if (pathname.endsWith('/api/v1')) return pathname;
  return pathname.endsWith('/api') ? `${pathname}/v1` : `${pathname}/api/v1`;
}

export function buildProfileApiUrl(path: string): string {
  const url = new URL(resolveProfileApiBase());
  const [rawPath, rawQuery = ''] = path.split('?', 2);
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  url.pathname = `${apiBasePath()}${normalizedPath}`.replace(/\/{2,}/g, '/');
  url.search = rawQuery ? `?${rawQuery}` : '';
  return url.toString();
}

async function profileRequest<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers = {}, ...rest } = options;
  const allHeaders: Record<string, string> = {
    ...(headers as Record<string, string>),
  };
  if (rest.body !== undefined && !Object.keys(allHeaders).some((key) => key.toLowerCase() === 'content-type')) {
    allHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    allHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildProfileApiUrl(path), {
    ...rest,
    credentials: 'include',
    headers: allHeaders,
    cache: 'no-store',
  });
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      code = payload?.error?.code || code;
      message = payload?.error?.message || message;
    } catch {
      // Keep the HTTP fallback.
    }
    throw new ProfileApiError(response.status, code, message);
  }
  return response.json() as Promise<T>;
}

export async function getPublicProfile(
  publicProfileId: string,
  options: { limit?: number; cursor?: string | null; signal?: AbortSignal } = {}
): Promise<PublicProfileResponse> {
  const limit = options.limit ?? 24;
  const params = new URLSearchParams({ limit: String(limit) });
  if (options.cursor) {
    params.set('cursor', options.cursor);
  }
  return profileRequest<PublicProfileResponse>(`/profiles/${encodeURIComponent(publicProfileId)}?${params.toString()}`, {
    signal: options.signal,
  });
}

export async function getMyProfileSettings(token: string, signal?: AbortSignal): Promise<ProfileSettingsResponse> {
  return profileRequest<ProfileSettingsResponse>('/profiles/me', { token, signal });
}

export async function updateMyProfileSettings(
  token: string,
  enabled: boolean
): Promise<ProfileSettingsResponse> {
  return profileRequest<ProfileSettingsResponse>('/profiles/me', {
    token,
    method: 'PATCH',
    body: JSON.stringify({ public_profile_enabled: enabled }),
  });
}
