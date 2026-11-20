import type { AuthToken } from './types';

// Signed-in browsers get the full window so a slow network does not prematurely
// fail authentication; signed-out browsers without Clerk cookies fall back fast.
export const CLERK_LOAD_TIMEOUT_MS = 8000;
export const CLERK_SIGNED_OUT_LOAD_TIMEOUT_MS = 1500;

/** What the browser's Clerk cookies say when the Clerk script itself is unavailable. */
export type ClerkSessionHint = {
  signedIn: boolean;
  clerkUserId: string | null;
};

export type ClerkFallbackAction =
  | 'logout'
  | 'reuse_persisted'
  | 'guest_ready'
  | 'auth_unavailable';

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    // Ignore malformed JWT payloads.
  }
  return null;
}

/**
 * Parses Clerk's first-party cookies without Clerk JS. `__client_uat` is `0`
 * (or absent) for signed-out browsers; `__session` carries the signed-in
 * user's id. Instance-suffixed variants (`__client_uat_xxxx`) are accepted.
 */
export function parseClerkSessionHint(cookies: string): ClerkSessionHint {
  let clientUat: boolean | null = null;
  let clerkUserId: string | null = null;
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    let value = part.slice(separator + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep the raw value.
    }
    if (/^__client_uat(_[\w-]+)?$/.test(name)) {
      clientUat = clientUat === true || (value !== '' && value !== '0');
    } else if (/^__session(_[\w-]+)?$/.test(name) && value) {
      const sub = decodeJwtPayload(value)?.sub;
      if (typeof sub === 'string' && sub) clerkUserId = sub;
    }
  }
  const signedIn = clientUat ?? Boolean(clerkUserId);
  return { signedIn, clerkUserId: signedIn ? clerkUserId : null };
}

/**
 * Signed-out browsers have no Clerk session cookie to preserve and can drop to
 * the guest path quickly if Clerk JS hangs. Signed-in browsers keep the full
 * timeout so slow connections are not misclassified as unavailable.
 */
export function getClerkLoadTimeoutMs(hint: Pick<ClerkSessionHint, 'signedIn'>): number {
  return hint.signedIn ? CLERK_LOAD_TIMEOUT_MS : CLERK_SIGNED_OUT_LOAD_TIMEOUT_MS;
}

/** Detects Clerk's `failed_to_load_clerk_js` error across Error objects and rejection payloads. */
export function isClerkScriptLoadError(error: unknown): boolean {
  if (typeof error === 'string') {
    return error.includes('failed_to_load_clerk_js');
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    errors?: unknown;
    cause?: unknown;
  };
  if (candidate.code === 'failed_to_load_clerk_js') {
    return true;
  }
  if (typeof candidate.message === 'string' && candidate.message.includes('failed_to_load_clerk_js')) {
    return true;
  }
  if (Array.isArray(candidate.errors)) {
    for (const item of candidate.errors) {
      if (isClerkScriptLoadError(item)) return true;
    }
  }
  if (candidate.cause && candidate.cause !== error && isClerkScriptLoadError(candidate.cause)) {
    return true;
  }
  return false;
}

type ScriptTargetLike = {
  tagName?: unknown;
  src?: unknown;
  hasAttribute?: (name: string) => boolean;
  getAttribute?: (name: string) => string | null;
};

/**
 * Identifies `<script data-clerk-js-script>` (SSR-injected) and Clerk's
 * hotloaded `clerk.browser.js` script tag so `error` events trigger fallback
 * immediately instead of waiting for Clerk's 15s internal retry timeout.
 */
export function isClerkJsScriptElement(target: unknown): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }
  const el = target as ScriptTargetLike;
  if (typeof el.tagName !== 'string' || el.tagName.toUpperCase() !== 'SCRIPT') {
    return false;
  }
  const hasAttr = (name: string): boolean => {
    if (typeof el.hasAttribute === 'function') {
      return el.hasAttribute(name);
    }
    if (typeof el.getAttribute === 'function') {
      return el.getAttribute(name) !== null;
    }
    return false;
  };
  if (hasAttr('data-clerk-js-script')) {
    return true;
  }
  if (hasAttr('data-clerk-ui-script')) {
    return false;
  }
  const src =
    typeof el.src === 'string'
      ? el.src
      : typeof el.getAttribute === 'function'
        ? el.getAttribute('src') ?? ''
        : '';
  return hasAttr('data-clerk-publishable-key') && /(?:@clerk\/clerk-js|clerk\.browser\.js)/i.test(src);
}

/**
 * Pure fallback decision when Clerk JS cannot load.
 * Preserves the security invariant: a browser with a Clerk sign-in cookie
 * (`hint.signedIn === true`) is NEVER downgraded to guest.
 */
export function resolveClerkFallbackAction(params: {
  hint: ClerkSessionHint;
  persistedAuth: Pick<AuthToken, 'auth_provider' | 'clerk_user_id'> | null;
  previousAuth: Pick<AuthToken, 'auth_provider'> | null;
  isPersistedMatchingClerkSession: boolean;
}): ClerkFallbackAction {
  const { hint, persistedAuth, previousAuth, isPersistedMatchingClerkSession } = params;
  if (!hint.signedIn) {
    if (persistedAuth?.auth_provider === 'clerk' || previousAuth?.auth_provider === 'clerk') {
      return 'logout';
    }
    return persistedAuth ? 'reuse_persisted' : 'guest_ready';
  }
  if (persistedAuth && hint.clerkUserId && isPersistedMatchingClerkSession) {
    return 'reuse_persisted';
  }
  if (
    persistedAuth?.auth_provider === 'clerk' &&
    hint.clerkUserId &&
    persistedAuth.clerk_user_id !== hint.clerkUserId
  ) {
    return 'logout';
  }
  return 'auth_unavailable';
}
