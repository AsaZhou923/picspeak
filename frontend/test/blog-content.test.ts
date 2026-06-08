import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBlogPostingJsonLd, estimateBlogPostWordCount } from '../src/lib/seo.ts';
import { siteConfig } from '../src/lib/site.ts';

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
    name: string;
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

  assert.equal(canonicalSlugs.length, 7);

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

test('blog index keeps static article data server-rendered with a small client view-count island', () => {
  const blogContentSource = readFileSync(
    path.join(TEST_DIR, '..', 'src', 'app', '[locale]', 'blog', 'BlogIndexPageContent.tsx'),
    'utf8',
  );
  const viewCountSource = readFileSync(
    path.join(TEST_DIR, '..', 'src', 'app', '[locale]', 'blog', 'BlogViewCount.tsx'),
    'utf8',
  );
  const defaultPageSource = readFileSync(path.join(TEST_DIR, '..', 'src', 'app', 'blog', 'page.tsx'), 'utf8');
  const localizedPageSource = readFileSync(path.join(TEST_DIR, '..', 'src', 'app', '[locale]', 'blog', 'page.tsx'), 'utf8');

  assert.doesNotMatch(blogContentSource, /^'use client';/m);
  assert.match(blogContentSource, /getBlogPosts\(pinnedLocale\)/);
  assert.match(blogContentSource, /BlogViewCountProvider/);
  assert.doesNotMatch(blogContentSource, /useEffect|useState|getBlogViewCounts/);
  assert.match(viewCountSource, /^'use client';/m);
  assert.match(viewCountSource, /getBlogViewCounts/);
  assert.match(defaultPageSource, /BlogIndexPageContent/);
  assert.match(localizedPageSource, /BlogIndexPageContent/);
});

test('blog post structured data exposes the headline and intro as speakable content', () => {
  const bundle = readBundle('en');
  const post = bundle.posts.find((entry) => entry.slug === 'five-photo-composition-checks');
  assert.ok(post);

  const schema = buildBlogPostingJsonLd({
    site: siteConfig,
    locale: 'en',
    ui: bundle.ui,
    post,
  });
  const blogPostSource = readFileSync(
    path.join(TEST_DIR, '..', 'src', 'app', '[locale]', 'blog', '[slug]', 'BlogPostClient.tsx'),
    'utf8',
  );

  assert.equal(schema['@type'], 'BlogPosting');
  assert.equal(schema.articleBody, post.intro);
  assert.equal(schema.wordCount, estimateBlogPostWordCount(post));
  assert.ok(schema.wordCount > 100);
  assert.deepEqual(schema.speakable, {
    '@type': 'SpeakableSpecification',
    cssSelector: ['article header h1', '[data-speakable="blog-intro"]'],
  });
  assert.match(blogPostSource, /data-speakable="blog-intro"/);
  assert.match(blogPostSource, /buildBlogPostingJsonLd/);
});
