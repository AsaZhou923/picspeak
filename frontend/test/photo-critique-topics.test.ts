import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PHOTO_CRITIQUE_TOPICS,
  getPhotoCritiqueTopicCopy,
  getPhotoCritiqueTopicHrefForImageType,
  getPhotoCritiqueTopicPath,
  type PhotoCritiqueTopicCopy,
} from '../src/content/topics/photo-critique-topics.ts';
import { PUBLIC_BLOG_SLUGS } from '../src/lib/app-route-roots.ts';
import { getBlogPost } from '../src/lib/blog-data.ts';
import { AI_MARKDOWN_CONTENT_PAGES } from '../src/lib/ai-markdown.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');
const LOCALES = ['en', 'zh', 'ja'] as const;
const SUPPORTED_IMAGE_TYPES = ['portrait', 'street', 'landscape', 'still_life', 'architecture'];

function source(...segments: string[]): string {
  return readFileSync(path.join(FRONTEND_DIR, ...segments), 'utf8');
}

function assertFilled(copy: PhotoCritiqueTopicCopy, label: string) {
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value === 'string') assert.ok(value.trim().length > 0, `${label}.${key} is empty`);
  }
  assert.equal(Object.keys(copy.dimensions).length, 5, `${label} must describe all five dimensions`);
  assert.ok(copy.issues.length >= 3, `${label} needs pre-upload checks`);
  assert.ok(copy.workflow.length >= 3, `${label} needs workflow steps`);
  assert.ok(copy.limits.length >= 3, `${label} must state limits`);
  assert.ok(copy.faq.length >= 3, `${label} needs FAQ entries`);
}

test('every topic maps to a real workspace image type and is complete in three locales', () => {
  assert.deepEqual(PHOTO_CRITIQUE_TOPICS.map((topic) => topic.slug), ['portrait', 'street', 'landscape']);
  for (const topic of PHOTO_CRITIQUE_TOPICS) {
    assert.ok(SUPPORTED_IMAGE_TYPES.includes(topic.imageType), `${topic.slug} has no matching image type`);
    for (const locale of LOCALES) {
      assertFilled(topic.copy[locale], `${topic.slug}.${locale}`);
    }
    assert.match(topic.lastReviewed, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('topic metadata stays concise, topic-only, and unique', () => {
  const titles = new Set<string>();
  for (const topic of PHOTO_CRITIQUE_TOPICS) {
    const { metaTitle, metaDescription } = topic.copy.en;
    assert.ok(metaTitle.length <= 60, `${topic.slug} title too long: ${metaTitle.length}`);
    assert.ok(metaDescription.length <= 170, `${topic.slug} description too long: ${metaDescription.length}`);
    assert.doesNotMatch(metaTitle, /PicSpeak/, 'the root title template appends the brand');
    titles.add(metaTitle);
  }
  assert.equal(titles.size, PHOTO_CRITIQUE_TOPICS.length);
});

test('topic copy never promises culling or batch ranking the product lacks', () => {
  for (const topic of PHOTO_CRITIQUE_TOPICS) {
    for (const locale of LOCALES) {
      const copy = topic.copy[locale];
      const promotional = [copy.metaTitle, copy.metaDescription, copy.title, copy.intro, copy.ctaBody].join(' ');
      assert.doesNotMatch(promotional, /cull|best shot|选片|セレクト/i, `${topic.slug}.${locale}`);
    }
    assert.match(topic.copy.en.limits.join(' '), /does not rank or cull/);
  }
});

test('related Lens Notes exist in every locale', () => {
  for (const topic of PHOTO_CRITIQUE_TOPICS) {
    for (const slug of topic.relatedBlogSlugs) {
      assert.ok(PUBLIC_BLOG_SLUGS.has(slug), `${topic.slug} links unknown post ${slug}`);
      for (const locale of LOCALES) {
        assert.ok(getBlogPost(locale, slug), `${slug} missing in ${locale}`);
      }
    }
  }
});

test('topic helpers resolve paths and locale fallbacks', () => {
  assert.equal(getPhotoCritiqueTopicPath('street'), '/photo-critique/street');
  assert.equal(getPhotoCritiqueTopicHrefForImageType('portrait'), '/photo-critique/portrait');
  assert.equal(getPhotoCritiqueTopicHrefForImageType('still_life'), null);
  assert.equal(getPhotoCritiqueTopicCopy(PHOTO_CRITIQUE_TOPICS[0], 'fr').title, PHOTO_CRITIQUE_TOPICS[0].copy.en.title);
});

test('topic pages are indexable, cached by locale, listed, mirrored and linked', () => {
  const page = source('src', 'app', 'photo-critique', '[topic]', 'page.tsx');
  const view = source('src', 'components', 'topics', 'PhotoCritiqueTopicView.tsx');
  const sitemap = source('src', 'app', 'sitemap.ts');
  const nextConfig = source('next.config.mjs');
  const footer = source('src', 'components', 'layout', 'Footer.tsx');
  const analytics = source('src', 'lib', 'product-analytics.ts');
  const localizedSources = nextConfig.match(/const localizedPublicPageSources = \[([\s\S]*?)\];/)?.[1] ?? '';

  assert.match(page, /robots: INDEXABLE_ROBOTS/);
  assert.match(page, /singlePageAlternates\(path\)/);
  assert.match(page, /export const dynamicParams = false/);
  assert.match(page, /BreadcrumbList|buildPublicBreadcrumbJsonLd/);
  assert.equal((view.match(/<h1/g) ?? []).length, 1);
  assert.match(view, /source: 'topic_landing'/);
  assert.match(view, /entrypoint: 'topic_landing'/);
  assert.match(sitemap, /PHOTO_CRITIQUE_TOPICS\.map/);
  assert.match(localizedSources, /'\/photo-critique\/:topic\(portrait\|street\|landscape\)'/);
  assert.match(footer, /getPhotoCritiqueTopicPath/);
  assert.match(analytics, /\\\/photo-critique\\\/\[\^\/\]\+\$\/\.test\(pathname\)\) \{\n\s+return 'topic_page_viewed'/);
  assert.match(analytics, /return 'topic_landing';/);

  for (const topic of PHOTO_CRITIQUE_TOPICS) {
    const mirror = AI_MARKDOWN_CONTENT_PAGES.find((entry) => entry.sourcePath === getPhotoCritiqueTopicPath(topic.slug));
    assert.ok(mirror, `${topic.slug} needs an AI markdown mirror`);
    assert.match(nextConfig, new RegExp(`/ai-content/photo-critique-${topic.slug}\\.md`));
  }
});
