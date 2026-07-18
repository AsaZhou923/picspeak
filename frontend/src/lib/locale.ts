export type SupportedLocale = 'zh' | 'en' | 'ja';

export const SUPPORTED_LOCALES = ['zh', 'en', 'ja'] as const satisfies readonly SupportedLocale[];
export const LOCALE_COOKIE_NAME = 'picspeak-locale';

export function isSupportedLocale(locale: string | null | undefined): locale is SupportedLocale {
  return Boolean(locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale));
}

export function normalizeLocale(locale: string | null | undefined): SupportedLocale {
  const normalized = (locale ?? '').trim().toLowerCase();
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('en')) return 'en';
  return 'en';
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
