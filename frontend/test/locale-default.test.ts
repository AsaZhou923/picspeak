import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_ROUTE_ROOTS,
  hasKnownAppPath,
  PUBLIC_BLOG_SLUGS,
  PUBLIC_PROMPT_EXAMPLE_IDS,
} from '../src/lib/app-route-roots.ts';
import { getBlogSlugs } from '../src/lib/blog-data.ts';
import { GENERATION_PROMPT_EXAMPLES } from '../src/content/generation/prompt-examples.ts';
import {
  getLocalizedBlogRedirectPath,
  isSupportedLocale,
  localeFromPathname,
  normalizeLocale,
  resolveRequestLocale,
} from '../src/lib/locale.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

test('unknown or missing locales normalize to English by default', () => {
  assert.equal(normalizeLocale(''), 'en');
  assert.equal(normalizeLocale('fr'), 'en');
});

test('explicit supported locale codes are preserved', () => {
  assert.equal(normalizeLocale('zh'), 'zh');
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(normalizeLocale('ja'), 'ja');
  assert.equal(normalizeLocale('zh-CN'), 'zh');
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('ja-JP'), 'ja');
});

test('request locale resolution only trusts exact path and cookie values', () => {
  for (const locale of ['zh', 'en', 'ja']) {
    assert.equal(isSupportedLocale(locale), true);
  }
  for (const locale of ['zh-CN', 'en-US', 'ja-JP', 'ZH', ' zh', 'fr', '']) {
    assert.equal(isSupportedLocale(locale), false);
  }

  assert.equal(localeFromPathname('/zh/blog'), 'zh');
  assert.equal(localeFromPathname('/zh-CN/blog'), null);
  assert.equal(resolveRequestLocale('/en/blog', 'zh'), 'en');
  assert.equal(resolveRequestLocale('/blog', 'ja'), 'ja');
  assert.equal(resolveRequestLocale('/blog', 'zh-CN'), null);
  assert.equal(resolveRequestLocale('/blog', 'fr'), null);
});

test('unprefixed Blog aliases resolve to locale-pinned paths only', () => {
  assert.equal(getLocalizedBlogRedirectPath('/blog', 'zh'), '/zh/blog');
  assert.equal(
    getLocalizedBlogRedirectPath('/blog/five-photo-composition-checks', 'ja'),
    '/ja/blog/five-photo-composition-checks',
  );
  assert.equal(getLocalizedBlogRedirectPath('/blog/', 'en'), '/en/blog/');
  assert.equal(getLocalizedBlogRedirectPath('/blogger', 'zh'), null);
  assert.equal(getLocalizedBlogRedirectPath('/en/blog', 'zh'), null);
});

test('route-root guard rejects invalid locale-shaped paths without blocking app directories', () => {
  assert.equal(hasKnownAppPath('/sitemap_index.xml'), false);
  assert.equal(hasKnownAppPath('/definitely-not-a-real-route'), false);
  assert.equal(hasKnownAppPath('/en/blog/example'), false);
  assert.equal(hasKnownAppPath('/generate/prompts/example'), false);
  assert.equal(hasKnownAppPath('/privacy/example'), false);
  assert.equal(hasKnownAppPath('/editorial-policy'), true);
  assert.equal(hasKnownAppPath('/_vercel/speed-insights/vitals'), true);
  assert.equal(hasKnownAppPath('/__clerk/v1/client'), true);

  const appDirectory = path.join(TEST_DIR, '..', 'src', 'app');
  const topLevelRouteDirectories = readdirSync(appDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '[locale]')
    .map((entry) => entry.name);

  for (const routeRoot of topLevelRouteDirectories) {
    assert.ok(APP_ROUTE_ROOTS.has(routeRoot), `${routeRoot} must be allowed by the route-root guard`);
  }

  assert.deepEqual([...PUBLIC_BLOG_SLUGS], getBlogSlugs());
  assert.deepEqual(
    [...PUBLIC_PROMPT_EXAMPLE_IDS],
    GENERATION_PROMPT_EXAMPLES.map((example) => example.id),
  );
});
