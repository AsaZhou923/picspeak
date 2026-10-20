import type { GenerationCreateRequest } from '../../lib/types';

type PendingRecord = { key: string; locale?: GenerationCreateRequest['locale']; analyticsSource?: GenerationCreateRequest['analytics_source'] };
export type PendingGenerationRequest = { storageKey: string; payload: GenerationCreateRequest };
const pending = new Map<string, PendingRecord>();
const PREFIX = 'ps_pending_generation_v1:';

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item);
}

/** Persist only an opaque fingerprint, key and request locale, never prompts or auth tokens. */
export async function prepareGenerationRequest(
  owner: string,
  payload: GenerationCreateRequest,
): Promise<PendingGenerationRequest> {
  const { idempotency_key: _key, locale, analytics_source: analyticsSource, ...intent } = payload;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson({ owner, intent })));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const storageKey = `${PREFIX}${fingerprint}`;
  let record = pending.get(storageKey);
  if (!record) {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? 'null') as PendingRecord | null;
      if (saved && typeof saved.key === 'string' && saved.key.startsWith('generation_')) record = saved;
    } catch { /* Restricted storage must not prevent an in-memory retry. */ }
  }
  if (!record) record = { key: `generation_${crypto.randomUUID()}`, locale, analyticsSource };
  pending.set(storageKey, record);
  try { window.sessionStorage.setItem(storageKey, JSON.stringify(record)); } catch { /* Best effort. */ }
  return {
    storageKey,
    // Locale/attribution changes are not a new generation intent. Replay the original body exactly.
    payload: { ...payload, locale: record.locale, analytics_source: record.analyticsSource, idempotency_key: record.key },
  };
}

/** End an intent only after its current owner accepts navigation; abandoned responses remain retryable. */
export function completeGenerationRequest(request: PendingGenerationRequest): void {
  if (pending.get(request.storageKey)?.key === request.payload.idempotency_key) pending.delete(request.storageKey);
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(request.storageKey) ?? 'null') as PendingRecord | null;
    if (saved?.key === request.payload.idempotency_key) window.sessionStorage.removeItem(request.storageKey);
  } catch { /* Best effort. */ }
}
