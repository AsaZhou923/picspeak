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
  assert.match(source, /headers\(\)/);
  assert.match(source, /x-picspeak-locale/);
  assert.match(source, /POLICY_COPY: Record<Locale, PolicyCopy>/);
  assert.match(source, /编辑与纠错政策/);
  assert.match(source, /編集・訂正ポリシー/);
  assert.match(source, /name: title/);
  assert.match(source, /description,/);

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
  const englishAuthorCopy = source
    .split('en: {')[1]
    ?.split('zh: {')[0] ?? '';
  const words = englishAuthorCopy.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) ?? [];

  assert.ok(words.length >= 300, `expected 300+ English copy words, got ${words.length}`);
  assert.match(source, /headers\(\)/);
  assert.match(source, /x-picspeak-locale/);
  assert.match(source, /const blogHref = `\/\$\{locale\}\/blog`/);
  assert.match(source, /AUTHOR_COPY: Record<Locale, AuthorCopy>/);
  assert.match(source, /AI 摄影点评系统/);
  assert.match(source, /AI 写真批評システム/);
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
  for (const locale of ['en', 'zh', 'ja']) {
    assert.match(llmsText, new RegExp(`https://www\\.picspeak\\.art/${locale}/blog`));
    assert.match(llmsText, new RegExp(`https://www\\.picspeak\\.art/${locale}/updates`));
  }

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
