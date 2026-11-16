import assert from 'node:assert/strict';
import test from 'node:test';

type RemotePattern = { protocol: string; hostname: string; port?: string };

const ENV_KEYS = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_DEMO_IMAGE_URL',
  'IMAGE_REMOTE_HOSTS',
] as const;

async function loadRemotePatterns(
  suffix: string,
  env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}
): Promise<RemotePattern[]> {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of ENV_KEYS) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    const configModule = `../next.config.mjs?image-remote-patterns-${suffix}-${Date.now()}`;
    const { default: config } = await import(configModule);
    return config.images.remotePatterns as RemotePattern[];
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function hostnames(patterns: RemotePattern[], protocol = 'https'): string[] {
  return patterns.filter((pattern) => pattern.protocol === protocol).map((pattern) => pattern.hostname);
}

test('the image optimizer never accepts an arbitrary host', async () => {
  const patterns = await loadRemotePatterns('default');

  for (const pattern of patterns) {
    assert.notEqual(pattern.hostname, '**');
    assert.notEqual(pattern.hostname, '*');
    assert.match(pattern.hostname, /[a-z0-9]\.[a-z0-9]|^localhost$/);
  }
});

test('the hosts that serve optimized images in production stay allowed', async () => {
  const patterns = await loadRemotePatterns('production', {
    NEXT_PUBLIC_API_URL: 'https://api.picspeak.art',
  });
  const hosts = hostnames(patterns);

  // Homepage demo photo, Clerk avatars, signed generated-image URLs, photo proxy.
  for (const expected of ['www.picspeak.art', 'img.clerk.com', '**.r2.cloudflarestorage.com', 'api.picspeak.art']) {
    assert.ok(hosts.includes(expected), `${expected} should be an allowed image host`);
  }
});

test('a custom demo image host is allowed without opening other hosts', async () => {
  const patterns = await loadRemotePatterns('demo', {
    NEXT_PUBLIC_DEMO_IMAGE_URL: 'https://cdn.example.com/demo/ginkgo.jpg',
  });

  assert.ok(hostnames(patterns).includes('cdn.example.com'));
  assert.ok(!hostnames(patterns).includes('example.com'));
});

test('IMAGE_REMOTE_HOSTS adds explicit hosts and ignores wildcards and malformed entries', async () => {
  const patterns = await loadRemotePatterns('extra-hosts', {
    IMAGE_REMOTE_HOSTS: ' Assets.Example.com , *.cdn.example.org, **, *, https://bad.example.com/x, , **.com',
  });
  const hosts = hostnames(patterns);

  assert.ok(hosts.includes('assets.example.com'));
  assert.ok(hosts.includes('*.cdn.example.org'));
  for (const rejected of ['**', '*', '**.com', 'https://bad.example.com/x', 'bad.example.com']) {
    assert.ok(!hosts.includes(rejected), `${rejected} must not become an image host`);
  }
});

test('non-HTTP URLs in the environment do not become image hosts', async () => {
  const patterns = await loadRemotePatterns('invalid-protocol', {
    NEXT_PUBLIC_API_URL: 'file:///private-api',
    NEXT_PUBLIC_DEMO_IMAGE_URL: 'javascript:alert(1)',
  });

  assert.deepEqual(
    patterns.map((pattern) => pattern.protocol).filter((protocol) => protocol !== 'http' && protocol !== 'https'),
    []
  );
});
