import { enTranslations } from '@/lib/i18n-en';
import { jaTranslations } from '@/lib/i18n-ja';
import type { TranslationDictionary } from '@/lib/i18n-en';
import { zhTranslations } from '@/lib/i18n-zh';
import type { Locale } from '@/lib/i18n';

const INITIAL_TRANSLATIONS: Record<Locale, TranslationDictionary> = {
  zh: zhTranslations,
  en: enTranslations,
  ja: jaTranslations,
};

export function getInitialTranslations(locale: Locale): TranslationDictionary {
  return INITIAL_TRANSLATIONS[locale];
}
