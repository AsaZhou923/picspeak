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
  const canvas = [244, 239, 230] as const;
  const surface = [252, 250, 245] as const;
  const accents = {
    gold: [184, 60, 11],
    accent: [168, 54, 10],
    accentMuted: [140, 52, 18],
    sage: [47, 110, 70],
    rust: [170, 44, 44],
  } as const;

  for (const [name, color] of Object.entries(accents)) {
    assert.ok(contrast(color, canvas) >= 4.5, `${name} must pass on the canvas`);
    assert.ok(contrast(color, surface) >= 4.5, `${name} must pass on a surface`);
  }

  const oldSmallGold = [184, 60, 11] as const;
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

test('desktop headers keep every label on one line in all locales between md and xl', () => {
  // Japanese labels are the widest; at 768-1279px they used to break mid-word and push into the logo.
  const controls = read('src/components/layout/HeaderControls.tsx');
  for (const file of ['src/components/layout/Header.tsx', 'src/components/layout/MarketingHeader.tsx']) {
    const header = read(file);
    assert.match(header, /<div className="flex shrink-0 items-center gap-3">/, `${file}: logo group must not collapse`);
    assert.match(header, /<nav className="hidden md:flex items-center gap-3 text-\[13px\] lg:gap-5 xl:gap-6 xl:text-sm">/, file);
    assert.match(header, /<HeaderRightControls headerVisibility=\{headerVisibility\} className="shrink-0" \/>/, file);
    assert.ok((header.match(/whitespace-nowrap/g) ?? []).length >= 1, `${file}: nav links must not wrap`);
  }
  assert.match(read('src/components/layout/Header.tsx'), /`whitespace-nowrap transition-colors \$\{active/);
  assert.match(read('src/components/layout/MarketingHeader.tsx'), /'whitespace-nowrap font-semibold text-gold[^']*'\s*: 'whitespace-nowrap text-ink-muted hover:text-ink'/);
  assert.match(controls, /flex h-11 items-center gap-1 whitespace-nowrap rounded-control px-2 text-sm text-ink-muted/);
  assert.match(controls, /<span className="hidden whitespace-nowrap sm:inline md:hidden xl:inline">\{t\('nav_more'\)\}<\/span>/);
  const signUpButtons = controls.match(/sm:inline-flex sm:px-3 md:hidden lg:inline-flex"\s*>\s*\{authLabels\.signUp\}/g) ?? [];
  assert.equal(signUpButtons.length, 2, 'both sign-up buttons step aside between md and lg; sign-in stays visible');
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

test('sticky headers are not defeated by a scroll container on body', () => {
  const css = read('src/app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const bodyRules = [...css.matchAll(/(?:^|\n)([^{}\n]*\bbody\b[^{}]*)\{([^}]*)\}/g)];

  assert.ok(bodyRules.length > 0, 'globals.css styles body');
  for (const [, selector, declarations] of bodyRules) {
    // `overflow-x: hidden` on body makes it the scroll container, so the
    // `sticky top-0` headers scroll away with the page instead of sticking.
    assert.doesNotMatch(declarations, /overflow(?:-x)?:\s*hidden/, `${selector.trim()} must not hide overflow`);
  }
  assert.match(css, /\nhtml \{\s*overflow-x: hidden;/);
});

test('mobile tab bar keeps one order across the app and marketing headers', () => {
  const tabOrder = (file: string) => {
    const source = read(file);
    const tabs = source.slice(source.lastIndexOf('fixed inset-x-0 bottom-0'));
    return [...tabs.matchAll(/href="(\/[a-z/]+)"/g)].map((match) => match[1]);
  };
  const marketing = read('src/components/layout/MarketingHeader.tsx');
  const marketingList = marketing.slice(marketing.indexOf('const MOBILE_MARKETING_LINKS'), marketing.indexOf('export default function'));
  const marketingOrder = [...marketingList.matchAll(/href: '(\/[a-z/]+)'/g)].map((match) => match[1]);
  const appOrder = tabOrder('src/components/layout/Header.tsx');

  assert.deepEqual(appOrder, ['/workspace', '/gallery', '/retake', '/generate', '/account/practice']);
  assert.deepEqual(marketingOrder, appOrder);
});

test('signed-in visitors do not get a second account button in the home hero', () => {
  const trigger = read('src/components/auth/ClerkSignInTrigger.tsx');
  const homeSignIn = read('src/components/home/HomeSignInButton.tsx');

  assert.match(trigger, /hideWhenSignedIn \? null : \(/);
  assert.match(homeSignIn, /hideWhenSignedIn/);
  assert.doesNotMatch(homeSignIn, /signedInClassName/);
});

test('nested review disclosures rotate their own chevron only', () => {
  const exportPanel = read('src/features/reviews/components/ReviewExportPanel.tsx');

  // The export panel renders inside the review page's `group` disclosure.
  assert.match(exportPanel, /className="group\/advanced /);
  assert.match(exportPanel, /group-open\/advanced:rotate-180/);
  assert.doesNotMatch(exportPanel, /group-open:rotate-180/);
});

test('generate page starts from a quality the current plan can submit', () => {
  const page = read('src/app/generate/GeneratePageClient.tsx');

  assert.match(page, /chosenQuality \?\? \(plan === 'pro' \? 'medium' : 'low'\)/);
  assert.doesNotMatch(page, /useState<GenerationQuality>\('medium'\)/);
});
