import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type UpdateEntry = {
  id: string;
  date: string;
  title: string;
  summary: string;
  docPath: string;
  sections?: Array<{ title: string; items: string[] }>;
};

type DimDescriptions = Record<
  'zh' | 'en' | 'ja',
  Record<'default' | 'landscape' | 'portrait' | 'street' | 'still_life' | 'architecture', Record<'composition' | 'lighting' | 'color' | 'impact' | 'technical', string>>
>;

const LOCALES = ['zh', 'en', 'ja'] as const;
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(TEST_DIR, '..', relativePath), 'utf8')) as T;
}

test('update content bundles keep the same ids across locales', () => {
  const bundles = Object.fromEntries(
    LOCALES.map((locale) => [locale, readJson<UpdateEntry[]>(`src/content/updates/${locale}.json`)]),
  ) as Record<(typeof LOCALES)[number], UpdateEntry[]>;
  const canonicalIds = bundles.en.map((entry) => entry.id);
  const canonicalDates = bundles.en.map((entry) => entry.date);

  assert.ok(canonicalIds.length > 0);

  for (const locale of LOCALES) {
    assert.deepEqual(
      bundles[locale].map((entry) => entry.id),
      canonicalIds,
    );
    assert.deepEqual(
      bundles[locale].map((entry) => entry.date),
      canonicalDates,
    );

    for (const entry of bundles[locale]) {
      assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(entry.title);
      assert.ok(entry.summary);
      assert.ok(entry.docPath);
      for (const section of entry.sections ?? []) {
        assert.ok(section.title);
        assert.ok(section.items.length > 0);
      }
    }
  }
});

test('update entries point to existing unified changelog anchors in newest-first order', () => {
  const entries = readJson<UpdateEntry[]>('src/content/updates/en.json');
  const changelog = readFileSync(
    path.join(TEST_DIR, '..', '..', 'docs', 'changelog', 'CHANGELOG.md'),
    'utf8',
  );

  for (const [index, entry] of entries.entries()) {
    const [docPath, anchor] = entry.docPath.split('#');

    assert.equal(docPath, 'docs/changelog/CHANGELOG.md');
    assert.ok(anchor);
    assert.ok(changelog.includes(`<a id="${anchor}"></a>`));

    if (index === 0) {
      assert.equal(anchor, entry.id);
    }

    if (index > 0) {
      assert.ok(entries[index - 1].date >= entry.date);
    }
  }
});

test('latest Blog hardening release describes redirects without stale SSG claims', () => {
  const redirectWording = {
    en: /redirect/i,
    zh: /跳转/,
    ja: /リダイレクト/,
  } as const;
  const staleSsgClaim = /statically generated|\bSSG\b|静态生成|静的生成/i;

  for (const locale of LOCALES) {
    const entries = readJson<UpdateEntry[]>(`src/content/updates/${locale}.json`);
    const latestEntry = entries[0];
    const recentCopy = entries
      .slice(0, 2)
      .flatMap((entry) => [
        entry.title,
        entry.summary,
        ...(entry.sections ?? []).flatMap((section) => [section.title, ...section.items]),
      ])
      .join('\n');

    assert.equal(latestEntry.id, '2026-07-31-blog-locale-routing-cache-hardening');
    assert.match(recentCopy, redirectWording[locale]);
    assert.doesNotMatch(recentCopy, staleSsgClaim);
  }
});

test('review dimension descriptions cover every locale, image type, and score dimension', () => {
  const descriptions = readJson<DimDescriptions>('src/content/review/dim-descriptions.json');
  const imageTypes = ['default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'] as const;
  const dimensions = ['composition', 'lighting', 'color', 'impact', 'technical'] as const;

  for (const locale of LOCALES) {
    for (const imageType of imageTypes) {
      for (const dimension of dimensions) {
        assert.ok(descriptions[locale][imageType][dimension]);
      }
    }
  }
});
