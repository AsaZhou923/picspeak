import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');
const FIXTURE_PATH = path.join(FRONTEND_DIR, 'test', 'fixtures', 'google-fonts-mocked-responses.cjs');

const require = createRequire(import.meta.url);
const { validateGoogleFontFunctionCall } = require(
  'next/dist/compiled/@next/font/dist/google/validate-google-font-function-call',
);
const { getFontAxes } = require('next/dist/compiled/@next/font/dist/google/get-font-axes');
const { getGoogleFontsUrl } = require(
  'next/dist/compiled/@next/font/dist/google/get-google-fonts-url',
);
const { fetchCSSFromGoogleFonts } = require(
  'next/dist/compiled/@next/font/dist/google/fetch-css-from-google-fonts',
);
const { findFontFilesInCss } = require(
  'next/dist/compiled/@next/font/dist/google/find-font-files-in-css',
);

// Keep in sync with `frontend/src/app/layout.tsx`.
export const LAYOUT_GOOGLE_FONT_CALLS = [
  {
    functionName: 'Noto_Serif_SC',
    options: {
      weight: ['600', '900'],
      variable: '--font-serif-sc',
      display: 'swap',
      preload: false,
    },
  },
  {
    functionName: 'Noto_Serif_JP',
    options: {
      weight: ['600', '900'],
      variable: '--font-serif-jp',
      display: 'swap',
      preload: false,
    },
  },
  {
    functionName: 'DM_Sans',
    options: {
      subsets: ['latin'],
      weight: ['400', '500', '600'],
      variable: '--font-sans-latin',
      display: 'swap',
    },
  },
  {
    functionName: 'JetBrains_Mono',
    options: {
      subsets: ['latin'],
      weight: ['400', '500'],
      variable: '--font-mono-latin',
      display: 'swap',
      preload: false,
    },
  },
];

const FONT_FILE_EXT_RE = /\.(woff|woff2|eot|ttf|otf)$/;

export function resolveGoogleFontRequest({ functionName, options }) {
  const { fontFamily, weights, styles, display, preload, selectedVariableAxes, subsets } =
    validateGoogleFontFunctionCall(functionName, options);
  const fontAxes = getFontAxes(fontFamily, weights, styles, selectedVariableAxes);
  const url = getGoogleFontsUrl(fontFamily, fontAxes, display);
  return { fontFamily, preload, subsets, url };
}

async function main() {
  const previousMockEnv = process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES;
  delete process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES;

  const responses = {};
  try {
    for (const call of LAYOUT_GOOGLE_FONT_CALLS) {
      const { fontFamily, preload, subsets, url } = resolveGoogleFontRequest(call);
      const css = await fetchCSSFromGoogleFonts(url, fontFamily, false);
      const fontFiles = findFontFilesInCss(css.split('body {', 1)[0], preload ? subsets : undefined);
      if (fontFiles.length === 0) {
        throw new Error(`No font files found in CSS for ${fontFamily}: ${url}`);
      }
      for (const { googleFontFileUrl } of fontFiles) {
        if (!FONT_FILE_EXT_RE.test(googleFontFileUrl)) {
          throw new Error(
            `Google Fonts returned an extensionless font URL for ${fontFamily}: ${googleFontFileUrl}`,
          );
        }
      }
      responses[url] = css;
      console.log(`Captured ${fontFamily} (${fontFiles.length} font file(s)): ${url}`);
    }
  } finally {
    if (previousMockEnv !== undefined) {
      process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = previousMockEnv;
    }
  }

  const output =
    `// Regenerate via \`node scripts/update-google-fonts-fixture.mjs\` when font options in src/app/layout.tsx change.\n` +
    `module.exports = ${JSON.stringify(responses, null, 2)};\n`;
  mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, output, 'utf8');
  console.log(`Wrote ${FIXTURE_PATH}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
