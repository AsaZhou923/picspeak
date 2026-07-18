'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { useEffect, useState } from 'react';
import { trackProductEvent } from '@/lib/product-analytics';
import { reportWebVitalMetric } from '@/lib/web-vitals';

const Analytics = dynamic(
  () => import('@vercel/analytics/react').then((mod) => mod.Analytics),
  { ssr: false }
);

const SpeedInsights = dynamic(
  () => import('@vercel/speed-insights/next').then((mod) => mod.SpeedInsights),
  { ssr: false }
);

function scheduleWhenIdle(callback: () => void, timeout = 1500) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(id);
  }

  const id = globalThis.setTimeout(callback, timeout);
  return () => globalThis.clearTimeout(id);
}

export default function PerformanceTelemetry() {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();

  useReportWebVitals((metric) => {
    void reportWebVitalMetric(metric, { pagePath: pathname }, trackProductEvent);
  });

  useEffect(() => {
    const cancel = scheduleWhenIdle(() => setEnabled(true));
    return cancel;
  }, []);

  if (!enabled) return null;

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
