import assert from 'node:assert/strict';
import test from 'node:test';

test('configured API origin is allowed for requests and photo proxy images without URL credentials', async () => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  try {
    process.env.NEXT_PUBLIC_API_URL = 'http://user:password@127.0.0.1:58000/api/v1?secret=hidden';
    const configModule = '../next.config.mjs?api-csp-origin';
    const { default: config } = await import(configModule);
    const headers = await config.headers();
    const csp = headers.flatMap((route: { headers: { key: string; value: string }[] }) => route.headers)
      .find((header: { key: string; value: string }) => header.key === 'Content-Security-Policy')?.value;
    assert.ok(csp);
    for (const directive of ['connect-src', 'img-src']) {
      const value = csp.split('; ').find((part: string) => part.startsWith(`${directive} `));
      assert.ok(value?.split(' ').includes('http://127.0.0.1:58000'));
    }
    assert.doesNotMatch(csp, /password|secret|hidden|user:/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = previous;
  }
});

test('unsupported API protocols do not enter the request or image CSP', async () => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  try {
    process.env.NEXT_PUBLIC_API_URL = 'file:///private-api';
    const configModule = '../next.config.mjs?api-csp-invalid';
    const { default: config } = await import(configModule);
    const headers = await config.headers();
    const csp = headers.flatMap((route: { headers: { key: string; value: string }[] }) => route.headers)
      .find((header: { key: string; value: string }) => header.key === 'Content-Security-Policy')?.value;
    assert.ok(csp);
    assert.doesNotMatch(csp, /file:|private-api/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = previous;
  }
});
