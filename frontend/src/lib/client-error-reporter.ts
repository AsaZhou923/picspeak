'use client';

export type ClientErrorKind = 'error' | 'unhandledrejection' | 'csp';

export interface ClientErrorReportPayload {
  kind: ClientErrorKind;
  source?: string;
  message: string;
  stack?: string;
  url?: string;
  user_agent?: string;
  release?: string;
}

export interface ClientErrorReportOptions {
  kind?: ClientErrorKind;
  source?: string;
  sampleRate?: number;
  url?: string;
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
const MAX_MESSAGE_CHARS = 500;
const MAX_STACK_CHARS = 3_500;
const MAX_URL_CHARS = 512;
const MAX_UA_CHARS = 256;

const CSP_ERROR_PATTERN = /\b(?:content[- ]security[- ]policy|securitypolicyviolation)\b/i;

export const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'photo_token',
  'generation_token',
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
  'auth',
  'authorization',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
  '__clerk_handshake',
  '__clerk_db_jwt',
  '__clerk_ticket',
  '__clerk_status',
]);

const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const SECRET_QUERY_TEXT_PATTERN =
  /([?&](?:token|photo_token|generation_token|access_token|guest_token|session_token|refresh_token|id_token|x-amz-signature|x-amz-credential|x-amz-security-token|__clerk_handshake|__clerk_db_jwt)=)[^&\s"'<>]+/gi;

const recentFingerprints = new Map<string, number>();
let sessionReportCount = 0;
let isDispatchingReport = false;
let reportingTransportFailed = false;

let globalHandlersInstalled = false;
let globalHandlersRefCount = 0;
let activeGlobalCleanup: (() => void) | null = null;

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
  return (configured || 'dev').slice(0, 64);
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
    const kept = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      if (!SENSITIVE_QUERY_PARAMS.has(key.trim().toLowerCase())) {
        kept.append(key, value);
      }
    }
    const query = kept.toString();
    return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}`.slice(0, MAX_URL_CHARS);
  } catch {
    return undefined;
  }
}

export function sanitizeReportText(raw?: string | null, maxLength = MAX_MESSAGE_CHARS): string | undefined {
  if (!raw || typeof raw !== 'string') {
    return undefined;
  }
  const scrubbed = raw
    .trim()
    .replace(BEARER_PATTERN, 'Bearer ***')
    .replace(SECRET_QUERY_TEXT_PATTERN, '$1***');
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

  const source = options.source?.trim().slice(0, 64) || undefined;
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

  if (sessionReportCount >= MAX_REPORTS_PER_SESSION) {
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
  sessionReportCount += 1;

  const currentUrl = options.url ?? (typeof window !== 'undefined' ? window.location?.href : undefined);
  const currentUa = options.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : undefined);

  const payload: ClientErrorReportPayload = {
    kind,
    ...(source ? { source } : {}),
    message,
    ...(stack ? { stack } : {}),
    ...(sanitizeReportUrl(currentUrl) ? { url: sanitizeReportUrl(currentUrl) } : {}),
    ...(sanitizeReportText(currentUa, MAX_UA_CHARS) ? { user_agent: sanitizeReportText(currentUa, MAX_UA_CHARS) } : {}),
    release: (options.release ?? resolveRelease()).slice(0, 64),
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
    if (requestPromise && typeof requestPromise.catch === 'function') {
      void requestPromise.catch(() => {
        // Once the reporting transport fails (e.g. blocked or offline), skip
        // further reporting for this page session and never emit unhandled rejections.
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

export function resetClientErrorReporterForTests(): void {
  recentFingerprints.clear();
  sessionReportCount = 0;
  isDispatchingReport = false;
  reportingTransportFailed = false;
  if (activeGlobalCleanup) {
    activeGlobalCleanup();
  }
  globalHandlersInstalled = false;
  globalHandlersRefCount = 0;
}
