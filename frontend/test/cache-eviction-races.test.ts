import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { deferred, settle } from './helpers/component-harness.ts';

function createMemoryCacheStorage() {
  const stores = new Map<string, Map<string, Response>>();
  const openStore = (name: string) => {
    let store = stores.get(name);
    if (!store) {
      store = new Map();
      stores.set(name, store);
    }
    return store;
  };
  const keyOf = (request: Request | string) => (typeof request === 'string' ? request : request.url);

  const hooks: {
    onMatch?: (url: string, response: Response | undefined) => Promise<Response | undefined> | Response | undefined;
    onPut?: (url: string, response: Response) => Promise<void> | void;
  } = {};

  const caches = {
    async open(name: string) {
      const store = openStore(name);
      return {
        async match(request: Request | string) {
          const url = keyOf(request);
          const stored = store.get(url);
          if (hooks.onMatch) return hooks.onMatch(url, stored);
          return stored;
        },
        async put(request: Request | string, response: Response) {
          const url = keyOf(request);
          if (hooks.onPut) await hooks.onPut(url, response);
          store.set(url, response);
        },
        async delete(request: Request | string) {
          return store.delete(keyOf(request));
        },
        async keys() {
          return [...store.keys()].map((url) => new Request(url));
        },
      };
    },
  };

  return {
    caches,
    hooks,
    entries(name: string) {
      return [...openStore(name).keys()];
    },
    rawStore(name: string) {
      return openStore(name);
    },
  };
}

function loadThumbnailCacheModule(fetchImpl: (url: string, init?: RequestInit) => Promise<any>) {
  const storage = createMemoryCacheStorage();
  let nextBlobId = 0;
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  const URLMock = class extends URL {
    static createObjectURL() {
      const url = `blob:thumb-${++nextBlobId}`;
      createdUrls.push(url);
      return url;
    }
    static revokeObjectURL(url: string) {
      revokedUrls.push(url);
    }
  };
  const exports: Record<string, any> = {};
  const compiled = ts.transpileModule(
    fs.readFileSync(new URL('../src/lib/review-thumbnail-cache.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;

  vm.runInNewContext(compiled, {
    exports,
    Request,
    Response,
    Blob,
    URL: URLMock,
    fetch: fetchImpl,
    window: {
      location: { origin: 'https://picspeak.test' },
      caches: storage.caches,
    },
    require(name: string) {
      if (name === './canvas') return { canvasToBlob: async () => null };
      if (name === './client-log') return { logClientWarning() {} };
      throw new Error(`Unexpected module ${name}`);
    },
  });

  return {
    mod: exports as {
      getReviewThumbnailSrc(photoId: string, photoUrl: string, size?: number, sourceIsThumbnail?: boolean): Promise<string | null>;
      evictReviewThumbnailCache(photoId: string): Promise<void>;
      clearReviewThumbnailCache(): Promise<void>;
    },
    storage,
    createdUrls,
    revokedUrls,
  };
}

function loadPhotoPreviewCacheModule() {
  const storage = createMemoryCacheStorage();
  let nextBlobId = 0;
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  const URLMock = class extends URL {
    static createObjectURL() {
      const url = `blob:preview-${++nextBlobId}`;
      createdUrls.push(url);
      return url;
    }
    static revokeObjectURL(url: string) {
      revokedUrls.push(url);
    }
  };
  const exports: Record<string, any> = {};
  const compiled = ts.transpileModule(
    fs.readFileSync(new URL('../src/lib/photo-preview-cache.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;

  vm.runInNewContext(compiled, {
    exports,
    Request,
    Response,
    Blob,
    URL: URLMock,
    window: {
      location: { origin: 'https://picspeak.test' },
      caches: storage.caches,
    },
    require(name: string) {
      throw new Error(`Unexpected module ${name}`);
    },
  });

  return {
    mod: exports as {
      cacheUploadedPhotoPreview(photoId: string, blob: Blob): Promise<void>;
      getUploadedPhotoPreviewSrc(photoId: string): Promise<string | null>;
      refreshUploadedPhotoPreviewSrc(photoId: string): Promise<string | null>;
      evictPhotoPreviewCache(photoId: string): Promise<void>;
      clearPhotoPreviewCache(): Promise<void>;
    },
    storage,
    createdUrls,
    revokedUrls,
  };
}

test('thumbnail cache: in-flight fetch released after eviction writes neither Cache Storage nor in-memory URL', async () => {
  const inFlight = deferred<any>();
  const fetchCalls: string[] = [];
  const { mod, storage, createdUrls } = loadThumbnailCacheModule(async (url) => {
    fetchCalls.push(url);
    if (url.includes('target-1')) return inFlight.promise;
    return { ok: true, status: 200, blob: async () => new Blob(['img'], { type: 'image/webp' }) };
  });

  const keepUrl = await mod.getReviewThumbnailSrc('keep-photo', 'https://cdn.test/keep.webp', 128, true);
  assert.ok(keepUrl);

  const staleRead = mod.getReviewThumbnailSrc('target-photo', 'https://cdn.test/target-1.webp', 128, true);
  await settle();
  assert.equal(fetchCalls.length, 2);

  await mod.evictReviewThumbnailCache('target-photo');

  inFlight.resolve({ ok: true, status: 200, blob: async () => new Blob(['deleted'], { type: 'image/webp' }) });
  const staleResult = await staleRead;

  assert.equal(staleResult, null, 'evicted in-flight thumbnail must not return a cached blob URL');
  assert.equal(createdUrls.length, 1, 'no blob URL created for evicted thumbnail');
  assert.deepEqual(
    storage.entries('ps-review-thumbnails-v1'),
    ['https://picspeak.test/__cache__/review-thumbnails/keep-photo?size=128'],
    'Cache Storage stays empty for evicted photo while keeping unrelated photo',
  );

  // Subsequent read must fetch fresh instead of returning any stale blob URL.
  const freshUrl = await mod.getReviewThumbnailSrc('target-photo', 'https://cdn.test/target-2.webp', 128, true);
  assert.ok(freshUrl && freshUrl !== keepUrl);
  assert.equal(fetchCalls.length, 3);
});

test('thumbnail cache: in-flight decode released after clearReviewThumbnailCache does not repopulate caches', async () => {
  const blobDeferred = deferred<Blob>();
  const { mod, storage, createdUrls } = loadThumbnailCacheModule(async () => ({
    ok: true,
    status: 200,
    blob: () => blobDeferred.promise,
  }));

  const pending = mod.getReviewThumbnailSrc('photo-a', 'https://cdn.test/a.webp', 128, true);
  await settle();

  await mod.clearReviewThumbnailCache();
  blobDeferred.resolve(new Blob(['late'], { type: 'image/webp' }));

  assert.equal(await pending, null);
  assert.equal(createdUrls.length, 0);
  assert.deepEqual(storage.entries('ps-review-thumbnails-v1'), []);
});

test('photo preview cache: read paused during blob decoding does not rebuild blob URL after eviction', async () => {
  const { mod, storage, createdUrls } = loadPhotoPreviewCacheModule();
  await mod.cacheUploadedPhotoPreview('target-photo', new Blob(['secret'], { type: 'image/jpeg' }));
  await mod.cacheUploadedPhotoPreview('other-photo', new Blob(['keep'], { type: 'image/jpeg' }));

  const pausedDecode = deferred<Blob>();
  storage.hooks.onMatch = (url, stored) => {
    if (url.endsWith('/target-photo') && stored) {
      return {
        headers: stored.headers,
        blob: () => pausedDecode.promise,
      } as unknown as Response;
    }
    return stored;
  };

  const pendingRead = mod.getUploadedPhotoPreviewSrc('target-photo');
  await settle();

  await mod.evictPhotoPreviewCache('target-photo');
  pausedDecode.resolve(new Blob(['secret'], { type: 'image/jpeg' }));

  assert.equal(await pendingRead, null, 'evicted in-flight preview read must return null');
  assert.equal(createdUrls.length, 0, 'evicted preview must not rebuild an in-memory blob URL');
  assert.deepEqual(
    storage.entries('ps-photo-previews-v1'),
    ['https://picspeak.test/__cache__/photo-previews/other-photo'],
  );

  // Follow-up read of evicted photo returns null; unrelated preview still loads.
  storage.hooks.onMatch = undefined;
  assert.equal(await mod.getUploadedPhotoPreviewSrc('target-photo'), null);
  assert.ok(await mod.getUploadedPhotoPreviewSrc('other-photo'));
});

test('photo preview cache: in-flight cacheUploadedPhotoPreview evicted mid-put cleans up Cache Storage', async () => {
  const { mod, storage } = loadPhotoPreviewCacheModule();
  const putGate = deferred<void>();
  storage.hooks.onPut = async (url) => {
    if (url.endsWith('/race-photo')) {
      await putGate.promise;
    }
  };

  const pendingPut = mod.cacheUploadedPhotoPreview('race-photo', new Blob(['late'], { type: 'image/jpeg' }));
  await settle();

  await mod.evictPhotoPreviewCache('race-photo');
  putGate.resolve();
  await pendingPut;

  assert.deepEqual(storage.entries('ps-photo-previews-v1'), []);
  assert.equal(await mod.getUploadedPhotoPreviewSrc('race-photo'), null);
});

async function loadIsolatedApiModule(instanceTag: string) {
  const moduleUrl = (source: string) => {
    const code = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    return `data:text/javascript;base64,${Buffer.from(`${code}\n// ${instanceTag}`).toString('base64')}`;
  };
  const typesUrl = moduleUrl(await readFile(new URL('../src/lib/types.ts', import.meta.url), 'utf8'));
  const downloadUrl = moduleUrl(await readFile(new URL('../src/lib/generation-download.ts', import.meta.url), 'utf8'));
  const galleryNavUrl = moduleUrl(await readFile(new URL('../src/lib/gallery-navigation.ts', import.meta.url), 'utf8'));
  const source = (await readFile(new URL('../src/lib/api.ts', import.meta.url), 'utf8'))
    .replaceAll("'./types'", JSON.stringify(typesUrl))
    .replaceAll("'./generation-download'", JSON.stringify(downloadUrl))
    .replaceAll("'./gallery-navigation'", JSON.stringify(galleryNavUrl));
  return import(moduleUrl(source));
}

for (const kind of ['review', 'generation'] as const) {
  test(`usage cache: in-flight getUsage resolved after delete ${kind} does not overwrite cleared cache`, async (t) => {
    const api = await loadIsolatedApiModule(kind);
    const firstUsage = deferred<Response>();
    let usageRequests = 0;

    t.mock.method(globalThis, 'fetch', async (input: string, options: RequestInit = {}) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/me/usage')) {
        usageRequests += 1;
        if (usageRequests === 1) return firstUsage.promise;
        return new Response(JSON.stringify({ plan: 'free', quota: { monthly_used: 9 } }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (options.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    const staleUsagePromise = api.getUsage('owner-token');
    await settle();
    assert.equal(usageRequests, 1);

    if (kind === 'review') {
      await api.deleteReview('rev_1', 'owner-token');
    } else {
      await api.deleteGeneration('gen_1', 'owner-token');
    }

    firstUsage.resolve(
      new Response(JSON.stringify({ plan: 'free', quota: { monthly_used: 10 } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const stalePayload = await staleUsagePromise;
    assert.equal(stalePayload.quota.monthly_used, 10);

    // Next usage read must hit the network instead of reusing the pre-deletion payload.
    const freshPayload = await api.getUsage('owner-token');
    assert.equal(usageRequests, 2, 'subsequent getUsage must fetch again after invalidation');
    assert.equal(freshPayload.quota.monthly_used, 9);
  });
}
