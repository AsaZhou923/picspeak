import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type BlogPost = {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  category: string;
  readingTime: string;
  publishedAt: string;
  updatedAt: string;
  keywords: string[];
  intro: string;
  takeawayTitle: string;
  takeawayItems: string[];
  sections: Array<{
    title: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
};

type BlogBundle = {
  ui: {
    title: string;
    description: string;
    keywords: string[];
  };
  posts: BlogPost[];
};

const LOCALES = ['zh', 'en', 'ja'] as const;
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIN_UI_DESCRIPTION_LENGTH = {
  zh: 70,
  en: 100,
  ja: 75,
} as const;
const MIN_POST_DESCRIPTION_LENGTH = {
  zh: 70,
  en: 120,
  ja: 75,
} as const;

function readBundle(locale: (typeof LOCALES)[number]): BlogBundle {
  const filePath = path.join(TEST_DIR, '..', 'src', 'content', 'blog', `${locale}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8')) as BlogBundle;
}

test('blog content bundles keep the same slug order across locales', () => {
  const bundles = Object.fromEntries(LOCALES.map((locale) => [locale, readBundle(locale)])) as Record<
    (typeof LOCALES)[number],
    BlogBundle
  >;
  const canonicalSlugs = bundles.en.posts.map((post) => post.slug);

  assert.equal(canonicalSlugs.length, 6);

  for (const locale of LOCALES) {
    assert.deepEqual(
      bundles[locale].posts.map((post) => post.slug),
      canonicalSlugs,
    );
  }
});

test('blog content bundles include SEO metadata and readable article bodies', () => {
  for (const locale of LOCALES) {
    const bundle = readBundle(locale);

    assert.ok(bundle.ui.title);
    assert.ok(bundle.ui.description);
    assert.ok([...bundle.ui.description].length >= MIN_UI_DESCRIPTION_LENGTH[locale]);
    assert.ok(bundle.ui.keywords.length > 0);

    for (const post of bundle.posts) {
      assert.ok(post.title);
      assert.ok(post.description);
      assert.ok([...post.description].length >= MIN_POST_DESCRIPTION_LENGTH[locale]);
      assert.ok(post.excerpt);
      assert.ok(post.category);
      assert.ok(post.readingTime);
      assert.match(post.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(post.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(post.keywords.length > 0);
      assert.ok(post.intro);
      assert.ok(post.takeawayTitle);
      assert.ok(post.takeawayItems.length > 0);
      assert.ok(post.sections.length > 0);

      for (const section of post.sections) {
        assert.ok(section.title);
        assert.ok(section.paragraphs.length > 0);
      }
    }
  }
});
