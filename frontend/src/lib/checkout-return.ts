const CHECKOUT_RETURN_PATH_KEY = 'ps_checkout_return_path_v1';

function safeRelativePath(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized.startsWith('/') || normalized.startsWith('//')) {
    return null;
  }
  return normalized.slice(0, 512);
}

export function currentCheckoutReturnPath(): string {
  if (typeof window === 'undefined') {
    return '/workspace';
  }
  return `${window.location.pathname}${window.location.search}`;
}

export function rememberCheckoutReturnPath(path = currentCheckoutReturnPath()): void {
  if (typeof window === 'undefined') {
    return;
  }
  const safePath = safeRelativePath(path);
  if (!safePath) {
    return;
  }
  try {
    window.sessionStorage.setItem(CHECKOUT_RETURN_PATH_KEY, safePath);
  } catch {
    // Best-effort only.
  }
}

export function consumeCheckoutReturnPath(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const value = safeRelativePath(window.sessionStorage.getItem(CHECKOUT_RETURN_PATH_KEY));
    window.sessionStorage.removeItem(CHECKOUT_RETURN_PATH_KEY);
    return value;
  } catch {
    return null;
  }
}
