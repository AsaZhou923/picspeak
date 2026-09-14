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

async function loadCsp(suffix?: string): Promise<string> {
  const nextConfig = await loadNextConfig(suffix);
  const routes = await nextConfig.headers();
  return (
    routes
      .flatMap((route) => route.headers)
      .find((header) => header.key === 'Content-Security-Policy')?.value ?? ''
  );
}

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
  const nextConfig = await loadNextConfig('public-headers');

  const routes = await nextConfig.headers();
  const globalRoute = routes.find((route) => route.source === '/:path*');
  const headers = new Map(globalRoute?.headers.map((header) => [header.key, header.value]) ?? []);

  assert.equal(headers.get('Vary'), undefined);
  assert.match(headers.get('Link') ?? '', /rel=preconnect/);
  assert.match(headers.get('Link') ?? '', /https:\/\/clerk\.picspeak\.art/);
  assert.match(headers.get('Link') ?? '', /https:\/\/pub-7ae066210514433e84a850bc95c5f1a2\.r2\.dev/);
  assert.equal(headers.get('X-Frame-Options'), 'DENY');
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
