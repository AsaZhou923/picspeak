import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('CSP allows Clerk modal workers without wildcard worker sources', async () => {
  const nextConfigModule = await import('../next.config.mjs');
  const nextConfig = nextConfigModule.default as {
    headers: () => Promise<Array<{ headers: Array<{ key: string; value: string }> }>>;
  };

  const routes = await nextConfig.headers();
  const csp =
    routes
      .flatMap((route) => route.headers)
      .find((header) => header.key === 'Content-Security-Policy')?.value ?? '';

  assert.match(csp, /(?:^|; )worker-src 'self' blob:(?:;|$)/);
  assert.doesNotMatch(csp, /(?:^|; )worker-src[^;]*\*/);
});

test('CSP allows the production Clerk custom domain', async () => {
  const nextConfigModule = await import('../next.config.mjs');
  const nextConfig = nextConfigModule.default as {
    headers: () => Promise<Array<{ headers: Array<{ key: string; value: string }> }>>;
  };

  const routes = await nextConfig.headers();
  const csp =
    routes
      .flatMap((route) => route.headers)
      .find((header) => header.key === 'Content-Security-Policy')?.value ?? '';

  assert.match(csp, /(?:^|; )script-src[^;]*https:\/\/clerk\.picspeak\.art(?:\s|;)/);
  assert.match(csp, /(?:^|; )frame-src[^;]*https:\/\/clerk\.picspeak\.art(?:\s|;)/);
});

test('canonical redirects force the production domain onto HTTPS with www', async () => {
  const nextConfigModule = await import('../next.config.mjs');
  const nextConfig = nextConfigModule.default as {
    redirects: () => Promise<
      Array<{
        source: string;
        destination: string;
        permanent: boolean;
        has?: Array<{ type: string; key?: string; value?: string }>;
      }>
    >;
  };

  const redirects = await nextConfig.redirects();

  assert.deepEqual(redirects, [
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

test('public responses advertise language variance and third-party preconnects', async () => {
  const nextConfigModule = await import('../next.config.mjs');
  const nextConfig = nextConfigModule.default as {
    headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
  };

  const routes = await nextConfig.headers();
  const globalRoute = routes.find((route) => route.source === '/:path*');
  const headers = new Map(globalRoute?.headers.map((header) => [header.key, header.value]) ?? []);

  assert.equal(headers.get('Vary'), 'Accept-Language');
  assert.match(headers.get('Link') ?? '', /rel=preconnect/);
  assert.match(headers.get('Link') ?? '', /https:\/\/clerk\.picspeak\.art/);
  assert.match(headers.get('Link') ?? '', /https:\/\/pub-7ae066210514433e84a850bc95c5f1a2\.r2\.dev/);
});

test('only locale-pinned Blog pages receive shared public-cache headers', async () => {
  const nextConfigModule = await import('../next.config.mjs');
  const nextConfig = nextConfigModule.default as {
    headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
  };

  const routes = await nextConfig.headers();
  const publiclyCachedSources = routes
    .filter((route) =>
      route.headers.some(
        (header) => header.key === 'Cache-Control' && header.value.includes('s-maxage='),
      ),
    )
    .map((route) => route.source);

  assert.ok(publiclyCachedSources.includes('/:locale(zh|en|ja)/blog'));
  assert.ok(publiclyCachedSources.includes('/:locale(zh|en|ja)/blog/:slug*'));
  assert.ok(!publiclyCachedSources.includes('/blog'));
  assert.ok(!publiclyCachedSources.includes('/blog/:slug*'));
});

test('proxy scrubs forged locale headers and makes locale redirects private', () => {
  const proxySource = new URL('../src/proxy.ts', import.meta.url);
  const source = readFileSync(proxySource, 'utf8');

  assert.match(source, /requestHeaders\.delete\('x-picspeak-locale'\)/);
  assert.match(source, /NextResponse\.redirect\(redirectUrl, 307\)/);
  assert.match(source, /private, no-store, max-age=0, must-revalidate/);
  assert.match(source, /response\.headers\.set\('Vary', 'Cookie'\)/);
});
