import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHomeAuthorJsonLd,
  buildHomeFaqJsonLd,
  buildHomeOrganizationJsonLd,
  buildHomeSoftwareJsonLd,
} from '../src/lib/home-structured-data.ts';
import { serializeJsonLd } from '../src/lib/json-ld.ts';
import { buildWebSiteJsonLd } from '../src/lib/seo.ts';
import { siteConfig } from '../src/lib/site.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

function readFrontendSource(relativePath: string): string {
  return readFileSync(path.join(TEST_DIR, '..', relativePath), 'utf8');
}

test('homepage entity graph defines and reuses stable organization and website IDs', () => {
  const organization = buildHomeOrganizationJsonLd(siteConfig);
  const software = buildHomeSoftwareJsonLd(siteConfig, {
    pageUrl: `${siteConfig.url}/en`,
    language: 'en',
    description: siteConfig.description,
  });
  const website = buildWebSiteJsonLd({
    site: siteConfig,
    locale: 'en',
    language: 'en',
    description: siteConfig.description,
    searchActionName: 'Search photo critiques',
  });
  const author = buildHomeAuthorJsonLd(siteConfig);

  assert.equal(organization['@type'], 'Organization');
  assert.equal(organization['@id'], siteConfig.organizationId);
  assert.equal(organization.logo.width, siteConfig.logoImageWidth);
  assert.equal(organization.logo.height, siteConfig.logoImageHeight);
  assert.ok(organization.sameAs.includes(siteConfig.social.productHunt));
  assert.equal(software.publisher['@id'], siteConfig.organizationId);
  assert.equal(website['@id'], siteConfig.websiteId);
  assert.equal(website.publisher['@id'], siteConfig.organizationId);
  assert.equal(author.worksFor['@id'], siteConfig.organizationId);
  assert.equal(author.publishingPrinciples, `${siteConfig.url}${siteConfig.editorialPolicyPath}`);
});

test('homepage FAQ schema remains page-owned and includes every supplied question', () => {
  const schema = buildHomeFaqJsonLd(
    [
      { question: 'What is PicSpeak?', answer: 'An AI photo critique tool.' },
      { question: 'Is it free?', answer: 'A free allowance is available.' },
    ],
    `${siteConfig.url}/en`,
  );

  assert.equal(schema['@type'], 'FAQPage');
  assert.equal(schema['@id'], `${siteConfig.url}/en#faq`);
  assert.equal(schema.mainEntity.length, 2);
});

test('root and locale home pages server-render schema while the locale layout stays schema-neutral', () => {
  const structuredDataSource = readFrontendSource('src/components/home/HomeStructuredData.tsx');
  const rootPageSource = readFrontendSource('src/app/page.tsx');
  const localePageSource = readFrontendSource('src/app/[locale]/page.tsx');
  const localeLayoutSource = readFrontendSource('src/app/[locale]/layout.tsx');
  const clientSource = readFrontendSource('src/components/home/HomePageClient.tsx');

  assert.match(structuredDataSource, /<script/);
  assert.match(structuredDataSource, /buildHomeOrganizationJsonLd/);
  assert.match(rootPageSource, /<HomeStructuredData locale="en" \/>/);
  assert.match(localePageSource, /<HomeStructuredData locale=\{pinnedLocale\} \/>/);
  assert.match(localeLayoutSource, /export const dynamicParams = false/);
  assert.doesNotMatch(localeLayoutSource, /application\/ld\+json|buildHomeFaqJsonLd/);
  assert.doesNotMatch(clientSource, /next\/script|application\/ld\+json/);
});

test('JSON-LD serialization escapes script-breaking characters', () => {
  const serialized = serializeJsonLd({
    name: 'PicSpeak </script><script>alert(1)</script>',
    separator: '\u2028\u2029',
  });

  assert.doesNotMatch(serialized, /<\/script/i);
  assert.match(serialized, /\\u003c\/script>/i);
  assert.match(serialized, /\\u2028\\u2029/);
});
