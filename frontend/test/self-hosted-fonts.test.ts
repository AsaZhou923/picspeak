import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CJK_STYLESHEET_PATH,
  FONT_SOURCES,
  assertValidWoff2,
  collapseSlicesByUrl,
  extractGoogleFontVersion,
  parseGoogleFontCss,
  renderCjkStylesheet,
} from '../scripts/fetch-fonts.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(TEST_DIR, '..');
const REPO_ROOT = path.resolve(FRONTEND_DIR, '..');

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

test('layout.tsx self-hosts Latin fonts with next/font/local and imports CJK font stylesheet', () => {
  const layout = readText(path.join(FRONTEND_DIR, 'src', 'app', 'layout.tsx'));

  assert.match(layout, /import localFont from ['"]next\/font\/local['"]/);
  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.match(layout, /import ['"]\.\.\/fonts\/noto-serif-cjk\.css['"]/);

  assert.match(layout, /src:\s*['"]\.\.\/fonts\/dm-sans-latin\.woff2['"]/);
  assert.match(layout, /variable:\s*['"]--font-sans-latin['"]/);
  assert.match(layout, /preload:\s*true/);

  assert.match(layout, /src:\s*['"]\.\.\/fonts\/jetbrains-mono-latin\.woff2['"]/);
  assert.match(layout, /variable:\s*['"]--font-mono-latin['"]/);
  assert.match(layout, /preload:\s*false/);
  assert.match(layout, /display:\s*['"]swap['"]/);
});

test('all self-hosted Latin WOFF2 files and OFL licenses exist and are valid', () => {
  for (const source of [FONT_SOURCES.dmSans, FONT_SOURCES.jetbrainsMono]) {
    assert.ok(existsSync(source.outputFile), `${source.family} WOFF2 must exist at ${source.outputFile}`);
    const buffer = readFileSync(source.outputFile);
    assertValidWoff2(buffer, source.family);

    assert.ok(existsSync(source.licenseFile), `${source.family} OFL license must exist`);
    assert.match(readText(source.licenseFile), /SIL OPEN FONT LICENSE/);
  }
});

test('CJK stylesheet defines expected CSS variables and every referenced WOFF2 slice and OFL license exists', () => {
  assert.ok(existsSync(CJK_STYLESHEET_PATH), 'noto-serif-cjk.css must exist');
  const css = readText(CJK_STYLESHEET_PATH);

  assert.match(css, /--font-serif-sc:\s*'Noto Serif SC',\s*'Noto Serif SC Fallback';/);
  assert.match(css, /--font-serif-jp:\s*'Noto Serif JP',\s*'Noto Serif JP Fallback';/);
  assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com/);

  const sliceUrls = [...css.matchAll(/url\('(\/fonts\/[^']+\.woff2)'\)/g)].map((match) => match[1]);
  assert.ok(sliceUrls.length >= 200, `Expected sliced CJK fonts, found ${sliceUrls.length}`);

  const scSlices = sliceUrls.filter((url) => url.startsWith('/fonts/noto-serif-sc/'));
  const jpSlices = sliceUrls.filter((url) => url.startsWith('/fonts/noto-serif-jp/'));
  assert.ok(scSlices.length >= 90, `Expected Noto Serif SC slices, found ${scSlices.length}`);
  assert.ok(jpSlices.length >= 100, `Expected Noto Serif JP slices, found ${jpSlices.length}`);

  for (const publicUrl of sliceUrls) {
    const filePath = path.join(FRONTEND_DIR, 'public', publicUrl.slice(1));
    assert.ok(existsSync(filePath), `Missing CJK font slice ${filePath}`);
    const buffer = readFileSync(filePath);
    assertValidWoff2(buffer, publicUrl);
  }

  for (const source of [FONT_SOURCES.notoSerifSc, FONT_SOURCES.notoSerifJp]) {
    assert.ok(existsSync(source.licenseFile), `${source.family} OFL license must exist`);
    assert.match(readText(source.licenseFile), /SIL OPEN FONT LICENSE/);
  }
});

test('no next/font/google workaround hooks, fixtures, or CI mocks remain', () => {
  const pkg = readText(path.join(FRONTEND_DIR, 'package.json'));
  const ci = readText(path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml'));

  assert.doesNotMatch(pkg, /patch-next-font-loader|postinstall/);
  assert.doesNotMatch(ci, /NEXT_FONT_GOOGLE_MOCKED_RESPONSES|google-fonts-mocked-responses/);
  assert.equal(existsSync(path.join(FRONTEND_DIR, 'scripts', 'patch-next-font-loader.mjs')), false);
  assert.equal(existsSync(path.join(FRONTEND_DIR, 'scripts', 'update-google-fonts-fixture.mjs')), false);
  assert.equal(
    existsSync(path.join(FRONTEND_DIR, 'test', 'fixtures', 'google-fonts-mocked-responses.cjs')),
    false,
  );
});

test('CSP allows same-origin fonts without Google hosts and CJK font paths are immutably cached', async () => {
  const nextConfigModule = await import(`../next.config.mjs?self-hosted-fonts=${Date.now()}`);
  const routes = (await nextConfigModule.default.headers()) as Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;

  const csp =
    routes
      .flatMap((route) => route.headers)
      .find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
  assert.match(csp, /(?:^|; )font-src 'self' data:(?:;|$)/);
  assert.doesNotMatch(csp, /fonts\.gstatic\.com|fonts\.googleapis\.com/);

  const fontCacheRoute = routes.find(
    (route) => route.source === '/fonts/:family(noto-serif-sc|noto-serif-jp)/:path*',
  );
  assert.ok(fontCacheRoute, 'Expected immutable cache headers for versioned CJK font paths');
  assert.equal(
    fontCacheRoute.headers.find((header) => header.key === 'Cache-Control')?.value,
    'public, max-age=31536000, immutable',
  );
});

test('fetch-fonts.mjs parses Google CSS2, collapses duplicate variable weights, and renders CJK CSS', () => {
  const sampleCss = [
    '/* [0] */',
    '@font-face {',
    "  font-family: 'Noto Serif SC';",
    '  font-style: normal;',
    '  font-weight: 600;',
    '  font-display: swap;',
    '  src: url(https://fonts.gstatic.com/s/notoserifsc/v36/slice.0.woff2) format(\'woff2\');',
    '  unicode-range: U+4E00-4E05;',
    '}',
    '/* [0] */',
    '@font-face {',
    "  font-family: 'Noto Serif SC';",
    '  font-style: normal;',
    '  font-weight: 900;',
    '  font-display: swap;',
    '  src: url(https://fonts.gstatic.com/s/notoserifsc/v36/slice.0.woff2) format(\'woff2\');',
    '  unicode-range: U+4E00-4E05;',
    '}',
  ].join('\n');

  const entries = parseGoogleFontCss(sampleCss);
  assert.equal(entries.length, 2);

  const slices = collapseSlicesByUrl(entries, ['600', '900']);
  assert.equal(slices.length, 1);
  assert.equal(extractGoogleFontVersion(slices[0].url), 'v36');

  const rendered = renderCjkStylesheet([
    {
      ...FONT_SOURCES.notoSerifSc,
      version: 'v36',
      slices: [
        {
          ...slices[0],
          publicUrl: '/fonts/noto-serif-sc/v36/000-deadbeef.woff2',
        },
      ],
    },
  ]);

  assert.match(rendered, /font-weight: 600 900;/);
  assert.match(rendered, /font-display: swap;/);
  assert.match(rendered, /src: url\('\/fonts\/noto-serif-sc\/v36\/000-deadbeef\.woff2'\) format\('woff2'\);/);
  assert.match(rendered, /unicode-range: U\+4E00-4E05;/);
  assert.match(rendered, /--font-serif-sc: 'Noto Serif SC', 'Noto Serif SC Fallback';/);
});
