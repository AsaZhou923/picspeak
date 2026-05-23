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
