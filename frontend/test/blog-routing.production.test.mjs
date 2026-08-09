import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLatestProductUpdateDate } from '../src/lib/updates-data.ts';
import { DEMO_REVIEW_ID } from '../src/lib/demo-review.ts';

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

function jsonLdObjects(html) {
  return [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
}

function documentTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  assert.ok(match, 'document title should exist');
  return match[1].replaceAll('&amp;', '&').replaceAll('&#x27;', "'").trim();
}

function headingCount(html, level) {
  return [...html.matchAll(new RegExp(`<h${level}(?:\\s|>)`, 'gi'))].length;
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

test('home schema is server-rendered while article schema stays page-specific', async () => {
  const homeResponse = await fetch(`${baseUrl}/en`);
  assert.equal(homeResponse.status, 200);
  assert.match(homeResponse.headers.get('cache-control') ?? '', /\bpublic\b/);
  assert.match(homeResponse.headers.get('cache-control') ?? '', /\bs-maxage=3600\b/);
  const homeSchemas = jsonLdObjects(await homeResponse.text());
  const homeTypes = homeSchemas.map((schema) => schema['@type']);

  for (const expectedType of [
    'Organization',
    'SoftwareApplication',
    'WebSite',
    'Person',
    'SoftwareSourceCode',
    'FAQPage',
    'BreadcrumbList',
  ]) {
    assert.ok(homeTypes.includes(expectedType), `${expectedType} should be present on /en`);
  }

  const organization = homeSchemas.find((schema) => schema['@type'] === 'Organization');
  assert.equal(organization?.['@id'], 'https://www.picspeak.art/#organization');

  const articleResponse = await fetch(`${baseUrl}/en/blog/${ARTICLE_SLUG}`);
  assert.equal(articleResponse.status, 200);
  const articleSchemas = jsonLdObjects(await articleResponse.text());
  const articleTypes = articleSchemas.map((schema) => schema['@type']);
  const article = articleSchemas.find((schema) => schema['@type'] === 'BlogPosting');

  assert.ok(articleTypes.includes('BlogPosting'));
  assert.ok(articleTypes.includes('BreadcrumbList'));
  assert.ok(!articleTypes.includes('FAQPage'));
  assert.ok(Array.isArray(article?.citation));
  assert.ok(article.citation.length >= 2);
});

test('public collection and trust routes emit page-owned JSON-LD', async () => {
  const cases = [
    { path: '/en/updates', types: ['CollectionPage', 'BreadcrumbList'] },
    { path: '/privacy', types: ['WebPage', 'BreadcrumbList'] },
    { path: '/editorial-policy', types: ['WebPage', 'BreadcrumbList'] },
    { path: '/generate/prompts', types: ['CollectionPage', 'BreadcrumbList'] },
  ];

  for (const entry of cases) {
    const response = await fetch(`${baseUrl}${entry.path}`);
    assert.equal(response.status, 200, entry.path);
    assert.match(response.headers.get('cache-control') ?? '', /\bpublic\b/, entry.path);
    const types = jsonLdObjects(await response.text()).map((schema) => schema['@type']);
    for (const expectedType of entry.types) {
      assert.ok(types.includes(expectedType), `${entry.path} should contain ${expectedType}`);
    }
  }
});

test('invalid locale-shaped paths are real 404s and discovery assets stay canonical', async () => {
  for (const pathName of [
    '/sitemap_index.xml',
    '/definitely-not-a-real-route',
    '/en/blog/definitely-not-a-real-post',
    '/generate/prompts/definitely-not-a-real-prompt',
    '/privacy/definitely-not-a-real-child',
  ]) {
    const response = await fetch(`${baseUrl}${pathName}`);
    assert.equal(response.status, 404, pathName);
    assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/i, pathName);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/i, pathName);
  }

  const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(robotsResponse.status, 200);
  const robotsText = await robotsResponse.text();
  assert.doesNotMatch(robotsText, /Crawl-delay:/i);
  assert.match(robotsText, /User-Agent: OAI-SearchBot/);
  assert.match(robotsText, /Sitemap: https:\/\/www\.picspeak\.art\/sitemap\.xml/);

  const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemapResponse.status, 200);
  const sitemapXml = await sitemapResponse.text();
  assert.doesNotMatch(sitemapXml, /<loc>https:\/\/www\.picspeak\.art<\/loc>/);
  assert.match(sitemapXml, /<loc>https:\/\/www\.picspeak\.art\/editorial-policy<\/loc>/);
});

test('search-result titles stay unique, concise, and free of duplicated brand suffixes', async () => {
  const paths = [
    '/en',
    '/affiliate',
    '/gallery',
    '/editorial-policy',
    '/author/asa-zhou',
    '/en/blog/ai-photo-critique-daily-practice',
    '/generate/prompts/photo-old-delhi-storefront',
    `/reviews/${DEMO_REVIEW_ID}`,
  ];
  const titles = [];

  for (const pathName of paths) {
    const response = await fetch(`${baseUrl}${pathName}`);
    assert.equal(response.status, 200, pathName);
    const title = documentTitle(await response.text());
    assert.ok(title.length <= 65, `${pathName} title is too long: ${title.length}`);
    assert.doesNotMatch(title, /PicSpeak\s*[|—·]\s*PicSpeak/i, pathName);
    titles.push(title);
  }

  assert.equal(new Set(titles).size, titles.length);
});

test('indexable interactive pages avoid cookie-unsafe shared caching', async () => {
  const generateResponse = await fetch(`${baseUrl}/generate`, {
    headers: { cookie: 'picspeak-locale=zh' },
  });
  assert.equal(generateResponse.status, 200);
  assert.doesNotMatch(generateResponse.headers.get('cache-control') ?? '', /\bs-maxage=/);
  const generateHtml = await generateResponse.text();
  assert.match(generateHtml, /<html[^>]+lang="zh-CN"/i);
  assert.equal(headingCount(generateHtml, 1), 1);

  const retakeResponse = await fetch(`${baseUrl}/retake`, {
    headers: { cookie: 'picspeak-locale=ja' },
  });
  assert.equal(retakeResponse.status, 200);
  assert.doesNotMatch(retakeResponse.headers.get('cache-control') ?? '', /\bs-maxage=/);
  const retakeHtml = await retakeResponse.text();
  assert.match(retakeHtml, /<html[^>]+lang="ja"/i);
  assert.equal(headingCount(retakeHtml, 1), 1);
  assert.match(metadataUrl(retakeHtml, 'name', 'robots'), /index, follow/i);
  assert.equal(new URL(metadataUrl(retakeHtml, 'rel', 'canonical'), baseUrl).pathname, '/retake');
  const retakeTypes = jsonLdObjects(retakeHtml).map((schema) => schema['@type']);
  for (const expectedType of ['WebPage', 'SoftwareApplication', 'BreadcrumbList']) {
    assert.ok(retakeTypes.includes(expectedType), `/retake should contain ${expectedType}`);
  }

  const demoResponse = await fetch(`${baseUrl}/reviews/${DEMO_REVIEW_ID}`);
  assert.equal(demoResponse.status, 200);
  assert.match(demoResponse.headers.get('cache-control') ?? '', /\bs-maxage=3600\b/);
  const demoHtml = await demoResponse.text();
  assert.equal(headingCount(demoHtml, 1), 1);
  assert.match(demoHtml, /Scores, Evidence, and Retake Guidance/);
});

test('legacy public demo URLs redirect permanently to the single canonical example', async () => {
  const response = await fetch(`${baseUrl}/reviews/rev_35e0951d0df94a1e`, { redirect: 'manual' });

  assert.equal(response.status, 308);
  assert.equal(new URL(response.headers.get('location'), baseUrl).pathname, `/reviews/${DEMO_REVIEW_ID}`);
});

test('AI discovery text remains crawlable while canonical HTML owns search indexing', async () => {
  const markdownResponse = await fetch(`${baseUrl}/ai-content/home.md`);
  assert.equal(markdownResponse.status, 200);
  assert.match(markdownResponse.headers.get('content-type') ?? '', /^text\/markdown/i);
  assert.match(markdownResponse.headers.get('x-robots-tag') ?? '', /noindex, follow/i);
  assert.match(markdownResponse.headers.get('link') ?? '', /<https:\/\/www\.picspeak\.art\/en>; rel="canonical"/);

  for (const pathName of ['/llms.txt', '/.well-known/llms.txt']) {
    const response = await fetch(`${baseUrl}${pathName}`);
    assert.equal(response.status, 200, pathName);
    assert.match(response.headers.get('x-robots-tag') ?? '', /noindex, follow/i, pathName);
  }
});
