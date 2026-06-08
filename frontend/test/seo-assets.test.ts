import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATION_PROMPT_EXAMPLES } from '../src/content/generation/prompt-examples.ts';
import { AI_MARKDOWN_CONTENT_PAGES } from '../src/lib/ai-markdown.ts';
import {
  buildImageSitemapEntries,
  buildImageSitemapXml,
  IMAGE_SITEMAP_PATH,
} from '../src/lib/image-sitemap.ts';
import { getLlmsText } from '../src/lib/llms.ts';
import { siteConfig } from '../src/lib/site.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');

test('product OG image is the expected large social preview size', () => {
  const image = readFileSync(path.join(FRONTEND_DIR, 'public', 'og-product.png'));

  assert.equal(image.toString('ascii', 1, 4), 'PNG');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});

test('logo asset remains a square PNG suitable for metadata icons', () => {
  const image = readFileSync(path.join(FRONTEND_DIR, 'public', 'logo.png'));
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);

  assert.equal(image.toString('ascii', 1, 4), 'PNG');
  assert.equal(width, height);
  assert.ok(width >= 64);
});

test('llms.txt stays published as a plain-text discovery asset', () => {
  const llmsText = readFileSync(path.join(FRONTEND_DIR, 'public', 'llms.txt'), 'utf8');
  const generatedLlmsText = getLlmsText();

  assert.match(llmsText, /^# PicSpeak/m);
  assert.match(llmsText, /\/generate\/prompts/);
  assert.match(llmsText, /## Markdown content mirrors/);
  assert.match(llmsText, /Founder and editor:/);
  assert.equal(llmsText, generatedLlmsText);

  for (const page of AI_MARKDOWN_CONTENT_PAGES) {
    assert.match(llmsText, new RegExp(`${siteConfig.url}${page.markdownPath.replaceAll('/', '\\/')}`));
  }
});

test('AI markdown content mirrors are routed as text markdown pages', () => {
  const routeSource = readFileSync(path.join(FRONTEND_DIR, 'src', 'app', 'ai-content', '[slug]', 'route.ts'), 'utf8');
  const markdownSource = readFileSync(path.join(FRONTEND_DIR, 'src', 'lib', 'ai-markdown.ts'), 'utf8');

  assert.match(routeSource, /text\/markdown; charset=utf-8/);
  assert.match(routeSource, /getAiMarkdownContentPage/);
  assert.match(markdownSource, /home\.md/);
  assert.match(markdownSource, /lens-notes\.md/);
  assert.match(markdownSource, /prompt-library\.md/);
});

test('image sitemap covers prompt examples, gallery, and the public demo review image', () => {
  const entries = buildImageSitemapEntries();
  const firstPrompt = GENERATION_PROMPT_EXAMPLES[0];

  assert.equal(IMAGE_SITEMAP_PATH, '/sitemap-images.xml');
  assert.equal(new Set(entries.map((entry) => entry.loc)).size, entries.length);
  assert.ok(entries.length >= GENERATION_PROMPT_EXAMPLES.length + 2);
  assert.ok(
    entries.some(
      (entry) =>
        entry.loc === `${siteConfig.url}/gallery` &&
        entry.images.some((image) => image.loc === `${siteConfig.url}${siteConfig.ogImage}`),
    ),
  );
  assert.ok(
    entries.some(
      (entry) =>
        entry.loc === `${siteConfig.url}/generate/prompts/${firstPrompt.id}` &&
        entry.images.some((image) => image.loc === `${siteConfig.url}${firstPrompt.imagePath}`),
    ),
  );
  assert.ok(entries.some((entry) => entry.loc.startsWith(`${siteConfig.url}/reviews/`)));

  const xml = buildImageSitemapXml(entries);
  assert.match(xml, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.match(xml, /<image:image>/);
  assert.match(xml, /<image:loc>https:\/\/www\.picspeak\.art\/generation-prompt-examples\//);
});

test('robots and app routes expose the image sitemap', () => {
  const robotsSource = readFileSync(path.join(FRONTEND_DIR, 'src', 'app', 'robots.ts'), 'utf8');
  const routeSource = readFileSync(path.join(FRONTEND_DIR, 'src', 'app', 'sitemap-images.xml', 'route.ts'), 'utf8');

  assert.match(robotsSource, /sitemap-images\.xml/);
  assert.match(routeSource, /buildImageSitemapXml/);
  assert.match(routeSource, /application\/xml/);
});

test('Asa Zhou author page is crawlable and wired into SEO discovery paths', () => {
  const authorPageSource = readFileSync(path.join(FRONTEND_DIR, 'src', 'app', 'author', 'asa-zhou', 'page.tsx'), 'utf8');
  const siteSource = readFileSync(path.join(FRONTEND_DIR, 'src', 'lib', 'site.ts'), 'utf8');
  const sitemapSource = readFileSync(path.join(FRONTEND_DIR, 'src', 'app', 'sitemap.ts'), 'utf8');
  const routeShellSource = readFileSync(path.join(FRONTEND_DIR, 'src', 'lib', 'route-shell.ts'), 'utf8');

  assert.match(siteSource, /https:\/\/www\.picspeak\.art\/author\/asa-zhou#person/);
  assert.match(authorPageSource, /'@type': 'Person'/);
  assert.match(authorPageSource, /siteConfig\.author\.id/);
  assert.match(sitemapSource, /\/author\/asa-zhou/);
  assert.match(routeShellSource, /startsWith\('\/author'\)/);
});
