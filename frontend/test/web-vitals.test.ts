import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWebVitalAnalyticsPayload,
  isCoreWebVitalMetric,
  reportWebVitalMetric,
} from '../src/lib/web-vitals.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');

test('web vitals helper converts Core Web Vitals into analytics metadata', async () => {
  const metric = {
    id: 'v5-1740000000000-123',
    name: 'LCP',
    value: 2400,
    delta: 2400,
    rating: 'needs-improvement',
    navigationType: 'navigate',
  };
  const payload = buildWebVitalAnalyticsPayload(metric, { pagePath: '/en/blog/five-photo-composition-checks' });

  assert.equal(isCoreWebVitalMetric('LCP'), true);
  assert.equal(isCoreWebVitalMetric('FCP'), false);
  assert.deepEqual(payload, {
    event_name: 'web_vital_reported',
    source: 'unknown',
    page_path: '/en/blog/five-photo-composition-checks',
    metadata: {
      metric_id: 'v5-1740000000000-123',
      metric_name: 'LCP',
      value: 2400,
      delta: 2400,
      rating: 'needs-improvement',
      navigation_type: 'navigate',
      is_core_web_vital: true,
    },
  });

  let trackedPayload: unknown;
  await reportWebVitalMetric(metric, { pagePath: '/en/blog/five-photo-composition-checks' }, async (eventName, options) => {
    trackedPayload = { eventName, options };
  });

  assert.deepEqual(trackedPayload, {
    eventName: 'web_vital_reported',
    options: {
      source: 'unknown',
      pagePath: '/en/blog/five-photo-composition-checks',
      metadata: payload.metadata,
    },
  });
});

test('performance telemetry reports web vitals without adding an eager analytics bundle', () => {
  const telemetrySource = readFileSync(
    path.join(FRONTEND_DIR, 'src', 'components', 'performance', 'PerformanceTelemetry.tsx'),
    'utf8',
  );
  const analyticsSource = readFileSync(path.join(FRONTEND_DIR, 'src', 'lib', 'product-analytics.ts'), 'utf8');
  const backendCatalogSource = readFileSync(
    path.join(FRONTEND_DIR, '..', 'backend', 'app', 'services', 'product_analytics.py'),
    'utf8',
  );

  assert.match(telemetrySource, /useReportWebVitals/);
  assert.match(telemetrySource, /reportWebVitalMetric/);
  assert.match(telemetrySource, /dynamic\(/);
  assert.match(analyticsSource, /web_vital_reported/);
  assert.match(backendCatalogSource, /web_vital_reported/);
});
