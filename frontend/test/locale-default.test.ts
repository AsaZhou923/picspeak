import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLocalizedBlogRedirectPath,
  isSupportedLocale,
  localeFromPathname,
  normalizeLocale,
  resolveRequestLocale,
} from '../src/lib/locale.ts';

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
