import { enTranslations } from '@/lib/i18n-en';
import { jaTranslations } from '@/lib/i18n-ja';
import { zhTranslations, type TranslationDictionary } from '@/lib/i18n-zh';
import type { Locale } from '@/lib/i18n';

const INITIAL_TRANSLATIONS: Record<Locale, TranslationDictionary> = {
  zh: zhTranslations,
  en: enTranslations as unknown as TranslationDictionary,
  ja: jaTranslations as unknown as TranslationDictionary,
};

export function getInitialTranslations(locale: Locale): TranslationDictionary {
  return INITIAL_TRANSLATIONS[locale];
}
