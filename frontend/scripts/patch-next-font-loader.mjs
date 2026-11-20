import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// next/font's Google loader assumes every font file URL ends in a known extension
// (`/\.(woff|woff2|eot|ttf|otf)$/.exec(url)[1]`) and crashes the build with
// "Cannot read properties of null (reading '1')" when Google Fonts returns an
// extensionless URL (issue #109). The extension only names the self-hosted file,
// so fall back to the CSS `format('...')` hint, then to woff2.
// Remove this script once Next ships an upstream fix.

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');
const LOADER_SUBPATH = path.join('dist', 'compiled', '@next', 'font', 'dist', 'google', 'loader.js');

export const ORIGINAL_EXPRESSION =
  'const ext = /\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1];';

export const PATCHED_EXPRESSION =
  'const ext = /* picspeak#109 */ ((match) => match ? match[1] : ' +
  "({ woff2: 'woff2', woff: 'woff', truetype: 'ttf', opentype: 'otf', 'embedded-opentype': 'eot' })" +
  "[(/^\\s*format\\(['\"]?([\\w-]+)/.exec(fontFaceDeclarations.split(`url(${googleFontFileUrl})`)[1] || '') || [])[1]] || 'woff2')" +
  '(/\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl));';

export function patchLoaderSource(source) {
  if (source.includes(PATCHED_EXPRESSION)) {
    return { status: 'already-patched', source };
  }
  if (!source.includes(ORIGINAL_EXPRESSION)) {
    return { status: 'not-found', source };
  }
  return { status: 'patched', source: source.replace(ORIGINAL_EXPRESSION, PATCHED_EXPRESSION) };
}

function resolveLoaderPath() {
  const require = createRequire(path.join(FRONTEND_DIR, 'package.json'));
  try {
    return path.join(path.dirname(require.resolve('next/package.json')), LOADER_SUBPATH);
  } catch {
    return null;
  }
}

function main() {
  const loaderPath = resolveLoaderPath();
  if (!loaderPath || !existsSync(loaderPath)) {
    console.log('[patch-next-font-loader] next/font Google loader not installed; skipping.');
    return;
  }

  const { status, source } = patchLoaderSource(readFileSync(loaderPath, 'utf8'));
  if (status === 'patched') {
    writeFileSync(loaderPath, source, 'utf8');
    console.log(`[patch-next-font-loader] Patched extensionless font URL handling in ${loaderPath}`);
  } else if (status === 'already-patched') {
    console.log('[patch-next-font-loader] Already patched; nothing to do.');
  } else {
    console.warn(
      `[patch-next-font-loader] WARNING: expected expression not found in ${loaderPath}. ` +
        'Next.js changed its Google font loader; the issue #109 patch was NOT applied. ' +
        'Check whether upstream now handles extensionless font URLs and update or remove this script.',
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
