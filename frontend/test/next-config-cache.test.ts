import test from 'node:test';
import assert from 'node:assert/strict';

async function loadNextConfig(suffix: string) {
  const mod = await import(`../next.config.mjs?webpack-cache=${suffix}-${Date.now()}`);
  return mod.default as {
    webpack: (config: { cache?: unknown }, context: { dev: boolean }) => { cache?: unknown };
  };
}

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('next.config webpack keeps persistent cache for production, CI, and Vercel builds', async () => {
  const nextConfig = await loadNextConfig('prod-ci-vercel');
  const persistentCache = { type: 'filesystem' };

  withEnv({ CI: undefined, VERCEL: undefined }, () => {
    const prodResult = nextConfig.webpack({ cache: persistentCache }, { dev: false });
    assert.deepEqual(prodResult.cache, persistentCache);
  });

  withEnv({ CI: 'true', VERCEL: undefined }, () => {
    const ciDevResult = nextConfig.webpack({ cache: persistentCache }, { dev: true });
    assert.deepEqual(ciDevResult.cache, persistentCache);
  });

  withEnv({ CI: undefined, VERCEL: '1' }, () => {
    const vercelDevResult = nextConfig.webpack({ cache: persistentCache }, { dev: true });
    assert.deepEqual(vercelDevResult.cache, persistentCache);
  });
});

test('next.config webpack limits the memory cache fallback to local Windows dev', async () => {
  const nextConfig = await loadNextConfig('local-dev');
  const persistentCache = { type: 'filesystem' };

  withEnv({ CI: undefined, VERCEL: undefined }, () => {
    const devResult = nextConfig.webpack({ cache: persistentCache }, { dev: true });
    if (process.platform === 'win32') {
      assert.deepEqual(devResult.cache, { type: 'memory' });
    } else {
      assert.deepEqual(devResult.cache, persistentCache);
    }
  });
});
