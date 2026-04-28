export type SupportedLocale = 'zh' | 'en' | 'ja';

export function normalizeLocale(locale: string): SupportedLocale {
  const normalized = locale.trim().toLowerCase();
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('en')) return 'en';
  return 'en';
}
