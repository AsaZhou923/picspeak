import { siteConfig } from './site.ts';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_KEY_FILE_PATH = '/indexnow-key.txt';

const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export type IndexNowPayload = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

export type IndexNowSubmitResult = {
  submitted: boolean;
  ok: boolean;
  status: number | null;
  payload: IndexNowPayload | null;
};

export function getIndexNowKey(rawKey = process.env.INDEXNOW_KEY): string | null {
  const key = rawKey?.trim() ?? '';
  return INDEXNOW_KEY_PATTERN.test(key) ? key : null;
}

export function getIndexNowKeyLocation(): string {
  return `${siteConfig.url}${INDEXNOW_KEY_FILE_PATH}`;
}

export function buildIndexNowUrlList(rawUrls: string[], siteUrl = siteConfig.url): string[] {
  const siteHost = new URL(siteUrl).host;
  const ownUrls = new Set<string>();

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
      // Ignore malformed URLs rather than sending a partial invalid payload.
    }
  }

  return [...ownUrls];
}

export function buildIndexNowPayload(urlList: string[], rawKey = process.env.INDEXNOW_KEY): IndexNowPayload | null {
  const key = getIndexNowKey(rawKey);
  if (!key) {
    return null;
  }

  const siteHost = new URL(siteConfig.url).host;
  const ownUrls = buildIndexNowUrlList(urlList);

  if (ownUrls.length === 0) {
    return null;
  }

  return {
    host: siteHost,
    key,
    keyLocation: getIndexNowKeyLocation(),
    urlList: ownUrls,
  };
}

export async function submitIndexNowUrls(
  urlList: string[],
  options: {
    rawKey?: string;
    endpoint?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<IndexNowSubmitResult> {
  const payload = buildIndexNowPayload(urlList, options.rawKey);

  if (!payload) {
    return {
      submitted: false,
      ok: false,
      status: null,
      payload,
    };
  }

  const response = await (options.fetchImpl ?? fetch)(options.endpoint ?? INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return {
    submitted: true,
    ok: response.ok,
    status: response.status,
    payload,
  };
}
