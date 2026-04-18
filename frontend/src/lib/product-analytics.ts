'use client';

import { trackProductAnalyticsEvent } from '@/lib/api';
import type { ProductAnalyticsSource } from '@/lib/types';

export type ProductAnalyticsEventName =
  | 'home_viewed'
  | 'blog_post_viewed'
  | 'gallery_viewed'
  | 'share_viewed'
  | 'workspace_viewed'
  | 'image_selected'
  | 'upload_succeeded'
  | 'start_review_clicked'
  | 'review_requested'
  | 'review_result_viewed'
  | 'reanalysis_clicked'
  | 'share_clicked'
  | 'export_clicked'
  | 'upgrade_pro_clicked'
  | 'checkout_started'
  | 'paid_success'
  | 'payment_success_viewed'
  | 'sign_in_completed';

const ANALYTICS_SOURCE_KEY = 'ps_product_source_v1';
const ANALYTICS_SESSION_KEY = 'ps_product_session_v1';

export function normalizeProductAnalyticsSource(value: string | null | undefined): ProductAnalyticsSource | null {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'home_direct':
      return 'home_direct';
    case 'blog':
      return 'blog';
    case 'gallery':
      return 'gallery';
    case 'share':
      return 'share';
    case 'checkout':
      return 'checkout';
    case 'unknown':
      return 'unknown';
    default:
      return null;
  }
}

function canUseBrowserStorage(): boolean {
  return typeof window !== 'undefined';
}

export function getProductAnalyticsSessionId(): string | null {
  if (!canUseBrowserStorage()) {
    return null;
  }

  try {
    const existing = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY)?.trim();
    if (existing) {
      return existing;
    }

    const generated =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, generated);
    return generated;
  } catch {
    return null;
  }
}

export function markProductAttributionSource(source: ProductAnalyticsSource): void {
  if (!canUseBrowserStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(ANALYTICS_SOURCE_KEY, source);
  } catch {
    // Best-effort only.
  }
}

export function readProductAttributionSource(): ProductAnalyticsSource {
  if (!canUseBrowserStorage()) {
    return 'unknown';
  }

  try {
    const stored = normalizeProductAnalyticsSource(window.sessionStorage.getItem(ANALYTICS_SOURCE_KEY));
    return stored ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function derivePageEvent(pathname: string): ProductAnalyticsEventName | null {
  if (pathname === '/') {
    return 'home_viewed';
  }
  if (pathname === '/workspace') {
    return 'workspace_viewed';
  }
  if (pathname === '/gallery') {
    return 'gallery_viewed';
  }
  if (pathname === '/payment-success') {
    return 'payment_success_viewed';
  }
  if (/^\/reviews\/[^/]+$/.test(pathname)) {
    return 'review_result_viewed';
  }
  if (/^\/share\/[^/]+$/.test(pathname)) {
    return 'share_viewed';
  }
  if (/^\/(zh|en|ja)\/blog(?:\/[^/]+)?$/.test(pathname)) {
    return 'blog_post_viewed';
  }
  return null;
}

export function deriveAttributionSourceForPath(pathname: string): ProductAnalyticsSource | null {
  if (pathname === '/') {
    return 'home_direct';
  }
  if (pathname === '/gallery') {
    return 'gallery';
  }
  if (/^\/share\/[^/]+$/.test(pathname)) {
    return 'share';
  }
  if (/^\/(zh|en|ja)\/blog(?:\/[^/]+)?$/.test(pathname)) {
    return 'blog';
  }
  if (pathname === '/payment-success') {
    return 'checkout';
  }
  return null;
}

type TrackProductEventOptions = {
  token?: string;
  source?: ProductAnalyticsSource;
  pagePath?: string;
  locale?: 'zh' | 'en' | 'ja';
  metadata?: Record<string, unknown>;
};

export async function trackProductEvent(
  eventName: ProductAnalyticsEventName,
  options: TrackProductEventOptions = {}
): Promise<void> {
  const sessionId = getProductAnalyticsSessionId();
  const source = options.source ?? readProductAttributionSource();

  try {
    await trackProductAnalyticsEvent(
      {
        event_name: eventName,
        source,
        page_path: options.pagePath,
        locale: options.locale,
        session_id: sessionId ?? undefined,
        metadata: options.metadata ?? {},
      },
      options.token
    );
  } catch {
    // Analytics should never block product flows.
  }
}
