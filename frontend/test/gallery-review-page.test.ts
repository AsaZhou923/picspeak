import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildGalleryReviewDescription,
  buildGalleryReviewHeading,
  buildGalleryReviewJsonLd,
  buildGalleryReviewTitle,
  buildGalleryReviewWorkspaceHref,
  buildGallerySitemapXml,
  buildGalleryTypeFilterHref,
  galleryReviewPath,
  isIndexableGalleryReview,
  isValidGalleryReviewId,
  resolveGalleryReviewContentLocale,
  type PublicGalleryReview,
} from '../src/lib/gallery-review-page.ts';
import { siteConfig } from '../src/lib/site.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');

function source(...segments: string[]): string {
  return readFileSync(path.join(FRONTEND_DIR, ...segments), 'utf8');
}

function review(overrides: Partial<PublicGalleryReview> = {}): PublicGalleryReview {
  return {
    review_id: 'rev_8424d4fbde054759',
    photo_id: 'pho_1',
    photo_url: null,
    photo_thumbnail_url: 'https://api.example.test/api/v1/photos/gallery/rev_8424d4fbde054759/thumbnail',
    mode: 'flash',
    image_type: 'street',
    final_score: 7.4,
    score_version: 'score-v8-style-relative',
    scores: { composition: 8, lighting: 7, color: 7, impact: 8, technical: 7 },
    advantage: 'The diagonal crosswalk leads straight to the cyclist, and the low angle gives the frame energy.',
    critique: 'The bright sign on the right edge pulls attention away from the subject.',
    suggestions: 'Step one pace left and crop the sign out, or wait for it to switch off.',
    summary: 'Diagonal crosswalk leads to the cyclist.',
    review_locale: 'en',
    owner_username: 'lens_owner',
    owner_avatar_url: null,
    owner_profile_url: '/u/lens-owner',
    like_count: 2,
    gallery_added_at: '2026-11-01T09:30:00Z',
    created_at: '2026-11-01T09:00:00Z',
    updated_at: '2026-11-05T12:00:00Z',
    ...overrides,
  };
}

test('gallery review ids and paths stay constrained to public review ids', () => {
  assert.equal(isValidGalleryReviewId('rev_8424d4fbde054759'), true);
  assert.equal(isValidGalleryReviewId('../admin'), false);
  assert.equal(isValidGalleryReviewId('rev_'), false);
  assert.equal(galleryReviewPath('rev_8424d4fbde054759'), '/gallery/rev_8424d4fbde054759');
});

test('content locale follows the critique language, falling back to script detection', () => {
  assert.equal(resolveGalleryReviewContentLocale(review()), 'en');
  assert.equal(resolveGalleryReviewContentLocale(review({ review_locale: null, critique: '右側の看板が目立ちます。' })), 'ja');
  assert.equal(resolveGalleryReviewContentLocale(review({ review_locale: null, advantage: '', critique: '右侧招牌太亮。', suggestions: '' })), 'zh');
  assert.equal(resolveGalleryReviewContentLocale(review({ review_locale: 'fr' })), 'en');
});

test('titles and headings are topic-only, localized to the critique, and unique per work', () => {
  assert.equal(buildGalleryReviewHeading(review()), 'Street photo critique: 7.4/10');
  assert.equal(buildGalleryReviewHeading(review({ image_type: 'default' })), 'AI photo critique: 7.4/10');
  assert.equal(
    buildGalleryReviewHeading(review({ review_locale: 'zh', image_type: 'portrait', final_score: 8 })),
    '人像摄影点评：8.0/10',
  );
  const title = buildGalleryReviewTitle(review());
  assert.match(title, /^Street photo critique: 7\.4\/10 — Diagonal crosswalk/);
  assert.doesNotMatch(title, /PicSpeak/);
  assert.notEqual(title, buildGalleryReviewTitle(review({ summary: 'Night tram reflections.' })));
  assert.ok(buildGalleryReviewDescription(review()).length <= 160);
});

test('thin critiques render but are not offered for indexing', () => {
  assert.equal(isIndexableGalleryReview(review()), true);
  assert.equal(isIndexableGalleryReview(review({ advantage: 'Nice.', critique: '', suggestions: '' })), false);
});

test('gallery detail CTAs carry gallery attribution and the critique image type', () => {
  const href = new URL(buildGalleryReviewWorkspaceHref(review()), 'https://example.test');
  assert.equal(href.pathname, '/workspace');
  assert.equal(href.searchParams.get('source'), 'gallery');
  assert.equal(href.searchParams.get('entrypoint'), 'gallery_detail');
  assert.equal(href.searchParams.get('image_type'), 'street');
  assert.equal(href.searchParams.get('gallery_review_id'), 'rev_8424d4fbde054759');
  assert.equal(buildGalleryTypeFilterHref('portrait'), '/gallery?image_type=portrait');
  assert.equal(buildGalleryTypeFilterHref('unknown'), '/gallery');
});

test('structured data reuses site entities and never claims a review rating', () => {
  const jsonLd = buildGalleryReviewJsonLd({ site: siteConfig, review: review() });
  assert.equal(jsonLd['@type'], 'WebPage');
  assert.equal(jsonLd.url, `${siteConfig.url}/gallery/rev_8424d4fbde054759`);
  assert.equal(jsonLd.isPartOf['@id'], siteConfig.websiteId);
  assert.equal(jsonLd.publisher['@id'], siteConfig.organizationId);
  assert.equal(jsonLd.inLanguage, 'en');
  const serialized = JSON.stringify(jsonLd);
  assert.doesNotMatch(serialized, /Rating|"Review"/);
  assert.match(serialized, /lens-owner/);
});

test('gallery sitemap lists only valid review ids with escaped absolute URLs', () => {
  const xml = buildGallerySitemapXml('https://www.picspeak.art', [
    { review_id: 'rev_8424d4fbde054759', image_type: 'street', last_modified: '2026-11-05T12:00:00Z' },
    { review_id: 'bad<id>', image_type: 'street', last_modified: '2026-11-05T12:00:00Z' },
    { review_id: 'rev_another_review', image_type: 'default', last_modified: 'not-a-date' },
  ]);
  assert.match(xml, /<loc>https:\/\/www\.picspeak\.art\/gallery\/rev_8424d4fbde054759<\/loc><lastmod>2026-11-05T12:00:00\.000Z<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/www\.picspeak\.art\/gallery\/rev_another_review<\/loc><changefreq>/);
  assert.doesNotMatch(xml, /bad/);
});

test('gallery detail page is indexable only through the approved Gallery channel', () => {
  const page = source('src', 'app', 'gallery', '[reviewId]', 'page.tsx');
  const server = source('src', 'lib', 'gallery-review-server.ts');
  const shareLayout = source('src', 'app', 'share', '[shareToken]', 'layout.tsx');
  const reviewLayout = source('src', 'app', 'reviews', '[reviewId]', 'layout.tsx');

  assert.match(page, /isIndexableGalleryReview\(review\) \? INDEXABLE_ROBOTS : NO_INDEX_ROBOTS/);
  assert.match(page, /singlePageAlternates\(path\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(server, /\/gallery\/\$\{encodeURIComponent\(reviewId\)\}/);
  assert.match(server, /photo_url: null/, 'short-lived signed photo URLs must not be cached in HTML');
  assert.match(server, /response\.status === 404/);
  assert.match(shareLayout, /NO_INDEX_ROBOTS/);
  assert.match(reviewLayout, /isDemoReview \? INDEXABLE_ROBOTS : NO_INDEX_ROBOTS/);
});

test('gallery detail pages are discoverable through cards, robots and cache rules', () => {
  const card = source('src', 'components', 'gallery', 'GalleryCard.tsx');
  const clientPage = source('src', 'app', 'gallery', 'GalleryClientPage.tsx');
  const robots = source('src', 'app', 'robots.ts');
  const nextConfig = source('next.config.mjs');
  const localizedSources = nextConfig.match(/const localizedPublicPageSources = \[([\s\S]*?)\];/)?.[1] ?? '';

  assert.match(card, /const reviewHref = `\/gallery\/\$\{item\.review_id\}/);
  assert.match(clientPage, /`\/gallery\/\$\{reviewId\}\?back=/);
  assert.match(robots, /GALLERY_SITEMAP_PATH/);
  assert.match(localizedSources, /'\/gallery\/:reviewId\(rev_\[A-Za-z0-9_-\]\+\)'/);
});

test('gallery submission copy discloses search indexing in every locale', () => {
  assert.match(source('src', 'lib', 'i18n-en.ts'), /review_gallery_body: '.*search engines may index/);
  assert.match(source('src', 'lib', 'i18n-zh.ts'), /review_gallery_body: '.*搜索引擎也可能收录/);
  assert.match(source('src', 'lib', 'i18n-ja.ts'), /review_gallery_body: '.*検索エンジンにインデックス/);
  const legal = source('src', 'components', 'marketing', 'LegalPageContent.tsx');
  assert.match(legal, /Share-link pages are not submitted for indexing/);
  assert.match(legal, /分享链接页面不会提交给搜索引擎/);
  assert.match(legal, /共有リンクのページは検索エンジンに送信されません/);
});
