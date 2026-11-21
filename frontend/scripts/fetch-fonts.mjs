import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');

// Modern Chromium UA so Google Fonts CSS2 serves variable WOFF2 subsets with
// unicode-range slicing (smaller than static per-weight files across all four families).
export const FETCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Pinned upstream google/fonts commit for authentic SIL OFL 1.1 license texts.
export const GOOGLE_FONTS_LICENSE_COMMIT = '06bfe0d62a98375cb09c942fa18e68bd32cff057';

const WOFF2_SIGNATURE = 'wOF2';
const DOWNLOAD_CONCURRENCY = 12;

export const FONT_SOURCES = {
  dmSans: {
    family: 'DM Sans',
    cssUrl: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap',
    pinnedVersion: 'v17',
    subset: 'latin',
    outputFile: path.join(FRONTEND_DIR, 'src', 'fonts', 'dm-sans-latin.woff2'),
    licenseUrl: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_LICENSE_COMMIT}/ofl/dmsans/OFL.txt`,
    licenseFile: path.join(FRONTEND_DIR, 'src', 'fonts', 'DM-SANS-OFL.txt'),
  },
  jetbrainsMono: {
    family: 'JetBrains Mono',
    cssUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap',
    pinnedVersion: 'v24',
    subset: 'latin',
    outputFile: path.join(FRONTEND_DIR, 'src', 'fonts', 'jetbrains-mono-latin.woff2'),
    licenseUrl: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_LICENSE_COMMIT}/ofl/jetbrainsmono/OFL.txt`,
    licenseFile: path.join(FRONTEND_DIR, 'src', 'fonts', 'JETBRAINS-MONO-OFL.txt'),
  },
  notoSerifSc: {
    family: 'Noto Serif SC',
    slug: 'noto-serif-sc',
    cssVariable: '--font-serif-sc',
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600;900&display=swap',
    pinnedVersion: 'v36',
    weightRange: '600 900',
    expectedWeights: ['600', '900'],
    fallbackMetrics: {
      family: 'Noto Serif SC Fallback',
      localFont: 'Times New Roman',
      ascentOverride: '95.04%',
      descentOverride: '23.62%',
      lineGapOverride: '0.00%',
      sizeAdjust: '121.11%',
    },
    outputDir: path.join(FRONTEND_DIR, 'public', 'fonts', 'noto-serif-sc'),
    publicBasePath: '/fonts/noto-serif-sc',
    licenseUrl: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_LICENSE_COMMIT}/ofl/notoserifsc/OFL.txt`,
    licenseFile: path.join(FRONTEND_DIR, 'public', 'fonts', 'noto-serif-sc', 'OFL.txt'),
  },
  notoSerifJp: {
    family: 'Noto Serif JP',
    slug: 'noto-serif-jp',
    cssVariable: '--font-serif-jp',
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600;900&display=swap',
    pinnedVersion: 'v34',
    weightRange: '600 900',
    expectedWeights: ['600', '900'],
    fallbackMetrics: {
      family: 'Noto Serif JP Fallback',
      localFont: 'Times New Roman',
      ascentOverride: '95.04%',
      descentOverride: '23.62%',
      lineGapOverride: '0.00%',
      sizeAdjust: '121.11%',
    },
    outputDir: path.join(FRONTEND_DIR, 'public', 'fonts', 'noto-serif-jp'),
    publicBasePath: '/fonts/noto-serif-jp',
    licenseUrl: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_LICENSE_COMMIT}/ofl/notoserifjp/OFL.txt`,
    licenseFile: path.join(FRONTEND_DIR, 'public', 'fonts', 'noto-serif-jp', 'OFL.txt'),
  },
};

export const CJK_STYLESHEET_PATH = path.join(FRONTEND_DIR, 'src', 'fonts', 'noto-serif-cjk.css');

/**
 * Parse a Google Fonts CSS2 response into ordered `@font-face` entries.
 */
export function parseGoogleFontCss(css) {
  const entries = [];
  const blockPattern = /(?:\/\*\s*([^*]+?)\s*\*\/\s*)?@font-face\s*\{([^}]+)\}/g;

  for (const match of css.matchAll(blockPattern)) {
    const comment = match[1]?.trim() ?? null;
    const body = match[2];
    const url = body.match(/url\((['"]?)([^)'"]+)\1\)/)?.[2]?.trim();
    const weight = body.match(/font-weight:\s*([^;]+)/)?.[1]?.trim() ?? null;
    const style = body.match(/font-style:\s*([^;]+)/)?.[1]?.trim() ?? 'normal';
    const unicodeRange = body.match(/unicode-range:\s*([^;]+)/)?.[1]?.trim() ?? null;

    if (!url) {
      throw new Error(`Missing url() in @font-face block:\n${body}`);
    }

    entries.push({ comment, url, weight, style, unicodeRange });
  }

  if (entries.length === 0) {
    throw new Error('No @font-face declarations found in CSS response.');
  }

  return entries;
}

/**
 * Extract the Google Fonts release version segment (e.g. `v36`) from a font URL.
 */
export function extractGoogleFontVersion(fontUrl) {
  const match = fontUrl.match(/\/s\/[^/]+\/(v\d+)\//);
  return match?.[1] ?? null;
}

/**
 * Deduplicate variable-font `@font-face` entries that share the same WOFF2 URL
 * across multiple requested weights while preserving declaration order.
 */
export function collapseSlicesByUrl(entries, expectedWeights) {
  const slicesByUrl = new Map();

  for (const entry of entries) {
    const existing = slicesByUrl.get(entry.url);
    if (!existing) {
      slicesByUrl.set(entry.url, {
        comment: entry.comment,
        url: entry.url,
        style: entry.style,
        unicodeRange: entry.unicodeRange,
        weights: entry.weight ? [entry.weight] : [],
      });
      continue;
    }

    if (existing.unicodeRange !== entry.unicodeRange) {
      throw new Error(
        `Conflicting unicode-range for shared font URL ${entry.url}: ` +
          `${existing.unicodeRange} vs ${entry.unicodeRange}`,
      );
    }

    if (entry.weight && !existing.weights.includes(entry.weight)) {
      existing.weights.push(entry.weight);
    }
  }

  const slices = [...slicesByUrl.values()];
  if (expectedWeights?.length) {
    for (const slice of slices) {
      for (const weight of expectedWeights) {
        if (!slice.weights.includes(weight)) {
          throw new Error(
            `Expected variable slice ${slice.url} to cover weight ${weight}; ` +
              `found [${slice.weights.join(', ')}].`,
          );
        }
      }
    }
  }

  return slices;
}

export function assertValidWoff2(buffer, label) {
  if (buffer.byteLength < 64 || buffer.toString('ascii', 0, 4) !== WOFF2_SIGNATURE) {
    throw new Error(`${label} is not a valid WOFF2 font file (size=${buffer.byteLength}).`);
  }
}

export function renderCjkStylesheet(families) {
  const header = [
    '/*',
    ' * Self-hosted Noto Serif SC & Noto Serif JP unicode-range font declarations.',
    ' * Regenerate via `node scripts/fetch-fonts.mjs` (not executed during `next build`).',
    ' *',
    ...families.map(
      (family) =>
        ` * - ${family.family}: ${family.version} (${family.slices.length} variable WOFF2 slices, weights ${family.weightRange})`,
    ),
    ' * Licenses: public/fonts/noto-serif-sc/OFL.txt and public/fonts/noto-serif-jp/OFL.txt',
    ' */',
    '',
  ].join('\n');

  const sections = [];

  for (const family of families) {
    const { fallbackMetrics } = family;
    sections.push(
      [
        '@font-face {',
        `  font-family: '${fallbackMetrics.family}';`,
        `  src: local('${fallbackMetrics.localFont}');`,
        `  ascent-override: ${fallbackMetrics.ascentOverride};`,
        `  descent-override: ${fallbackMetrics.descentOverride};`,
        `  line-gap-override: ${fallbackMetrics.lineGapOverride};`,
        `  size-adjust: ${fallbackMetrics.sizeAdjust};`,
        '}',
      ].join('\n'),
    );

    for (const slice of family.slices) {
      const lines = [
        '@font-face {',
        `  font-family: '${family.family}';`,
        `  font-style: ${slice.style};`,
        `  font-weight: ${family.weightRange};`,
        '  font-display: swap;',
        `  src: url('${slice.publicUrl}') format('woff2');`,
      ];
      if (slice.unicodeRange) {
        lines.push(`  unicode-range: ${slice.unicodeRange};`);
      }
      lines.push('}');
      sections.push(lines.join('\n'));
    }
  }

  sections.push(
    [
      ':root {',
      ...families.map(
        (family) =>
          `  ${family.cssVariable}: '${family.family}', '${family.fallbackMetrics.family}';`,
      ),
      '}',
      '',
    ].join('\n'),
  );

  return `${header}\n${sections.join('\n\n')}`;
}

async function fetchWithRetry(url, init = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${url}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 400));
      }
    }
  }
  throw lastError;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

async function downloadLicense(url, targetPath) {
  const response = await fetchWithRetry(url, {
    headers: { 'User-Agent': FETCH_USER_AGENT },
  });
  const text = await response.text();
  if (!text.includes('SIL OPEN FONT LICENSE')) {
    throw new Error(`Unexpected license content from ${url}`);
  }
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, text, 'utf8');
}

async function fetchLatinFont(source, { allowVersionDrift }) {
  const cssResponse = await fetchWithRetry(source.cssUrl, {
    headers: { 'User-Agent': FETCH_USER_AGENT },
  });
  const css = await cssResponse.text();
  const entries = parseGoogleFontCss(css);
  const latinEntries = entries.filter((entry) => entry.comment === source.subset);
  if (latinEntries.length === 0) {
    throw new Error(`No /* ${source.subset} */ subset found for ${source.family}.`);
  }

  const uniqueUrls = [...new Set(latinEntries.map((entry) => entry.url))];
  if (uniqueUrls.length !== 1) {
    throw new Error(
      `Expected 1 variable WOFF2 URL for ${source.family} (${source.subset}); found ${uniqueUrls.length}.`,
    );
  }

  const fontUrl = uniqueUrls[0];
  const version = extractGoogleFontVersion(fontUrl);
  if (!allowVersionDrift && version !== source.pinnedVersion) {
    throw new Error(
      `${source.family} upstream version changed (${version} !== pinned ${source.pinnedVersion}). ` +
        'Re-run with --update-versions after verifying the update.',
    );
  }

  const fontResponse = await fetchWithRetry(fontUrl, {
    headers: { 'User-Agent': FETCH_USER_AGENT },
  });
  const buffer = Buffer.from(await fontResponse.arrayBuffer());
  assertValidWoff2(buffer, source.family);

  mkdirSync(path.dirname(source.outputFile), { recursive: true });
  writeFileSync(source.outputFile, buffer);
  await downloadLicense(source.licenseUrl, source.licenseFile);

  return {
    family: source.family,
    version,
    bytes: buffer.byteLength,
    unicodeRange: latinEntries[0].unicodeRange,
  };
}

async function fetchCjkFont(source, { allowVersionDrift }) {
  const cssResponse = await fetchWithRetry(source.cssUrl, {
    headers: { 'User-Agent': FETCH_USER_AGENT },
  });
  const css = await cssResponse.text();
  const entries = parseGoogleFontCss(css);
  const slices = collapseSlicesByUrl(entries, source.expectedWeights);

  const versions = [...new Set(slices.map((slice) => extractGoogleFontVersion(slice.url)))];
  if (versions.length !== 1 || !versions[0]) {
    throw new Error(`Unexpected version set for ${source.family}: ${versions.join(', ')}`);
  }
  const version = versions[0];
  if (!allowVersionDrift && version !== source.pinnedVersion) {
    throw new Error(
      `${source.family} upstream version changed (${version} !== pinned ${source.pinnedVersion}). ` +
        'Re-run with --update-versions after verifying the update.',
    );
  }

  rmSync(source.outputDir, { recursive: true, force: true });
  const versionDir = path.join(source.outputDir, version);
  mkdirSync(versionDir, { recursive: true });

  const downloadedSlices = await mapWithConcurrency(
    slices,
    DOWNLOAD_CONCURRENCY,
    async (slice, index) => {
      const response = await fetchWithRetry(slice.url, {
        headers: { 'User-Agent': FETCH_USER_AGENT },
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      assertValidWoff2(buffer, `${source.family} slice ${index}`);

      const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
      const filename = `${String(index).padStart(3, '0')}-${hash}.woff2`;
      writeFileSync(path.join(versionDir, filename), buffer);

      return {
        ...slice,
        filename,
        bytes: buffer.byteLength,
        publicUrl: `${source.publicBasePath}/${version}/${filename}`,
      };
    },
  );

  await downloadLicense(source.licenseUrl, source.licenseFile);

  const totalBytes = downloadedSlices.reduce((sum, slice) => sum + slice.bytes, 0);
  return {
    ...source,
    version,
    slices: downloadedSlices,
    totalBytes,
  };
}

async function main() {
  const allowVersionDrift = process.argv.includes('--update-versions');

  const dmSans = await fetchLatinFont(FONT_SOURCES.dmSans, { allowVersionDrift });
  console.log(`Fetched ${dmSans.family} (${dmSans.version}, latin): ${dmSans.bytes} bytes`);

  const jetbrainsMono = await fetchLatinFont(FONT_SOURCES.jetbrainsMono, { allowVersionDrift });
  console.log(
    `Fetched ${jetbrainsMono.family} (${jetbrainsMono.version}, latin): ${jetbrainsMono.bytes} bytes`,
  );

  const notoSerifSc = await fetchCjkFont(FONT_SOURCES.notoSerifSc, { allowVersionDrift });
  console.log(
    `Fetched ${notoSerifSc.family} (${notoSerifSc.version}): ${notoSerifSc.slices.length} slices, ${notoSerifSc.totalBytes} bytes`,
  );

  const notoSerifJp = await fetchCjkFont(FONT_SOURCES.notoSerifJp, { allowVersionDrift });
  console.log(
    `Fetched ${notoSerifJp.family} (${notoSerifJp.version}): ${notoSerifJp.slices.length} slices, ${notoSerifJp.totalBytes} bytes`,
  );

  const cjkCss = renderCjkStylesheet([notoSerifSc, notoSerifJp]);
  mkdirSync(path.dirname(CJK_STYLESHEET_PATH), { recursive: true });
  writeFileSync(CJK_STYLESHEET_PATH, cjkCss, 'utf8');
  console.log(`Wrote ${CJK_STYLESHEET_PATH} (${Buffer.byteLength(cjkCss)} bytes)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
