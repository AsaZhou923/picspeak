import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

async function loadNextConfig(suffix = 'default') {
  const nextConfigModule = await import(`../next.config.mjs?test=${suffix}-${Date.now()}`);
  return nextConfigModule.default as {
    headers: () => Promise<Array<{ source?: string; headers: Array<{ key: string; value: string }> }>>;
    redirects: () => Promise<
      Array<{
        source: string;
        destination: string;
        permanent: boolean;
        has?: Array<{ type: string; key?: string; value?: string }>;
      }>
    >;
  };
}

async function loadSecurityHeaders(suffix?: string): Promise<Map<string, string>> {
  const nextConfig = await loadNextConfig(suffix);
  const routes = await nextConfig.headers();
  const globalRoute = routes.find((route) => route.source === '/:path*');
  return new Map(globalRoute?.headers.map((header) => [header.key, header.value]) ?? []);
}

async function loadCsp(suffix?: string): Promise<string> {
  return (await loadSecurityHeaders(suffix)).get('Content-Security-Policy') ?? '';
}

test('CSP omits unsafe-eval in production and includes it only outside production', async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalApiUrl = env.NEXT_PUBLIC_API_URL;
  env.NEXT_PUBLIC_API_URL = 'https://api.picspeak.art';

  try {
    env.NODE_ENV = 'production';
    const prodHeaders = await loadSecurityHeaders('prod-script-src');
    const prodCsp = prodHeaders.get('Content-Security-Policy') ?? '';
    const prodScriptSrc = prodCsp.match(/(?:^|; )script-src ([^;]+)/)?.[1] ?? '';

    assert.doesNotMatch(prodScriptSrc, /'unsafe-eval'/);
    assert.match(prodScriptSrc, /'unsafe-inline'/);

    env.NODE_ENV = 'development';
    const devHeaders = await loadSecurityHeaders('dev-script-src');
    const devCsp = devHeaders.get('Content-Security-Policy') ?? '';
    const devScriptSrc = devCsp.match(/(?:^|; )script-src ([^;]+)/)?.[1] ?? '';

    assert.match(devScriptSrc, /'unsafe-eval'/);
  } finally {
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalApiUrl === undefined) delete env.NEXT_PUBLIC_API_URL;
    else env.NEXT_PUBLIC_API_URL = originalApiUrl;
  }
});

test('CSP tightens connect-src to explicit API, Clerk, Turnstile, Vercel, and R2 origins without wildcard https:', async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalApiUrl = env.NEXT_PUBLIC_API_URL;
  env.NODE_ENV = 'production';
  env.NEXT_PUBLIC_API_URL = 'https://api.picspeak.art';

  try {
    const csp = await loadCsp('tightened-connect-src');
    const connectSrc = csp.match(/(?:^|; )connect-src ([^;]+)/)?.[1] ?? '';
    const tokens = connectSrc.split(/\s+/);

    assert.ok(!tokens.includes('https:'), 'connect-src must not allow arbitrary https: origins');
    assert.ok(!tokens.includes('http://localhost:8000'), 'production connect-src omits localhost');
    for (const expected of [
      "'self'",
      'https://api.picspeak.art',
      'wss://api.picspeak.art',
      'https://*.clerk.accounts.dev',
      'https://*.clerk.com',
      'https://clerk.picspeak.art',
      'https://challenges.cloudflare.com',
      'https://vitals.vercel-insights.com',
      'https://va.vercel-scripts.com',
      'https://*.r2.cloudflarestorage.com',
    ]) {
      assert.ok(tokens.includes(expected), `connect-src should include ${expected}`);
    }
  } finally {
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalApiUrl === undefined) delete env.NEXT_PUBLIC_API_URL;
    else env.NEXT_PUBLIC_API_URL = originalApiUrl;
  }
});

test('CSP Report-Only strips unsafe-inline from script-src and reports to /api/v1/client-errors', async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalApiUrl = env.NEXT_PUBLIC_API_URL;
  env.NODE_ENV = 'production';
  env.NEXT_PUBLIC_API_URL = 'https://api.picspeak.art';

  try {
    const headers = await loadSecurityHeaders('report-only');
    const enforced = headers.get('Content-Security-Policy') ?? '';
    const reportOnly = headers.get('Content-Security-Policy-Report-Only') ?? '';
    const reportingEndpoints = headers.get('Reporting-Endpoints') ?? '';

    assert.ok(reportOnly.length > 0);
    const reportOnlyScriptSrc = reportOnly.match(/(?:^|; )script-src ([^;]+)/)?.[1] ?? '';
    assert.doesNotMatch(reportOnlyScriptSrc, /'unsafe-inline'/);
    assert.doesNotMatch(reportOnlyScriptSrc, /'unsafe-eval'/);
    assert.match(reportOnlyScriptSrc, /'self'/);
    assert.match(reportOnlyScriptSrc, /https:\/\/clerk\.picspeak\.art/);
    assert.match(reportOnly, /(?:^|; )report-uri https:\/\/api\.picspeak\.art\/api\/v1\/client-errors(?:;|$)/);
    assert.match(reportOnly, /(?:^|; )report-to csp-endpoint(?:;|$)/);
    assert.equal(reportingEndpoints, 'csp-endpoint="https://api.picspeak.art/api/v1/client-errors"');
    assert.doesNotMatch(enforced, /report-uri/);
  } finally {
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalApiUrl === undefined) delete env.NEXT_PUBLIC_API_URL;
    else env.NEXT_PUBLIC_API_URL = originalApiUrl;
  }
});

test('CSP allows Clerk modal workers without wildcard worker sources', async () => {
  const csp = await loadCsp();

  assert.match(csp, /(?:^|; )worker-src 'self' blob:(?:;|$)/);
  assert.doesNotMatch(csp, /(?:^|; )worker-src[^;]*\*/);
});

test('CSP allows the production Clerk custom domain', async () => {
  const csp = await loadCsp();

  assert.match(csp, /(?:^|; )script-src[^;]*https:\/\/clerk\.picspeak\.art(?:\s|;)/);
  assert.match(csp, /(?:^|; )frame-src[^;]*https:\/\/clerk\.picspeak\.art(?:\s|;)/);
});

test('CSP allows task WebSockets for the configured production API origin only', async () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = 'https://api.picspeak.art';

  try {
    const csp = await loadCsp('production-api-websocket');
    const connectSrc = csp.match(/(?:^|; )connect-src ([^;]+)/)?.[1] ?? '';

    assert.match(connectSrc, /(?:^|\s)wss:\/\/api\.picspeak\.art(?:\s|$)/);
    assert.doesNotMatch(connectSrc, /(?:^|\s)wss:(?:\s|$)/);
    assert.doesNotMatch(connectSrc, /(?:^|\s)ws:(?:\s|$)/);
  } finally {
    if (originalApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }
  }
});

test('CSP allows local task WebSockets during frontend development', async () => {
  const csp = await loadCsp('local-websocket');
  const connectSrc = csp.match(/(?:^|; )connect-src ([^;]+)/)?.[1] ?? '';

  assert.match(connectSrc, /(?:^|\s)ws:\/\/localhost:8000(?:\s|$)/);
  assert.match(connectSrc, /(?:^|\s)ws:\/\/127\.0\.0\.1:8000(?:\s|$)/);
});

test('canonical redirects consolidate the demo alias and force HTTPS with www', async () => {
  const nextConfig = await loadNextConfig('redirects');

  const redirects = await nextConfig.redirects();

  assert.deepEqual(redirects, [
    {
      source: '/reviews/rev_35e0951d0df94a1e',
      destination: '/reviews/rev_8424d4fbde054759',
      permanent: true,
    },
    {
      source: '/:path*',
      has: [{ type: 'host', value: 'picspeak.art' }],
      destination: 'https://www.picspeak.art/:path*',
      permanent: true,
    },
    {
      source: '/:path*',
      has: [
        { type: 'host', value: 'www.picspeak.art' },
        { type: 'header', key: 'x-forwarded-proto', value: 'http' },
      ],
      destination: 'https://www.picspeak.art/:path*',
      permanent: true,
    },
  ]);
});

test('public responses advertise third-party preconnects without fake global language variance', async () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = 'https://api.picspeak.art/api/v1';
  try {
    const nextConfig = await loadNextConfig('public-headers');

    const routes = await nextConfig.headers();
    const globalRoute = routes.find((route) => route.source === '/:path*');
    const headers = new Map(globalRoute?.headers.map((header) => [header.key, header.value]) ?? []);

    assert.equal(headers.get('Vary'), undefined);
    assert.match(headers.get('Link') ?? '', /rel=preconnect/);
    assert.match(headers.get('Link') ?? '', /https:\/\/clerk\.picspeak\.art/);
    assert.match(headers.get('Link') ?? '', /<https:\/\/api\.picspeak\.art>; rel=preconnect/);
    assert.doesNotMatch(headers.get('Link') ?? '', /r2\.dev|\/api\/v1/);
    assert.equal(headers.get('X-Frame-Options'), 'DENY');
  } finally {
    if (originalApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }
  }
});

test('localized public pages partition shared cache by cookie and accepted language', async () => {
  const nextConfig = await loadNextConfig('cache-headers');

  const routes = await nextConfig.headers();
  const publiclyCachedSources = routes
    .filter((route) =>
      route.headers.some(
        (header) => header.key === 'Cache-Control' && header.value.includes('s-maxage='),
      ),
    )
    .map((route) => route.source);
  const localizedPublicPageSources = [
    '/',
    '/gallery',
    '/updates',
    '/generate/prompts',
    '/generate/prompts/:id*',
    '/reviews/rev_8424d4fbde054759',
    '/privacy',
    '/terms',
    '/affiliate',
    '/editorial-policy',
    '/author/:path*',
  ];

  assert.ok(publiclyCachedSources.includes('/:locale(zh|en|ja)/blog'));
  assert.ok(publiclyCachedSources.includes('/:locale(zh|en|ja)/blog/:slug*'));
  assert.ok(publiclyCachedSources.includes('/:locale(zh|en|ja)/updates'));
  assert.ok(publiclyCachedSources.includes('/'));
  assert.ok(publiclyCachedSources.includes('/gallery'));
  assert.ok(publiclyCachedSources.includes('/updates'));
  assert.ok(!publiclyCachedSources.includes('/blog'));
  assert.ok(!publiclyCachedSources.includes('/blog/:slug*'));
  assert.ok(!publiclyCachedSources.includes('/generate'));
  assert.ok(publiclyCachedSources.includes('/generate/prompts'));
  assert.ok(publiclyCachedSources.includes('/generate/prompts/:id*'));
  assert.ok(!publiclyCachedSources.includes('/retake'));
  assert.ok(publiclyCachedSources.includes('/privacy'));
  assert.ok(publiclyCachedSources.includes('/terms'));
  assert.ok(publiclyCachedSources.includes('/affiliate'));
  assert.ok(publiclyCachedSources.includes('/editorial-policy'));
  assert.ok(publiclyCachedSources.includes('/author/:path*'));

  for (const source of localizedPublicPageSources) {
    const route = routes.find((candidate) => candidate.source === source);
    const headers = new Map(route?.headers.map((header) => [header.key, header.value]) ?? []);
    assert.equal(headers.get('Vary'), 'Cookie, Accept-Language');
  }
});

test('revocable Gallery critiques and genre samples cannot be served from a shared cache', async () => {
  const nextConfig = await loadNextConfig('gallery-review-cache');

  const routes = await nextConfig.headers();
  for (const source of ['/gallery/:reviewId+', '/photo-critique/:topic*']) {
    const matches = routes.filter((route) => route.source === source);
    assert.equal(matches.length, 1, source);
    const headers = new Map(matches[0].headers.map((header) => [header.key, header.value]));
    assert.equal(headers.get('Cache-Control'), 'private, no-store, max-age=0');
    assert.equal(headers.get('Vary'), 'Cookie, Accept-Language');
  }
});

test('the home AI mirror points directly to the canonical English homepage', async () => {
  const nextConfig = await loadNextConfig('home-ai-mirror');

  const routes = await nextConfig.headers();
  const homeMirrorRoute = routes.find((route) => route.source === '/ai-content/home.md');
  const canonical = homeMirrorRoute?.headers.find((header) => header.key === 'Link')?.value;

  assert.equal(canonical, '<https://www.picspeak.art/en>; rel="canonical"');
});

test('proxy scrubs forged locale headers and makes locale redirects private', () => {
  const proxySource = new URL('../src/proxy.ts', import.meta.url);
  const source = readFileSync(proxySource, 'utf8');

  assert.match(source, /requestHeaders\.delete\('x-picspeak-locale'\)/);
  assert.match(source, /NextResponse\.redirect\(redirectUrl, 307\)/);
  assert.match(source, /private, no-store, max-age=0, must-revalidate/);
  assert.match(source, /response\.headers\.set\('Vary', 'Cookie, Accept-Language'\)/);
});

test('proxy localizes guarded 404 responses from path or cookie locale', () => {
  const proxySource = new URL('../src/proxy.ts', import.meta.url);
  const source = readFileSync(proxySource, 'utf8');

  assert.match(source, /const NOT_FOUND_COPY/);
  assert.match(source, /ページが見つかりません/);
  assert.match(source, /页面不存在/);
  assert.match(source, /unknownRouteResponse\(locale \?\? 'en'\)/);
  assert.match(source, /<a href="\/\$\{locale\}">/);
});
