import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_LANGUAGE_ALTERNATES, singlePageAlternates } from '../src/lib/seo.ts';

test('home language alternates point only to equivalent locale home pages', () => {
  assert.deepEqual(HOME_LANGUAGE_ALTERNATES, {
    'zh-CN': '/zh',
    en: '/en',
    ja: '/ja',
    'x-default': '/',
  });
});

test('single URL public pages do not point hreflang to unrelated locale home pages', () => {
  assert.deepEqual(singlePageAlternates('/gallery'), {
    canonical: '/gallery',
    languages: {
      'x-default': '/gallery',
    },
  });
});
