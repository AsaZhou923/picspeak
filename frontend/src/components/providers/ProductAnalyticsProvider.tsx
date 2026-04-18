'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import {
  deriveAttributionSourceForPath,
  derivePageEvent,
  markProductAttributionSource,
  normalizeProductAnalyticsSource,
  readProductAttributionSource,
  trackProductEvent,
} from '@/lib/product-analytics';

export default function ProductAnalyticsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { token, isLoading } = useAuth();
  const { locale } = useI18n();
  const lastTrackedKeyRef = useRef<string>('');

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const pageEvent = derivePageEvent(pathname);
    if (!pageEvent) {
      return;
    }

    const explicitSource = normalizeProductAnalyticsSource(searchParams.get('source'));
    const pathSource = deriveAttributionSourceForPath(pathname);
    const resolvedSource = explicitSource ?? pathSource ?? readProductAttributionSource();

    if (explicitSource) {
      markProductAttributionSource(explicitSource);
    } else if (pathSource) {
      markProductAttributionSource(pathSource);
    }

    const trackKey = `${pageEvent}:${pathname}:${searchParams.toString()}`;
    if (lastTrackedKeyRef.current === trackKey) {
      return;
    }
    lastTrackedKeyRef.current = trackKey;

    void trackProductEvent(pageEvent, {
      token: token ?? undefined,
      source: resolvedSource,
      pagePath: pathname,
      locale,
    });
  }, [isLoading, locale, pathname, searchParams, token]);

  return <>{children}</>;
}
