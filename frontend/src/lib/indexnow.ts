import { siteConfig } from '@/lib/site';

export const INDEXNOW_KEY_FILE_PATH = '/indexnow-key.txt';

const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export type IndexNowPayload = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

export function getIndexNowKey(rawKey = process.env.INDEXNOW_KEY): string | null {
  const key = rawKey?.trim() ?? '';
  return INDEXNOW_KEY_PATTERN.test(key) ? key : null;
}

export function getIndexNowKeyLocation(): string {
  return `${siteConfig.url}${INDEXNOW_KEY_FILE_PATH}`;
}

export function buildIndexNowPayload(urlList: string[], rawKey = process.env.INDEXNOW_KEY): IndexNowPayload | null {
  const key = getIndexNowKey(rawKey);
  if (!key) {
    return null;
  }

  const siteHost = new URL(siteConfig.url).host;
  const ownUrls = urlList.filter((url) => {
    try {
      return new URL(url).host === siteHost;
    } catch {
      return false;
    }
  });

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
