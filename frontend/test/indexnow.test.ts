import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIndexNowPayload,
  buildIndexNowUrlList,
  INDEXNOW_ENDPOINT,
  submitIndexNowUrls,
} from '../src/lib/indexnow.ts';
import {
  buildIndexNowPayload as buildScriptIndexNowPayload,
  buildDefaultIndexNowPaths,
  DEFAULT_INDEXNOW_PATHS,
  INDEXNOW_URL_LIMIT,
  normalizeIndexNowUrls,
} from '../scripts/submit-indexnow.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');
const VALID_KEY = 'indexnow-test-key';

test('IndexNow URL builder normalizes own relative URLs and rejects external URLs', () => {
  const urlList = buildIndexNowUrlList([
    '/en/blog',
    'https://www.picspeak.art/gallery#featured',
    'https://example.com/not-owned',
    ' ',
    '/en/blog',
  ]);

  assert.deepEqual(urlList, ['https://www.picspeak.art/en/blog', 'https://www.picspeak.art/gallery']);
});

test('IndexNow payload includes host, key location, and deduped URL list', () => {
  const payload = buildIndexNowPayload(['/sitemap.xml', '/sitemap-images.xml', 'https://example.com/nope'], VALID_KEY);

  assert.deepEqual(payload, {
    host: 'www.picspeak.art',
    key: VALID_KEY,
    keyLocation: 'https://www.picspeak.art/indexnow-key.txt',
    urlList: ['https://www.picspeak.art/sitemap.xml', 'https://www.picspeak.art/sitemap-images.xml'],
  });
});

test('IndexNow submit helper posts JSON to the IndexNow endpoint', async () => {
  const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response('', { status: 202 });
  };

  const result = await submitIndexNowUrls(['/author/asa-zhou'], {
    rawKey: VALID_KEY,
    fetchImpl,
  });

  assert.equal(result.submitted, true);
  assert.equal(result.ok, true);
  assert.equal(result.status, 202);
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0].url), INDEXNOW_ENDPOINT);
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[0].init?.headers?.['Content-Type' as keyof HeadersInit], 'application/json');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    host: 'www.picspeak.art',
    key: VALID_KEY,
    keyLocation: 'https://www.picspeak.art/indexnow-key.txt',
    urlList: ['https://www.picspeak.art/author/asa-zhou'],
  });
});

test('IndexNow automation is available as a deploy-safe script and workflow hook', () => {
  const packageJson = JSON.parse(readFileSync(path.join(FRONTEND_DIR, 'package.json'), 'utf8'));
  const scriptSource = readFileSync(path.join(FRONTEND_DIR, 'scripts', 'submit-indexnow.mjs'), 'utf8');
  const workflowSource = readFileSync(path.join(FRONTEND_DIR, '..', '.github', 'workflows', 'indexnow.yml'), 'utf8');

  assert.equal(packageJson.scripts['indexnow:submit'], 'node scripts/submit-indexnow.mjs');
  assert.match(scriptSource, /'\/zh\/blog'/);
  assert.match(scriptSource, /'\/en\/blog'/);
  assert.match(scriptSource, /'\/ja\/blog'/);
  assert.doesNotMatch(scriptSource, /^\s*'\/blog',?$/m);
  assert.match(scriptSource, /sitemap-images\.xml/);
  assert.match(scriptSource, /author\/asa-zhou/);
  assert.match(workflowSource, /deployment_status:/);
  assert.match(workflowSource, /deployment_status\.state == 'success'/);
  assert.match(workflowSource, /npm run indexnow:submit/);
  assert.match(workflowSource, /INDEXNOW_KEY/);
});

test('IndexNow script default URLs include changed public leaf pages without aliases', () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://picspeak.example.com';

  try {
    const defaultPaths = buildDefaultIndexNowPaths();
    const defaultUrls = normalizeIndexNowUrls(DEFAULT_INDEXNOW_PATHS);
    const payload = buildScriptIndexNowPayload(['/en', '/ja/blog'], VALID_KEY);

    assert.ok(defaultPaths.includes('/zh/blog/ai-photo-critique-daily-practice'));
    assert.ok(defaultPaths.includes('/en/blog/ai-photo-critique-daily-practice'));
    assert.ok(defaultPaths.includes('/ja/blog/ai-photo-critique-daily-practice'));
    assert.ok(defaultPaths.some((pathName) => pathName.startsWith('/generate/prompts/')));
    assert.ok(defaultPaths.includes('/zh/updates'));
    assert.ok(defaultPaths.includes('/en/updates'));
    assert.ok(defaultPaths.includes('/ja/updates'));
    assert.ok(defaultPaths.includes('/editorial-policy'));
    assert.ok(!defaultPaths.includes('/'));
    assert.ok(!defaultPaths.includes('/blog'));
    assert.ok(!defaultPaths.some((pathName) => pathName.startsWith('/blog/')));
    assert.equal(defaultUrls.length, new Set(defaultUrls).size);
    assert.ok(defaultUrls.length <= INDEXNOW_URL_LIMIT);
    assert.ok(defaultUrls.every((url) => new URL(url).origin === 'https://www.picspeak.art'));
    assert.equal(payload?.host, 'www.picspeak.art');
    assert.ok(payload?.urlList.every((url) => new URL(url).origin === 'https://www.picspeak.art'));
  } finally {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
  }
});
