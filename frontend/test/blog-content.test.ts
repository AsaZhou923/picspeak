import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getBlogPostsByFreshness,
  getFeaturedBlogPost,
  getStarterBlogPosts,
} from '../src/lib/blog-data.ts';
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
    label: string;
    starterPostsLabel: string;
    primaryTopicsLabel: string;
    seoDirectionLabel: string;
    featuredLabel: string;
    allPostsLabel: string;
    nextStepLabel: string;
    relatedLabel: string;
    updatedLabel: string;
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

test('the two refreshed guides expose their update date in every locale', () => {
  const refreshedSlugs = [
    'ai-photo-critique-daily-practice',
    'turn-photo-feedback-into-shooting-checklist',
  ];

  for (const locale of LOCALES) {
    const bundle = readBundle(locale);
    assert.ok(bundle.ui.updatedLabel);

    for (const slug of refreshedSlugs) {
      const post = bundle.posts.find((entry) => entry.slug === slug);
      assert.ok(post, `${locale}/${slug} should exist`);
      assert.equal(post.updatedAt, '2026-07-27');
    }
  }
});

test('Blog freshness and editorial curation are independent contracts', () => {
  const expectedStarterSlugs = readBundle('en').posts.map((post) => post.slug);

  for (const locale of LOCALES) {
    const freshPosts = getBlogPostsByFreshness(locale);
    const featuredPost = getFeaturedBlogPost(locale);
    const starterPosts = getStarterBlogPosts(locale);

    assert.ok(featuredPost);
    assert.equal(featuredPost.slug, 'ai-photo-critique-daily-practice');
    assert.deepEqual(
      starterPosts.map((post) => post.slug),
      expectedStarterSlugs,
    );

    for (let index = 1; index < freshPosts.length; index += 1) {
      assert.ok(freshPosts[index - 1].updatedAt >= freshPosts[index].updatedAt);
    }
  }
});

test('Chinese and Japanese blog chrome is fully localized', () => {
  const expectedLabels = {
    zh: {
      label: '镜头手记',
      starterPostsLabel: '入门文章',
      primaryTopicsLabel: '核心主题',
      seoDirectionLabel: '内容方向',
      featuredLabel: '精选文章',
      allPostsLabel: '全部文章',
      nextStepLabel: '下一步',
      relatedLabel: '相关文章',
      updatedLabel: '更新于',
    },
    ja: {
      label: 'レンズノート',
      starterPostsLabel: '入門記事',
      primaryTopicsLabel: '主なテーマ',
      seoDirectionLabel: 'コンテンツの方向性',
      featuredLabel: '注目の記事',
      allPostsLabel: 'すべての記事',
      nextStepLabel: '次のステップ',
      relatedLabel: '関連記事',
      updatedLabel: '更新',
    },
  } as const;

  for (const locale of ['zh', 'ja'] as const) {
    const ui = readBundle(locale).ui;
    for (const [key, value] of Object.entries(expectedLabels[locale])) {
      assert.equal(ui[key as keyof typeof expectedLabels.zh], value);
    }
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
  const defaultPostSource = readFileSync(
    path.join(TEST_DIR, '..', 'src', 'app', 'blog', '[slug]', 'page.tsx'),
    'utf8',
  );
  const localizedPageSource = readFileSync(path.join(TEST_DIR, '..', 'src', 'app', '[locale]', 'blog', 'page.tsx'), 'utf8');

  assert.doesNotMatch(blogContentSource, /^'use client';/m);
  assert.match(blogContentSource, /getBlogPostsByFreshness\(pinnedLocale\)/);
  assert.match(blogContentSource, /getFeaturedBlogPost\(pinnedLocale\)/);
  assert.match(blogContentSource, /getStarterBlogPosts\(pinnedLocale\)/);
  assert.match(blogContentSource, /ui\.updatedLabel/);
  assert.match(blogContentSource, /BlogViewCountProvider/);
  assert.doesNotMatch(blogContentSource, /useEffect|useState|getBlogViewCounts/);
  assert.match(viewCountSource, /^'use client';/m);
  assert.match(viewCountSource, /getBlogViewCounts/);
  assert.match(defaultPageSource, /redirect\('\/en\/blog'\)/);
  assert.doesNotMatch(defaultPageSource, /headers\(\)|generateMetadata|BlogIndexPageContent/);
  assert.match(defaultPostSource, /redirect\(`\/en\/blog\/\$\{slug\}`\)/);
  assert.doesNotMatch(defaultPostSource, /headers\(\)|generateMetadata|BlogPostClient/);
  assert.doesNotMatch(defaultPostSource, /generateStaticParams/);
  assert.equal(
    existsSync(path.join(TEST_DIR, '..', 'src', 'app', 'blog', '[slug]', 'opengraph-image.tsx')),
    false,
  );
  assert.match(localizedPageSource, /BlogIndexPageContent/);
});

test('generate page keeps template copy crawlable through a server SEO fallback', () => {
  const pageSource = readFileSync(path.join(TEST_DIR, '..', 'src', 'app', 'generate', 'page.tsx'), 'utf8');
  const clientSource = readFileSync(path.join(TEST_DIR, '..', 'src', 'app', 'generate', 'GeneratePageClient.tsx'), 'utf8');
  const fallbackSource = readFileSync(
    path.join(TEST_DIR, '..', 'src', 'components', 'generation', 'GenerateSeoFallback.tsx'),
    'utf8',
  );

  assert.doesNotMatch(pageSource, /^'use client';/);
  assert.match(pageSource, /<GenerateSeoFallback \/>/);
  assert.match(pageSource, /<GeneratePageClient \/>/);
  assert.match(clientSource, /^'use client';/);
  assert.match(fallbackSource, /data-seo-generate-fallback/);
  assert.match(fallbackSource, /GENERATION_TEMPLATES/);
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
