'use client';

export type ClientErrorKind = 'error' | 'unhandledrejection' | 'csp';

export interface ClientErrorReportPayload {
  kind: ClientErrorKind;
  source?: string;
  message: string;
  stack?: string;
  url?: string;
  referrer?: string;
  user_agent?: string;
  release?: string;
}

export interface ClientErrorReportOptions {
  kind?: ClientErrorKind;
  source?: string;
  sampleRate?: number;
  url?: string;
  referrer?: string;
  userAgent?: string;
  release?: string;
  endpoint?: string | null;
  fetchImpl?: typeof fetch;
  random?: () => number;
  now?: () => number;
}

export interface GlobalErrorHandlerOptions {
  sampleRate?: number;
  endpoint?: string | null;
  fetchImpl?: typeof fetch;
  random?: () => number;
  now?: () => number;
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

const DEFAULT_GLOBAL_SAMPLE_RATE = 1;
const DEDUP_WINDOW_MS = 60_000;
const MAX_REPORTS_PER_SESSION = 20;
const SESSION_COUNT_STORAGE_KEY = 'ps_client_error_count_v1';
const MAX_MESSAGE_CHARS = 500;
const MAX_STACK_CHARS = 3_500;
const MAX_URL_CHARS = 512;
const MAX_UA_CHARS = 256;

const CSP_ERROR_PATTERN = /\b(?:content[- ]security[- ]policy|securitypolicyviolation)\b/i;

// Single shared lists used for redacting BOTH standalone URLs (url, referrer)
// and free-text fields (message, stack, source, user_agent, release).
export const CAPABILITY_PATH_PREFIXES = [
  '/share/',
  '/public/reviews/',
] as const;

export const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'photo_token',
  'generation_token',
  'share_token',
  'grant_token',
  'access_token',
  'guest_token',
  'session_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'signature',
  'code',
  'state',
  'auth',
  'authorization',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
  'x-goog-signature',
  'x-goog-credential',
  '__clerk_handshake',
  '__clerk_db_jwt',
  '__clerk_ticket',
  '__clerk_status',
  '__clerk_created_session',
]);

// Every signed-URL parameter in these families (X-Amz-Date, X-Amz-Expires, ...) is redacted.
export const SENSITIVE_QUERY_PARAM_PREFIXES = ['x-amz-', 'x-goog-'] as const;

function isSensitiveQueryParam(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return SENSITIVE_QUERY_PARAMS.has(normalized) || SENSITIVE_QUERY_PARAM_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Tokens never contain `[`, so an already-redacted `[redacted]` segment is left alone.
const CAPABILITY_PATH_PATTERN = new RegExp(
  `(${CAPABILITY_PATH_PREFIXES.map(escapeRegExp).join('|')})([^/?#\\s"'<>\\)\\[\\]]+)`,
  'gi',
);
const ENCODED_CAPABILITY_PATH_PATTERN = new RegExp(
  `(${CAPABILITY_PATH_PREFIXES.map((p) => escapeRegExp(p.replaceAll('/', '%2f'))).join('|')})((?:(?!%2[fF]|%3[fF]|%23|[/?#&\\s"'<>\\)\\[\\]]).)+)`,
  'gi',
);
const SENSITIVE_QUERY_ALT = [
  ...SENSITIVE_QUERY_PARAM_PREFIXES.map((prefix) => `${escapeRegExp(prefix)}[a-z0-9-]+`),
  ...[...SENSITIVE_QUERY_PARAMS].sort((a, b) => b.length - a.length).map(escapeRegExp),
].join('|');
const SECRET_QUERY_TEXT_PATTERN = new RegExp(
  `((?:^|[?&]|%3[fF]|%26|\\\\u0026|\\\\u003[fF]|&amp;)(?:${SENSITIVE_QUERY_ALT})(?:=|%3[dD]|\\\\u003[dD]))(?:(?!%26|\\\\u0026|&amp;|[&\\s"'<>\\)\\]]).)*`,
  'gi',
);
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const URL_USERINFO_PATTERN = /\b(https?:\/\/)([^/\s@"'<>]+)@/gi;

const recentFingerprints = new Map<string, number>();
let inMemorySessionReportCount = 0;
let isDispatchingReport = false;
let reportingTransportFailed = false;

let globalHandlersInstalled = false;
let globalHandlersRefCount = 0;
let activeGlobalCleanup: (() => void) | null = null;

function readSessionReportCount(): number {
  let storedCount = 0;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(SESSION_COUNT_STORAGE_KEY);
      if (raw !== null) {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          storedCount = parsed;
        }
      }
    }
  } catch {
    // Restricted storage access falls back to in-memory tracking.
  }
  return Math.max(inMemorySessionReportCount, storedCount);
}

function writeSessionReportCount(nextCount: number): void {
  inMemorySessionReportCount = nextCount;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(SESSION_COUNT_STORAGE_KEY, String(nextCount));
    }
  } catch {
    // Best-effort persistence only.
  }
}

function resolveDefaultGlobalSampleRate(): number {
  const raw = process.env.NEXT_PUBLIC_CLIENT_ERROR_SAMPLE_RATE?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return DEFAULT_GLOBAL_SAMPLE_RATE;
}

function resolveRelease(): string {
  const configured =
    process.env.NEXT_PUBLIC_RELEASE?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim();
  return sanitizeReportText(configured || 'dev', 64) ?? 'dev';
}

export function resolveClientErrorEndpoint(apiBase?: string): string | null {
  const configured = (apiBase ?? process.env.NEXT_PUBLIC_API_URL ?? '').trim();
  const fallback = configured || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000');
  if (!fallback) {
    return null;
  }
  try {
    const parsed = new URL(fallback);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const basePath = parsed.pathname.replace(/\/$/, '');
    const apiPath = basePath.endsWith('/api/v1')
      ? basePath
      : basePath.endsWith('/api')
        ? `${basePath}/v1`
        : `${basePath}/api/v1`;
    return `${parsed.origin}${apiPath}/client-errors`.replace(/([^:]\/)\/+/g, '$1');
  } catch {
    return null;
  }
}

function redactCapabilityPaths(value: string): string {
  return value
    .replace(CAPABILITY_PATH_PATTERN, '$1[redacted]')
    .replace(ENCODED_CAPABILITY_PATH_PATTERN, '$1[redacted]');
}

function redactSensitiveText(value: string): string {
  return redactCapabilityPaths(value)
    .replace(URL_USERINFO_PATTERN, '$1***@')
    .replace(BEARER_PATTERN, 'Bearer ***')
    .replace(SECRET_QUERY_TEXT_PATTERN, '$1***');
}

export function sanitizeReportUrl(rawUrl?: string | null): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return undefined;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://www.picspeak.art';
    const parsed = new URL(trimmed, base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    const safePath = redactCapabilityPaths(parsed.pathname);
    const kept = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      if (!isSensitiveQueryParam(key)) {
        kept.append(key, value);
      }
    }
    const query = kept.toString();
    return redactSensitiveText(`${parsed.origin}${safePath}${query ? `?${query}` : ''}`).slice(0, MAX_URL_CHARS);
  } catch {
    return undefined;
  }
}

export function sanitizeReportText(raw?: string | null, maxLength = MAX_MESSAGE_CHARS): string | undefined {
  if (!raw || typeof raw !== 'string') {
    return undefined;
  }
  const scrubbed = redactSensitiveText(raw.trim());
  if (!scrubbed) {
    return undefined;
  }
  return scrubbed.length <= maxLength ? scrubbed : `${scrubbed.slice(0, maxLength)}...<truncated>`;
}

function isAbortLike(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (error as { name?: unknown }).name === 'AbortError';
}

function extractMessageAndStack(errorOrMessage: unknown): { message: string; stack?: string } {
  if (typeof errorOrMessage === 'string') {
    return { message: errorOrMessage };
  }
  if (errorOrMessage instanceof Error) {
    const errObj = errorOrMessage as Error & { code?: unknown; status?: unknown };
    const code = typeof errObj.code === 'string' ? errObj.code : '';
    const status = typeof errObj.status === 'number' ? errObj.status : null;
    const prefix = code ? `[${code}${status !== null ? ` HTTP ${status}` : ''}] ` : '';
    return {
      message: `${prefix}${errorOrMessage.message || errorOrMessage.name || 'Error'}`,
      stack: errorOrMessage.stack,
    };
  }
  if (errorOrMessage && typeof errorOrMessage === 'object') {
    const obj = errorOrMessage as { message?: unknown; code?: unknown; status?: unknown; stack?: unknown };
    const code = typeof obj.code === 'string' ? obj.code : '';
    const status = typeof obj.status === 'number' ? obj.status : null;
    const prefix = code ? `[${code}${status !== null ? ` HTTP ${status}` : ''}] ` : '';
    const msg = typeof obj.message === 'string' && obj.message.trim() ? obj.message : 'Unknown browser error';
    return {
      message: `${prefix}${msg}`,
      stack: typeof obj.stack === 'string' ? obj.stack : undefined,
    };
  }
  return { message: 'Unknown browser error' };
}

function buildFingerprint(kind: ClientErrorKind, source: string | undefined, message: string, stack?: string): string {
  const topFrame = stack ? stack.split('\n').slice(0, 2).join('|') : '';
  return `${kind}|${source ?? ''}|${message.slice(0, 160)}|${topFrame.slice(0, 160)}`;
}

export function reportClientError(
  errorOrMessage: unknown,
  options: ClientErrorReportOptions = {}
): boolean {
  if (isDispatchingReport || reportingTransportFailed || isAbortLike(errorOrMessage)) {
    return false;
  }

  const kind: ClientErrorKind = options.kind ?? 'error';
  // Browsers deliver CSP reports directly via report-uri / report-to; the JS
  // reporter must never re-send CSP violations (prevents reporting loops).
  if (kind === 'csp') {
    return false;
  }

  const endpoint = options.endpoint !== undefined ? options.endpoint : resolveClientErrorEndpoint();
  const fetchImpl = options.fetchImpl ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  if (!endpoint || !fetchImpl) {
    return false;
  }

  const source = sanitizeReportText(options.source, 64);
  const { message: rawMessage, stack: rawStack } = extractMessageAndStack(errorOrMessage);
  const message = sanitizeReportText(rawMessage, MAX_MESSAGE_CHARS);
  if (!message) {
    return false;
  }

  // Never recursively report errors from the reporting endpoint itself or CSP violations.
  if (message.includes('/client-errors') || CSP_ERROR_PATTERN.test(message)) {
    return false;
  }

  const stack = sanitizeReportText(rawStack, MAX_STACK_CHARS);
  const now = (options.now ?? Date.now)();

  const currentCount = readSessionReportCount();
  if (currentCount >= MAX_REPORTS_PER_SESSION) {
    return false;
  }

  const fingerprint = buildFingerprint(kind, source, message, stack);
  const previousTs = recentFingerprints.get(fingerprint);
  if (previousTs !== undefined && now - previousTs < DEDUP_WINDOW_MS) {
    return false;
  }

  const sampleRate = options.sampleRate ?? 1;
  const random = options.random ?? Math.random;
  if (sampleRate <= 0 || (sampleRate < 1 && random() >= sampleRate)) {
    return false;
  }

  // Prune stale dedup entries so the map stays small.
  if (recentFingerprints.size > 64) {
    for (const [key, ts] of recentFingerprints.entries()) {
      if (now - ts >= DEDUP_WINDOW_MS) {
        recentFingerprints.delete(key);
      }
    }
  }

  recentFingerprints.set(fingerprint, now);
  writeSessionReportCount(currentCount + 1);

  const currentUrl = options.url ?? (typeof window !== 'undefined' ? window.location?.href : undefined);
  const currentReferrer = options.referrer ?? (typeof document !== 'undefined' ? document.referrer || undefined : undefined);
  const currentUa = options.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : undefined);
  const sanitizedUrl = sanitizeReportUrl(currentUrl);
  const sanitizedReferrer = sanitizeReportUrl(currentReferrer);
  const sanitizedUa = sanitizeReportText(currentUa, MAX_UA_CHARS);
  const sanitizedRelease = sanitizeReportText(options.release, 64) ?? resolveRelease();

  const payload: ClientErrorReportPayload = {
    kind,
    ...(source ? { source } : {}),
    message,
    ...(stack ? { stack } : {}),
    ...(sanitizedUrl ? { url: sanitizedUrl } : {}),
    ...(sanitizedReferrer ? { referrer: sanitizedReferrer } : {}),
    ...(sanitizedUa ? { user_agent: sanitizedUa } : {}),
    release: sanitizedRelease,
  };

  isDispatchingReport = true;
  try {
    const requestPromise = fetchImpl(endpoint, {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (requestPromise && typeof requestPromise.then === 'function') {
      void requestPromise
        .then((response) => {
          if (!response || !response.ok) {
            reportingTransportFailed = true;
          }
        })
        .catch(() => {
          // Once the reporting endpoint returns non-2xx or fails at the network
          // layer, stop sending for the rest of this page session.
          reportingTransportFailed = true;
        });
    }
    return true;
  } catch {
    reportingTransportFailed = true;
    return false;
  } finally {
    isDispatchingReport = false;
  }
}

export function installGlobalClientErrorHandlers(options: GlobalErrorHandlerOptions = {}): () => void {
  const target = options.target ?? (typeof window !== 'undefined' ? window : null);
  if (!target || typeof target.addEventListener !== 'function') {
    return () => {};
  }

  globalHandlersRefCount += 1;
  if (!globalHandlersInstalled) {
    const sampleRate = options.sampleRate ?? resolveDefaultGlobalSampleRate();

    const onError = (event: Event) => {
      const errorEvent = event as ErrorEvent;
      const err = errorEvent.error ?? (errorEvent.message ? new Error(errorEvent.message) : null);
      if (!err) {
        return;
      }
      reportClientError(err, {
        kind: 'error',
        source: 'window_error',
        sampleRate,
        endpoint: options.endpoint,
        fetchImpl: options.fetchImpl,
        random: options.random,
        now: options.now,
      });
    };

    const onUnhandledRejection = (event: Event) => {
      const rejectionEvent = event as PromiseRejectionEvent;
      if (rejectionEvent.reason === undefined || rejectionEvent.reason === null) {
        return;
      }
      reportClientError(rejectionEvent.reason, {
        kind: 'unhandledrejection',
        source: 'unhandledrejection',
        sampleRate,
        endpoint: options.endpoint,
        fetchImpl: options.fetchImpl,
        random: options.random,
        now: options.now,
      });
    };

    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onUnhandledRejection);
    globalHandlersInstalled = true;
    activeGlobalCleanup = () => {
      target.removeEventListener('error', onError);
      target.removeEventListener('unhandledrejection', onUnhandledRejection);
      globalHandlersInstalled = false;
      activeGlobalCleanup = null;
    };
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    globalHandlersRefCount = Math.max(0, globalHandlersRefCount - 1);
    if (globalHandlersRefCount === 0 && activeGlobalCleanup) {
      activeGlobalCleanup();
    }
  };
}

export function resetClientErrorReporterForTests(options: { clearStorage?: boolean } = {}): void {
  recentFingerprints.clear();
  inMemorySessionReportCount = 0;
  isDispatchingReport = false;
  reportingTransportFailed = false;
  if (options.clearStorage !== false) {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(SESSION_COUNT_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }
  if (activeGlobalCleanup) {
    activeGlobalCleanup();
  }
  globalHandlersInstalled = false;
  globalHandlersRefCount = 0;
}
