import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  installGlobalClientErrorHandlers,
  reportClientError,
  resetClientErrorReporterForTests,
  resolveClientErrorEndpoint,
  sanitizeReportText,
  sanitizeReportUrl,
} from '../src/lib/client-error-reporter.ts';

test('sanitizeReportUrl strips sensitive tokens, credentials, and fragments while keeping safe params', () => {
  const sanitized = sanitizeReportUrl(
    'https://user:pass@www.picspeak.art/workspace?mode=pro&token=t1&photo_token=p2&generation_token=g3&X-Amz-Signature=s4&image_type=portrait#secret-hash',
  );
  assert.equal(sanitized, 'https://www.picspeak.art/workspace?mode=pro&image_type=portrait');
  assert.equal(sanitizeReportUrl('javascript:alert(1)'), undefined);
});

test('sanitizeReportText scrubs bearer tokens and signed query parameters', () => {
  const cleaned = sanitizeReportText(
    'Failed Bearer eyJhbGciOiJIUzI1NiJ9.abc.def on https://api.picspeak.art/p?photo_token=secret123&generation_token=gen456&ok=1',
  );
  assert.ok(cleaned);
  assert.doesNotMatch(cleaned, /eyJhbGci|secret123|gen456/);
  assert.match(cleaned, /Bearer \*\*\*/);
});

test('resolveClientErrorEndpoint normalizes API base URLs and ignores invalid schemes', () => {
  assert.equal(resolveClientErrorEndpoint('https://api.picspeak.art'), 'https://api.picspeak.art/api/v1/client-errors');
  assert.equal(resolveClientErrorEndpoint('https://api.picspeak.art/api/v1'), 'https://api.picspeak.art/api/v1/client-errors');
  assert.equal(resolveClientErrorEndpoint('file:///etc/passwd'), null);
});

test('reportClientError omits cookies/tokens, deduplicates within 60s, respects sampling, and skips AbortError', () => {
  resetClientErrorReporterForTests();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  let clock = 1_000;
  const now = () => clock;

  // AbortError is ignored
  const abortErr = new Error('aborted');
  abortErr.name = 'AbortError';
  assert.equal(reportClientError(abortErr, { endpoint: 'https://api.picspeak.art/api/v1/client-errors', fetchImpl, now }), false);
  assert.equal(calls.length, 0);

  // Sampled out when random >= sampleRate
  assert.equal(
    reportClientError(new Error('sampled out'), {
      endpoint: 'https://api.picspeak.art/api/v1/client-errors',
      fetchImpl,
      now,
      sampleRate: 0.2,
      random: () => 0.9,
    }),
    false,
  );
  assert.equal(calls.length, 0);

  // Sent cleanly without credentials or secret params
  const uploadErr = new Error('Upload failed');
  const sent = reportClientError(uploadErr, {
    source: 'upload',
    endpoint: 'https://api.picspeak.art/api/v1/client-errors',
    url: 'https://www.picspeak.art/workspace?token=secret&photo_token=p1&mode=flash',
    userAgent: 'TestAgent/1.0',
    release: 'rel-1',
    fetchImpl,
    now,
    sampleRate: 1,
  });
  assert.equal(sent, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.picspeak.art/api/v1/client-errors');
  assert.equal(calls[0].init?.credentials, 'omit');
  assert.equal(calls[0].init?.keepalive, true);
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers['Authorization'], undefined);
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.kind, 'error');
  assert.equal(body.source, 'upload');
  assert.equal(body.url, 'https://www.picspeak.art/workspace?mode=flash');
  assert.equal(body.release, 'rel-1');

  // Duplicate within 60s is suppressed
  assert.equal(
    reportClientError(uploadErr, {
      source: 'upload',
      endpoint: 'https://api.picspeak.art/api/v1/client-errors',
      fetchImpl,
      now,
      sampleRate: 1,
    }),
    false,
  );
  assert.equal(calls.length, 1);

  // Allowed again after 60s window passes
  clock += 61_000;
  assert.equal(
    reportClientError(uploadErr, {
      source: 'upload',
      endpoint: 'https://api.picspeak.art/api/v1/client-errors',
      fetchImpl,
      now,
      sampleRate: 1,
    }),
    true,
  );
  assert.equal(calls.length, 2);
});

test('installGlobalClientErrorHandlers registers error and unhandledrejection once and cleans up cleanly', () => {
  resetClientErrorReporterForTests();
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const target = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      listeners.get(type)?.delete(listener);
    },
  };

  const calls: Array<{ body: Record<string, unknown> }> = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body)) });
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  const cleanup1 = installGlobalClientErrorHandlers({
    target,
    sampleRate: 1,
    endpoint: 'https://api.picspeak.art/api/v1/client-errors',
    fetchImpl,
  });
  const cleanup2 = installGlobalClientErrorHandlers({
    target,
    sampleRate: 1,
    endpoint: 'https://api.picspeak.art/api/v1/client-errors',
    fetchImpl,
  });

  assert.equal(listeners.get('error')?.size, 1);
  assert.equal(listeners.get('unhandledrejection')?.size, 1);

  const [errorListener] = [...(listeners.get('error') ?? [])] as Array<(ev: unknown) => void>;
  const [rejectionListener] = [...(listeners.get('unhandledrejection') ?? [])] as Array<(ev: unknown) => void>;
  errorListener({ error: new Error('window boom'), message: 'window boom' });
  rejectionListener({ reason: new Error('promise boom') });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.kind, 'error');
  assert.equal(calls[1].body.kind, 'unhandledrejection');

  cleanup1();
  assert.equal(listeners.get('error')?.size, 1);
  cleanup2();
  assert.equal(listeners.get('error')?.size, 0);
  assert.equal(listeners.get('unhandledrejection')?.size, 0);
});

test('critical frontend paths explicitly report failures to the client error reporter', () => {
  const cases = [
    ['../src/components/providers/AppErrorBoundary.tsx', /installGlobalClientErrorHandlers\(/],
    ['../src/features/workspace/hooks/useUploadFlow.ts', /reportClientError\(err,\s*\{\s*source:\s*'upload'/],
    ['../src/app/tasks/[taskId]/page.tsx', /reportClientError\(.*source:\s*'task_polling'/],
    ['../src/app/generation-tasks/[taskId]/page.tsx', /reportClientError\(err,\s*\{\s*source:\s*'task_polling'/],
    ['../src/app/payment-success/page.tsx', /reportClientError\(err,\s*\{\s*source:\s*'payment_return'/],
  ] as const;

  for (const [relativePath, pattern] of cases) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(source, pattern, `${relativePath} should wire reportClientError`);
  }
});
