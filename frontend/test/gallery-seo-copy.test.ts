import test from 'node:test';
import assert from 'node:assert/strict';
import { getGallerySeoHeroCopy } from '../src/lib/gallery-seo-copy.ts';

test('gallery SEO hero copy is localized for visible first-fold content', () => {
  assert.equal(getGallerySeoHeroCopy('zh').primaryCta, '开始点评');
  assert.equal(getGallerySeoHeroCopy('ja').secondaryCta, 'プロンプト例を見る');
  assert.equal(getGallerySeoHeroCopy('fr').title, getGallerySeoHeroCopy('en').title);
});
