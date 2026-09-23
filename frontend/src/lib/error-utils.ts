'use client';

import type { Translator } from './i18n';
import type { TranslationKey } from './i18n-en';

type ErrorLike = {
  code?: string | null;
  requestId?: string;
  request_id?: string;
};

const ERROR_CODE_KEYS: Record<string, TranslationKey> = {
  BAD_REQUEST: 'err_validation_body',
  UNAUTHORIZED: 'err_unauthorized_body',
  FORBIDDEN: 'err_forbidden_body',
  NOT_FOUND: 'err_not_found_body',
  CONFLICT: 'err_conflict_body',
  RATE_LIMITED: 'err_rate_limited_body',
  VALIDATION_ERROR: 'err_validation_body',
  QUOTA_EXCEEDED: 'err_quota_exceeded_body',
  PLAN_MODE_FORBIDDEN: 'err_quota_exceeded_body',
  UPLOAD_FAILED: 'err_upload_failed_body',
  REVIEW_REJECTED: 'err_review_rejected_body',
  TASK_NOT_FOUND: 'err_not_found_body',
  TASK_FAILED: 'err_task_failed_body',
  TASK_EXPIRED: 'task_expired_detail',
  TASK_STALLED: 'task_timeout_error',
  TASK_DISPATCH_FAILED: 'err_service_unavailable_body',
  TASK_ALREADY_RUNNING: 'err_service_unavailable_body',
  TASK_DISPATCH_UNAUTHORIZED: 'err_unauthorized_body',
  TASK_STREAM_ERROR: 'task_fetch_error',
  BILLING_SIGNIN_REQUIRED: 'err_unauthorized_body',
  CREDIT_PACK_CURRENCY_UNSUPPORTED: 'usage_checkout_unavailable',
  GENERATION_LOGIN_REQUIRED: 'err_generation_login_required_body',
  GENERATION_QUALITY_FORBIDDEN: 'err_generation_quality_forbidden_body',
  GENERATION_CREDITS_EXHAUSTED: 'err_generation_credits_exhausted_body',
  IMAGE_GENERATION_CREDITS_EXHAUSTED: 'err_generation_credits_exhausted_body',
  GENERATION_PROMPT_REJECTED: 'err_generation_prompt_rejected_body',
  PROMPT_SAFETY: 'err_generation_prompt_rejected_body',
  GENERATION_TASK_DISPATCH_FAILED: 'err_service_unavailable_body',
  GENERATION_TASK_NOT_FOUND: 'err_generation_not_found_body',
  GENERATION_NOT_FOUND: 'err_generation_not_found_body',
  GENERATION_DOWNLOAD_FAILED: 'err_generation_download_failed_body',
  GENERATION_DOWNLOAD_SIZE_UNKNOWN: 'err_generation_download_failed_body',
  GENERATION_DOWNLOAD_TOO_LARGE: 'err_generation_download_failed_body',
  OPENAI_IMAGE_GENERATION_FAILED: 'err_generation_task_failed_body',
  IMAGE_GENERATION_FAILED: 'err_generation_task_failed_body',
  IMAGE_GENERATION_PROCESSING_FAILED: 'err_generation_task_failed_body',
  IMAGE_GENERATION_RESERVATION_INVALID: 'err_generation_task_failed_body',
  IMAGE_GENERATION_STORAGE_FAILED: 'err_generation_task_failed_body',
  IMAGE_GENERATION_PERSISTENCE_FAILED: 'err_generation_task_failed_body',
  USER_NOT_FOUND: 'err_not_found_body',
  PHOTO_NOT_FOUND: 'err_not_found_body',
  SOURCE_REVIEW_REQUIRED: 'err_validation_body',
  SOURCE_REVIEW_NOT_FOUND: 'err_not_found_body',
  SOURCE_PHOTO_NOT_FOUND: 'err_not_found_body',
  IDEMPOTENCY_CONFLICT: 'err_idempotency_conflict_body',
  PRACTICE_DISABLED: 'err_practice_disabled_body',
  PRACTICE_SESSION_NOT_FOUND: 'err_not_found_body',
  PRACTICE_SESSION_FORBIDDEN: 'err_forbidden_body',
  PRACTICE_SESSION_DUPLICATE: 'err_idempotency_conflict_body',
  PRACTICE_SESSION_ARCHIVED: 'err_practice_unavailable_body',
  PRACTICE_SESSION_INACTIVE: 'err_practice_unavailable_body',
  PRACTICE_SESSION_SOURCE_MISMATCH: 'err_practice_unavailable_body',
  PRACTICE_SESSION_KIND_MISMATCH: 'err_practice_unavailable_body',
  PRACTICE_SOURCE_CONFLICT: 'err_practice_unavailable_body',
  PRACTICE_SOURCE_NOT_READY: 'err_practice_unavailable_body',
  PRACTICE_LOCALE_CONFLICT: 'err_practice_unavailable_body',
  PRACTICE_KIND_CONFLICT: 'err_practice_unavailable_body',
  PRACTICE_KIND_ANALYSIS_MISMATCH: 'err_practice_kind_invalid_body',
  PRACTICE_OWNER_CONFLICT: 'err_practice_unavailable_body',
  PRACTICE_PHOTO_MISSING: 'err_practice_unavailable_body',
  PRACTICE_PHOTO_CONFLICT: 'err_practice_unavailable_body',
  PRACTICE_ATTEMPT_NOT_FOUND: 'err_not_found_body',
  PRACTICE_ATTEMPT_MISSING: 'err_practice_unavailable_body',
  PRACTICE_ATTEMPT_DUPLICATE_TASK: 'err_idempotency_conflict_body',
  PRACTICE_RESULT_REQUIRED: 'err_practice_unavailable_body',
  PRACTICE_GOAL_INVALID: 'err_practice_goal_invalid_body',
  PRACTICE_KIND_INVALID: 'err_practice_kind_invalid_body',
  PRACTICE_ASYNC_REQUIRED: 'err_practice_kind_invalid_body',
  RETAKE_PHOTO_DUPLICATE: 'err_practice_kind_invalid_body',
  REANALYZE_PHOTO_MISMATCH: 'err_practice_kind_invalid_body',
  GOAL_ASSESSMENT_INVALID: 'err_practice_assessment_invalid_body',
  INTERNAL_ERROR: 'err_unknown_body',
  UPSTREAM_ERROR: 'err_service_unavailable_body',
  SERVICE_UNAVAILABLE: 'err_service_unavailable_body',
};

export function localizedErrorMessage(
  t: Translator,
  errorOrCode?: ErrorLike | string | null,
  fallbackMessage?: string
): string {
  const code = typeof errorOrCode === 'string' ? errorOrCode : errorOrCode?.code;
  const key = code ? ERROR_CODE_KEYS[code.trim().toUpperCase()] : null;
  return key ? t(key) : fallbackMessage ?? t('err_unknown_body');
}

export function formatSupportMessage(
  t: Translator,
  message: string,
  requestId?: string
): string {
  const parts = [message, t('support_contact_prompt')];
  if (requestId) {
    parts.push(t('support_request_id').replace('{id}', requestId));
  }
  return parts.join(' ');
}

export function formatUserFacingError(
  t: Translator,
  error: unknown,
  fallbackMessage: string
): string {
  if (isApiExceptionLike(error)) {
    return formatSupportMessage(t, localizedErrorMessage(t, error, fallbackMessage), error.requestId);
  }
  return formatSupportMessage(t, fallbackMessage);
}

export function formatTaskError(
  t: Translator,
  error: ErrorLike | null | undefined,
  fallbackMessage: string
): string {
  const requestId = error?.requestId ?? error?.request_id;
  return formatSupportMessage(t, localizedErrorMessage(t, error, fallbackMessage), requestId);
}

function isApiExceptionLike(error: unknown): error is ErrorLike & { requestId?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { name?: unknown }).name === 'ApiException'
  );
}
