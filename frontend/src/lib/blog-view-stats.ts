import type { Locale } from './i18n';

const VIEW_COUNT_LOCALES: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
};

const BLOG_VIEW_STORAGE_PREFIX = 'ps_blog_view_';
const BLOG_VIEW_THROTTLE_MS = 5_000;

export function formatBlogViewCount(locale: Locale, viewCount: number): string {
  const formattedCount = new Intl.NumberFormat(VIEW_COUNT_LOCALES[locale]).format(viewCount);

  switch (locale) {
    case 'zh':
      return `${formattedCount}次浏览`;
    case 'ja':
      return `${formattedCount} 回閲覧`;
    default:
      return `${formattedCount} views`;
  }
}

export function shouldTrackBlogView(slug: string): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const key = `${BLOG_VIEW_STORAGE_PREFIX}${slug}`;
    const now = Date.now();
    const lastTrackedAt = Number(window.sessionStorage.getItem(key) ?? '0');

    if (lastTrackedAt && now - lastTrackedAt < BLOG_VIEW_THROTTLE_MS) {
      return false;
    }

    window.sessionStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}
