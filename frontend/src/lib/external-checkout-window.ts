'use client';

export type ExternalCheckoutWindow = Window | null;

export function openExternalCheckoutWindow(message = 'Opening checkout...'): ExternalCheckoutWindow {
  if (typeof window === 'undefined') {
    return null;
  }

  const checkoutWindow = window.open('', '_blank');
  if (!checkoutWindow) {
    return null;
  }

  try {
    checkoutWindow.opener = null;
    checkoutWindow.document.title = 'PicSpeak Checkout';
    checkoutWindow.document.body.innerHTML = `
      <main style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; display: grid; place-items: center; margin: 0; background: #111; color: #f4efe7;">
        <div style="max-width: 420px; padding: 32px; text-align: center;">
          <h1 style="font-size: 22px; margin: 0 0 12px;">PicSpeak</h1>
          <p style="margin: 0; color: rgba(244,239,231,.72); line-height: 1.7;">${escapeHtml(message)}</p>
        </div>
      </main>
    `;
  } catch {
    // Some browsers restrict writing to the placeholder page. Navigation can still work.
  }

  return checkoutWindow;
}

export function navigateExternalCheckoutWindow(
  checkoutWindow: ExternalCheckoutWindow,
  url: string
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (checkoutWindow && !checkoutWindow.closed) {
    checkoutWindow.location.href = url;
    return true;
  }

  return Boolean(window.open(url, '_blank', 'noopener,noreferrer'));
}

export function closeExternalCheckoutWindow(checkoutWindow: ExternalCheckoutWindow): void {
  try {
    if (checkoutWindow && !checkoutWindow.closed) {
      checkoutWindow.close();
    }
  } catch {
    // Ignore browser-specific close restrictions.
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
