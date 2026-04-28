import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocale } from '../src/lib/locale.ts';

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
