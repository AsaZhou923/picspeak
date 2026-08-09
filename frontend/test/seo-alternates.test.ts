import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAffiliateMetadata,
  buildBlogBreadcrumbJsonLd,
  buildPublicBreadcrumbJsonLd,
  buildPublicWebPageJsonLd,
  buildUpdatesCollectionJsonLd,
  buildWebSiteJsonLd,
  buildDefaultUpdatesMetadata,
  HOME_LANGUAGE_ALTERNATES,
  INDEXABLE_ROBOTS,
  singlePageAlternates,
  UPDATES_LANGUAGE_ALTERNATES,
} from '../src/lib/seo.ts';
import { buildGalleryCollectionJsonLd } from '../src/lib/gallery-schema.ts';
import { siteConfig } from '../src/lib/site.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SITE = {
  name: 'PicSpeak',
  url: 'https://www.picspeak.art',
  ogImage: '/og-product.png',
  ogImageWidth: 1200,
  ogImageHeight: 630,
};

test('home language alternates point only to equivalent locale home pages', () => {
  assert.deepEqual(HOME_LANGUAGE_ALTERNATES, {
    'zh-CN': '/zh',
    en: '/en',
    ja: '/ja',
    'x-default': '/en',
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

test('blog post JSON-LD breadcrumbs link the locale home, blog index, and article', () => {
  const schema = buildBlogBreadcrumbJsonLd({
    siteName: SITE.name,
    siteUrl: SITE.url,
    locale: 'en',
    blogName: 'Lens Notes',
    postTitle: 'Five photo composition checks',
    slug: 'five-photo-composition-checks',
  });

  assert.equal(schema['@type'], 'BreadcrumbList');
  assert.deepEqual(
    schema.itemListElement.map((item) => item.item),
    [
      'https://www.picspeak.art/en',
      'https://www.picspeak.art/en/blog',
      'https://www.picspeak.art/en/blog/five-photo-composition-checks',
    ],
  );
  assert.deepEqual(
    schema.itemListElement.map((item) => item.position),
    [1, 2, 3],
  );
});

test('default updates metadata has canonical URL, hreflang alternates, and social previews', () => {
  const metadata = buildDefaultUpdatesMetadata(SITE);

  assert.equal(metadata.title, 'PicSpeak Updates | 产品更新 | 更新履歴');
  assert.equal(metadata.alternates?.canonical, '/updates');
  assert.deepEqual(metadata.alternates?.languages, UPDATES_LANGUAGE_ALTERNATES);
  assert.equal(metadata.openGraph?.url, 'https://www.picspeak.art/updates');
  assert.equal(metadata.openGraph?.siteName, SITE.name);
  assert.deepEqual(metadata.twitter?.images, [SITE.ogImage]);
});

test('affiliate metadata owns robots and social preview fields', () => {
  const metadata = buildAffiliateMetadata(SITE);

  assert.equal(metadata.alternates?.canonical, '/affiliate');
  assert.deepEqual(metadata.robots, INDEXABLE_ROBOTS);
  assert.equal(metadata.openGraph?.url, 'https://www.picspeak.art/affiliate');
  assert.equal(metadata.openGraph?.siteName, SITE.name);
  assert.deepEqual(metadata.twitter?.images, [SITE.ogImage]);
});

test('gallery collection schema exposes featured parts for AI citation', () => {
  const schema = buildGalleryCollectionJsonLd({ site: siteConfig });

  assert.equal(schema['@type'], 'CollectionPage');
  assert.ok(Array.isArray(schema.hasPart));
  assert.ok(schema.hasPart.length >= 3);
  assert.ok(
    schema.hasPart.every((part) => part['@type'] === 'CreativeWork' && part.url.startsWith(`${siteConfig.url}/`)),
  );
});

test('default updates page owns generateMetadata instead of relying on layout metadata', () => {
  const pageSource = readFileSync(path.join(TEST_DIR, '..', 'src', 'app', 'updates', 'page.tsx'), 'utf8');
  const layoutSource = readFileSync(path.join(TEST_DIR, '..', 'src', 'app', 'updates', 'layout.tsx'), 'utf8');

  assert.match(pageSource, /export function generateMetadata\(\)/);
  assert.doesNotMatch(layoutSource, /export const metadata/);
});

test('website JSON-LD exposes search and updates subscription actions', () => {
  const schema = buildWebSiteJsonLd({
    site: SITE,
    locale: 'en',
    language: 'en',
    description: 'AI photo critique and visual-reference generation.',
    searchActionName: 'Search photo critiques',
  });

  assert.equal(schema['@type'], 'WebSite');
  assert.equal(schema['@id'], 'https://www.picspeak.art/#website');
  assert.equal(schema.publisher['@id'], 'https://www.picspeak.art/#organization');
  assert.deepEqual(
    schema.potentialAction.map((action) => action['@type']),
    ['SearchAction', 'SubscribeAction'],
  );
  const searchAction = schema.potentialAction[0];
  const subscribeAction = schema.potentialAction[1] as {
    object: { name: string };
    target: { urlTemplate: string };
  } | undefined;

  assert.ok(searchAction);
  assert.ok(subscribeAction);
  assert.equal(searchAction.target.urlTemplate, 'https://www.picspeak.art/gallery?q={search_term_string}');
  assert.equal(subscribeAction.object.name, 'PicSpeak Updates');
  assert.equal(subscribeAction.target.urlTemplate, 'https://www.picspeak.art/updates');
});

test('public page helpers connect page identity, organization, and breadcrumbs', () => {
  const page = buildPublicWebPageJsonLd({
    site: SITE,
    path: '/privacy',
    name: 'Privacy Notice',
    description: 'How PicSpeak handles public and account data.',
  });
  const breadcrumb = buildPublicBreadcrumbJsonLd({
    site: SITE,
    items: [
      { name: 'PicSpeak', path: '/en' },
      { name: 'Privacy Notice', path: '/privacy' },
    ],
  });

  assert.equal(page['@id'], 'https://www.picspeak.art/privacy#webpage');
  assert.equal(page.isPartOf['@id'], 'https://www.picspeak.art/#website');
  assert.equal(page.publisher['@id'], 'https://www.picspeak.art/#organization');
  assert.deepEqual(
    breadcrumb.itemListElement.map((item) => item.item),
    ['https://www.picspeak.art/en', 'https://www.picspeak.art/privacy'],
  );
});

test('updates collection schema exposes dated, ordered release entries', () => {
  const schema = buildUpdatesCollectionJsonLd({
    site: SITE,
    path: '/updates',
    name: 'PicSpeak Updates',
    description: 'Product updates.',
    language: 'en',
    updates: [
      { id: 'release-a', date: '2026-08-09', title: 'Release A', summary: 'Fresh release.' },
      { id: 'release-b', date: '2026-08-01', title: 'Release B', summary: 'Earlier release.' },
    ],
  });

  assert.equal(schema['@type'], 'CollectionPage');
  assert.equal(schema.dateModified, '2026-08-09');
  assert.equal(schema.mainEntity.numberOfItems, 2);
  assert.deepEqual(
    schema.mainEntity.itemListElement.map((item) => item.position),
    [1, 2],
  );
});
