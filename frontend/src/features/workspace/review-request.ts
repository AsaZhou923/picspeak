import type { ReviewCreateRequest } from '../../lib/types';

type PendingRecord = { key: string; locale?: ReviewCreateRequest['locale'] };
export type PendingReviewRequest = { storageKey: string; payload: ReviewCreateRequest; isRetry: boolean };
const pending = new Map<string, PendingRecord>();
const PREFIX = 'ps_pending_review_v1:';

/** Keep an uncertain critique retry tied to its original key and language. */
export async function prepareReviewRequest(
  owner: string,
  payload: ReviewCreateRequest,
): Promise<PendingReviewRequest> {
  const { idempotency_key: _key, locale, ...intent } = payload;
  const canonical = JSON.stringify({ owner, intent }, (_name, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
      : value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const storageKey = `${PREFIX}${fingerprint}`;
  let record = pending.get(storageKey);
  if (!record) {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? 'null') as PendingRecord | null;
      if (saved && typeof saved.key === 'string' && saved.key.startsWith('review_')) record = saved;
    } catch { /* Restricted storage still allows an in-memory retry. */ }
  }
  const isRetry = Boolean(record);
  if (!record) record = { key: `review_${crypto.randomUUID()}`, locale };
  pending.set(storageKey, record);
  // Persist only the opaque fingerprint, retry key and locale, never photo IDs or tokens.
  try { window.sessionStorage.setItem(storageKey, JSON.stringify(record)); } catch { /* Best effort. */ }
  return { storageKey, payload: { ...payload, locale: record.locale, idempotency_key: record.key }, isRetry };
}

/** Clear after a current-owner handoff, or cancel a preparation that was never submitted. */
export function completeReviewRequest(request: PendingReviewRequest): void {
  if (pending.get(request.storageKey)?.key === request.payload.idempotency_key) pending.delete(request.storageKey);
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(request.storageKey) ?? 'null') as PendingRecord | null;
    if (saved?.key === request.payload.idempotency_key) window.sessionStorage.removeItem(request.storageKey);
  } catch { /* Best effort. */ }
}
