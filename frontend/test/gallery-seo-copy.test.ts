import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getGallerySeoHeroCopy } from '../src/lib/gallery-seo-copy.ts';

test('gallery SEO hero copy is localized for visible first-fold content', () => {
  assert.equal(getGallerySeoHeroCopy('zh').primaryCta, '开始点评');
  assert.equal(getGallerySeoHeroCopy('ja').exampleCta, '講評の完全な例を見る');
  assert.equal(getGallerySeoHeroCopy('fr').title, getGallerySeoHeroCopy('en').title);
});

test('gallery hero links to the sort and filter controls that sit below the works', () => {
  const hero = readFileSync(new URL('../src/components/gallery/GallerySeoHero.tsx', import.meta.url), 'utf8');
  const filters = readFileSync(new URL('../src/components/gallery/GalleryFilters.tsx', import.meta.url), 'utf8');

  assert.match(hero, /href="#gallery-filters"/);
  assert.match(filters, /id="gallery-filters" className="[^"]*scroll-mt-/);
  assert.equal(getGallerySeoHeroCopy('zh').filtersCta, '排序与筛选');
  for (const locale of ['en', 'ja'] as const) {
    assert.ok(getGallerySeoHeroCopy(locale).filtersCta);
  }
});
