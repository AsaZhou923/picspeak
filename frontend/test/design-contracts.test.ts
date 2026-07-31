import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url);

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, root), 'utf8');
}

function listTsx(directory: string): string[] {
  const absolute = new URL(directory, root);
  const files: string[] = [];

  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const entryPath = join(absolute.pathname, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsx(`${directory}${entry.name}/`));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(relative(root.pathname, entryPath));
    }
  }

  return files;
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: readonly number[]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(left: readonly number[], right: readonly number[]): number {
  const bright = Math.max(luminance(left), luminance(right));
  const dark = Math.min(luminance(left), luminance(right));
  return (bright + 0.05) / (dark + 0.05);
}

test('light-theme semantic accent text meets normal-text contrast on core surfaces', () => {
  const canvas = [250, 249, 247] as const;
  const surface = [243, 239, 233] as const;
  const accents = {
    gold: [132, 88, 32],
    sage: [66, 107, 70],
    rust: [139, 70, 57],
  } as const;

  for (const [name, color] of Object.entries(accents)) {
    assert.ok(contrast(color, canvas) >= 4.5, `${name} must pass on the canvas`);
    assert.ok(contrast(color, surface) >= 4.5, `${name} must pass on a surface`);
  }
});

test('global design tokens and reduced-motion behavior remain defined', () => {
  const css = read('src/app/globals.css');

  for (const token of [
    '--color-action',
    '--color-action-ink',
    '--radius-control',
    '--radius-card',
    '--radius-feature',
    '--shadow-level-1',
    '--width-workspace',
  ]) {
    assert.match(css, new RegExp(token));
  }

  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /\.bg-orb-(?:indigo|teal)|\.bg-star/);
});

test('shared chrome participates in normal flow and owns the route main landmark', () => {
  const siteChrome = read('src/components/layout/SiteChrome.tsx');
  const marketingHeader = read('src/components/layout/MarketingHeader.tsx');
  const headers = [
    read('src/components/layout/Header.tsx'),
    marketingHeader,
  ];

  assert.match(siteChrome, /<main id="main-content"/);
  assert.doesNotMatch(siteChrome, /pt-12 md:pt-0/);

  for (const header of headers) {
    assert.match(header, /<header className="sticky top-0/);
    assert.doesNotMatch(header, /<header className="fixed top-0/);
  }

  assert.match(marketingHeader, /href=\{`\/\$\{locale\}\/blog`\}/);
  assert.doesNotMatch(marketingHeader, /href="\/blog"/);
});

test('route content does not introduce a second main landmark', () => {
  const mainOwners = listTsx('src/')
    .filter((file) => /<main\b/.test(read(file)))
    .sort();

  assert.deepEqual(mainOwners, [
    'src/components/layout/SiteChrome.tsx',
    'src/components/providers/AppProviders.tsx',
  ]);
});

test('sticky chrome does not leave legacy fixed-header compensation behind', () => {
  const compensatedRoutes = listTsx('src/')
    .filter((file) => /\bpt-14\b/.test(read(file)))
    .sort();

  assert.deepEqual(compensatedRoutes, []);
});

test('portal action slots and gallery hero conversion remain accessible and attributable', () => {
  const home = read('src/components/home/HomePageClient.tsx');
  const galleryHero = read('src/components/gallery/GallerySeoHero.tsx');

  for (const slotId of ['home-signin-slot', 'home-signup-slot', 'home-checkout-slot']) {
    const slotPattern = new RegExp(`id="${slotId}"[^>]*aria-hidden`);
    assert.doesNotMatch(home, slotPattern);
  }

  assert.match(galleryHero, /buildWorkspaceConversionHref\(\{ source: 'gallery', entrypoint: 'gallery_practice' \}\)/);
  assert.match(galleryHero, /markProductAttributionSource\('gallery'\)/);
  assert.match(galleryHero, /trackProductEvent\('content_workspace_clicked'/);
});
