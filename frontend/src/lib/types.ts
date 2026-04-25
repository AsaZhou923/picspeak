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
  generation_credits: {
    monthly_total: number | null;
    monthly_used: number | null;
    monthly_remaining: number | null;
  };
  features: {
    review_modes: Array<'flash' | 'pro'>;
    history_retention_days: number | null;
    priority_queue: boolean;
  };
  subscription: {
    provider: string | null;
    status: string;
    cancelled: boolean;
    renews_at: string | null;
    ends_at: string | null;
    current_period_ends_at: string | null;
  } | null;
  rate_limit: {
    limit_per_min: number;
    remaining: number;
    reset_at: string;
  };
}

export interface BillingCheckoutResponse {
  status: 'created' | 'already_active';
  plan: 'pro';
  message: string;
  checkout_url: string | null;
}

export interface CreditPackCheckoutResponse {
  status: 'placeholder' | 'created';
  pack: 'image_credits_300';
  credits: number;
  currency: 'usd';
  price: string;
  message: string;
  checkout_url: string | null;
}

export interface BillingPortalResponse {
  status: string;
  portal_url: string | null;
  message: string;
}

export interface ActivationCodeRedeemResponse {
  status: string;
  plan: 'guest' | 'free' | 'pro';
  provider: string;
  message: string;
  activated_until: string;
}

export interface ImageCreditCodeRedeemResponse {
  status: string;
  code: string;
  credits_granted: number;
  message: string;
  monthly_total: number | null;
  monthly_used: number | null;
  monthly_remaining: number | null;
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
export type GenerationMode = 'general' | 'review_linked';
export type GenerationQuality = 'low' | 'medium' | 'high';
export type GenerationSize = '1024x1024' | '1024x1536' | '1536x1024';
export type GenerationOutputFormat = 'webp' | 'png' | 'jpeg';

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
  score_version: string;
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
  source_review_id?: string;
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
  error: TaskErrorPayload | null;
}

export interface TaskErrorPayload {
  code: string | null;
  message: string | null;
  retryable: boolean;
  timeout: boolean;
  failure_stage: string;
  quota_charged: boolean;
}

export interface GenerationTemplateItem {
  key: string;
  label_zh: string;
  label_en: string;
  description: string;
  default_negative: string;
}

export interface GenerationTemplatesResponse {
  items: GenerationTemplateItem[];
  credits_table: Partial<Record<GenerationQuality, Partial<Record<GenerationSize, number>>>>;
}

export interface GenerationCreateRequest {
  generation_mode: GenerationMode;
  intent: string;
  prompt: string;
  template_key?: string | null;
  source_photo_id?: string | null;
  source_review_id?: string | null;
  image_type?: ImageType;
  quality: GenerationQuality;
  size: GenerationSize;
  style?: string;
  negative_prompt?: string | null;
  output_format: GenerationOutputFormat;
  async: boolean;
  idempotency_key?: string;
}

export interface GenerationCreateResponse {
  task_id: string;
  status: TaskStatus;
  estimated_seconds: number;
  credits_reserved: number;
}

export interface GenerationTaskStatusResponse {
  task_id: string;
  status: TaskStatus;
  progress: number;
  generation_id: string | null;
  generation_mode: GenerationMode;
  intent: string | null;
  source_review_id: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_heartbeat_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: TaskErrorPayload | null;
}

export interface GeneratedImageItem {
  generation_id: string;
  task_id: string | null;
  image_url: string;
  generation_mode: GenerationMode;
  intent: string;
  prompt: string;
  revised_prompt: string | null;
  model_name: string;
  model_snapshot: string | null;
  quality: GenerationQuality;
  size: GenerationSize;
  output_format: GenerationOutputFormat;
  credits_charged: number;
  template_key: string | null;
  source_photo_id: string | null;
  source_review_id: string | null;
  created_at: string;
}

export interface GeneratedImageDetailResponse extends GeneratedImageItem {
  cost_usd: number | null;
  input_text_tokens: number | null;
  input_image_tokens: number | null;
  output_image_tokens: number | null;
  metadata: Record<string, unknown>;
}

export interface GeneratedImageHistoryResponse {
  items: GeneratedImageItem[];
  next_cursor: string | null;
}

export interface ReviewGetResponse {
  review_id: string;
  photo_id: string;
  photo_url: string | null;
  mode: ReviewMode;
  status: ReviewStatus;
  image_type: ImageType;
  source_review_id?: string | null;
  viewer_is_owner?: boolean;
  favorite?: boolean;
  gallery_visible?: boolean;
  gallery_audit_status?: 'none' | 'approved' | 'rejected';
  gallery_added_at?: string | null;
  gallery_rejected_reason?: string | null;
  tags?: string[];
  note?: string | null;
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
  image_type: ImageType;
  source_review_id?: string | null;
  final_score: number;
  scores: ReviewScores;
  model_name: string;
  model_version: string;
  favorite?: boolean;
  gallery_visible?: boolean;
  gallery_audit_status?: 'none' | 'approved' | 'rejected';
  gallery_added_at?: string | null;
  tags?: string[];
  note?: string | null;
  is_shared?: boolean;
  created_at: string;
}

export interface ReviewHistoryResponse {
  items: ReviewHistoryItem[];
  next_cursor: string | null;
}

export interface ReviewHistoryQuery {
  cursor?: string;
  limit?: number;
  created_from?: string;
  created_to?: string;
  min_score?: number;
  max_score?: number;
  image_type?: ImageType;
  favorite_only?: boolean;
}

export interface PublicGalleryQuery {
  cursor?: string;
  limit?: number;
  created_from?: string;
  created_to?: string;
  min_score?: number;
  max_score?: number;
  image_type?: ImageType;
  sort?: string;
}

export interface ReviewShareResponse {
  review_id: string;
  share_token: string;
  share_url: string;
  enabled: boolean;
}

export interface ReviewMetaUpdateRequest {
  favorite?: boolean;
  gallery_visible?: boolean;
  tags?: string[];
  note?: string | null;
}

export interface ReviewMetaResponse {
  review_id: string;
  favorite: boolean;
  gallery_visible: boolean;
  gallery_audit_status: 'none' | 'approved' | 'rejected';
  gallery_added_at: string | null;
  gallery_rejected_reason: string | null;
  tags: string[];
  note: string | null;
}

export interface ReviewExportPhoto {
  photo_id: string;
  photo_url: string | null;
  photo_thumbnail_url: string | null;
}

export interface ReviewExportData {
  review_id: string;
  source_review_id: string | null;
  mode: ReviewMode;
  status: ReviewStatus;
  image_type: ImageType;
  model_name: string;
  model_version: string;
  final_score: number;
  scores: ReviewScores;
  advantage: string;
  critique: string;
  suggestions: string;
  favorite: boolean;
  tags: string[];
  note: string | null;
  created_at: string;
  exported_at: string;
}

export interface ReviewExportResponse {
  photo: ReviewExportPhoto;
  review: ReviewExportData;
}

export interface PublicGalleryItem {
  review_id: string;
  photo_id: string;
  photo_url: string | null;
  photo_thumbnail_url?: string | null;
  mode: ReviewMode;
  image_type: ImageType;
  final_score: number;
  score_version: string;
  summary: string;
  owner_username: string;
  owner_avatar_url?: string | null;
  like_count: number;
  liked_by_viewer: boolean;
  recommended: boolean;
  score_percentile?: number | null;
  gallery_added_at: string;
  created_at: string;
}

export interface PublicGalleryResponse {
  items: PublicGalleryItem[];
  total_count: number;
  next_cursor: string | null;
}

export interface GalleryLikeResponse {
  review_id: string;
  like_count: number;
  liked_by_viewer: boolean;
}

// ─── Error ───────────────────────────────────────────────────────────────────

export interface BlogPostViewItem {
  slug: string;
  view_count: number;
}

export interface BlogPostViewsResponse {
  items: BlogPostViewItem[];
}

export interface BlogPostViewIncrementResponse {
  slug: string;
  view_count: number;
}

export type ProductAnalyticsSource =
  | 'home_direct'
  | 'blog'
  | 'gallery'
  | 'share'
  | 'checkout'
  | 'unknown';

export interface ProductAnalyticsTrackRequest {
  event_name: string;
  source?: ProductAnalyticsSource;
  page_path?: string;
  locale?: 'zh' | 'en' | 'ja';
  session_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ProductAnalyticsTrackResponse {
  status: string;
  event_name: string;
}

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
