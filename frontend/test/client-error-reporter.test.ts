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

test('sanitizeReportUrl strips capability paths, sensitive tokens, credentials, and fragments while keeping safe params', () => {
  const sanitized = sanitizeReportUrl(
    'https://user:pass@www.picspeak.art/share/shr_secret_123?mode=pro&token=t1&photo_token=p2&generation_token=g3&__clerk_ticket=tkt_999&code=c1&state=s1&X-Amz-Signature=s4&X-Amz-Date=d5&X-Goog-Expires=g6&image_type=portrait#secret-hash',
  );
  assert.equal(sanitized, 'https://www.picspeak.art/share/[redacted]?mode=pro&image_type=portrait');
  assert.equal(
    sanitizeReportUrl('https://api.picspeak.art/api/v1/public/reviews/pub_secret_456?signature=sig1&ok=1'),
    'https://api.picspeak.art/api/v1/public/reviews/[redacted]?ok=1',
  );
  assert.equal(sanitizeReportUrl('javascript:alert(1)'), undefined);
});

test('sanitizeReportText scrubs capability paths, bearer tokens, and all shared sensitive query params', () => {
  const cleaned = sanitizeReportText(
    'Failed Bearer eyJhbGciOiJIUzI1NiJ9.abc.def on https://www.picspeak.art/share/shr_text_secret' +
      ' and https://api.picspeak.art/api/v1/public/reviews/pub_text_secret' +
      '?photo_token=secret123&generation_token=gen456&__clerk_ticket=tkt_text_777&code=code_888&state=state_999' +
      '&X-Amz-Credential=amzcred_111&X-Amz-Date=amzdate_222&ok=1',
  );
  assert.ok(cleaned);
  for (const secret of [
    'eyJhbGci',
    'shr_text_secret',
    'pub_text_secret',
    'secret123',
    'gen456',
    'tkt_text_777',
    'code_888',
    'state_999',
    'amzcred_111',
    'amzdate_222',
  ]) {
    assert.ok(!cleaned.includes(secret), `expected ${secret} to be redacted in: ${cleaned}`);
  }
  assert.match(cleaned, /\/share\/\[redacted\]/);
  assert.match(cleaned, /\/public\/reviews\/\[redacted\]/);
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

test('frontend reporter never re-reports CSP violations and skips reporting after fetch fails', async () => {
  resetClientErrorReporterForTests();
  const calls: string[] = [];
  const okFetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  // Never subscribes to securitypolicyviolation and never sends kind: 'csp' or CSP violation messages.
  const reporterSource = readFileSync(new URL('../src/lib/client-error-reporter.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(reporterSource, /addEventListener\(['"]securitypolicyviolation['"]/);
  assert.equal(
    reportClientError(new Error('CSP inline blocked'), {
      kind: 'csp',
      endpoint: 'https://api.picspeak.art/api/v1/client-errors',
      fetchImpl: okFetch,
    }),
    false,
  );
  assert.equal(
    reportClientError(new Error('Refused to execute inline script because it violates Content Security Policy'), {
      kind: 'error',
      endpoint: 'https://api.picspeak.art/api/v1/client-errors',
      fetchImpl: okFetch,
    }),
    false,
  );
  assert.equal(calls.length, 0);

  // Sync throw from fetch disables further reporting cleanly without throwing.
  let syncAttempts = 0;
  const throwingFetch = (() => {
    syncAttempts += 1;
    throw new Error('network blocked');
  }) as unknown as typeof fetch;
  assert.equal(
    reportClientError(new Error('first boom'), {
      endpoint: 'https://api.picspeak.art/api/v1/client-errors',
      fetchImpl: throwingFetch,
    }),
    false,
  );
  assert.equal(
    reportClientError(new Error('second boom'), {
      endpoint: 'https://api.picspeak.art/api/v1/client-errors',
      fetchImpl: throwingFetch,
    }),
    false,
  );
  assert.equal(syncAttempts, 1);

  // Async rejection from fetch is swallowed and skips subsequent reports.
  resetClientErrorReporterForTests();
  let asyncAttempts = 0;
  const rejectingFetch = (async () => {
    asyncAttempts += 1;
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
  assert.equal(
    reportClientError(new Error('third boom'), {
      endpoint: 'https://api.picspeak.art/api/v1/client-errors',
      fetchImpl: rejectingFetch,
    }),
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(
    reportClientError(new Error('fourth boom'), {
      endpoint: 'https://api.picspeak.art/api/v1/client-errors',
      fetchImpl: rejectingFetch,
    }),
    false,
  );
  assert.equal(asyncAttempts, 1);

  // Non-2xx HTTP responses (429 / 500) trip the circuit breaker for the rest of the page session.
  for (const statusCode of [429, 500]) {
    resetClientErrorReporterForTests();
    let httpAttempts = 0;
    const failingStatusFetch = (async () => {
      httpAttempts += 1;
      return new Response(null, { status: statusCode });
    }) as unknown as typeof fetch;
    assert.equal(
      reportClientError(new Error(`first-${statusCode}`), {
        endpoint: 'https://api.picspeak.art/api/v1/client-errors',
        fetchImpl: failingStatusFetch,
      }),
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    for (let i = 0; i < 5; i += 1) {
      assert.equal(
        reportClientError(new Error(`after-${statusCode}-${i}`), {
          endpoint: 'https://api.picspeak.art/api/v1/client-errors',
          fetchImpl: failingStatusFetch,
        }),
        false,
      );
    }
    assert.equal(httpAttempts, 1, `HTTP ${statusCode} must trip circuit breaker after first failed send`);
  }
});

test('per-session cap persists across reloads via sessionStorage and degrades cleanly when storage throws', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  const prevWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, 'window', {
    value: { sessionStorage: mockStorage, location: { href: 'https://www.picspeak.art/workspace', origin: 'https://www.picspeak.art' } },
    configurable: true,
  });

  try {
    resetClientErrorReporterForTests();
    let sentCount = 0;
    const okFetch = (async () => {
      sentCount += 1;
      return new Response(null, { status: 202 });
    }) as typeof fetch;

    for (let i = 0; i < 24; i += 1) {
      reportClientError(new Error(`err-doc1-${i}`), {
        endpoint: 'https://api.picspeak.art/api/v1/client-errors',
        fetchImpl: okFetch,
      });
    }
    assert.equal(sentCount, 20);

    // Simulate reload in the same tab: reset in-memory counters while retaining sessionStorage.
    resetClientErrorReporterForTests({ clearStorage: false });
    for (let i = 0; i < 5; i += 1) {
      assert.equal(
        reportClientError(new Error(`err-doc2-${i}`), {
          endpoint: 'https://api.picspeak.art/api/v1/client-errors',
          fetchImpl: okFetch,
        }),
        false,
      );
    }
    assert.equal(sentCount, 20, 'session cap must span reloads in the same browser tab');

    // Restricted/throwing sessionStorage still works via in-memory fallback.
    Object.defineProperty(globalThis, 'window', {
      value: {
        get sessionStorage() {
          throw new Error('SecurityError');
        },
        location: { href: 'https://www.picspeak.art/workspace', origin: 'https://www.picspeak.art' },
      },
      configurable: true,
    });
    resetClientErrorReporterForTests();
    let fallbackSent = 0;
    const fallbackFetch = (async () => {
      fallbackSent += 1;
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    assert.equal(
      reportClientError(new Error('storage-blocked-err'), {
        endpoint: 'https://api.picspeak.art/api/v1/client-errors',
        fetchImpl: fallbackFetch,
      }),
      true,
    );
    assert.equal(fallbackSent, 1);
  } finally {
    if (prevWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, 'window', { value: prevWindow, configurable: true });
    resetClientErrorReporterForTests();
  }
});

test('reportClientError redacts capability paths and sensitive query values across all outgoing fields', () => {
  resetClientErrorReporterForTests();
  const bodies: Array<Record<string, unknown>> = [];
  const captureFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  const err = new Error(
    'Failed loading https://www.picspeak.art/share/shr_m1?__clerk_ticket=tkt_m1&code=code_m1&state=st_m1',
  );
  err.stack = 'Error\n at fn (https://api.picspeak.art/api/v1/public/reviews/pub_s1?token=tok_s1:1:1)';

  assert.equal(
    reportClientError(err, {
      source: 'upload:/share/shr_src1?photo_token=pt_src1',
      url: 'https://www.picspeak.art/share/shr_u1?__clerk_ticket=tkt_u1&mode=flash',
      referrer: 'https://www.picspeak.art/api/v1/public/reviews/pub_r1?signature=sig_r1&ok=1',
      userAgent: 'UA/1.0 https://www.picspeak.art/share/shr_ua1?token=tok_ua1',
      endpoint: 'https://api.picspeak.art/api/v1/client-errors',
      fetchImpl: captureFetch,
    }),
    true,
  );
  assert.equal(bodies.length, 1);
  const serialized = JSON.stringify(bodies[0]);
  for (const secret of [
    'shr_m1',
    'tkt_m1',
    'code_m1',
    'st_m1',
    'pub_s1',
    'tok_s1',
    'shr_src1',
    'pt_src1',
    'shr_u1',
    'tkt_u1',
    'pub_r1',
    'sig_r1',
    'shr_ua1',
    'tok_ua1',
  ]) {
    assert.ok(!serialized.includes(secret), `outgoing payload leaked ${secret}: ${serialized}`);
  }
  assert.equal(bodies[0].url, 'https://www.picspeak.art/share/[redacted]?mode=flash');
  assert.equal(bodies[0].referrer, 'https://www.picspeak.art/api/v1/public/reviews/[redacted]?ok=1');
});
