import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLatestProductUpdateDate } from '../src/lib/updates-data.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');
const NEXT_BIN = path.join(FRONTEND_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
const ARTICLE_SLUG = 'five-photo-composition-checks';
const LOCALE_CASES = [
  { locale: 'zh', documentLang: 'zh-CN' },
  { locale: 'en', documentLang: 'en' },
  { locale: 'ja', documentLang: 'ja' },
];

let baseUrl;
let serverProcess;
let serverOutput = '';

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, 'localhost', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`next start exited early (${serverProcess.exitCode})\n${serverOutput}`);
    }

    try {
      const response = await fetch(`${baseUrl}/en/blog`, { redirect: 'manual' });
      if (response.status === 200) return;
      if (response.status >= 500) {
        const responseBody = await response.text();
        throw new Error(
          `next start returned ${response.status}\n${serverOutput}\n${responseBody.slice(0, 2_000)}`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('next start returned')) {
        throw error;
      }
      // The socket is not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for next start\n${serverOutput}`);
}

function responseLocation(response) {
  const location = response.headers.get('location');
  assert.ok(location);
  return new URL(location, baseUrl);
}

function assertPrivateRedirect(response) {
  assert.equal(response.status, 307);
  const cacheControl = response.headers.get('cache-control') ?? '';
  assert.match(cacheControl, /\bprivate\b/);
  assert.match(cacheControl, /\bno-store\b/);
  assert.doesNotMatch(cacheControl, /\bpublic\b|\bs-maxage\b|\bstale-while-revalidate\b/);
  assert.match(response.headers.get('vary') ?? '', /(?:^|,\s*)Cookie(?:,|$)/i);
}

function metadataUrl(html, attribute, value) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<(?:meta|link)[^>]+${attribute}="${escapedValue}"[^>]+(?:content|href)="([^"]+)"`,
    'i',
  );
  const match = html.match(pattern);
  assert.ok(match, `${value} metadata should exist`);
  return match[1].replaceAll('&amp;', '&');
}

before(async () => {
  assert.ok(existsSync(path.join(FRONTEND_DIR, '.next', 'BUILD_ID')), 'Run npm run build first');
  const port = await reservePort();
  baseUrl = `http://localhost:${port}`;
  serverProcess = spawn(
    process.execPath,
    [NEXT_BIN, 'start', '--hostname', 'localhost', '--port', String(port)],
    {
      cwd: FRONTEND_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_URL:
          process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_ZXhhbXBsZS5jb20k',
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_placeholder',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  serverProcess.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  await waitForServer();
});

after(async () => {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  const exited = new Promise((resolve) => serverProcess.once('exit', resolve));
  serverProcess.kill('SIGTERM');
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
    serverProcess.kill('SIGKILL');
  }
});

test('unprefixed Blog aliases redirect privately and preserve the full query string', async () => {
  const indexResponse = await fetch(
    `${baseUrl}/blog?utm_source=review&tag=portrait&tag=light`,
    {
      headers: { cookie: 'picspeak-locale=zh' },
      redirect: 'manual',
    },
  );
  assertPrivateRedirect(indexResponse);
  const indexLocation = responseLocation(indexResponse);
  assert.equal(indexLocation.pathname, '/zh/blog');
  assert.equal(indexLocation.search, '?utm_source=review&tag=portrait&tag=light');

  const articleResponse = await fetch(`${baseUrl}/blog/${ARTICLE_SLUG}?ref=history`, {
    headers: { cookie: 'picspeak-locale=ja' },
    redirect: 'manual',
  });
  assertPrivateRedirect(articleResponse);
  const articleLocation = responseLocation(articleResponse);
  assert.equal(articleLocation.pathname, `/ja/blog/${ARTICLE_SLUG}`);
  assert.equal(articleLocation.search, '?ref=history');

  const legacyImageResponse = await fetch(
    `${baseUrl}/blog/${ARTICLE_SLUG}/opengraph-image?source=legacy`,
    {
      headers: { cookie: 'picspeak-locale=zh' },
      redirect: 'manual',
    },
  );
  assertPrivateRedirect(legacyImageResponse);
  const legacyImageLocation = responseLocation(legacyImageResponse);
  assert.equal(
    legacyImageLocation.pathname,
    `/zh/blog/${ARTICLE_SLUG}/opengraph-image`,
  );
  assert.equal(legacyImageLocation.search, '?source=legacy');
});

test('forged headers and invalid locale cookies fall back to English', async () => {
  const forgedHeaderResponse = await fetch(`${baseUrl}/blog`, {
    headers: { 'x-picspeak-locale': 'ja' },
    redirect: 'manual',
  });
  assertPrivateRedirect(forgedHeaderResponse);
  assert.equal(responseLocation(forgedHeaderResponse).pathname, '/en/blog');

  const invalidCookieResponse = await fetch(`${baseUrl}/blog/${ARTICLE_SLUG}`, {
    headers: {
      cookie: 'picspeak-locale=zh-CN',
      'x-picspeak-locale': 'zh',
    },
    redirect: 'manual',
  });
  assertPrivateRedirect(invalidCookieResponse);
  assert.equal(
    responseLocation(invalidCookieResponse).pathname,
    `/en/blog/${ARTICLE_SLUG}`,
  );

  const unrelatedResponse = await fetch(`${baseUrl}/blogger`, { redirect: 'manual' });
  assert.notEqual(unrelatedResponse.status, 307);
  assert.equal(unrelatedResponse.headers.get('location'), null);
});

test('locale-prefixed articles own document language, canonical, and social images', async () => {
  for (const { locale, documentLang } of LOCALE_CASES) {
    const response = await fetch(`${baseUrl}/${locale}/blog/${ARTICLE_SLUG}`, {
      headers: {
        cookie: `picspeak-locale=${locale === 'en' ? 'zh' : 'en'}`,
        'x-picspeak-locale': locale === 'ja' ? 'zh' : 'ja',
      },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /\bpublic\b/);
    assert.match(response.headers.get('cache-control') ?? '', /\bs-maxage=3600\b/);
    const html = await response.text();
    assert.match(html, new RegExp(`<html[^>]+lang="${documentLang}"`));

    const canonical = new URL(metadataUrl(html, 'rel', 'canonical'), baseUrl);
    const ogImage = new URL(metadataUrl(html, 'property', 'og:image'), baseUrl);
    const twitterImage = new URL(metadataUrl(html, 'name', 'twitter:image'), baseUrl);
    const expectedArticlePath = `/${locale}/blog/${ARTICLE_SLUG}`;
    const expectedImagePath = `${expectedArticlePath}/opengraph-image`;

    assert.equal(canonical.pathname, expectedArticlePath);
    assert.equal(ogImage.pathname, expectedImagePath);
    assert.equal(twitterImage.pathname, expectedImagePath);

    const imageResponse = await fetch(ogImage);
    assert.equal(imageResponse.status, 200);
    assert.match(imageResponse.headers.get('content-type') ?? '', /^image\/png\b/);
    assert.ok((await imageResponse.arrayBuffer()).byteLength > 1_000);
  }
});

test('regular sitemap excludes Blog aliases and shares the latest update date', async () => {
  const response = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(response.status, 200);
  const xml = await response.text();
  const siteOrigin = 'https://www.picspeak.art';
  const latestDate = getLatestProductUpdateDate();

  assert.doesNotMatch(xml, new RegExp(`<loc>${siteOrigin}/blog(?:/|<)`));
  for (const pathname of ['/updates', '/zh/updates', '/en/updates', '/ja/updates']) {
    const escapedPath = pathname.replaceAll('/', '\\/');
    assert.match(
      xml,
      new RegExp(
        `<loc>${siteOrigin}${escapedPath}<\\/loc>[\\s\\S]*?<lastmod>${latestDate}`,
      ),
    );
  }
});
