import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBlogPosts } from '../src/lib/blog-data.ts';
import { buildDemoReviewJsonLd } from '../src/lib/demo-review.ts';
import { buildGalleryCollectionJsonLd } from '../src/lib/gallery-schema.ts';
import { AI_MARKDOWN_CONTENT_PAGES, buildAiMarkdownContent } from '../src/lib/ai-markdown.ts';
import { siteConfig } from '../src/lib/site.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');

function source(...segments: string[]): string {
  return readFileSync(path.join(FRONTEND_DIR, ...segments), 'utf8');
}

test('English Lens Notes metadata stays concise without shortening visible article headings', () => {
  const posts = getBlogPosts('en');
  const metadataTitles = posts.map((post) => `${post.seoTitle ?? post.title} | Lens Notes`);

  assert.equal(new Set(metadataTitles).size, posts.length);
  for (const post of posts) {
    const title = `${post.seoTitle ?? post.title} | Lens Notes`;
    const description = post.seoDescription ?? post.description;
    assert.ok(title.length <= 65, `${post.slug} metadata title is too long: ${title.length}`);
    assert.ok(description.length <= 180, `${post.slug} metadata description is too long: ${description.length}`);
    assert.ok(post.title.length >= (post.seoTitle ?? post.title).length);
  }
});

test('Retake Coach is indexable without cookie-unsafe shared cache coverage', () => {
  const layout = source('src', 'app', 'retake', 'layout.tsx');
  const sitemap = source('src', 'app', 'sitemap.ts');
  const nextConfig = source('next.config.mjs');
  const cacheSources = nextConfig.match(/const cacheablePublicPageSources = \[([\s\S]*?)\];/)?.[1] ?? '';

  assert.match(layout, /INDEXABLE_ROBOTS/);
  assert.match(layout, /singlePageAlternates\(RETAKE_PATH\)/);
  assert.match(layout, /SoftwareApplication/);
  assert.match(layout, /BreadcrumbList|buildPublicBreadcrumbJsonLd/);
  assert.match(sitemap, /siteConfig\.url\}\/retake/);
  assert.doesNotMatch(cacheSources, /['"]\/retake['"]/);
});

test('legacy demo review URLs consolidate into one canonical indexable example', () => {
  const nextConfig = source('next.config.mjs');
  const cacheSources = nextConfig.match(/const cacheablePublicPageSources = \[([\s\S]*?)\];/)?.[1] ?? '';

  assert.match(cacheSources, /\/reviews\/rev_8424d4fbde054759/);
  assert.doesNotMatch(cacheSources, /\/reviews\/rev_35e0951d0df94a1e/);
  assert.match(
    nextConfig,
    /source: '\/reviews\/rev_35e0951d0df94a1e',[\s\S]*destination: '\/reviews\/rev_8424d4fbde054759',[\s\S]*permanent: true/,
  );
});

test('AI discovery mirrors remain crawlable but cannot compete with canonical HTML pages', () => {
  const markdownRoute = source('src', 'app', 'ai-content', '[slug]', 'route.ts');
  const llmsRoute = source('src', 'app', 'llms.txt', 'route.ts');
  const wellKnownRoute = source('src', 'app', '.well-known', 'llms.txt', 'route.ts');

  assert.match(markdownRoute, /'X-Robots-Tag': 'noindex, follow'/);
  assert.match(markdownRoute, /rel=\"canonical\"/);
  assert.match(llmsRoute, /'X-Robots-Tag': 'noindex, follow'/);
  assert.match(wellKnownRoute, /'X-Robots-Tag': 'noindex, follow'/);

  const homeMirror = AI_MARKDOWN_CONTENT_PAGES.find((page) => page.slug === 'home');
  assert.equal(homeMirror?.sourcePath, '/en');
  assert.match(buildAiMarkdownContent(homeMirror!), /Source page: https:\/\/www\.picspeak\.art\/en/);
});

test('public schemas reuse the canonical website and organization entity IDs', () => {
  const gallery = buildGalleryCollectionJsonLd({ site: siteConfig });
  const demo = buildDemoReviewJsonLd({
    site: siteConfig,
    title: 'AI Photo Critique Example',
    description: 'Public critique example',
    locale: 'en',
    imageAlt: 'Public demo photo',
    advantage: 'Clear subject',
    critique: 'Background distraction',
    suggestions: 'Simplify the frame',
  });

  assert.equal(gallery.isPartOf['@id'], siteConfig.websiteId);
  assert.equal(gallery.publisher['@id'], siteConfig.organizationId);
  assert.equal(demo.author['@id'], siteConfig.organizationId);
  assert.equal(demo.publisher['@id'], siteConfig.organizationId);
  assert.equal(demo.itemReviewed.isPartOf['@id'], siteConfig.websiteId);

  const blogIndex = source('src', 'app', '[locale]', 'blog', 'BlogIndexPageContent.tsx');
  const generateLayout = source('src', 'app', 'generate', 'layout.tsx');
  assert.match(blogIndex, /siteConfig\.organizationId/);
  assert.match(blogIndex, /siteConfig\.websiteId/);
  assert.match(blogIndex, /buildPublicBreadcrumbJsonLd/);
  assert.match(generateLayout, /'@id': siteConfig\.organizationId/);
  assert.doesNotMatch(generateLayout, /Pro monthly image credits/);
});

test('global navigation links to locale canonicals and exposes Updates sitewide', () => {
  const header = source('src', 'components', 'layout', 'Header.tsx');
  const marketingHeader = source('src', 'components', 'layout', 'MarketingHeader.tsx');
  const footer = source('src', 'components', 'layout', 'Footer.tsx');

  assert.match(header, /const homeHref = `\/\$\{locale\}`/);
  assert.match(marketingHeader, /const homeHref = `\/\$\{locale\}`/);
  assert.match(footer, /href=\{`\/\$\{locale\}\/updates`\}/);
  assert.match(footer, /updates_label/);
});

test('indexable interactive pages expose exactly one server-visible primary heading contract', () => {
  const generateFallback = source('src', 'components', 'generation', 'GenerateSeoFallback.tsx');
  const generateClient = source('src', 'features', 'generations', 'components', 'GeneratePageHeader.tsx');
  const reviewLayout = source('src', 'app', 'reviews', '[reviewId]', 'layout.tsx');
  const reviewPage = source('src', 'app', 'reviews', '[reviewId]', 'page.tsx');

  assert.doesNotMatch(generateFallback, /<h1/);
  assert.match(generateClient, /<h1/);
  assert.match(reviewLayout, /AI Photo Critique Example: Scores, Evidence, and Retake Guidance/);
  assert.match(reviewPage, /const ReviewResultHeading = isDemoReview \? 'h2' : 'h1'/);
});
