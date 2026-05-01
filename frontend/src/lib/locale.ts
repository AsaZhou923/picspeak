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
