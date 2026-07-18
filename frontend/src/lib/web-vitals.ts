export type WebVitalMetricInput = {
  id: string;
  name: string;
  value: number;
  delta?: number;
  rating?: string;
  navigationType?: string;
};

type WebVitalAnalyticsContext = {
  pagePath?: string | null;
};

type WebVitalTrackFunction = (
  eventName: 'web_vital_reported',
  options: {
    source: 'unknown';
    pagePath?: string;
    metadata: Record<string, unknown>;
  },
) => Promise<void>;

const CORE_WEB_VITAL_NAMES = new Set(['CLS', 'INP', 'LCP']);

export function isCoreWebVitalMetric(name: string): boolean {
  return CORE_WEB_VITAL_NAMES.has(name);
}

export function buildWebVitalAnalyticsPayload(metric: WebVitalMetricInput, context: WebVitalAnalyticsContext = {}) {
  return {
    event_name: 'web_vital_reported' as const,
    source: 'unknown' as const,
    page_path: context.pagePath ?? undefined,
    metadata: {
      metric_id: metric.id,
      metric_name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigation_type: metric.navigationType,
      is_core_web_vital: isCoreWebVitalMetric(metric.name),
    },
  };
}

export async function reportWebVitalMetric(
  metric: WebVitalMetricInput,
  context: WebVitalAnalyticsContext,
  track: WebVitalTrackFunction,
): Promise<void> {
  const payload = buildWebVitalAnalyticsPayload(metric, context);

  await track(payload.event_name, {
    source: payload.source,
    pagePath: payload.page_path,
    metadata: payload.metadata,
  });
}
