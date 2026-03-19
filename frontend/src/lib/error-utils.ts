'use client';

import { ApiException } from './types';

type Translator = (key: string) => string;

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
  if (error instanceof ApiException) {
    return formatSupportMessage(t, error.message, error.requestId);
  }
  return formatSupportMessage(t, fallbackMessage);
}
