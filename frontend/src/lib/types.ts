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
    monthly_held: number | null;
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
export type ReviewModel = 'qwen' | 'gpt-5.5' | 'gpt-5.6-luna';
export type ReviewAnalysisType = 'single' | 'retake_compare';
export type ImageType = 'default' | 'landscape' | 'portrait' | 'street' | 'still_life' | 'architecture';
export type ReviewStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'DEAD_LETTER';
export type PracticeKind = 'capture_retake' | 'edit_revision' | 'same_image_recheck';
export type PracticeLifecycle = 'active' | 'completed' | 'archived';
export type GoalAssessmentStatus = 'achieved' | 'partial' | 'not_achieved' | 'indeterminate';
export type PracticeFeedbackVote = 'helpful' | 'not_helpful' | 'incorrect';
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

export type RetakeDimensionKey = keyof ReviewScores;
export type RetakeTrend = 'improved' | 'flat' | 'declined';

export interface ReviewScoreEvidenceDimension {
  strength?: string | null;
  limitation?: string | null;
  high_score_justification?: string | null;
}

export interface ReviewScoreEvidence {
  dimensions?: Partial<Record<RetakeDimensionKey, ReviewScoreEvidenceDimension>>;
  overall_justification?: string | null;
  high_score_audited?: boolean | null;
}

export interface RetakeDimensionResult {
  before_score: number;
  after_score: number;
  delta: number;
  trend: RetakeTrend;
  evidence: string[];
  remaining_gap: string;
}

export interface RetakeActionItem {
  priority: number;
  dimension: RetakeDimensionKey;
  action: string;
  success_check: string;
}

export interface RetakeComparisonResult {
  original_review_id: string;
  original_photo_id: string;
  retake_photo_id: string;
  is_comparable: boolean;
  comparison_confidence: 'low' | 'medium' | 'high';
  comparison_caveat: string;
  summary: string;
  dimensions: Record<RetakeDimensionKey, RetakeDimensionResult>;
  overall_before: number;
  overall_after: number;
  overall_delta: number;
  strongest_improvement: RetakeDimensionKey;
  next_actions: RetakeActionItem[];
  visual_reference_prompt: string;
  openai_response_id: string;
  goal_assessment?: GoalAssessment | null;
}

export interface GoalAssessmentEvidence {
  success_criterion: string;
  before_observation: string;
  after_observation: string;
  conclusion: string;
}

export interface GoalAssessment {
  goal_version: string;
  status: GoalAssessmentStatus;
  evidence: GoalAssessmentEvidence[];
  limitations: string[];
  next_action: string;
  rubric_version?: string | null;
  prompt_version?: string | null;
  model_name?: string | null;
  model_version?: string | null;
  preprocess_version?: string | null;
}

export interface ReviewResult {
  schema_version: string;
  prompt_version: string;
  score_version?: string | null;
  score_prompt_version: string;
  model_name: string;
  model_version: string;
  scorer_model_name: string;
  scorer_model_version: string;
  writer_model_name: string;
  writer_model_version: string;
  scorer_preprocess_version: string;
  score_cache_hit: boolean;
  scores: ReviewScores;
  score_evidence?: ReviewScoreEvidence | null;
  final_score: number;
  advantage: string;
  critique: string;
  suggestions: string;
  comparison?: RetakeComparisonResult | null;
  goal_assessment?: GoalAssessment | null;
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
  review_model?: ReviewModel;
  async: boolean;
  idempotency_key?: string;
  locale?: 'zh' | 'en' | 'ja';
  image_type?: ImageType;
  source_review_id?: string;
  analysis_type?: ReviewAnalysisType;
  practice_session_id?: string;
  practice_kind?: PracticeKind;
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
  practice_session_id?: string | null;
  practice_attempt_id?: string | null;
  practice_kind?: PracticeKind | null;
}

export interface PracticeConfigResponse {
  practice_enabled: boolean;
}

export interface PracticeSessionCreateRequest {
  source_review_id: string;
  practice_kind: PracticeKind;
  goal_snapshot: PracticeGoalSnapshot;
  success_criteria: PracticeSuccessCriterion[];
  locale: 'zh' | 'en' | 'ja';
  idempotency_key?: string | null;
}

export interface PracticeAttemptSummary {
  attempt_id: string;
  task_id: string | null;
  review_id: string | null;
  review_access?: 'available' | 'hidden' | 'deleted' | 'expired' | string;
  task_status?: TaskStatus | null;
  progress?: number | null;
  error?: TaskErrorPayload | null;
  sequence: number;
  photo_id?: string | null;
  kind: PracticeKind;
  created_at?: string | null;
}

export interface PracticeSessionListItem {
  session_id: string;
  lifecycle: PracticeLifecycle;
  practice_kind: PracticeKind;
  goal: string;
  dimension: RetakeDimensionKey;
  scene_group?: string | null;
  source: PracticeJournalSourceSummary;
  attempt_count: number;
  latest_assessment_status: GoalAssessmentStatus | 'unknown' | 'failed';
  latest_assessment_date: string;
  continuation_id: string | null;
  continue_available: boolean;
  latest_attempt: PracticeJournalLatestAttempt | null;
  created_at: string;
  updated_at: string;
}

export interface PracticeJournalSourceSummary {
  access: 'available' | 'hidden' | 'deleted' | 'expired' | 'photo_unavailable' | string;
  review_id: string | null;
  photo_id: string | null;
  genre: ImageType | string | null;
}

export interface PracticeJournalLatestAttempt {
  attempt_id: string | null;
  task_id: string | null;
  review_id: string | null;
  review_access: 'available' | 'hidden' | 'deleted' | 'expired' | 'photo_unavailable' | 'none' | string;
  assessment_status: GoalAssessmentStatus | 'unknown' | 'failed';
  created_at: string | null;
}

export interface PracticeSessionsQuery {
  cursor?: string;
  limit?: number;
  lifecycle?: PracticeLifecycle | 'all';
  dimension?: RetakeDimensionKey | 'all';
  practice_kind?: PracticeKind | 'all';
}

export interface PracticeLegacyComparisonsQuery {
  cursor?: string;
  limit?: number;
}

export interface PracticeSessionsResponse {
  items: PracticeSessionListItem[];
  next_cursor: string | null;
  limit: number;
}

export interface PracticeLegacyComparisonsResponse {
  items: ReviewHistoryItem[];
  next_cursor: string | null;
}

export interface PracticeSummaryResponse {
  scope: 'all_practice';
  timeframe: {
    start_at: string | null;
    end_at: string | null;
  };
  session_count: number;
  attempt_count: number;
  sample_count: number;
  status_counts: Record<GoalAssessmentStatus, number>;
  unknown_count: number;
  indeterminate_count: number;
  failed_count: number;
}

export interface PracticeContext {
  session_id: string;
  attempt_id?: string | null;
  kind: PracticeKind;
  lifecycle: PracticeLifecycle;
  source_review_id: string | null;
  source_photo_id: string | null;
  source_access?: PracticeJournalSourceSummary['access'];
  continue_available?: boolean;
  sequence?: number | null;
}

export interface PracticeGoalSnapshot {
  goal_version: string;
  goal: string;
  dimension: RetakeDimensionKey;
}

export interface PracticeSuccessCriterion {
  key: string;
  label: string;
}

export interface PracticeSessionResponse {
  session_id: string;
  source_review_id: string | null;
  source_photo_id: string | null;
  source_access?: 'available' | 'hidden' | 'deleted' | 'expired' | string;
  practice_kind: PracticeKind;
  lifecycle: PracticeLifecycle;
  goal_snapshot: PracticeGoalSnapshot;
  success_criteria: PracticeSuccessCriterion[];
  locale: 'zh' | 'en' | 'ja';
  attempts: PracticeAttemptSummary[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PracticeSessionPatchRequest {
  lifecycle: PracticeLifecycle;
}

export interface PracticeFeedbackRequest {
  verdict: PracticeFeedbackVote;
  reason?: string | null;
}

export interface PracticeFeedbackResponse {
  feedback_id?: string;
  verdict: PracticeFeedbackVote;
  reason?: string | null;
  created_at?: string | null;
}

export type PracticeGuidanceLevel = 'records_only' | 'preliminary_observations' | 'practice_summary';

export interface PracticeSceneGroupRequest {
  label: string;
  description?: string | null;
}

export interface PracticeSceneGroupResponse {
  scene_group_id: string;
  session_id: string;
  label: string;
  description: string | null;
  visibility: 'private';
  updated_at: string;
}

export interface PracticeGuidanceCoverage {
  valid_session_count: number;
  valid_attempt_count: number;
  scene_group_count: number;
  goal_count: number;
  untagged_session_count: number;
  capture_retake_count: number;
  edit_revision_count: number;
  same_image_recheck_count: number;
}

export interface PracticeGuidanceEvidence {
  session_id: string;
  attempt_id: string;
  review_id: string;
  source_review_id: string;
  scene_group: string | null;
  goal: string;
  dimension: RetakeDimensionKey | string;
  status: Exclude<GoalAssessmentStatus, 'indeterminate'>;
  practice_kind: PracticeKind;
  created_at: string;
}

export interface PracticeGuidanceObservation {
  observation_id: string;
  kind: 'repeated_issue' | 'worked_example' | 'pending_goal';
  title: string;
  body: string;
  dimension: RetakeDimensionKey | string;
  source_count: number;
  source_attempt_ids: string[];
  source_session_ids: string[];
  scene_groups: string[];
  evidence: PracticeGuidanceEvidence[];
}

export interface PracticeGuidanceTemplate {
  template_id: string;
  version: string;
  dimension: RetakeDimensionKey | string;
  title: string;
  applicable_genres: string[];
  scene_conditions: string[];
  goal_example: string;
  success_criteria: PracticeSuccessCriterion[];
  counterexamples: string[];
  transfer_task: string;
  human_review_status: 'draft_pending_review' | 'owner_confirmed_summary';
}

export interface PracticeRecommendation {
  recommendation_id: string;
  template_id: string;
  template_version: string;
  title: string;
  reason: string;
  goal_snapshot: PracticeGoalSnapshot;
  success_criteria: PracticeSuccessCriterion[];
  suggested_scene_group: string | null;
  skip_available: boolean;
  change_goal_available: boolean;
  accept_available: boolean;
  accept_unavailable_reason: string | null;
  accept_payload: PracticeSessionCreateRequest | null;
}

export interface PracticeGuidanceProfileResponse {
  scope: 'owner_practice_guidance';
  level: PracticeGuidanceLevel;
  level_reason: string;
  coverage: PracticeGuidanceCoverage;
  observations: PracticeGuidanceObservation[];
  recent_evidence: PracticeGuidanceEvidence[];
  scene_group_gaps: string[];
  templates: PracticeGuidanceTemplate[];
  generated_at: string;
}

export interface PracticeRecommendationsResponse {
  scope: 'owner_practice_recommendations';
  level: PracticeGuidanceLevel;
  recommendations: PracticeRecommendation[];
  templates: PracticeGuidanceTemplate[];
  generated_at: string;
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
  prompt_example_id?: string | null;
  prompt_example_category?: string | null;
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
  analytics_source?: ProductAnalyticsSource;
  locale?: 'zh' | 'en' | 'ja';
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
  task_id?: string | null;
  photo_id: string;
  photo_url: string | null;
  mode: ReviewMode;
  status: ReviewStatus;
  image_type: ImageType;
  source_review_id?: string | null;
  practice?: PracticeContext | null;
  practice_session_id?: string | null;
  goal_assessment?: GoalAssessment | null;
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
  practice?: PracticeContext | null;
  practice_session_id?: string | null;
  comparison?: RetakeComparisonResult | null;
  goal_assessment?: GoalAssessment | null;
  final_score: number;
  scores: ReviewScores;
  model_name: string;
  model_version: string;
  scorer_model_name: string;
  scorer_model_version: string;
  writer_model_name: string;
  writer_model_version: string;
  score_version?: string | null;
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
  scorer_model_name: string;
  scorer_model_version: string;
  writer_model_name: string;
  writer_model_version: string;
  score_version?: string | null;
  final_score: number;
  scores: ReviewScores;
  score_evidence?: ReviewScoreEvidence | null;
  advantage: string;
  critique: string;
  suggestions: string;
  comparison?: RetakeComparisonResult | null;
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

// ─── Blog Views ──────────────────────────────────────────────────────────────

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
  | 'retake_coach'
  | 'home_direct'
  | 'blog'
  | 'gallery'
  | 'prompt_library'
  | 'share'
  | 'checkout'
  | 'system_performance'
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
