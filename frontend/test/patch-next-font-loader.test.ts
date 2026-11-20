import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  ORIGINAL_EXPRESSION,
  PATCHED_EXPRESSION,
  patchLoaderSource,
} from '../scripts/patch-next-font-loader.mjs';

const require = createRequire(import.meta.url);

const LOADER_FIXTURE = [
  '            if (fontFileBuffer == null) {',
  '                (0, next_font_error_1.nextFontError)(`Failed to fetch \\`${fontFamily}\\` from Google Fonts.`);',
  '            }',
  `            ${ORIGINAL_EXPRESSION}`,
  '            // Emit font file to .next/static/media',
].join('\n');

function evaluateExt(source: string, googleFontFileUrl: string, fontFaceDeclarations: string) {
  const line = source.split('\n').find((candidate) => candidate.includes('const ext ='));
  assert.ok(line, 'Expected the ext expression in the source');
  return new Function('googleFontFileUrl', 'fontFaceDeclarations', `${line}\nreturn ext;`)(
    googleFontFileUrl,
    fontFaceDeclarations,
  ) as string;
}

function fontFace(url: string, format?: string) {
  return [
    '/* latin */',
    '@font-face {',
    "  font-family: 'DM Sans';",
    `  src: url(${url})${format ? ` format('${format}')` : ''};`,
    '}',
  ].join('\n');
}

test('patch replaces only the next/font extension expression', () => {
  const { status, source } = patchLoaderSource(LOADER_FIXTURE);
  assert.equal(status, 'patched');
  assert.ok(!source.includes(ORIGINAL_EXPRESSION));
  assert.equal(source, LOADER_FIXTURE.replace(ORIGINAL_EXPRESSION, PATCHED_EXPRESSION));
});

test('the unpatched expression crashes on an extensionless URL', () => {
  const url = 'https://fonts.gstatic.com/l/font?kit=abc&skey=def&v=v1';
  assert.throws(() => evaluateExt(LOADER_FIXTURE, url, fontFace(url, 'woff2')), TypeError);
});

test('patched expression keeps the URL extension when present', () => {
  const { source } = patchLoaderSource(LOADER_FIXTURE);
  for (const ext of ['woff', 'woff2', 'eot', 'ttf', 'otf']) {
    const url = `https://fonts.gstatic.com/s/dmsans/v15/abc.${ext}`;
    assert.equal(evaluateExt(source, url, fontFace(url, 'truetype')), ext);
  }
});

test('patched expression infers an extensionless URL from the format hint', () => {
  const { source } = patchLoaderSource(LOADER_FIXTURE);
  const url = 'https://fonts.gstatic.com/l/font?kit=abc&skey=def&v=v1';
  const cases: Array<[string, string]> = [
    ['woff2', 'woff2'],
    ['woff', 'woff'],
    ['truetype', 'ttf'],
    ['opentype', 'otf'],
    ['embedded-opentype', 'eot'],
  ];
  for (const [format, ext] of cases) {
    assert.equal(evaluateExt(source, url, fontFace(url, format)), ext);
  }
});

test('patched expression defaults to woff2 without an extension or a known format hint', () => {
  const { source } = patchLoaderSource(LOADER_FIXTURE);
  const url = 'https://fonts.gstatic.com/l/font?kit=abc';
  assert.equal(evaluateExt(source, url, fontFace(url)), 'woff2');
  assert.equal(evaluateExt(source, url, fontFace(url, 'svg')), 'woff2');
  assert.equal(evaluateExt(source, url, ''), 'woff2');
});

test('patching is idempotent', () => {
  const once = patchLoaderSource(LOADER_FIXTURE);
  const twice = patchLoaderSource(once.source);
  assert.equal(twice.status, 'already-patched');
  assert.equal(twice.source, once.source);
});

test('installed next/font loader still contains the expression the postinstall patch targets', () => {
  const loader = readFileSync(
    require.resolve('next/dist/compiled/@next/font/dist/google/loader.js'),
    'utf8',
  );
  const occurrences = [ORIGINAL_EXPRESSION, PATCHED_EXPRESSION].map(
    (expression) => loader.split(expression).length - 1,
  );
  assert.equal(occurrences[0] + occurrences[1], 1, 'Next changed its Google font loader; revisit issue #109');
});

test('patch reports not-found and leaves unknown loader source unchanged', () => {
  const changed = LOADER_FIXTURE.replace(ORIGINAL_EXPRESSION, 'const ext = getFontExtension(googleFontFileUrl);');
  const result = patchLoaderSource(changed);
  assert.equal(result.status, 'not-found');
  assert.equal(result.source, changed);
});
