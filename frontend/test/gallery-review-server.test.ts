import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as galleryPage from '../src/lib/gallery-review-page.ts';

function loadModule(relativePath: string, imports: Record<string, unknown>, fetchImpl?: typeof fetch) {
  const exports: Record<string, any> = {};
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, Response, URLSearchParams, TextEncoder, fetch: fetchImpl,
    require(name: string) {
      assert.ok(name in imports, `Unexpected import ${name}`);
      return imports[name];
    },
  });
  return exports;
}

function serverHarness(responses: Response[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    assert.ok(response, 'Unexpected fetch');
    return response;
  };
  const server = loadModule('../src/lib/gallery-review-server.ts', {
    '@/lib/gallery-scoreboard-api': { buildGalleryApiUrl: (path: string) => `https://api.example.test${path}` },
    '@/lib/gallery-review-page': galleryPage,
  }, fetchImpl);
  return { server, calls };
}

function entry(id: string) {
  return { review_id: id, image_type: 'street', last_modified: '2026-11-22T00:00:00Z' };
}

test('sitemap reads every page without caching and accepts a genuine empty inventory', async () => {
  const { server, calls } = serverHarness([
    Response.json({ items: [entry('rev_page_one')], next_cursor: '90' }),
    Response.json({ items: [entry('rev_page_two')], next_cursor: null }),
  ]);
  const result = await server.fetchGallerySitemapEntries();
  assert.deepEqual(Array.from(result, (item: any) => item.review_id), ['rev_page_one', 'rev_page_two']);
  assert.ok(calls[1].url.endsWith('limit=1000&cursor=90'));
  assert.ok(calls.every((call) => call.init?.cache === 'no-store'));
  const empty = serverHarness([Response.json({ items: [], next_cursor: null })]);
  assert.equal((await empty.server.fetchGallerySitemapEntries()).length, 0);
});

test('sitemap rejects partial inventories, invalid payloads and non-advancing cursors', async () => {
  for (const second of [
    new Response('', { status: 503 }),
    Response.json({ items: [] }),
    Response.json({ items: [entry('rev_page_two')], next_cursor: '100' }),
    Response.json({ items: [entry('rev_page_two')], next_cursor: '90' }),
    Response.json({ items: [], next_cursor: '80' }),
    Response.json({ items: [entry('rev_page_one')], next_cursor: null }),
    Response.json({ items: [entry('../private')], next_cursor: null }),
    Response.json({ items: [{ ...entry('rev_page_two'), last_modified: 'invalid' }], next_cursor: null }),
  ]) {
    const { server } = serverHarness([
      Response.json({ items: [entry('rev_page_one')], next_cursor: '90' }), second,
    ]);
    await assert.rejects(server.fetchGallerySitemapEntries());
  }
});

test('sitemap refuses silent truncation beyond the single-file URL limit', async () => {
  const responses = Array.from({ length: 50 }, (_, page) => Response.json({
    items: Array.from({ length: 1000 }, (_, index) => entry(`rev_item_${page}_${index}`)),
    next_cursor: String(50_000 - page * 1000),
  }));
  const { server } = serverHarness(responses);
  await assert.rejects(server.fetchGallerySitemapEntries(), /single-sitemap URL limit/);
});

test('detail reads are fresh and hide short-lived original URLs', async () => {
  const { server, calls } = serverHarness([
    Response.json({ review_id: 'rev_public', photo_url: 'https://secret-signed.test', is_indexable: true }),
    new Response('', { status: 404 }),
    new Response('', { status: 503 }),
  ]);
  assert.equal((await server.fetchPublicGalleryReview('rev_public')).photo_url, null);
  assert.equal(await server.fetchPublicGalleryReview('rev_public'), null);
  await assert.rejects(server.fetchPublicGalleryReview('rev_public'), /503/);
  assert.ok(calls.every((call) => call.init?.cache === 'no-store'));
});

test('topic samples prefer the quality-filtered endpoint and only fall back for old APIs', async () => {
  const sample = { review_id: 'rev_sample', photo_thumbnail_url: null, final_score: 8, summary: 'Street scene' };
  const current = serverHarness([Response.json({ items: [sample] })]);
  assert.equal((await current.server.fetchGalleryTopicSamples('street'))[0].review_id, sample.review_id);
  assert.match(current.calls[0].url, /\/gallery\/topic-samples\?image_type=street&limit=3$/);

  const failed = serverHarness([new Response('', { status: 503 })]);
  assert.equal((await failed.server.fetchGalleryTopicSamples('street')).length, 0);
  assert.equal(failed.calls.length, 1);

  const legacy = serverHarness([
    new Response('', { status: 404 }),
    Response.json({ items: [sample, { ...sample, review_id: 'rev_withdrawn' }, { ...sample, review_id: 'rev_thin' }] }),
    Response.json({ ...sample, image_type: 'street', is_indexable: true }),
    new Response('', { status: 404 }),
    Response.json({ ...sample, review_id: 'rev_thin', image_type: 'street', is_indexable: false }),
  ]);
  const samples = await legacy.server.fetchGalleryTopicSamples('street');
  assert.deepEqual(Array.from(samples, (item: any) => item.review_id), ['rev_sample']);
  assert.ok(legacy.calls[1].url.endsWith('image_type=street&sort=score&limit=6'));
  assert.ok(legacy.calls.every((call) => call.init?.cache === 'no-store'));
});

test('sitemap route serves complete XML or a retryable uncached 503', async () => {
  const loadRoute = (fetchEntries: () => Promise<unknown[]>) => loadModule('../src/app/sitemap-gallery.xml/route.ts', {
    '@/lib/gallery-review-page': galleryPage,
    '@/lib/gallery-review-server': { fetchGallerySitemapEntries: fetchEntries },
    '@/lib/site': { siteConfig: { url: 'https://picspeak.example.test' } },
  });
  const empty = await loadRoute(async () => []).GET();
  assert.equal(empty.status, 200);
  assert.match(await empty.text(), /<urlset[^>]*><\/urlset>/);
  assert.equal(empty.headers.get('cache-control'), 'no-store');
  const failed = await loadRoute(async () => { throw new Error('upstream unavailable'); }).GET();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('cache-control'), 'no-store');
  assert.equal(failed.headers.get('retry-after'), '60');
  assert.doesNotMatch(await failed.text(), /<urlset/);
});
