export type SupportedLocale = 'zh' | 'en' | 'ja';

export const SUPPORTED_LOCALES = ['zh', 'en', 'ja'] as const satisfies readonly SupportedLocale[];
export const LOCALE_COOKIE_NAME = 'picspeak-locale';

export function isSupportedLocale(locale: string | null | undefined): locale is SupportedLocale {
  return Boolean(locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale));
}

export function localeFromPathname(pathname: string): SupportedLocale | null {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  return isSupportedLocale(firstSegment) ? firstSegment : null;
}

export function resolveRequestLocale(
  pathname: string,
  cookieLocale: string | null | undefined,
  acceptLanguage?: string | null | undefined,
): SupportedLocale | null {
  return (
    localeFromPathname(pathname) ??
    (isSupportedLocale(cookieLocale) ? cookieLocale : null) ??
    localeFromAcceptLanguage(acceptLanguage)
  );
}

export function localeFromAcceptLanguage(acceptLanguage: string | null | undefined): SupportedLocale | null {
  if (!acceptLanguage) return null;

  const candidates = acceptLanguage
    .split(',')
    .map((entry) => {
      const [tag = '', ...params] = entry.trim().split(';');
      const qParam = params.find((param) => param.trim().toLowerCase().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.split('=')[1] ?? '') : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of candidates) {
    const normalized = localeFromLanguageTag(tag);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function getLocalizedBlogRedirectPath(
  pathname: string,
  locale: SupportedLocale,
): string | null {
  if (pathname !== '/blog' && !pathname.startsWith('/blog/')) {
    return null;
  }

  return `/${locale}${pathname}`;
}

export function normalizeLocale(locale: string | null | undefined): SupportedLocale {
  const normalized = (locale ?? '').trim().toLowerCase();
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('en')) return 'en';
  return 'en';
}

export function localeFromLanguageTag(locale: string | null | undefined): SupportedLocale | null {
  const normalized = (locale ?? '').trim().toLowerCase();
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('en')) return 'en';
  return null;
}

export function localeFromLanguagePreferences(languages: readonly (string | null | undefined)[]): SupportedLocale | null {
  for (const language of languages) {
    const normalized = localeFromLanguageTag(language);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

/**
 * BCP-47 tags for each supported locale, for use with `Intl` APIs
 * (`toLocaleString`, `Intl.DateTimeFormat`, ...). Previously this mapping was
 * reinlined as a `locale === 'zh' ? 'zh-CN' : ...` ternary or a local
 * `localeMap` object in every file that formatted dates.
 */
export const INTL_LOCALE: Record<SupportedLocale, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
};

/**
 * Resolve a raw locale string (cookie, prop, or URL segment) into a BCP-47 tag
 * safe for `Intl` formatting. Defaults to `en-US` for unknown locales.
 */
export function localeToIntlLocale(locale: string | null | undefined): string {
  return INTL_LOCALE[normalizeLocale(locale)];
}
