import { pathToFileURL } from 'node:url';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const DEFAULT_SITE_URL = 'https://www.picspeak.art';
export const DEFAULT_INDEXNOW_PATHS = [
  '/',
  '/blog',
  '/updates',
  '/gallery',
  '/generate',
  '/generate/prompts',
  '/author/asa-zhou',
  '/sitemap.xml',
  '/sitemap-images.xml',
];

const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export function getIndexNowKey(rawKey = process.env.INDEXNOW_KEY) {
  const key = rawKey?.trim() ?? '';
  return INDEXNOW_KEY_PATTERN.test(key) ? key : null;
}

export function normalizeIndexNowUrls(rawUrls, siteUrl = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL) {
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

  return [...ownUrls];
}

export function buildIndexNowPayload(rawUrls, rawKey = process.env.INDEXNOW_KEY) {
  const key = getIndexNowKey(rawKey);
  if (!key) {
    return null;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
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
