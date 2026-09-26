import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

function listTsx(directory: string): string[] {
  const absolute = join(root, directory);
  const files: string[] = [];

  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const entryPath = join(absolute, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsx(`${directory}${entry.name}/`));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(relative(root, entryPath).split(sep).join('/'));
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

function blend(foreground: readonly number[], background: readonly number[], alpha: number): number[] {
  return foreground.map((channelValue, index) => Math.round((channelValue * alpha) + (background[index] * (1 - alpha))));
}

test('light-theme semantic accent text meets normal-text contrast on core surfaces', () => {
  const canvas = [250, 249, 247] as const;
  const surface = [243, 239, 233] as const;
  const accents = {
    gold: [132, 88, 32],
    accent: [116, 77, 27],
    accentMuted: [93, 68, 38],
    sage: [66, 107, 70],
    rust: [139, 70, 57],
  } as const;

  for (const [name, color] of Object.entries(accents)) {
    assert.ok(contrast(color, canvas) >= 4.5, `${name} must pass on the canvas`);
    assert.ok(contrast(color, surface) >= 4.5, `${name} must pass on a surface`);
  }

  const oldSmallGold = [132, 88, 32] as const;
  assert.ok(contrast(blend(oldSmallGold, canvas, 0.7), canvas) < 4.5, 'gold/70 demonstrates why small accent text needs a solid semantic role');
  assert.ok(contrast(accents.accentMuted, canvas) >= 4.5, 'accent muted must pass on the canvas');
  assert.ok(contrast(accents.accentMuted, surface) >= 4.5, 'accent muted must pass on a surface');
});

test('global design tokens and reduced-motion behavior remain defined', () => {
  const css = read('src/app/globals.css');

  for (const token of [
    '--color-action',
    '--color-action-ink',
    '--color-accent',
    '--color-accent-muted',
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

test('small accent labels avoid translucent gold text in owned route surfaces', () => {
  const excluded = [
    'src/components/gallery/',
    'src/features/generations/components/PromptExampleGallery.tsx',
    'src/components/layout/Header.tsx',
    'src/components/layout/MarketingHeader.tsx',
    'src/components/layout/Footer.tsx',
    'src/app/layout.tsx',
    'src/app/reviews/[reviewId]/',
    'src/features/reviews/components/ReviewScorePanel.tsx',
  ];
  const offenders = listTsx('src/')
    .filter((file) => !excluded.some((prefix) => file.startsWith(prefix)))
    .filter((file) => /\btext-gold\/(?:70|72|75|80)\b/.test(read(file)))
    .sort();

  assert.deepEqual(offenders, []);
});

test('theme text roles remain readable on every base panel surface', () => {
  const css = read('src/app/globals.css');
  for (const selector of [':root', '.dark']) {
    const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    const color = (name: string) => {
      const match = block.match(new RegExp(`--color-${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
      assert.ok(match, `${selector} defines ${name}`);
      return match.slice(1).map(Number);
    };
    for (const ink of ['ink', 'ink-muted', 'ink-subtle']) {
      for (const surface of ['void', 'surface', 'raised', 'overlay']) {
        assert.ok(contrast(color(ink), color(surface)) >= 4.5, `${selector} ${ink} on ${surface}`);
      }
    }
  }
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
