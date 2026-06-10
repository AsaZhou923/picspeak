import test from 'node:test';
import assert from 'node:assert/strict';

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
