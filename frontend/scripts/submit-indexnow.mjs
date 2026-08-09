import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const DEFAULT_SITE_URL = 'https://www.picspeak.art';
export const INDEXNOW_URL_LIMIT = 10000;
export const BASE_INDEXNOW_PATHS = [
  '/zh',
  '/en',
  '/ja',
  '/zh/blog',
  '/en/blog',
  '/ja/blog',
  '/updates',
  '/zh/updates',
  '/en/updates',
  '/ja/updates',
  '/gallery',
  '/generate',
  '/generate/prompts',
  '/author/asa-zhou',
  '/editorial-policy',
  '/privacy',
  '/terms',
  '/affiliate',
  '/sitemap.xml',
  '/sitemap-images.xml',
];

const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
const LOCALES = ['zh', 'en', 'ja'];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');

function readJson(relativePath, fallback) {
  try {
    return JSON.parse(readFileSync(path.join(FRONTEND_DIR, relativePath), 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(relativePath) {
  try {
    return readFileSync(path.join(FRONTEND_DIR, relativePath), 'utf8');
  } catch {
    return '';
  }
}

function getBlogPostPaths() {
  return LOCALES.flatMap((locale) => {
    const bundle = readJson(path.join('src', 'content', 'blog', `${locale}.json`), { posts: [] });
    return (bundle.posts ?? []).flatMap((post) =>
      typeof post.slug === 'string' ? [`/${locale}/blog/${post.slug}`] : [],
    );
  });
}

function getPromptDetailPaths() {
  const source = readText(path.join('src', 'content', 'generation', 'prompt-examples.ts'));
  return [...source.matchAll(/^\s*id:\s*["']([^"']+)["'],/gm)].map((match) => `/generate/prompts/${match[1]}`);
}

export function buildDefaultIndexNowPaths() {
  return [
    ...BASE_INDEXNOW_PATHS,
    ...getBlogPostPaths(),
    ...getPromptDetailPaths(),
  ];
}

export const DEFAULT_INDEXNOW_PATHS = buildDefaultIndexNowPaths();

export function getIndexNowKey(rawKey = process.env.INDEXNOW_KEY) {
  const key = rawKey?.trim() ?? '';
  return INDEXNOW_KEY_PATTERN.test(key) ? key : null;
}

export function normalizeIndexNowUrls(rawUrls, siteUrl = DEFAULT_SITE_URL) {
  const siteHost = new URL(siteUrl).host;
  const ownUrls = new Set();

  for (const rawUrl of rawUrls) {
    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl) {
      continue;
    }

    try {
      const absoluteUrl = new URL(trimmedUrl, siteUrl);
      absoluteUrl.hash = '';

      if (absoluteUrl.host === siteHost) {
        ownUrls.add(absoluteUrl.toString());
      }
    } catch {
      // Ignore malformed URLs in deploy hooks.
    }
  }

  return [...ownUrls].slice(0, INDEXNOW_URL_LIMIT);
}

export function buildIndexNowPayload(rawUrls, rawKey = process.env.INDEXNOW_KEY, siteUrl = DEFAULT_SITE_URL) {
  const key = getIndexNowKey(rawKey);
  if (!key) {
    return null;
  }

  const urlList = normalizeIndexNowUrls(rawUrls, siteUrl);
  if (urlList.length === 0) {
    return null;
  }

  return {
    host: new URL(siteUrl).host,
    key,
    keyLocation: new URL('/indexnow-key.txt', siteUrl).toString(),
    urlList,
  };
}

export async function submitIndexNow(rawUrls = DEFAULT_INDEXNOW_PATHS) {
  const payload = buildIndexNowPayload(rawUrls);

  if (!payload) {
    console.log('IndexNow skipped: INDEXNOW_KEY is missing/invalid or no PicSpeak URLs were provided.');
    return { submitted: false, ok: true, status: null };
  }

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`IndexNow submission failed with ${response.status}${body ? `: ${body}` : ''}`);
  }

  console.log(`IndexNow submitted ${payload.urlList.length} URL(s).`);
  return { submitted: true, ok: true, status: response.status };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cliUrls = process.argv.slice(2);
  await submitIndexNow(cliUrls.length > 0 ? cliUrls : DEFAULT_INDEXNOW_PATHS).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
