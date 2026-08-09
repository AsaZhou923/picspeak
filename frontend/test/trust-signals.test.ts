import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_MARKDOWN_CONTENT_PAGES, buildAiMarkdownContent } from '../src/lib/ai-markdown.ts';
import { getLlmsText } from '../src/lib/llms.ts';
import { siteConfig } from '../src/lib/site.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');

function readFrontendFile(relativePath: string) {
  return readFileSync(path.join(FRONTEND_DIR, relativePath), 'utf8');
}

test('editorial policy page is crawlable and covers required trust topics', () => {
  const source = readFrontendFile('src/app/editorial-policy/page.tsx');

  assert.match(source, /INDEXABLE_ROBOTS/);
  assert.match(source, /singlePageAlternates\(POLICY_PATH\)/);
  assert.match(source, /'@type': 'WebPage'/);
  assert.match(source, /dateModified: '2026-08-09'/);

  for (const topic of [
    'Editorial Review',
    'Corrections',
    'Dates and Review Cadence',
    'AI-Assistance Disclosure',
    'Source and Provenance',
    'Sponsorship and Conflicts',
    'Contact',
  ]) {
    assert.match(source, new RegExp(topic));
  }
});

test('author profile keeps verified identity links and adds policy-backed publishing principles', () => {
  const source = readFrontendFile('src/app/author/asa-zhou/page.tsx');
  const visibleAuthorCopy = source
    .split('<section className="mt-10 space-y-5 text-sm leading-8 text-ink-muted">')[1]
    ?.split('</section>')[0] ?? '';
  const words = visibleAuthorCopy.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) ?? [];

  assert.ok(words.length >= 300, `expected 300+ visible words, got ${words.length}`);
  assert.match(source, /sameAs: \[siteConfig\.social\.x, siteConfig\.social\.githubProfile\]/);
  assert.match(source, /publishingPrinciples: POLICY_URL/);
  assert.match(source, /'@id': siteConfig\.organizationId/);
  assert.match(source, /href=\{POLICY_PATH\}/);
});

test('footer renders external listings once and links the editorial policy', () => {
  const source = readFrontendFile('src/components/layout/Footer.tsx');

  assert.doesNotMatch(source, /animate-marquee/);
  assert.equal((source.match(/PRODUCT_HUNT_BADGE_HREF/g) ?? []).length, 2);
  assert.equal((source.match(/https:\/\/indieai\.directory\//g) ?? []).length, 1);
  assert.equal((source.match(/https:\/\/saastoolsdir\.com/g) ?? []).length, 1);
  assert.equal((source.match(/https:\/\/saashubdirectory\.com/g) ?? []).length, 1);
  assert.equal((source.match(/https:\/\/productlistdir\.com/g) ?? []).length, 1);
  assert.match(source, /footer_editorial_policy/);
  assert.match(source, /href="\/editorial-policy"/);
});

test('AI markdown and llms.txt publish trust metadata consistently', () => {
  const llmsText = readFrontendFile('public/llms.txt');
  const generatedLlmsText = getLlmsText();
  const policyMirror = AI_MARKDOWN_CONTENT_PAGES.find((page) => page.slug === 'editorial-policy');

  assert.ok(policyMirror);
  assert.equal(llmsText, generatedLlmsText);
  assert.match(llmsText, /Editorial and corrections policy: https:\/\/www\.picspeak\.art\/editorial-policy/);
  assert.match(llmsText, /Author profile: https:\/\/www\.picspeak\.art\/author\/asa-zhou/);
  assert.match(llmsText, /Last reviewed: 2026-08-09/);
  assert.match(llmsText, /do not infer extra license rights/);

  const markdown = buildAiMarkdownContent(policyMirror);
  assert.match(markdown, new RegExp(`Author: ${siteConfig.author.name}`));
  assert.match(markdown, /Source page: https:\/\/www\.picspeak\.art\/editorial-policy/);
  assert.match(markdown, /Last reviewed: 2026-08-09/);
  assert.match(markdown, /Editorial policy: https:\/\/www\.picspeak\.art\/editorial-policy/);
  assert.match(markdown, /Citation boundary:/);
});

test('prompt detail page explains source, author, adaptation, and image provenance', () => {
  const source = readFrontendFile('src/app/generate/prompts/[id]/PromptExampleContent.tsx');

  assert.match(source, /sourceNote/);
  assert.match(source, /example\.author/);
  assert.match(source, /Original source/);
  assert.match(source, /curates and adapts/);
  assert.match(source, /does not claim extra license rights/);
  assert.match(source, /Image provenance/);
  assert.match(source, /PicSpeak-hosted example output/);
});
