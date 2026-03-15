// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthToken {
  access_token: string;
  token_type: string;
  user_id: string;
  plan: 'guest' | 'free' | 'pro';
  auth_provider?: 'guest' | 'google' | 'clerk';
  clerk_user_id?: string | null;
  migrated_reviews?: number;
  migrated_photos?: number;
}

// ─── Usage ───────────────────────────────────────────────────────────────────

export interface UsageResponse {
  plan: 'guest' | 'free' | 'pro';
  quota: {
    daily_total: number | null;
    daily_used: number | null;
    daily_remaining: number | null;
    monthly_total: number | null;
    monthly_used: number | null;
    monthly_remaining: number | null;
    pro_monthly_total: number | null;
    pro_monthly_used: number | null;
    pro_monthly_remaining: number | null;
  };
  features: {
    review_modes: Array<'flash' | 'pro'>;
    history_retention_days: number | null;
    priority_queue: boolean;
  };
  rate_limit: {
    limit_per_min: number;
    remaining: number;
    reset_at: string;
  };
}

export interface BillingCheckoutResponse {
  status: 'placeholder' | 'already_active';
  plan: 'pro';
  message: string;
  checkout_url: string | null;
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
export type ImageType = 'default' | 'landscape' | 'portrait' | 'street' | 'still_life' | 'architecture';
export type ReviewStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'DEAD_LETTER';

export interface ReviewScores {
  composition: number;
  lighting: number;
  color: number;
  impact: number;
  technical: number;
}

export interface ReviewResult {
  schema_version: string;
  prompt_version: string;
  model_name: string;
  model_version: string;
  scores: ReviewScores;
  final_score: number;
  advantage: string;
  critique: string;
  suggestions: string;
  image_type: ImageType;
  billing_info: {
    quota_charged?: boolean;
    remaining_quota?: {
      daily_remaining?: number | null;
      monthly_remaining?: number | null;
      pro_monthly_remaining?: number | null;
    };
  };
  visual_analysis: Record<string, unknown>;
  tonal_analysis: Record<string, unknown>;
  issue_marks: Array<Record<string, unknown>>;
  exif_info: Record<string, unknown>;
  share_info: Record<string, unknown>;
}

export interface ReviewCreateRequest {
  photo_id: string;
  mode: ReviewMode;
  async: boolean;
  idempotency_key?: string;
  locale?: 'zh' | 'en' | 'ja';
  image_type?: ImageType;
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
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_heartbeat_at: string | null;
  started_at: string | null;
  finished_at: string | null;
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
  exif_data?: Record<string, unknown>;
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
  photo_thumbnail_url?: string | null;
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
    extra?: Record<string, unknown>;
  };
}

export interface TaskStreamMessage {
  type: 'task.update';
  task: TaskStatusResponse;
  event: {
    event_type: string;
    message: string | null;
    created_at: string;
  } | null;
}

// ─── Guest Migration ────────────────────────────────────────────────────────

export interface GuestMigrateResponse {
  migrated_reviews: number;
  migrated_photos: number;
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
