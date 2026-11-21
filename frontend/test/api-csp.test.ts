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

test('LOCAL_OBJECT_STORAGE_ORIGIN only allows loopback HTTP origins in connect-src', async () => {
  const previous = process.env.LOCAL_OBJECT_STORAGE_ORIGIN;
  try {
    process.env.LOCAL_OBJECT_STORAGE_ORIGIN = 'http://user:pass@127.0.0.1:9000/bucket?token=secret';
    const loopbackModule = '../next.config.mjs?e2e-storage-loopback';
    const { default: loopbackConfig } = await import(loopbackModule);
    const loopbackHeaders = await loopbackConfig.headers();
    const loopbackCsp = loopbackHeaders
      .flatMap((route: { headers: { key: string; value: string }[] }) => route.headers)
      .find((header: { key: string; value: string }) => header.key === 'Content-Security-Policy')?.value;
    assert.ok(loopbackCsp);
    const connectSrc = loopbackCsp.split('; ').find((part: string) => part.startsWith('connect-src '));
    assert.ok(connectSrc?.split(' ').includes('http://127.0.0.1:9000'));
    assert.doesNotMatch(loopbackCsp, /pass|secret|bucket/);

    process.env.LOCAL_OBJECT_STORAGE_ORIGIN = 'http://evil.example.com:9000';
    const remoteModule = '../next.config.mjs?e2e-storage-remote';
    const { default: remoteConfig } = await import(remoteModule);
    const remoteHeaders = await remoteConfig.headers();
    const remoteCsp = remoteHeaders
      .flatMap((route: { headers: { key: string; value: string }[] }) => route.headers)
      .find((header: { key: string; value: string }) => header.key === 'Content-Security-Policy')?.value;
    assert.ok(remoteCsp);
    assert.doesNotMatch(remoteCsp, /evil\.example\.com/);
  } finally {
    if (previous === undefined) delete process.env.LOCAL_OBJECT_STORAGE_ORIGIN;
    else process.env.LOCAL_OBJECT_STORAGE_ORIGIN = previous;
  }
});
