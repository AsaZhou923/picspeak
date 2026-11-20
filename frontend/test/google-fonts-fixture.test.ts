import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAYOUT_GOOGLE_FONT_CALLS,
  resolveGoogleFontRequest,
} from '../scripts/update-google-fonts-fixture.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(TEST_DIR, 'fixtures', 'google-fonts-mocked-responses.cjs');
const require = createRequire(import.meta.url);
const { fetchCSSFromGoogleFonts } = require(
  'next/dist/compiled/@next/font/dist/google/fetch-css-from-google-fonts',
);
const { findFontFilesInCss } = require(
  'next/dist/compiled/@next/font/dist/google/find-font-files-in-css',
);

test('CI Google Fonts mocked fixture covers every layout.tsx font URL with extensioned font files', async () => {
  const previous = process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES;
  process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = FIXTURE_PATH;
  try {
    const mockedResponses = require(FIXTURE_PATH) as Record<string, string>;
    const expectedUrls = LAYOUT_GOOGLE_FONT_CALLS.map((call) => resolveGoogleFontRequest(call));
    assert.deepEqual(
      Object.keys(mockedResponses).sort(),
      expectedUrls.map((entry) => entry.url).sort(),
    );

    for (const { fontFamily, preload, subsets, url } of expectedUrls) {
      const css = await fetchCSSFromGoogleFonts(url, fontFamily, false);
      const fontFiles = findFontFilesInCss(css.split('body {', 1)[0], preload ? subsets : undefined);
      assert.ok(fontFiles.length > 0, `Expected font files for ${fontFamily}`);
      for (const { googleFontFileUrl } of fontFiles) {
        assert.match(googleFontFileUrl, /\.(woff|woff2|eot|ttf|otf)$/);
      }
    }
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES;
    } else {
      process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = previous;
    }
  }
});

test('CI Google Fonts mocked fixture fails loudly when a font option changes without regeneration', async () => {
  const previous = process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES;
  process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = FIXTURE_PATH;
  try {
    const changed = resolveGoogleFontRequest({
      functionName: 'DM_Sans',
      options: {
        subsets: ['latin'],
        weight: ['400', '500', '700'],
        variable: '--font-sans-latin',
        display: 'swap',
      },
    });
    await assert.rejects(
      () => fetchCSSFromGoogleFonts(changed.url, changed.fontFamily, false),
      /Missing mocked response for URL:/,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES;
    } else {
      process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = previous;
    }
  }
});
