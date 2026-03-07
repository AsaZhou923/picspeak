// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthToken {
  access_token: string;
  token_type: string;
  user_id: string;
  plan: 'guest' | 'free' | 'pro';
}

// ─── Usage ───────────────────────────────────────────────────────────────────

export interface UsageResponse {
  plan: 'guest' | 'free' | 'pro';
  quota: {
    daily_total: number;
    used: number;
    remaining: number;
  };
  rate_limit: {
    limit_per_min: number;
    remaining: number;
    reset_at: string;
  };
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export interface PresignRequest {
  filename: string;
  content_type: string;
  size_bytes: number;
  sha256?: string;
}

export interface PresignResponse {
  upload_id: string;
  object_key: string;
  put_url: string;
  headers: Record<string, string>;
  expires_at: string;
}

// ─── Photo ───────────────────────────────────────────────────────────────────

export type PhotoStatus = 'UPLOADING' | 'READY' | 'REJECTED';

export interface PhotoCreateResponse {
  photo_id: string;
  photo_url: string;
  status: PhotoStatus;
}

// ─── Review ──────────────────────────────────────────────────────────────────

export type ReviewMode = 'flash' | 'pro';
export type ReviewStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';

export interface ReviewScores {
  composition: number;
  lighting: number;
  color: number;
  story: number;
  technical: number;
}

export interface ReviewResult {
  schema_version: string;
  scores: ReviewScores;
  final_score: number;
  advantage: string;
  critique: string;
  suggestions: string;
}

export interface ReviewCreateRequest {
  photo_id: string;
  mode: ReviewMode;
  async: boolean;
  idempotency_key?: string;
  locale?: 'zh' | 'en' | 'ja';
}

export interface ReviewCreateAsyncResponse {
  task_id: string;
  status: TaskStatus;
  estimated_seconds: number;
}

export interface ReviewCreateSyncResponse {
  review_id: string;
  status: ReviewStatus;
  result: ReviewResult;
}

export type ReviewCreateResponse = ReviewCreateAsyncResponse | ReviewCreateSyncResponse;

export interface TaskStatusResponse {
  task_id: string;
  status: TaskStatus;
  progress: number;
  review_id: string | null;
  error: Record<string, unknown> | null;
}

export interface ReviewGetResponse {
  review_id: string;
  photo_id: string;
  photo_url: string | null;
  mode: ReviewMode;
  status: ReviewStatus;
  result: ReviewResult;
  created_at: string;
}

export interface ReviewListItem {
  review_id: string;
  mode: ReviewMode;
  status: ReviewStatus;
}

export interface PhotoReviewsResponse {
  items: ReviewListItem[];
  next_cursor: string | null;
}

export interface ReviewHistoryItem {
  review_id: string;
  photo_id: string;
  photo_url: string | null;
  mode: ReviewMode;
  status: ReviewStatus;
  final_score: number;
  created_at: string;
}

export interface ReviewHistoryResponse {
  items: ReviewHistoryItem[];
  next_cursor: string | null;
}

// ─── Error ───────────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    request_id?: string;
  };
}

export class ApiException extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string
  ) {
    super(message);
    this.name = 'ApiException';
  }
}
